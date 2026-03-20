require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const { testConnection } = require("./db");

const fs = require("fs");
const path = require("path");

const { fetchNews } = require("./news");
const { analyzeWithGemini, analyzeMotherFishWithGemini } = require("./gemini");
const { writeFilter, readFilter } = require("./filter-writer");
const { sendTelegram } = require("./telegram");

const { analyzePerformance } = require("./performance/performance-analyzer");
const { runDailyLearning } = require("./performance/daily-learner");
const { analyzeEarlyExit } = require("./brain/early-exit-engine");

const { evaluateDecision, decision } =
    require("./brain/decision-engine");

const { getSession } =
    require("./brain/session-filter");

const { getRiskState, calculateDynamicRisk } =
    require("./brain/risk-manager");

const { checkCalendar, fetchCalendar } =
    require("./brain/economic-calendar");

const { analyzePattern } =
    require("./pattern/pattern-analyzer");

const { analyzeICT } =
    require("./pattern/ict-rules");

const { learnPatternWeights } =
    require("./learning/pattern-learner");

const { exec } = require("child_process");

const app = express();
app.use(express.json());

app.post('/signal', async (req, res) => {
    const { symbol, userId, side, price, candles, candles_h1, candles_h4, balance, overlapPips } = req.body;

    // [NEW] Save raw candles data with tick volume for future ML/AI training
    try {
        if (candles && candles.length > 0) {
            const dataPath = path.join(__dirname, 'data');
            if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);

            const trainingDataPath = path.join(dataPath, 'candle_training_data.json');
            let trainingLogs = [];

            if (fs.existsSync(trainingDataPath)) {
                const raw = fs.readFileSync(trainingDataPath, 'utf-8');
                if (raw.trim() !== '') trainingLogs = JSON.parse(raw);
            }

            // Only keep last 2 candles to save space, but include full context
            const lastCandles = candles.slice(-3);

            trainingLogs.push({
                timestamp: new Date().toISOString(),
                symbol: symbol,
                userId: userId,
                price: price,
                candles: lastCandles
            });

            // Limit file size (keep last 5000 records)
            if (trainingLogs.length > 5000) trainingLogs.shift();

            fs.writeFileSync(trainingDataPath, JSON.stringify(trainingLogs, null, 2));
        }
    } catch (e) {
        console.error("Error saving training data: ", e);
    }

    const news = readFilter();
    const calendar = checkCalendar();
    const session = getSession();
    const risk = getRiskState();
    const pattern = analyzePattern({
        candles: candles,
        candlesH1: candles_h1,
        candlesH4: candles_h4,
        overlapPips: overlapPips
    });
    const ictContext = analyzeICT(candles);

    // Pass everything to evaluateDecision
    const evaluateResult = evaluateDecision({
        news,
        calendar,
        session,
        risk,
        pattern,
        ictContext, // Pass ICT analysis to the brain
        market: {
            candlesH1: candles_h1,
            candlesH4: candles_h4,
            portfolio: req.body.portfolio || { currentPosition: "NONE", count: 0 }
        }
    });

    const score = evaluateResult.score || 0;
    let finalDecision = decision(evaluateResult);

    // [NEW] Console Log for Market State Verification
    console.log(`\n--- 📊 MARKET STATE LOG [${symbol}] ---`);
    console.log(`Price: ${price}`);
    console.log(`H1/H4 Trend: ${evaluateResult.trend} | Mode: ${evaluateResult.mode}`);
    if (pattern.structure) {
        console.log(`M5 Micro-Trend: ${pattern.structure.microTrend}`);
        console.log(`Fail to LL: ${pattern.structure.isFailToLL} | Fail to HH: ${pattern.structure.isFailToHH}`);
        console.log(`Retesting Support: ${pattern.structure.isRetestingSupport} | Retesting Resistance: ${pattern.structure.isRetestingResistance}`);
    }
    console.log(`Volume Climax (VSA): ${pattern.isVolumeClimax} | Volume Drying: ${pattern.isVolumeDrying}`);
    console.log(`Pattern Detected: ${pattern.pattern} (${pattern.type})`);
    console.log(`Final Score: ${score.toFixed(2)} | Decision: ${finalDecision}`);
    console.log(`--------------------------------------\n`);

    let slPoints = 500;
    let tpPoints = 800;
    let lotSize = 0.01;
    let retracePoints = 0;

    // Use Dynamic SL/TP from Pattern Analysis if available (and valid distance)
    if (pattern.slPrice && price) {
        // คูณ 100 เพื่อแปลงผลต่างราคาเป็น Pips/จุด (เช่น ต่างกัน 2.50 ดอลลาร์ = 250 จุด)
        let dynamicSLPips = Math.abs(price - pattern.slPrice) * 100;
        if (dynamicSLPips > 50 && dynamicSLPips < 1500) slPoints = Math.round(dynamicSLPips);
    }
    if (pattern.tpPrice && price) {
        let dynamicTPPips = Math.abs(pattern.tpPrice - price) * 100;
        if (dynamicTPPips > 100 && dynamicTPPips < 3000) tpPoints = Math.round(dynamicTPPips);
    }

    if (score >= 5) retracePoints = 0;
    else if (score >= 3) retracePoints = 45;
    else retracePoints = 65;

    const hour = new Date().getHours();
    // Only override with time-based rules if we didn't get dynamic TP/SL
    if (!pattern.slPrice && !pattern.tpPrice) {
        if (hour >= 19 && hour <= 23) {
            slPoints = 1000;
            tpPoints = 5000;
        } else if (hour >= 7 && hour <= 8) {
            tpPoints = 300;
            slPoints = 600;
        } else if (hour >= 23 && hour <= 6) {
            retracePoints = 150;
        }
    }
    // 2. การปรับขนาด Lot Size
    if (balance && balance > 0) {
        const riskPercent = calculateDynamicRisk(score, pattern.type, evaluateResult.mode, 2.0);
        const riskAmount = balance * (riskPercent / 100);
        let calculatedLot = riskAmount / slPoints;

        // ถ้าคะแนนไม่ถึง 5.5 (ไม่มั่นใจสุดๆ) ให้ใช้โหมด "ตีหัวเข้าบ้าน" (SCALP Lot)
        if (Math.abs(score) < 5.5) {
            calculatedLot *= 1.5; // เพิ่ม Lot 50% ชดเชย TP ที่สั้นลง
        }

        lotSize = Number(calculatedLot.toFixed(2));
        if (lotSize < 0.01) lotSize = 0.01;
        if (lotSize > 5.0) lotSize = 5.0;
    }

    // 3. การปรับระยะ TP ตาม Score (Smart TP Shrinking)
    // ถ้าคะแนนสูงมากๆ (>= 5.5) -> ปล่อย TP วิ่งตามสวิง/เทรนด์ โดยไม่หดเลย
    // ถ้าคะแนนปานกลาง (3.0 - 5.4) -> หด TP ลงมาที่ 70% ของระยะสวิง
    // ถ้าคะแนนต่ำ (ต่ำกว่า 3.0) -> หด TP ลงมาเหลือ 40% (เน้นปิดไวสุดๆ)
    if (Math.abs(score) < 3.0) {
        // Low Confidence -> Aggressive Scalp
        tpPoints = Math.round(tpPoints * 0.4);
    } else if (Math.abs(score) < 5.5) {
        // Medium Confidence -> Standard Scalp
        tpPoints = Math.round(tpPoints * 0.7);
    }
    // If score is >= 5.5, do nothing, let it run full TP.

    // บังคับ TP ขั้นต่ำเพื่อไม่ให้ขาดทุน Spread
    if (tpPoints < 200) {
        tpPoints = 200;
    }

    return res.json({
        decision: finalDecision,
        score: score,
        mode: evaluateResult.mode || "NORMAL",
        trend: evaluateResult.trend || "NEUTRAL",
        pattern: pattern,
        trade_setup: {
            recommended_lot: lotSize,
            sl_points: slPoints,
            tp_points: tpPoints,
            retrace_points: retracePoints
        }
    });
});

app.post("/trade-event", async (req, res) => {
    const { type, symbol, userId, side, lot, price, sl, tp, profit, mode } = req.body;
    console.log(req.body);

    let message = "";

    if (type === "OPEN_ORDER") {
        message = `🟢 เปิดออเดอร์ใหม่ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
    }

    if (type === "CLOSE_ORDER") {
        message = `🔴 ปิดออเดอร์แล้ว (${mode})\nSide: ${side}\nProfit: ${profit}`;
    }

    if (type === "WAIT_ORDER") {
        message = `🔘 รอเปิดออเดอร์ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
    }

    if (type === "CANCEL_ORDER") {
        message = `⚫ ยกเลิกออเดอร์ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
    }

    if (type === "CLOSE_EMERGENCY") {
        message = `🚨 ปิดออเดอร์หนี (${mode})\nSide: ${side}\nnProfit: ${profit}`;
    }

    await sendTelegram(
        process.env.TELEGRAM_BOT_TOKEN,
        process.env.TELEGRAM_CHAT_ID,
        message
    );

    const historyFile = path.join(__dirname, "data", "trade-history.json");
    let history = [];

    if (fs.existsSync(historyFile)) {
        const raw = fs.readFileSync(historyFile, "utf8").trim();
        if (raw) {
            history = JSON.parse(raw);
        }
    }

    history.push(req.body);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

    // [New] Send data for Post-Trade Analysis (Mae Pla Pakka Keaw)
    if (type === "CLOSE_ORDER") {
        const maePlaLogPath = path.join(__dirname, "data", "mae_pla_logs.json");
        let maePlaLogs = [];
        if (fs.existsSync(maePlaLogPath)) {
            const rawLog = fs.readFileSync(maePlaLogPath, "utf-8");
            if (rawLog.trim() !== '') maePlaLogs = JSON.parse(rawLog);
        }

        maePlaLogs.push({
            timestamp: new Date().toISOString(),
            type: "trade_result",
            ticket_id: req.body.ticket_id || Date.now(),
            result: parseFloat(profit) > 0 ? "TP" : "SL",
            pnl_pips: parseFloat(profit),
            market_conditions_at_entry: {
                symbol: symbol,
                side: side
            },
            lesson_learned: parseFloat(profit) > 0
                ? "Trade successful. Align with Mae Pla rules."
                : "Trade failed. Need to review entry condition or market session."
        });

        fs.writeFileSync(maePlaLogPath, JSON.stringify(maePlaLogs, null, 2));
    }

    analyzePerformance();
    res.json({ success: true });
});

app.post('/check-exit-signal', async (req, res) => {
    const { openPosition, currentProfit, candles } = req.body;

    if (!openPosition || !candles) {
        return res.status(400).json({ error: "Missing required data: openPosition and candles" });
    }

    try {
        const exitDecision = analyzeEarlyExit({
            openPosition,
            currentProfit,
            candles
        });

        console.log(`-> 🕵️ Early Exit Check for ${openPosition.side} Order: ${exitDecision.action} - Reason: ${exitDecision.reason}`);

        return res.json(exitDecision);

    } catch (error) {
        console.error("Early Exit analysis failed:", error.message);
        return res.status(500).json({ action: "HOLD", reason: "Analysis engine error." });
    }
});

app.post('/webhook/mae-pla', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[Mae Pla Webhook] Received type: ` + payload.type);

        const dataPath = path.join(__dirname, 'data');
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath);
        }

        const logPath = path.join(dataPath, 'mae_pla_logs.json');

        let logs = [];
        if (fs.existsSync(logPath)) {
            const raw = fs.readFileSync(logPath, 'utf-8');
            if (raw.trim() !== '') logs = JSON.parse(raw);
        }

        logs.push(payload);
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

        if (payload.type === 'market_context') {
            console.log('-> Market Context Updated: recommendation =', payload.recommendation);
        } else if (payload.type === 'signal_validation') {
            console.log('-> Signal Validation:', payload.action, 'Score:', payload.ai_confidence_score);
        } else if (payload.type === 'trade_result') {
            console.log('-> Trade Learning Logged:', payload.result, 'Lesson:', payload.lesson_learned);
        }

        res.json({ success: true, message: 'Mae Pla data logged & processed' });
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ==========================================
// [NEW] OpenClaw AI Autonomous Cron Jobs
// ==========================================

// 04:30 - Daily Internal Mapping and Learning (Backend ML)
cron.schedule("0 */1 * * *", () => {
    runDailyLearning();
});

// 06:00 - Morning Brief
cron.schedule("0 6 * * *", () => {
    console.log("[AI Cron] Waking up AI for Morning Brief...");
    exec('openclaw chat "สรุปข่าวเศรษฐกิจ XAUUSD ของวันนี้ และส่ง news_filter เข้า webhook"');
});

// 07:00 - Asian Session (Sideway)
cron.schedule("0 7 * * *", () => {
    console.log("[AI Cron] Waking up AI for Asian Session...");
    exec('openclaw chat "ส่ง market_context บอก EA ให้ระวัง Sideway บีบตัว หรือ pause_ea"');
});

// 14:00 - London Pre-Open
cron.schedule("0 14 * * *", () => {
    console.log("[AI Cron] Waking up AI for London Session...");
    exec('openclaw chat "ประเมินโครงสร้าง H1/H4 ปัจจุบัน แล้วส่ง market_context อนุญาตให้ EA กลับมาเทรด (active)"');
});

// 18:00 - US Pre-Open
cron.schedule("0 18 * * *", async () => {
    console.log("[AI Cron] Waking up AI for US Session...");
    exec('openclaw chat "อัปเดตข่าวค่ำนี้ และเตรียมขยับ SL/TP ของ EA เป็น 300/500 จุดผ่าน webhook"');
});

// 23:30 - Daily Review
cron.schedule("30 23 * * *", () => {
    console.log("[AI Cron] Waking up AI for Daily Review...");
    exec('openclaw chat "สรุปบทเรียนจากไม้ที่ปิดไปวันนี้ใน mae_pla_logs.json และหาจุดอ่อนเพื่อปรับปรุงระบบ"');
});

async function updateNewsAnalysis() {

    try {

        const news = await fetchNews();

        const analysis = await analyzeWithGemini(process.env.GEMINI_API_KEY, news);

        const filter = writeFilter(
            "./trade-filter.json",
            analysis
        );

    } catch (err) {
        console.log("news error", err);
    }
}

cron.schedule("* 4 * * *", updateNewsAnalysis);

cron.schedule("0 0 * * *", () => {
    learnPatternWeights();
});

analyzePerformance();

cron.schedule("0 4 * * *", async () => {
    try {
        const result = analyzePerformance();
        await sendTelegram(
            process.env.TELEGRAM_BOT_TOKEN,
            process.env.TELEGRAM_CHAT_ID,
            `AI GOLD BOT\n\n📊 สรุปผลการเทรดประจำวัน\n\nTrades: ${result.summary.totalTrades}\nWins: ${result.summary.wins}\nLosses: ${result.summary.losses}\nWinRate: ${result.summary.winRate}%\nProfit: ${result.summary.totalProfit}`
        );
    } catch (err) {
        console.error("Performance Report Error:", err.message);
    }
});

testConnection().catch((err) => {
    console.error("MySQL connection error:", err.message);
});

app.listen(5000, () => {
    console.log("Trading AI Engine running");
});
