require("dotenv").config();
var cors = require('cors')
const express = require("express");
const cron = require("node-cron");
const { testConnection, query } = require("./db");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
const { insertTradeHistory, countTradeHistoryByUser, getTradeHistoryByUser, getTradeHistoryDetailFromCommands, getTodayTradeStatsByUserAndAccount } = require("./tradeHistory.repo");

const { evaluateCurrentVolumeAgainstHistory } = require("./brain/volume-history.service");
const { exec } = require("child_process");

const {
  broadcastActivePositionChange
} = require("./activePosition.stream")

const {
  upsertDailyAccountSnapshot
} = require("./accountSnapshot.repo");

const {
  upsertLiveAccountSnapshot,
  getAggregatedLiveAccountSnapshotByUser
} = require("./accountSnapshotLive.repo");

const {
  addAccountSnapshotClient,
  removeAccountSnapshotClient,
  sendSse,
  broadcastAccountSnapshot,
  initSseHeaders
} = require("./accountSnapshot.stream");

const { syncActivePositionsToFirebase } = require("./firebaseActivePositions.service");

const {
  insertEmergencyCommand,
  getPendingEmergencyCommand,
  markEmergencyCommandProcessing,
  updateEmergencyCommandResult,
  getEmergencyCommandById,
  expireOldPendingCommands
} = require("./emergencyCommand.repo");

const {
  syncActivePositionsToMongo,
  getActivePositionsByUserAndSymbol,
} = require("./activePosition.mongo.repo");

const {
  registerSseClient,
  unregisterSseClient,
} = require("./activePosition.stream");

const database = require('./config/mongoDB')
const ActivePosition = require("./models/ActivePosition");
const CandleTrainingData = require("./models/CandleTrainingData");

const { trace } = require("console");

const microScalpEngine = require("./microScalpEngine");

const MICRO_SCALP_CONFIG = {
  enabled: true,
  minScore: 45,
  minScoreGap: 8,
  maxSpread: 20,

  onePositionOnly: true,
  maxHoldBars: 2,
  maxLossUsd: 8,
  minProfitToClose: 2,

  trendWeight: 1,
  momentumWeight: 1,
  entryWeight: 1,
  volumeWeight: 1,
  penaltyWeight: 1,

  extremeBodyMultiplier: 2.5,
  momentumBodyMultiplier: 1.2,

  useVolume: true,
  minVolumeRatio: 1.05,
};

const symbolConfig = {
  // "XAUUSD": { pipMultiplier: 100, minSL: 800, maxSL: 1500, minTP: 950, maxTP: 2500 },
  // "BTCUSD": { pipMultiplier: 100, minSL: 1250, maxSL: 5500, minTP: 1700, maxTP: 5500 },
  // "XAUUSDm": { pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1800 },
  // "BTCUSDm": { pipMultiplier: 100, minSL: 1200, maxSL: 5000, minTP: 1500, maxTP: 5000 },
  // "DEFAULT": { pipMultiplier: 100, minSL: 100, maxSL: 2000, minTP: 150, maxTP: 4000 }
  NORMAL: {
    "XAUUSD": { pipMultiplier: 100, minSL: 800, maxSL: 1500, minTP: 950, maxTP: 2500 },
    "BTCUSD": { pipMultiplier: 100, minSL: 1250, maxSL: 5500, minTP: 1700, maxTP: 5500 },
    "XAUUSDm": { pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1800 },
    "BTCUSDm": { pipMultiplier: 100, minSL: 1200, maxSL: 5000, minTP: 1500, maxTP: 5000 },
    "DEFAULT": { pipMultiplier: 100, minSL: 100, maxSL: 2000, minTP: 150, maxTP: 4000 }
  },
  SCALP: {
    "XAUUSD": { pipMultiplier: 100, minSL: 300, maxSL: 600, minTP: 500, maxTP: 800 },
    "BTCUSD": { pipMultiplier: 100, minSL: 800, maxSL: 2000, minTP: 1000, maxTP: 2500 },
    "XAUUSDm": { pipMultiplier: 100, minSL: 300, maxSL: 600, minTP: 500, maxTP: 800 },
    "BTCUSDm": { pipMultiplier: 100, minSL: 800, maxSL: 2000, minTP: 1000, maxTP: 2500 },
    "DEFAULT": { pipMultiplier: 100, minSL: 300, maxSL: 1000, minTP: 600, maxTP: 2000 }
  }
};

const app = express();
app.use(express.json());

const whiteList = ['https://tradeengine.zonedevnode.com'];
var corsOptionsDelegate = function (req, callback) {
  var corsOptions;
  if (whiteList.indexOf(req.header('Origin')) !== -1) {
    corsOptions = { origin: true }
  } else {
    corsOptions = { origin: false }
  }

  callback(null, corsOptions)
}

app.use(cors(corsOptionsDelegate));

function getActiveSymbolConfig(symbol, mode = "NORMAL") {
  const safeMode = String(mode || "NORMAL").toUpperCase();
  const configByMode = symbolConfig[safeMode] || symbolConfig.NORMAL;
  return configByMode[symbol] || configByMode.DEFAULT;
}

function ensureDataDir() {
  const dataPath = path.join(__dirname, "data");
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
}

function normalizeNullable(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function normalizeDirectionBias(value) {
  const allowed = ["AUTO", "BUY_ONLY", "SELL_ONLY", "DISABLE_NEW_ENTRY"];
  const v = String(value || "AUTO").trim().toUpperCase();
  return allowed.includes(v) ? v : "AUTO";
}

function toBool(value, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return defaultValue;
}

function toPositiveInt(value, defaultValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(0, Math.floor(n));
}

function toPositiveDecimal(value, defaultValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(0, Number(n.toFixed(2)));
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

function calculateAvgRange(candles = [], length = 3, pipMultiplier) {
  if (!Array.isArray(candles) || candles.length < length) return 50;

  const recent = candles.slice(-length);
  const ranges = recent.map(c =>
    Math.abs(Number(c.high || 0) - Number(c.low || 0)) * 100
  );

  const avg = ranges.reduce((sum, v) => sum + v, 0) / ranges.length;
  return (avg * pipMultiplier);
}

function hasPrimarySignal(result) {
  if (!result || typeof result !== "object") return false;

  const signal = String(result.signal || "").toUpperCase();
  return signal === "BUY" || signal === "SELL";
}

function isPrimaryTradeDecision(decisionValue) {
  return [
    "ALLOW_BUY",
    "ALLOW_SELL",
    "ALLOW_BUY_SCALP",
    "ALLOW_SELL_SCALP",
    "ALLOW_BUY_PYRAMID",
    "ALLOW_SELL_PYRAMID",
  ].includes(String(decisionValue || "").toUpperCase());
}

function normalizePortfolio(portfolio) {
  if (!portfolio || typeof portfolio !== "object") {
    return { currentPosition: "NONE", count: 0 };
  }

  return {
    currentPosition: String(portfolio.currentPosition || "NONE").toUpperCase(),
    count: Number(portfolio.count || 0),
  };
}

function mapMicroScoreToMainScore(microScore, side) {
  const raw = Number(microScore || 0);

  // แปลง 45..100 ให้ใกล้ช่วง score เดิมของระบบหลัก
  // 45 => 2.45, 100 => 5.20
  const normalized = 2.45 + Math.max(0, raw - 45) * 0.05;
  const rounded = Number(normalized.toFixed(2));

  return String(side || "").toUpperCase() === "SELL" ? -rounded : rounded;
}

function buildTradeSetupFromPattern({
  side,
  price,
  pattern,
  candles,
  balance,
  spreadPoints,
  activeCfg,
  score,
  defensiveFlags,
}) {
  let slPoints = 500;
  let tpPoints = 800;
  let lotSize = 0.01;
  let retracePoints = 0;
  let signalStrength = 0;

  if (side === "BUY") signalStrength = score;
  else if (side === "SELL") signalStrength = -score;

  const mult = activeCfg.pipMultiplier;
  const avgRange = calculateAvgRange(candles, 3, mult);

  if (side === "BUY") {
    if (pattern.slPrice < price) {
      slPoints = Math.round((price - pattern.slPrice) * mult);
    } else {
      slPoints = Math.round(avgRange * 1.4);
    }

    if (pattern.tpPrice > price) {
      tpPoints = Math.round((pattern.tpPrice - price) * mult);
    } else {
      tpPoints = Math.round(avgRange * 2.2);
    }

    if (spreadPoints > 0) {
      slPoints += Math.round(spreadPoints * 1.75);
      tpPoints += Math.round(spreadPoints * 1.75);
    }
  } else if (side === "SELL") {
    if (pattern.slPrice > price) {
      slPoints = Math.round((pattern.slPrice - price) * mult);
    } else {
      slPoints = Math.round(avgRange * 1.4);
    }

    if (pattern.tpPrice < price) {
      tpPoints = Math.round((price - pattern.tpPrice) * mult);
    } else {
      tpPoints = Math.round(avgRange * 2.2);
    }

    if (spreadPoints > 0) {
      slPoints += Math.round(spreadPoints * 1.75);
      tpPoints += Math.round(spreadPoints * 1.75);
    }
  }

  // Calculate Retracement
  retracePoints = Math.round(avgRange * 0.85);

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
  if (retracePoints > maxRetraceBySL) retracePoints = maxRetraceBySL;

  const minR = 20 * (mult / 100);
  const maxR = 200 * (mult / 100);
  if (retracePoints < minR) retracePoints = minR;
  if (retracePoints > maxR) retracePoints = maxR;
  // const lastCandle = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
  // const recentBodies = Array.isArray(candles) ? candles.slice(-5).map(c => Math.abs(Number(c.close || 0) - Number(c.open || 0))) : [];
  // const avgBody = recentBodies.length
  //   ? recentBodies.reduce((sum, v) => sum + v, 0) / recentBodies.length
  //   : 0;
  
  // const lastBody = lastCandle
  //   ? Math.abs(Number(lastCandle.close || 0) - Number(lastCandle.open || 0))
  //   : 0;
  
  // const lastVolume = lastCandle ? Number(lastCandle.tickVolume || lastCandle.tick_volume || 0) : 0;
  // const recentVolumes = Array.isArray(candles)
  //   ? candles.slice(-5).map(c => Number(c.tickVolume || c.tick_volume || 0))
  //   : [];
  // const avgVolume = recentVolumes.length
  //   ? recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length
  //   : 0;
  
  // const isStrongMomentumCandle = avgBody > 0 && lastBody >= avgBody * 1.35;
  // const isStrongVolume = avgVolume > 0 && lastVolume >= avgVolume * 1.10;
  // const isHighConfidence = signalStrength >= 6;
  // const isMediumConfidence = signalStrength >= 4;
  
  // if (isStrongMomentumCandle && isStrongVolume && isHighConfidence) {
  //   retracePoints = Math.round(retracePoints * 0.20);
  // } else if ((isStrongMomentumCandle && isMediumConfidence) || (isStrongVolume && isHighConfidence)) {
  //   retracePoints = Math.round(retracePoints * 0.35);
  // } else if (signalStrength >= 2) {
  //   retracePoints = Math.round(retracePoints * 0.60);
  // } else {
  //   retracePoints = Math.round(retracePoints * 0.90);
  // }
  
  // if (pattern?.isVolumeClimax) {
  //   retracePoints = Math.round(retracePoints * 0.75);
  // }
  
  // if (pattern?.isVolumeDrying) {
  //   retracePoints = Math.round(retracePoints * 1.10);
  // }

  // End Calculate Retracement

  if (balance && balance > 0) {
    const riskPercent = calculateDynamicRisk(
      score,
      pattern.type,
      "SCALP",
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

  if (signalStrength < 3.0) {
    tpPoints = Math.round(tpPoints * 0.6);
    slPoints = Math.round(slPoints * 0.85);
  } else if (signalStrength < 5.5) {
    tpPoints = Math.round(tpPoints * 0.9);
    slPoints = Math.round(slPoints * 0.95);
  } else if (signalStrength >= 6.0) {
    tpPoints = Math.round(tpPoints * 1.15);
  }

  if (defensiveFlags?.warningMatched) {
    lotSize = Number((lotSize * defensiveFlags.lotMultiplier).toFixed(2));
    if (lotSize < 0.01) lotSize = 0.01;
    tpPoints = Math.round(tpPoints * defensiveFlags.tpMultiplier);
  }

  if (tpPoints < activeCfg.minTP) tpPoints = activeCfg.minTP;
  if (slPoints < activeCfg.minSL) slPoints = activeCfg.minSL;
  if (tpPoints > activeCfg.maxTP) tpPoints = activeCfg.maxTP;
  if (slPoints > activeCfg.maxSL) slPoints = activeCfg.maxSL;

  return {
    recommended_lot: lotSize,
    sl_points: slPoints,
    tp_points: tpPoints,
    retrace_points: retracePoints,
  };
}

function buildMicroFallbackResponse({
  microResult,
  reqBody,
  resolvedUserId,
  pattern,
  historicalVolume,
  activeCfg,
}) {
  const side = String(reqBody.side || "").toUpperCase();
  const microSignal = String(microResult.signal || "").toUpperCase();

  if (microSignal !== side) {
    return null;
  }

  const score = mapMicroScoreToMainScore(microResult.confidenceScore, side);
  const decision =
    side === "BUY" ? "ALLOW_BUY_SCALP" : "ALLOW_SELL_SCALP";

  const defensiveFlags = {
    warningMatched: false,
    lotMultiplier: 1,
    tpMultiplier: 1,
    reason: "MICRO_SCALP_FALLBACK",
  };

  const trade_setup = buildTradeSetupFromPattern({
    side,
    price: Number(reqBody.price || 0),
    pattern,
    candles: Array.isArray(reqBody.candles) ? reqBody.candles : [],
    balance: Number(reqBody.balance || 0),
    spreadPoints: Number(reqBody.spreadPoints || 0),
    activeCfg,
    score,
    defensiveFlags,
  });

  return {
    decision,
    score,
    firebaseUserId: resolvedUserId,
    mode: "MICRO_SCALP",
    trend:
      microSignal === "BUY" ? "BULLISH" :
      microSignal === "SELL" ? "BEARISH" :
      "NEUTRAL",
    pattern,
    historicalVolume,
    defensiveFlags,
    trade_setup,
  };
}

app.post("/signal", async (req, res) => {
  const {
    symbol,
    firebaseUserId,
    accountId,
    side,
    price,
    candles,
    candles_h1,
    candles_h4,
    balance,
    overlapPips,
  } = req.body;

  const resolvedUserId = firebaseUserId || null;
  const spreadPoints = req.body.spreadPoints || 0;

  console.log(candles)

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

    const pattern = await analyzePattern({
      symbol: symbol,
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
        sessionName: session.name,
      },
    });

    const score = evaluateResult.score || 0;
    const finalDecision = decision(evaluateResult);

    try {
      if (Array.isArray(candles) && candles.length > 0) {
        const contextCandles = candles.slice(-10).map((c) => ({
          time: c.time ? new Date(c.time) : null,
          open: Number(c.open || 0),
          high: Number(c.high || 0),
          low: Number(c.low || 0),
          close: Number(c.close || 0),
          tickVolume: Number(c.tickVolume || c.tick_volume || 0),
        }));
    
        await CandleTrainingData.create({
          firebaseUserId: resolvedUserId || "",
          accountId: accountId || "",
          symbol: symbol || "",
          timeframe: "M5",
          eventTime: new Date(),
          price: Number(price || 0),
          candles: contextCandles,
          source: "signal",
          mode: evaluateResult.mode || "NORMAL",
        });
      }
    } catch (e) {
      console.error("Error saving candle training data to MongoDB:", e);
    }

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

    // const activeCfg = symbolConfig[symbol] || symbolConfig["DEFAULT"];
    const activeCfg = getActiveSymbolConfig(symbol, evaluateResult.mode || "NORMAL");
    
    // ========= FALLBACK TO MICRO SCALP =========
    if (!isPrimaryTradeDecision(finalDecision)) {
      const microResult = microScalpEngine.evaluateMicroScalp({
        candles: Array.isArray(candles) ? candles : [],
        spread: Number(spreadPoints || 0),
        openPositions: [],
        config: MICRO_SCALP_CONFIG,
      });

      if (microResult.allowOpen) {
        const microResponse = buildMicroFallbackResponse({
          microResult,
          reqBody: req.body,
          resolvedUserId,
          pattern,
          historicalVolume,
          activeCfg,
        });

        if (microResponse) {
          console.log(`[MICRO_SCALP FALLBACK] symbol=${symbol} side=${side} score=${microResponse.score} decision=${microResponse.decision}`);

          return res.json(microResponse);
        }
      }
    }
    
    const defensiveFlags = evaluateResult.defensiveFlags || {
      warningMatched: false,
      lotMultiplier: 1,
      tpMultiplier: 1,
      reason: null,
    };
    
    const trade_setup = buildTradeSetupFromPattern({
      side,
      price: Number(price || 0),
      pattern,
      candles,
      balance: Number(balance || 0),
      spreadPoints: Number(spreadPoints || 0),
      activeCfg,
      score,
      defensiveFlags,
    });

    return res.json({
      decision: finalDecision,
      score: score,
      firebaseUserId: resolvedUserId,
      mode: evaluateResult.mode || "NORMAL",
      trend: evaluateResult.trend || "NEUTRAL",
      pattern: pattern,
      historicalVolume: historicalVolume,
      defensiveFlags: defensiveFlags,
      trade_setup,
    });
    // return res.json({
    //   decision: finalDecision,
    //   score: score,
    //   firebaseUserId: resolvedUserId,
    //   mode: evaluateResult.mode || "NORMAL",
    //   trend: evaluateResult.trend || "NEUTRAL",
    //   pattern: pattern,
    //   historicalVolume: historicalVolume,
    //   defensiveFlags: defensiveFlags,
    //   trade_setup: {
    //     recommended_lot: lotSize,
    //     sl_points: slPoints,
    //     tp_points: tpPoints,
    //     retrace_points: retracePoints,
    //   },
    // });
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
    accountId,
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

  console.log("trade-event payload:", {
    ...req.body,
    firebaseUserId: resolvedUserId,
    normalizedTicketId,
  });

  let message = "";

  if (type === "OPEN_ORDER") {
    message = `🟢 เปิดออเดอร์ใหม่ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  } else if (type === "CLOSE_ORDER") {
    message = `🔴 ปิดออเดอร์แล้ว (${mode})\nSide: ${side}\nProfit: ${profit}`;
  } else if (type === "WAIT_ORDER") {
    message = `🔘 รอเปิดออเดอร์ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  } else if (type === "MOVE_TO_BE") {
    message = `🔘 ย้าย SL (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  } else if (type === "CANCEL_ORDER") {
    message = `⚫ ยกเลิกออเดอร์ (${mode})\nSide: ${side}\nLot: ${lot}\nEntry: ${price}\nSL: ${sl}\nTP: ${tp}`;
  } else if (type === "CLOSE_EMERGENCY") {
    message = `🚨 ปิดออเดอร์หนี (${mode})\nSide: ${side}\nProfit: ${profit}`;
  }

  try {
    if (message) {
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

    const historyFile = path.join(dataPath, "trade-history.json");
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
      const maePlaLogPath = path.join(dataPath, "mae_pla_logs.json");
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
    await analyzePerformance(resolvedUserId, symbol, mode);
  } catch (perfError) {
    console.error("analyzePerformance error:", perfError.message);
  }

  let dbInsertResult = null;
  let dbInsertError = null;

  try {
    dbInsertResult = await insertTradeHistory({
      firebaseUserId: resolvedUserId,
      accountId: accountId,
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
  } catch (dbError) {
    dbInsertError = dbError;
    console.error("Insert trade_history error:", dbError.message);
  }

  return res.json({
    success: true,
    firebaseUserId: resolvedUserId,
    ticketId: normalizedTicketId,
    db_saved: !dbInsertError,
    db_error: dbInsertError ? dbInsertError.message : null,
    db_result: dbInsertResult || null,
  });
});

// app.post("/check-exit-signal", async (req, res) => {
//   // BYPASS EARLY EXIT TEMPORARILY
//   return res.json({
//     action: "HOLD",
//     reason: "Early exit bypassed manually to prevent panic closes.",
//     riskLevel: "LOW",
//     score: 0
//   });
// });

app.post("/check-exit-signal", async (req, res) => {
  const {
    firebaseUserId,
    openPosition,
    candles,
    currentProfit,
    failedPattern = null,
    mode = null,
    tpPoints = null,
    slPoints = null
  } = req.body;

  const resolvedUserId = firebaseUserId || null;

  try {
    const resolvedMode =
      mode ||
      openPosition?.mode ||
      openPosition?.tradeMode ||
      "NORMAL";

    const resolvedTpPoints = Number(
      tpPoints ??
      openPosition?.tpPoints ??
      openPosition?.tp_points ??
      0
    );

    const resolvedSlPoints = Number(
      slPoints ??
      openPosition?.slPoints ??
      openPosition?.sl_points ??
      0
    );
    
    const result = analyzeEarlyExit({
      firebaseUserId: resolvedUserId,
      openPosition,
      currentProfit,
      candles,
      failedPattern,
      mode: String(resolvedMode || "NORMAL").toUpperCase(),
      tpPoints: Number.isFinite(resolvedTpPoints) ? resolvedTpPoints : 0,
      slPoints: Number.isFinite(resolvedSlPoints) ? resolvedSlPoints : 0
    });

    return res.json(result);
  } catch (error) {
    console.error("check-exit-signal error:", error);

    return res.status(500).json({
      action: "HOLD",
      reason: error.message || "Internal server error",
      riskLevel: "UNKNOWN",
      score: 0
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

app.get("/trade-history/:firebaseUserId", async (req, res) => {
  const { firebaseUserId } = req.params;
  const { limit = 50, page = 1 } = req.query;

  if (!firebaseUserId) {
    return res.status(400).json({
      success: false,
      error: "firebaseUserId is required"
    });
  }

  try {
    const total = await countTradeHistoryByUser(firebaseUserId);
    const [rows] = await getTradeHistoryByUser(firebaseUserId, limit, page);

    return res.json({
      success: true,
      data: rows.result,
      date: rows.dateSql,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit || 50))
      }
    });
  } catch (error) {
    console.error("trade-history error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.post("/active-positions", async (req, res) => {
  const {
    firebaseUserId,
    accountId = null,
    symbol,
    positions = [],
    eventTime = null
  } = req.body;

  console.log(req.body)

  try {
    const result = await syncActivePositionsToMongo({
      firebaseUserId,
      accountId,
      symbol,
      positions,
      eventTime,
    });

    // ดึงข้อมูลล่าสุดหลัง sync
    const rows = await ActivePosition.find({ firebaseUserId })
      .sort({ updatedAt: -1 })
      .lean();

    // const origin = req.headers.origin;
    // if (origin === "https://tradeengine.zonedevnode.com") {
    //   res.setHeader("Access-Control-Allow-Origin", origin);
    // }

    // res.setHeader("Content-Type", "text/event-stream");
    // res.setHeader("Cache-Control", "no-cache, no-transform");
    // res.setHeader("Connection", "keep-alive");
    // res.setHeader("X-Accel-Buffering", "no");

    // res.flushHeaders?.();

    // broadcast ไป frontend
    if (rows.length > 0) {
      broadcastActivePositionChange({
        firebaseUserId,
        symbol,
        eventName: "active-position-update",
        payload: {
          action: "sync",
          firebaseUserId,
          symbol: symbol || "",
          data: rows,
          eventTime,
          synced: result?.synced || 0
        }
      });
    } else {
      broadcastActivePositionChange({
        firebaseUserId,
        symbol,
        eventName: "active-position-update",
        payload: {
          action: "delete",
          firebaseUserId,
          symbol: symbol || "",
          data: rows,
          eventTime,
          synced: result?.synced || 0
        }
      });
    }

    // sendSse(res, "active-positions-update", {
    //   action: "update",
    //   firebaseUserId,
    //   symbol: symbol || "",
    //   data: rows
    // });

    return res.json({
      success: true,
      message: "Active positions synced successfully",
      synced: result?.synced || 0
    });
  } catch (error) {
    console.error("active-positions sync error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/active-positions", async (req, res) => {
  const { firebaseUserId } = req.query;

  if (!firebaseUserId) {
    return res.status(400).json({
      success: false,
      error: "firebaseUserId is required"
    });
  }

  try {
    const query = { firebaseUserId };
    // if (symbol) {
    //   query.symbol = String(symbol).toUpperCase();
    // }

    const rows = await ActivePosition.find(query)
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("get active-positions error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/active-positions/stream", async (req, res) => {
  const { firebaseUserId, symbol = "" } = req.query;

  if (!firebaseUserId) {
    return res.status(400).json({
      success: false,
      error: "firebaseUserId is required"
    });
  }

  const origin = req.headers.origin;
  if (origin === "https://tradeengine.zonedevnode.com") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders?.();

  const clientId = crypto.randomUUID();

  registerSseClient({
    clientId,
    firebaseUserId,
    symbol,
    res
  });

  try {
    const query = { firebaseUserId };
    // if (symbol) query.symbol = String(symbol).toUpperCase();

    const rows = await ActivePosition.find(query)
      .sort({ updatedAt: -1 })
      .lean();

    sendSse(res, "active-positions-init", {
      action: "init",
      firebaseUserId,
      symbol: symbol || "",
      data: rows
    });
  } catch (error) {
    sendSse(res, "error", {
      message: error.message || "Failed to load initial active positions"
    });
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) { }
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unregisterSseClient(clientId);
    try { res.end(); } catch (_) { }
  });
});

app.get("/active-positions/:firebaseUserId", async (req, res) => {
  const { firebaseUserId } = req.params;

  try {
    const rows = await getActivePositionsByUserAndSymbol({
      firebaseUserId
    });

    // return res.json({
    //   success: true,
    //   data: rows
    // });
    return res.json({
      success: true,
      data: rows || {
        firebaseUserId,
        balance: 0,
        equity: 0,
        margin: 0,
        freeMargin: 0,
        floatingProfit: 0,
        dailyProfit: 0,
        dailyLoss: 0,
        dailyNetProfit: 0,
        todayWinTrades: 0,
        todayLossTrades: 0,
        todayClosedTrades: 0,
        openPositionsCount: 0,
        maxPositions: 0,
        eventTime: null
      }
    });
  } catch (error) {
    console.error("get active-positions error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

// app.post("/account-snapshot", async (req, res) => {
//   const {
//     firebaseUserId,
//     accountId,
//     balance,
//     equity,
//     margin,
//     freeMargin,
//     floatingProfit,
//     dailyProfit,
//     dailyLoss,
//     dailyNetProfit,
//     todayWinTrades,
//     todayLossTrades,
//     todayClosedTrades,
//     openPositionsCount,
//     maxPositions,
//     eventTime
//   } = req.body;

//   if (!firebaseUserId) {
//     return res.status(400).json({
//       success: false,
//       error: "firebaseUserId is required"
//     });
//   }

//   try {
//     console.log("[account-snapshot] incoming:", {
//       firebaseUserId,
//       accountId,
//       balance,
//       equity,
//       dailyProfit,
//       dailyLoss,
//       dailyNetProfit,
//       floatingProfit,
//       openPositionsCount,
//       eventTime
//     });

//     await upsertDailyAccountSnapshot({
//       firebaseUserId,
//       accountId,
//       balance,
//       equity,
//       margin,
//       freeMargin,
//       floatingProfit,
//       dailyProfit,
//       dailyLoss,
//       dailyNetProfit,
//       todayWinTrades,
//       todayLossTrades,
//       todayClosedTrades,
//       openPositionsCount,
//       maxPositions,
//       eventTime
//     });

//     return res.json({
//       success: true,
//       message: "Daily account snapshot saved successfully"
//     });
//   } catch (error) {
//     console.error("account-snapshot error:", error);
//     return res.status(500).json({
//       success: false,
//       error: error.message || "Internal server error"
//     });
//   }
// });

app.post("/account-snapshot", async (req, res) => {
  try {
    // const {
    //   firebaseUserId,
    //   accountId = "",
    //   eventTime = null
    // } = req.body || {};
    const body = req.body || {};
    const firebaseUserId = String(body.firebaseUserId || "").trim();

    if (!firebaseUserId) {
      return res.status(400).json({
        success: false,
        error: "firebaseUserId is required"
      });
    }

    const tradeStats = await getTodayTradeStatsByUserAndAccount(
      firebaseUserId,
      body.accountId,
      body.eventTime
    );

    console.log(tradeStats)

    const payloadToSave = {
      firebaseUserId,
      accountId: body.accountId || "",
      eventTime: body.eventTime || new Date(),

      balance: body.balance || 0,
      equity: body.equity || 0,
      margin: body.margin || 0,
      freeMargin: body.freeMargin || 0,
      floatingProfit: body.floatingProfit || 0,
      openPositionsCount: body.openPositionsCount || 0,

      dailyProfit: tradeStats.dailyProfit,
      dailyLoss: tradeStats.dailyLoss,
      dailyNetProfit: tradeStats.dailyNetProfit,
      todayWinTrades: tradeStats.todayWinTrades,
      todayLossTrades: tradeStats.todayLossTrades,
      todayClosedTrades: tradeStats.todayClosedTrades
    };

    await upsertLiveAccountSnapshot(payloadToSave);
    await upsertDailyAccountSnapshot(payloadToSave);

    const data = await getAggregatedLiveAccountSnapshotByUser(firebaseUserId);
    broadcastAccountSnapshot(firebaseUserId, data);

    // live snapshot ล่าสุดต่อ account
    // await upsertLiveAccountSnapshot(body);

    // daily snapshot history
    // await upsertDailyAccountSnapshot(body);

    // aggregate ทั้ง user
    // const data = await getAggregatedLiveAccountSnapshotByUser(firebaseUserId);

    // broadcast stream
    // broadcastAccountSnapshot(firebaseUserId, data);

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("account-snapshot sync error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/account-snapshot", async (req, res) => {
  try {
    const { firebaseUserId } = req.query;

    if (!firebaseUserId) {
      return res.status(400).json({
        success: false,
        error: "firebaseUserId is required"
      });
    }

    const data = await getAggregatedLiveAccountSnapshotByUser(firebaseUserId);

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("get account-snapshot error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/account-snapshot/stream", async (req, res) => {
  try {
    const { firebaseUserId } = req.query;

    if (!firebaseUserId) {
      return res.status(400).json({
        success: false,
        error: "firebaseUserId is required"
      });
    }

    initSseHeaders(res);
    addAccountSnapshotClient(firebaseUserId, res);

    sendSse(res, "connected", {
      success: true,
      message: "account snapshot stream connected"
    });

    const data = await getAggregatedLiveAccountSnapshotByUser(firebaseUserId);

    sendSse(res, "account-snapshot", {
      success: true,
      data
    });

    const heartbeat = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeAccountSnapshotClient(firebaseUserId, res);
      res.end();
    });
  } catch (error) {
    console.error("account-snapshot stream error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error"
      });
    }

    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({
        success: false,
        error: error.message || "Internal server error"
      })}\n\n`);
      res.end();
    } catch (_) { }
  }
});

app.get("/account-snapshot/:firebaseUserId", async (req, res) => {
  const { firebaseUserId } = req.params;

  if (!firebaseUserId) {
    return res.status(400).json({
      success: false,
      error: "firebaseUserId is required"
    });
  }

  try {
    const row = await getTodayAccountSnapshotByUser(firebaseUserId);

    return res.json({
      success: true,
      data: row || null
    });
  } catch (error) {
    console.error("get account-snapshot error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

//Emergency close
app.post("/commands/emergency-close", async (req, res) => {
  const {
    firebaseUserId,
    accountId,
    symbol,
    scope = "ONE",
    ticketId = null,
    eventTime
  } = req.body;

  if (!accountId) {
    return res.status(400).json({
      success: false,
      error: "accountId is required"
    });
  }

  if (!symbol) {
    return res.status(400).json({
      success: false,
      error: "symbol is required"
    });
  }

  const safeScope = String(scope || "").trim().toUpperCase();

  if (!["ALL", "ONE"].includes(safeScope)) {
    return res.status(400).json({
      success: false,
      error: "scope must be ALL or ONE"
    });
  }

  if (safeScope === "ONE" && !ticketId) {
    return res.status(400).json({
      success: false,
      error: "ticketId is required when scope is ONE"
    });
  }

  try {
    const command = await insertEmergencyCommand({
      firebaseUserId,
      accountId,
      symbol,
      type: safeScope === "ONE" ? "CLOSE_POSITION" : "EMERGENCY_CLOSE",
      scope: safeScope,
      ticketId,
      eventTime
    });

    console.log("[emergency-close] command created:", command);

    return res.json({
      success: true,
      message: "Emergency command created successfully",
      data: command
    });
  } catch (error) {
    console.error("emergency-close error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/commands/pending", async (req, res) => {
  const { accountId, symbol } = req.query;

  if (!accountId) {
    return res.status(400).json({
      success: false,
      hasCommand: false,
      error: "accountId is required"
    });
  }

  if (!symbol) {
    return res.status(400).json({
      success: false,
      hasCommand: false,
      error: "symbol is required"
    });
  }

  try {
    await expireOldPendingCommands(5);

    const command = await getPendingEmergencyCommand(accountId, symbol);

    if (!command) {
      return res.json({
        success: true,
        hasCommand: false
      });
    }

    // await markEmergencyCommandProcessing(command.command_id);

    return res.json({
      success: true,
      hasCommand: true,
      commandId: command.command_id,
      type: command.type,
      scope: command.scope,
      ticketId: command.ticket_id ? String(command.ticket_id) : "",
      symbol: command.symbol
    });
  } catch (error) {
    console.error("commands/pending error:", error);

    return res.status(500).json({
      success: false,
      hasCommand: false,
      error: error.message || "Internal server error"
    });
  }
});

app.post("/commands/result", async (req, res) => {
  const {
    commandId,
    status,
    message,
    closePrice,
    closeProfit,
    eventTime
  } = req.body;

  if (!commandId) {
    return res.status(400).json({
      success: false,
      error: "commandId is required"
    });
  }

  if (!status) {
    return res.status(400).json({
      success: false,
      error: "status is required"
    });
  }

  try {
    await updateEmergencyCommandResult({
      commandId,
      status,
      message,
      eventTime
    });

    const command = await getEmergencyCommandById(commandId);

    console.log("[commands/result] updated:", {
      commandId,
      status,
      message
    });

    //Update trade history
    let dbInsertResult = null;
    let dbInsertError = null;

    const tradeHistory = await getTradeHistoryDetailFromCommands(commandId);

    try {
      dbInsertResult = await insertTradeHistory({
        firebaseUserId: tradeHistory.firebase_user_id,
        ticketId: tradeHistory.ticket_id,
        eventType: "CLOSE_ORDER",
        symbol: tradeHistory.symbol,
        side: tradeHistory.side,
        lot: tradeHistory.lot,
        closePrice,
        sl: tradeHistory.sl,
        tp: tradeHistory.tp,
        closeProfit,
        mode: tradeHistory.mode,
        eventTime: new Date(),
      });
    } catch (dbError) {
      dbInsertError = dbError;
      console.error("Insert trade_history error:", dbError.message);
    }

    try {
      analyzePerformance(tradeHistory.firebase_user_id, tradeHistory.symbol, tradeHistory.mode);
    } catch (perfError) {
      console.error("analyzePerformance error:", perfError.message);
    }

    return res.json({
      success: true,
      message: "Command result updated successfully",
      data: command
    });
  } catch (error) {
    console.error("commands/result error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/commands/:commandId", async (req, res) => {
  const { commandId } = req.params;

  if (!commandId) {
    return res.status(400).json({
      success: false,
      error: "commandId is required"
    });
  }

  try {
    const command = await getEmergencyCommandById(commandId);

    return res.json({
      success: true,
      data: command || null
    });
  } catch (error) {
    console.error("get command by id error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/runDailyLearning", async (req, res) => {
  try {
    await runDailyLearning();

    return res.json({
      success: true
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/learnPatternWeights", async (req, res) => {
  try {
    const result = await learnPatternWeights();

    return res.json({
      success: true,
      data: result || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/analyzePerformance", async (req, res) => {
  try {
    //const result = await analyzePerformance();

    return res.json({
      success: true,
      data: result || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/updateNewsAnalysis", async (req, res) => {
  try {
    const result = await updateNewsAnalysis();

    return res.json({
      success: true,
      data: result || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

app.get("/updateSummary", async (req, res) => {
  try {
    const result = await analyzePerformance();

    // await sendTelegram(
    //   process.env.TELEGRAM_BOT_TOKEN,
    //   process.env.TELEGRAM_CHAT_ID,
    //   `AI GOLD BOT\n\n สรุปผลการเทรดประจำวัน\n\nTrades: ${result.summary.totalTrades}\nWins: ${result.summary.wins}\nLosses: ${result.summary.losses}\nWinRate: ${result.summary.winRate}%\nProfit: ${result.summary.totalProfit}`
    // );
  } catch (err) {
    console.error("Performance Report Error:", err.message);
  }
});

async function updateNewsAnalysis() {
  try {
    // const news = await fetchNews();
    const analysis = await analyzeWithGemini(process.env.GEMINI_API_KEY);

    const tradeFilter = path.join(__dirname, "trade-filter.json");
    writeFilter(tradeFilter, analysis);
  } catch (err) {
    console.log("news error", err);
  }
}

app.post("/trading-preferences", async (req, res) => {
  try {
    const {
      firebaseUserId,
      accountId = null,
      engineEnabled = true,
      directionBias = "AUTO",
      maxOpenPositions = 5,
      baseLotSize = 0.01,
      changedBy = null,
      note = null,
    } = req.body || {};

    const safeFirebaseUserId = normalizeNullable(firebaseUserId);
    const safeAccountId = normalizeNullable(accountId);
    const safeEngineEnabled = toBool(engineEnabled, true) ? 1 : 0;
    const safeDirectionBias = normalizeDirectionBias(directionBias);
    const safeMaxOpenPositions = toPositiveInt(maxOpenPositions, 5);
    const safeBaseLotSize = toPositiveDecimal(baseLotSize, 0.01);
    const safeChangedBy = normalizeNullable(changedBy);
    const safeNote = normalizeNullable(note);

    if (!safeFirebaseUserId) {
      return res.status(400).json({
        success: false,
        error: "firebaseUserId is required",
      });
    }

    if (safeMaxOpenPositions < 1 || safeMaxOpenPositions > 100) {
      return res.status(400).json({
        success: false,
        error: "maxOpenPositions must be between 1 and 100",
      });
    }

    if (safeBaseLotSize <= 0 || safeBaseLotSize > 100) {
      return res.status(400).json({
        success: false,
        error: "baseLotSize must be greater than 0 and not exceed 100",
      });
    }

    const upsertSql = `
      INSERT INTO user_trading_preferences (
        firebase_user_id,
        account_id,
        engine_enabled,
        direction_bias,
        max_open_positions,
        base_lot_size
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        engine_enabled = VALUES(engine_enabled),
        direction_bias = VALUES(direction_bias),
        max_open_positions = VALUES(max_open_positions),
        base_lot_size = VALUES(base_lot_size),
        updated_at = CURRENT_TIMESTAMP
    `;

    await query(
      upsertSql,
      [
        safeFirebaseUserId,
        safeAccountId,
        safeEngineEnabled,
        safeDirectionBias,
        safeMaxOpenPositions,
        safeBaseLotSize,
      ],
      { retries: 2 }
    );

    const historySql = `
      INSERT INTO user_trading_preferences_history (
        firebase_user_id,
        account_id,
        engine_enabled,
        direction_bias,
        max_open_positions,
        base_lot_size,
        changed_by,
        change_source,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'USER_DASHBOARD', ?)
    `;

    await query(
      historySql,
      [
        safeFirebaseUserId,
        safeAccountId,
        safeEngineEnabled,
        safeDirectionBias,
        safeMaxOpenPositions,
        safeBaseLotSize,
        safeChangedBy,
        safeNote,
      ],
      { retries: 2 }
    );

    const getSql = `
      SELECT
        firebase_user_id AS firebaseUserId,
        account_id AS accountId,
        engine_enabled AS engineEnabled,
        direction_bias AS directionBias,
        max_open_positions AS maxOpenPositions,
        base_lot_size AS baseLotSize,
        updated_at AS updatedAt
      FROM user_trading_preferences
      WHERE firebase_user_id = ?
        AND account_id <=> ?
      LIMIT 1
    `;

    const rows = await query(getSql, [safeFirebaseUserId, safeAccountId], { retries: 2 });

    return res.json({
      success: true,
      message: "Trading preferences saved successfully",
      data: rows?.[0] || {
        firebaseUserId: safeFirebaseUserId,
        accountId: safeAccountId,
        engineEnabled: safeEngineEnabled,
        directionBias: safeDirectionBias,
        maxOpenPositions: safeMaxOpenPositions,
        baseLotSize: safeBaseLotSize,
      },
    });
  } catch (error) {
    console.error("trading-preferences save error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

app.get("/trading-preferences", async (req, res) => {
  try {
    const firebaseUserId = normalizeNullable(req.query.firebaseUserId);
    const accountId = normalizeNullable(req.query.accountId);

    if (!firebaseUserId) {
      return res.status(400).json({
        success: false,
        error: "firebaseUserId is required",
      });
    }

    const sql = `
      SELECT
        firebase_user_id AS firebaseUserId,
        account_id AS accountId,
        engine_enabled AS engineEnabled,
        direction_bias AS directionBias,
        max_open_positions AS maxOpenPositions,
        base_lot_size AS baseLotSize,
        updated_at AS updatedAt
      FROM user_trading_preferences
      WHERE firebase_user_id = ?
        AND (account_id <=> ? OR account_id IS NULL)
      ORDER BY
        CASE
          WHEN account_id <=> ? THEN 0
          WHEN account_id IS NULL THEN 1
          ELSE 2
        END,
        updated_at DESC
      LIMIT 1
    `;

    const rows = await query(sql, [firebaseUserId, accountId, accountId], { retries: 2 });
    const row = rows?.[0] || null;

    return res.json({
      success: true,
      data: row || {
        firebaseUserId,
        accountId,
        engineEnabled: 1,
        directionBias: "AUTO",
        maxOpenPositions: 5,
        baseLotSize: 0.01,
        updatedAt: null,
      },
    });
  } catch (error) {
    console.error("trading-preferences get error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

app.listen(5000, async () => {
  await database.connect();
  //startActivePositionChangeStream();
  console.log("Trading AI Engine running");
});
