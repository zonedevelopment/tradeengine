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

function ensureDataDir() {
  const dataPath = path.join(__dirname, "data");
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
}

function safeReadJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Failed to read JSON array from ${filePath}:`, error.message);
    return [];
  }
}

function safeWriteJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Failed to write JSON to ${filePath}:`, error.message);
    return false;
  }
}

function normalizeTicketId(value) {
  if (value === undefined || value === null) return null;

  const str = String(value).trim();
  if (!str) return null;

  if (!/^\d+$/.test(str)) {
    return null;
  }

  const num = Number(str);
  return Number.isSafeInteger(num) ? num : null;
}

function calculateAvgRange(candles = [], length = 3) {
  if (!Array.isArray(candles) || candles.length < length) return 50;

  const recent = candles.slice(-length);
  const ranges = recent.map(c =>
    Math.abs(Number(c.high || 0) - Number(c.low || 0)) * 100
  );

  const avg = ranges.reduce((sum, v) => sum + v, 0) / ranges.length;
  return avg;
}

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
      if (Array.isArray(candles) && candles.length > 0) {
        const dataPath = ensureDataDir();
        const trainingDataPath = path.join(dataPath, "candle_training_data.json");
        const trainingLogs = safeReadJsonArray(trainingDataPath);

        const contextCandles = candles.slice(-10);
        trainingLogs.push({
          timestamp: new Date().toISOString(),
          symbol: symbol,
          firebaseUserId: resolvedUserId,
          price: price,
          candles: contextCandles,
        });

        if (trainingLogs.length > 5000) {
          trainingLogs.shift();
        }

        safeWriteJson(trainingDataPath, trainingLogs);
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
      candles,
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
    const finalDecision = decision(evaluateResult);

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

    let signalStrength = 0;
    if (side === "BUY") {
      signalStrength = score;
    } else if (side === "SELL") {
      signalStrength = -score;
    }

    const avgRange = calculateAvgRange(candles, 5);

    if (side === "BUY") {
      if (pattern.slPrice < price) {
        slPoints = Math.round((price - pattern.slPrice) * 100);
      } else {
        slPoints = Math.round(avgRange * 1.2);
      }
      if (pattern.tpPrice > price) {
        tpPoints = Math.round((pattern.tpPrice - price) * 100);
      } else {
        tpPoints = Math.round(avgRange * 2.0);
      }
    } else if (side === "SELL") {
      if (pattern.slPrice > price) {
        slPoints = Math.round((pattern.slPrice - price) * 100);
      } else {
        slPoints = Math.round(avgRange * 1.2);
      }
      if (pattern.tpPrice < price) {
        tpPoints = Math.round((price - pattern.tpPrice) * 100);
      } else {
        tpPoints = Math.round(avgRange * 2.0);
      }
    }

    retracePoints = Math.round(avgRange * 0.6);
    
    if (signalStrength >= 6) {
      retracePoints = Math.round(retracePoints * 0.35);
    } else if (signalStrength >= 4) {
      retracePoints = Math.round(retracePoints * 0.60);
    } else if (signalStrength >= 2) {
      retracePoints = Math.round(retracePoints * 0.90);
    } else {
      retracePoints = Math.round(retracePoints * 1.20);
    }
    
    if (pattern?.isVolumeClimax) {
      retracePoints = Math.round(retracePoints * 0.80);
    }
    
    if (pattern?.isVolumeDrying) {
      retracePoints = Math.round(retracePoints * 1.15);
    }

    const maxRetraceBySL = Math.round(slPoints * 0.4);
    if (retracePoints > maxRetraceBySL) {
      retracePoints = maxRetraceBySL;
    }
    
    if (retracePoints < 20) retracePoints = 20;
    if (retracePoints > 200) retracePoints = 200;

    if (balance && balance > 0) {
      const riskPercent = calculateDynamicRisk(
        score,
        pattern.type,
        evaluateResult.mode,
        2.0
      );
      const riskAmount = balance * (riskPercent / 100);
      let calculatedLot = riskAmount / slPoints;

      if (signalStrength >= 6) {
        calculatedLot *= 1.1;
      } else if (signalStrength < 3) {
        calculatedLot *= 0.75;
      }

      lotSize = Number(calculatedLot.toFixed(2));
      if (lotSize < 0.01) lotSize = 0.01;
      if (lotSize > 5.0) lotSize = 5.0;
    }

    // ===== TP / SL Scaling (USE signalStrength) =====
    if (signalStrength < 3.0) {
      tpPoints = Math.round(tpPoints * 0.4);
      slPoints = Math.round(slPoints * 0.7);
    } else if (signalStrength < 5.5) {
      tpPoints = Math.round(tpPoints * 0.7);
      slPoints = Math.round(slPoints * 0.85);
    } else if (signalStrength >= 6.0) {
      tpPoints = Math.round(tpPoints * 1.1);
    }

    if (defensiveFlags.warningMatched) {
      lotSize = Number((lotSize * defensiveFlags.lotMultiplier).toFixed(2));
      if (lotSize < 0.01) lotSize = 0.01;

      tpPoints = Math.round(tpPoints * defensiveFlags.tpMultiplier);
      tpPoints = Math.round(tpPoints * 0.8);
      evaluateResult.mode = "SCALP";
    }

    if (tpPoints < 200) tpPoints = 200;
    if (slPoints < 150) slPoints = 150;
    if (tpPoints > 3000) tpPoints = 3000;
    if (slPoints > 1500) slPoints = 1500;

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
    mode,
    ticketId,
    ticket_id,
    eventTime,
  } = req.body;

  const resolvedUserId = firebaseUserId || null;
  const normalizedTicketId = normalizeTicketId(ticketId ?? ticket_id);

  // เช็คว่าเป็นเสาร์-อาทิตย์หรือไม่ (0 = Sunday, 6 = Saturday)
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;

  console.log("trade-event payload:", {
    ...req.body,
    firebaseUserId: resolvedUserId,
    normalizedTicketId,
    isWeekend
  });

  let message = "";
  if (isWeekend) {
  if (type === "OPEN_ORDER") {
    message = `🟢 เปิดออเดอร์ใหม่ (BACKTEST ${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "CLOSE_ORDER") {
    message = `🔴 ปิดออเดอร์แล้ว (BACKTEST ${mode})\nSide: ${side}\nProfit: ${profit}`;
  }

  if (type === "WAIT_ORDER") {
    message = `🔘 รอเปิดออเดอร์ (BACKTEST ${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "MOVE_TO_BE") {
    message = `🔘 ย้าย SL (BACKTEST ${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "CANCEL_ORDER") {
    message = `⚫ ยกเลิกออเดอร์ (BACKTEST ${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "CLOSE_EMERGENCY") {
    message = `🚨 ปิดออเดอร์หนี (BACKTEST ${mode})\nSide: ${side}\nnProfit: ${profit}`;
  }
} else {
  if (type === "OPEN_ORDER") {
    message = `🟢 เปิดออเดอร์ใหม่ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "CLOSE_ORDER") {
    message = `🔴 ปิดออเดอร์แล้ว (${mode})\nSide: ${side}\nProfit: ${profit}`;
  }

  if (type === "WAIT_ORDER") {
    message = `🔘 รอเปิดออเดอร์ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "MOVE_TO_BE") {
    message = `🔘 ย้าย SL (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "CANCEL_ORDER") {
    message = `⚫ ยกเลิกออเดอร์ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  }

  if (type === "CLOSE_EMERGENCY") {
    message = `🚨 ปิดออเดอร์หนี (${mode})\nSide: ${side}\nnProfit: ${profit}`;
  }
}

  try {
    // ปิดการแจ้งเตือน Telegram หากเป็นการรัน Backtest วันหยุด
    if (message && !isWeekend) {
      await sendTelegram(
        process.env.TELEGRAM_BOT_TOKEN,
        process.env.TELEGRAM_CHAT_ID,
        message
      );
    }
  } catch (telegramError) {
    console.error("Telegram send error:", telegramError.message);
  }

  try {
    const dataPath = ensureDataDir();

    // แยกไฟล์ประวัติการเทรด
    const historyFileName = isWeekend ? "trade-history-backtest.json" : "trade-history.json";
    const historyFile = path.join(dataPath, historyFileName);
    const history = safeReadJsonArray(historyFile);

    history.push({
      ...req.body,
      firebaseUserId: resolvedUserId,
      ticketId: normalizedTicketId,
      ticket_id: normalizedTicketId,
      logged_at: new Date().toISOString(),
    });

    safeWriteJson(historyFile, history);

    if (type === "CLOSE_ORDER" || type === "CLOSE_EMERGENCY") {
      // แยกไฟล์ Mae Pla logs
      const maePlaLogName = isWeekend ? "mae_pla_logs_backtest.json" : "mae_pla_logs.json";
      const maePlaLogPath = path.join(dataPath, maePlaLogName);
      const maePlaLogs = safeReadJsonArray(maePlaLogPath);
      const numericProfit = Number(profit || 0);

      maePlaLogs.push({
        timestamp: new Date().toISOString(),
        type: "trade_result",
        ticket_id: normalizedTicketId || Date.now(),
        firebaseUserId: resolvedUserId,
        result: numericProfit > 0 ? "TP" : "SL",
        pnl_pips: numericProfit,
        market_conditions_at_entry: {
          symbol: symbol,
          side: side,
        },
        lesson_learned:
          numericProfit > 0
            ? "Trade successful. Align with Mae Pla rules."
            : "Trade failed. Need to review entry condition or market session.",
      });

      safeWriteJson(maePlaLogPath, maePlaLogs);
    }
  } catch (fileError) {
    console.error("Trade-event file logging error:", fileError.message);
  }

  try {
    // ไม่คำนวณ Performance ของจริงหากเป็น Backtest
    if (!isWeekend) analyzePerformance();
  } catch (perfError) {
    console.error("analyzePerformance error:", perfError.message);
  }

  let dbInsertResult = null;
  let dbInsertError = null;

  try {
    // Bypass การบันทึกลงฐานข้อมูล MySQL
    if (!isWeekend) {
      dbInsertResult = await insertTradeHistory({
        firebaseUserId: resolvedUserId,
        ticketId: normalizedTicketId,
        eventType: type,
        symbol,
        side,
        lot,
        price,
        sl,
        tp,
        profit,
        mode,
        eventTime: eventTime ? new Date(eventTime) : new Date(),
      });
    } else {
      dbInsertResult = { bypassed: true, note: "Weekend Backtest Bypass" };
    }
  } catch (dbError) {
    dbInsertError = dbError;
    console.error("Insert trade_history error:", dbError.message);
  }

  return res.json({
    success: true,
    firebaseUserId: resolvedUserId,
    ticketId: normalizedTicketId,
    isWeekend: isWeekend,
    db_saved: !isWeekend && !dbInsertError,
    db_error: dbInsertError ? dbInsertError.message : null,
    db_result: dbInsertResult || null,
  });
});

app.post("/check-exit-signal", async (req, res) => {
  // const {
  //   firebaseUserId,
  //   openPosition,
  //   candles,
  //   currentProfit,
  //   symbol = "XAUUSD",
  //   mode = "NORMAL",
  // } = req.body;
  const {
    firebaseUserId,
    openPosition,
    candles,
    currentProfit,
    symbol = "XAUUSD",
    mode = "NORMAL",
    tpPoints,
    slPoints,
  } = req.body;

  if (!openPosition || !candles) {
    return res.status(400).json({
      error: "Missing required data: openPosition and candles",
    });
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
      contextHash,
    });

    // const exitDecision = analyzeEarlyExit({
    //   firebaseUserId: resolvedUserId,
    //   openPosition,
    //   currentProfit,
    //   candles,
    //   failedPattern,
    // });
    const exitDecision = analyzeEarlyExit({
        firebaseUserId: resolvedUserId,
        openPosition,
        currentProfit,
        candles,
        failedPattern,
        mode,
        tpPoints,
        slPoints,
      });

    console.log(
      `-> ️ Early Exit [${resolvedUserId}] ${openPosition.side}: ${exitDecision.action} - ${exitDecision.reason}`
    );

    return res.json(exitDecision);
  } catch (error) {
    console.error("Early Exit analysis failed:", error.message);
    return res.status(500).json({
      action: "HOLD",
      reason: "Analysis engine error.",
    });
  }
});

app.post("/webhook/mae-pla", async (req, res) => {
  try {
    const payload = req.body;
    console.log(`[Mae Pla Webhook] Received type: ${payload.type}`);

    const dataPath = ensureDataDir();
    const logPath = path.join(dataPath, "mae_pla_logs.json");
    const logs = safeReadJsonArray(logPath);

    logs.push(payload);
    safeWriteJson(logPath, logs);

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

cron.schedule("0 */1 * * *", () => {
  runDailyLearning();
});

cron.schedule("0 6 * * *", () => {
  console.log("[AI Cron] Waking up AI for Morning Brief...");
  exec('openclaw chat "สรุปข่าวเศรษฐกิจ XAUUSD ของวันนี้ และส่ง news_filter เข้า webhook"');
});

cron.schedule("0 7 * * *", () => {
  console.log("[AI Cron] Waking up AI for Asian Session...");
  exec('openclaw chat "ส่ง market_context บอก EA ให้ระวัง Sideway บีบตัว หรือ pause_ea"');
});

cron.schedule("0 14 * * *", () => {
  console.log("[AI Cron] Waking up AI for London Session...");
  exec('openclaw chat "ประเมินโครงสร้าง H1/H4 ปัจจุบัน แล้วส่ง market_context อนุญาตให้ EA กลับมาเทรด (active)"');
});

cron.schedule("0 18 * * *", async () => {
  console.log("[AI Cron] Waking up AI for US Session...");
  exec('openclaw chat "อัปเดตข่าวค่ำนี้ และเตรียมขยับ SL/TP ของ EA เป็น 300/500 จุดผ่าน webhook"');
});

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
      `AI GOLD BOT\n\n สรุปผลการเทรดประจำวัน\n\nTrades: ${result.summary.totalTrades}\nWins: ${result.summary.wins}\nLosses: ${result.summary.losses}\nWinRate: ${result.summary.winRate}%\nProfit: ${result.summary.totalProfit}`
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
