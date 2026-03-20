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

const { evaluateDecision, decision } = require("./brain/decision-engine");
const { getSession } = require("./brain/session-filter");
const { getRiskState, calculateDynamicRisk } = require("./brain/risk-manager");
const { checkCalendar, fetchCalendar } = require("./brain/economic-calendar");
const { analyzePattern } = require("./pattern/pattern-analyzer");
const { analyzeICT } = require("./pattern/ict-rules");
const { learnPatternWeights } = require("./learning/pattern-learner");

const { findFailedPattern } = require("./failedPattern.repo");
const { buildContextHash } = require("./utils/context-hash");
const { buildContextFeatures, buildContextHashNew } = require("./utils/context-features");
const { detectMotherFishPattern } = require("./pattern/pattern-rules");

const { insertTradeHistory } = require("./tradeHistory.repo");
const { evaluateCurrentVolumeAgainstHistory } = require("./brain/volume-history.service");

const { exec } = require("child_process");

const app = express();
app.use(express.json());

app.post("/signal", async (req, res) => {
    const {
        symbol,
        firebaseUserId,
        side,
        price,
        candles,
        candles_h1,
        candles_h4,
        balance,
        overlapPips,
    } = req.body;

    const resolvedUserId = firebaseUserId || null;

    try {
        try {
            if (candles && candles.length > 0) {
                const dataPath = path.join(__dirname, "data");
                if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);

                const trainingDataPath = path.join(dataPath, "candle_training_data.json");
                let trainingLogs = [];

                if (fs.existsSync(trainingDataPath)) {
                    const raw = fs.readFileSync(trainingDataPath, "utf-8");
                    if (raw.trim() !== "") trainingLogs = JSON.parse(raw);
                }

                const contextCandles = candles.slice(-10);

                trainingLogs.push({
                    timestamp: new Date().toISOString(),
                    symbol: symbol,
                    firebaseUserId: resolvedUserId,
                    price: price,
                    candles: contextCandles,
                });

                if (trainingLogs.length > 5000) trainingLogs.shift();

                fs.writeFileSync(trainingDataPath, JSON.stringify(trainingLogs, null, 2));
            }
        } catch (e) {
            console.error("Error saving training data:", e);
        }

        const news = readFilter();
        const calendar = checkCalendar();
        const session = getSession();
        const risk = getRiskState();

        const pattern = analyzePattern({
            candles: candles,
            candlesH1: candles_h1,
            candlesH4: candles_h4,
            overlapPips: overlapPips,
        });

        const ictContext = analyzeICT(candles);

        const historicalVolume = evaluateCurrentVolumeAgainstHistory({
            firebaseUserId: resolvedUserId,
            symbol,
            candles
        });

        const evaluateResult = await evaluateDecision({
            news,
            calendar,
            session,
            risk,
            pattern,
            ictContext,
            historicalVolume,
            market: {
                userId: resolvedUserId,
                symbol: symbol,
                timeframe: "M5",
                price: price,
                candles: candles,
                candlesH1: candles_h1,
                candlesH4: candles_h4,
                portfolio: req.body.portfolio || { currentPosition: "NONE", count: 0 },
            },
        });

        const score = evaluateResult.score || 0;
        let finalDecision = decision(evaluateResult);

        const defensiveFlags = evaluateResult.defensiveFlags || {
            warningMatched: false,
            lotMultiplier: 1,
            tpMultiplier: 1,
            reason: null,
        };

        let slPoints = 500;
        let tpPoints = 800;
        let lotSize = 0.01;
        let retracePoints = 0;

        if (pattern.slPrice && price) {
            const dynamicSLPips = Math.abs(price - pattern.slPrice) * 100;
            if (dynamicSLPips > 50 && dynamicSLPips < 1500) {
                slPoints = Math.round(dynamicSLPips);
            }
        }

        if (pattern.tpPrice && price) {
            const dynamicTPPips = Math.abs(pattern.tpPrice - price) * 100;
            if (dynamicTPPips > 100 && dynamicTPPips < 3000) {
                tpPoints = Math.round(dynamicTPPips);
            }
        }

        if (score >= 5) {
            retracePoints = 0;
        } else if (score >= 3 && score < 5) {
            retracePoints = 40;
        } else {
            retracePoints = 55;
        }

        if (score >= -5) {
            retracePoints = 0;
        } else if (score >= -3 && score < -5) {
            retracePoints = 40;
        } else {
            retracePoints = 55;
        }

        const hour = new Date().getHours();

        if (!pattern.slPrice && !pattern.tpPrice) {
            if (hour >= 19 && hour <= 23) {
                slPoints = 1000;
                tpPoints = 5000;
            } else if (hour >= 7 && hour <= 8) {
                tpPoints = 300;
                slPoints = 600;
            } else if (hour >= 23 || hour <= 6) {
                retracePoints = 150;
            }
        }

        if (balance && balance > 0) {
            const riskPercent = calculateDynamicRisk(score, pattern.type, evaluateResult.mode, 2.0);
            const riskAmount = balance * (riskPercent / 100);
            let calculatedLot = riskAmount / slPoints;

            if (Math.abs(score) < 5.5) {
                calculatedLot *= 1.5;
            }

            lotSize = Number(calculatedLot.toFixed(2));
            if (lotSize < 0.01) lotSize = 0.01;
            if (lotSize > 5.0) lotSize = 5.0;
        }

        if (Math.abs(score) < 3.0) {
            tpPoints = Math.round(tpPoints * 0.4);
        } else if (Math.abs(score) < 5.5) {
            tpPoints = Math.round(tpPoints * 0.7);
        }

        if (defensiveFlags.warningMatched) {
            lotSize = Number((lotSize * defensiveFlags.lotMultiplier).toFixed(2));
            if (lotSize < 0.01) lotSize = 0.01;

            tpPoints = Math.round(tpPoints * defensiveFlags.tpMultiplier);
            evaluateResult.mode = "SCALP";
        }

        if (tpPoints < 200) {
            tpPoints = 200;
        }

        return res.json({
            decision: finalDecision,
            score: score,
            firebaseUserId: resolvedUserId,
            mode: evaluateResult.mode || "NORMAL",
            trend: evaluateResult.trend || "NEUTRAL",
            pattern: pattern,
            historicalVolume: historicalVolume,
            defensiveFlags: defensiveFlags,
            trade_setup: {
                recommended_lot: lotSize,
                sl_points: slPoints,
                tp_points: tpPoints,
                retrace_points: retracePoints,
            },
        });
    } catch (error) {
        console.error("Signal processing error:", error);
        return res.status(500).json({
            decision: "NO_TRADE",
            score: 0,
            firebaseUserId: resolvedUserId,
            mode: "NORMAL",
            trend: "NEUTRAL",
            error: error.message || "Internal server error",
        });
    }
});

app.post("/trade-event", async (req, res) => {
    const {
        type,
        symbol,
        firebaseUserId,
        side,
        lot,
        price,
        sl,
        tp,
        profit,
        mode
    } = req.body;

    const resolvedUserId = firebaseUserId || null;

    console.log({
        ...req.body,
        firebaseUserId: resolvedUserId
    });

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
        message = `🚨 ปิดออเดอร์หนี (${mode})\nSide: ${side}\nProfit: ${profit}`;
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

    history.push({
        ...req.body,
        firebaseUserId: resolvedUserId
    });

    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

    if (type === "CLOSE_ORDER") {
        const maePlaLogPath = path.join(__dirname, "data", "mae_pla_logs.json");
        let maePlaLogs = [];

        if (fs.existsSync(maePlaLogPath)) {
            const rawLog = fs.readFileSync(maePlaLogPath, "utf-8");
            if (rawLog.trim() !== "") maePlaLogs = JSON.parse(rawLog);
        }

        maePlaLogs.push({
            timestamp: new Date().toISOString(),
            type: "trade_result",
            ticket_id: req.body.ticket_id || Date.now(),
            firebaseUserId: resolvedUserId,
            result: parseFloat(profit) > 0 ? "TP" : "SL",
            pnl_pips: parseFloat(profit),
            market_conditions_at_entry: {
                symbol: symbol,
                side: side
            },
            lesson_learned:
                parseFloat(profit) > 0
                    ? "Trade successful. Align with Mae Pla rules."
                    : "Trade failed. Need to review entry condition or market session."
        });

        fs.writeFileSync(maePlaLogPath, JSON.stringify(maePlaLogs, null, 2));
    }

    analyzePerformance();

    try {
        await insertTradeHistory({
            firebaseUserId: resolvedUserId,
            ticketId: "",
            eventType: type,
            symbol,
            side,
            lot,
            price,
            sl,
            tp,
            profit,
            mode,
            eventTime: new Date(),
        });
    } catch (dbError) {
        console.error("Insert trade_history error:", dbError.message);
        return res.status(500).json({
            success: false,
            error: "Insert trade_history failed"
        });
    }

    res.json({
        success: true,
        firebaseUserId: resolvedUserId
    });
});


app.post("/check-exit-signal", async (req, res) => {
    const {
        firebaseUserId,
        openPosition,
        candles,
        currentProfit,
        symbol = "XAUUSD",
        mode = "NORMAL"
    } = req.body;

    if (!openPosition || !candles) {
        return res.status(400).json({ error: "Missing required data: openPosition and candles" });
    }

    const resolvedUserId = firebaseUserId || null;

    try {
        const pattern = detectMotherFishPattern({ candles });

        const contextFeatures = buildContextFeatures({
            symbol,
            timeframe: "M5",
            side: openPosition.side,
            mode,
            pattern,
            marketPrice: openPosition.price || openPosition.entryPrice || 0,
            candles,
            now: new Date(),
        });

        const contextHash = buildContextHash(contextFeatures);

        const failedPattern = await findFailedPattern({
            userId: resolvedUserId,
            accountId: null,
            symbol,
            timeframe: "M5",
            side: openPosition.side,
            mode,
            contextHash
        });

        // =========================
        // Analyze
        // =========================
        const exitDecision = analyzeEarlyExit({
            firebaseUserId: resolvedUserId,
            openPosition,
            currentProfit,
            candles,
            failedPattern
        });

        console.log(
            `-> 🕵️ Early Exit [${resolvedUserId}] ${openPosition.side}: ${exitDecision.action} - ${exitDecision.reason}`
        );

        return res.json(exitDecision);
    } catch (error) {
        console.error("Early Exit analysis failed:", error.message);
        return res.status(500).json({ action: "HOLD", reason: "Analysis engine error." });
    }
});

app.post("/webhook/mae-pla", async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[Mae Pla Webhook] Received type: ${payload.type}`);

        const dataPath = path.join(__dirname, "data");
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath);
        }

        const logPath = path.join(dataPath, "mae_pla_logs.json");

        let logs = [];
        if (fs.existsSync(logPath)) {
            const raw = fs.readFileSync(logPath, "utf-8");
            if (raw.trim() !== "") logs = JSON.parse(raw);
        }

        logs.push(payload);
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

        if (payload.type === "market_context") {
            console.log("-> Market Context Updated: recommendation =", payload.recommendation);
        } else if (payload.type === "signal_validation") {
            console.log("-> Signal Validation:", payload.action, "Score:", payload.ai_confidence_score);
        } else if (payload.type === "trade_result") {
            console.log("-> Trade Learning Logged:", payload.result, "Lesson:", payload.lesson_learned);
        }

        res.json({ success: true, message: "Mae Pla data logged & processed" });
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update failed_patterns every 1 hour
cron.schedule("0 */1 * * *", () => {
    runDailyLearning();
});

// 06:00 - Morning Brief
cron.schedule("0 6 * * *", () => {
    console.log("[AI Cron] Waking up AI for Morning Brief...");
    exec('openclaw chat "สรุปข่าวเศรษฐกิจ XAUUSD ของวันนี้ และส่ง news_filter เข้า webhook"');
});

// 07:00 - Asian Session
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
        writeFilter("./trade-filter.json", analysis);
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