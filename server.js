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
const {
  evaluateDecision,
  decision,
  resolveDecisionWithTradingPreferences,
} = require("./brain/decision-engine");
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
const {
  insertTradeHistory,
  countTradeHistoryByUser,
  getTradeHistoryByUser,
  getTradeHistoryDetailFromCommands,
  getTodayTradeStatsByUserAndAccount,
  getRecentClosedTradePerformance,
} = require("./tradeHistory.repo");

const { evaluateCurrentVolumeAgainstHistory } = require("./brain/volume-history.service");

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
  countOpenPositionsByUserAccountAndSymbol
} = require("./activePosition.mongo.repo");

const {
  registerSseClient,
  unregisterSseClient,
} = require("./activePosition.stream");

const database = require('./config/mongoDB')
const ActivePosition = require("./models/ActivePosition");
const CandleTrainingData = require("./models/CandleTrainingData");

const microScalpEngine = require("./microScalpEngine");

const { getUserTradingPreferences } = require("./userTradingPreferences.repo");
const {
  normalizeTradingPreferences,
  enforceDirectionBiasOnDecision,
  isMaxOpenPositionsReached,
  isOpenDecision,
} = require("./tradingPreferences.service");


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
  NORMAL: {
    "XAUUSD": { maxSpread: 100, pipMultiplier: 100, minSL: 1000, maxSL: 1400, minTP: 1250, maxTP: 1800 },
    "BTCUSD": { maxSpread: 200, pipMultiplier: 100, minSL: 1250, maxSL: 5500, minTP: 1700, maxTP: 5500 },
    "XAUUSDm": { maxSpread: 100, pipMultiplier: 100, minSL: 1000, maxSL: 1400, minTP: 1250, maxTP: 1800 },
    "BTCUSDm": { maxSpread: 200, pipMultiplier: 100, minSL: 1000, maxSL: 2000, minTP: 1200, maxTP: 3000 },
    "DEFAULT": { maxSpread: 30, pipMultiplier: 100, minSL: 100, maxSL: 2000, minTP: 150, maxTP: 4000 }
  },
  SCALP: {
    "XAUUSD": { maxSpread: 50, pipMultiplier: 100, minSL: 750, maxSL: 950, minTP: 800, maxTP: 1000 },
    "BTCUSD": { maxSpread: 80, pipMultiplier: 100, minSL: 800, maxSL: 2000, minTP: 1000, maxTP: 2500 },
    "XAUUSDm": { maxSpread: 50, pipMultiplier: 100, minSL: 750, maxSL: 950, minTP: 800, maxTP: 1000 },
    "BTCUSDm": { maxSpread: 80, pipMultiplier: 100, minSL: 400, maxSL: 600, minTP: 500, maxTP: 1000 },
    "DEFAULT": { maxSpread: 20, pipMultiplier: 100, minSL: 300, maxSL: 1000, minTP: 600, maxTP: 2000 }
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

function getCandleRange(candle = {}) {
  return Math.abs(toNum(candle.high) - toNum(candle.low));
}

function getUpperWick(candle = {}) {
  return Math.max(
    0,
    toNum(candle.high) - Math.max(toNum(candle.open), toNum(candle.close))
  );
}

function getLowerWick(candle = {}) {
  return Math.max(
    0,
    Math.min(toNum(candle.open), toNum(candle.close)) - toNum(candle.low)
  );
}

function getBodyRatio(candle = {}) {
  const range = getCandleRange(candle);
  if (range <= 0) return 0;
  return getBodySize(candle) / range;
}

function average(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + Number(v || 0), 0) / arr.length;
}

function overlapRatio(a = {}, b = {}) {
  const aLow = toNum(a.low);
  const aHigh = toNum(a.high);
  const bLow = toNum(b.low);
  const bHigh = toNum(b.high);

  const overlap = Math.max(0, Math.min(aHigh, bHigh) - Math.max(aLow, bLow));
  const base = Math.max(0.0000001, Math.min(aHigh - aLow, bHigh - bLow));

  return overlap / base;
}

function countDirectionalImpulse({ side, candles = [], lookback = 3 }) {
  const recent = Array.isArray(candles) ? candles.slice(-lookback) : [];
  if (recent.length === 0) return 0;

  let count = 0;

  for (let i = 0; i < recent.length; i++) {
    const c = recent[i] || {};
    const prev = i > 0 ? recent[i - 1] : null;
    const bodyRatio = getBodyRatio(c);

    const directional = side === "BUY" ? isBullish(c) : isBearish(c);
    if (!directional || bodyRatio < 0.55) continue;

    if (prev) {
      if (side === "BUY" && toNum(c.high) < toNum(prev.high)) continue;
      if (side === "SELL" && toNum(c.low) > toNum(prev.low)) continue;
    }

    count += 1;
  }

  return count;
}

function countCongestionBars(candles = [], lookback = 4) {
  const recent = Array.isArray(candles) ? candles.slice(-(lookback + 1)) : [];
  if (recent.length < 2) return 0;

  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (overlapRatio(recent[i], recent[i - 1]) >= 0.55) {
      count += 1;
    }
  }

  return count;
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

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getLastCandle(candles = [], indexFromEnd = 1) {
  if (!Array.isArray(candles) || candles.length < indexFromEnd) return null;
  return candles[candles.length - indexFromEnd] || null;
}

function getBodySize(candle = {}) {
  return Math.abs(toNum(candle.close) - toNum(candle.open));
}

function isBullish(candle = {}) {
  return toNum(candle.close) > toNum(candle.open);
}

function isBearish(candle = {}) {
  return toNum(candle.close) < toNum(candle.open);
}

function normalizeAdaptiveMode(mode = "NORMAL") {
  const raw = String(mode || "NORMAL").trim().toUpperCase();
  if (raw === "MICRO_SCALP") return "SCALP";
  return raw || "NORMAL";
}

function buildUserAdaptiveProfile({
  recentPerformance = null,
  mode = "NORMAL",
} = {}) {
  const normalizedMode = normalizeAdaptiveMode(mode);
  const isScalp = normalizedMode === "SCALP";
  const perf = recentPerformance && typeof recentPerformance === "object"
    ? recentPerformance
    : null;

  const sampleCount = Number(perf?.sampleCount || 0);
  const winRate = Number(perf?.winRate || 0);
  const netProfit = Number(perf?.netProfit || 0);
  const profitFactor = Number(perf?.profitFactor || 0);
  const lossStreak = Number(perf?.lossStreak || 0);
  const winStreak = Number(perf?.winStreak || 0);

  const profile = {
    enabled: false,
    stage: "NO_DATA",
    sampleCount,
    minScoreBoost: 0,
    lotMultiplier: 1,
    slMultiplier: 1,
    tpMultiplier: 1,
    retraceMultiplier: 1,
    reason: "NO_DATA",
  };

  if (sampleCount < 6) {
    return profile;
  }

  profile.enabled = true;
  profile.stage = "OBSERVE";
  profile.reason = "OBSERVE";

  // ฟอร์มแย่ -> ลด aggression แต่ยังไม่ hard stop
  if (
    lossStreak >= 4 ||
    (sampleCount >= 8 && profitFactor > 0 && profitFactor < 0.85 && netProfit < 0) ||
    (sampleCount >= 8 && winRate < 38 && netProfit < 0)
  ) {
    profile.stage = "DEFENSIVE";
    profile.reason = "RECENT_PERFORMANCE_WEAK";
    profile.minScoreBoost = isScalp ? 0.20 : 0.30;
    profile.lotMultiplier = isScalp ? 0.72 : 0.65;
    profile.slMultiplier = 1.03;
    profile.tpMultiplier = isScalp ? 0.93 : 0.90;
    profile.retraceMultiplier = isScalp ? 1.08 : 1.12;
    return profile;
  }

  // ฟอร์มอ่อนแบบไม่หนักมาก
  if (
    lossStreak >= 2 ||
    (sampleCount >= 8 && netProfit < 0) ||
    (sampleCount >= 8 && profitFactor > 0 && profitFactor < 1.0)
  ) {
    profile.stage = "CAUTIOUS";
    profile.reason = "RECENT_PERFORMANCE_SOFT";
    profile.minScoreBoost = isScalp ? 0.08 : 0.12;
    profile.lotMultiplier = isScalp ? 0.88 : 0.82;
    profile.slMultiplier = 1.01;
    profile.tpMultiplier = 0.97;
    profile.retraceMultiplier = 1.04;
    return profile;
  }

  // ฟอร์มดี -> เพิ่มได้แค่นิดเดียว เน้นรักษาพอร์ทก่อน
  if (
    sampleCount >= 8 &&
    winRate >= 60 &&
    netProfit > 0 &&
    (profitFactor === 99 || profitFactor >= 1.25)
  ) {
    profile.stage = "POSITIVE";
    profile.reason = "RECENT_PERFORMANCE_STRONG";
    profile.minScoreBoost = 0;
    profile.lotMultiplier = isScalp ? 1.05 : 1.08;
    profile.slMultiplier = 1.0;
    profile.tpMultiplier = isScalp ? 1.03 : 1.05;
    profile.retraceMultiplier = isScalp ? 0.97 : 0.95;
    return profile;
  }

  return profile;
}

function getAdaptiveMinRequiredScore({
  baseScore = 0,
  coldStartProfile = null,
  userAdaptiveProfile = null,
}) {
  let required = Number(baseScore || 0);

  if (coldStartProfile?.enabled) {
    required = Math.max(required, Number(coldStartProfile.minRequiredStrength || 0));
  }

  if (userAdaptiveProfile?.enabled) {
    required += Number(userAdaptiveProfile.minScoreBoost || 0);
  }

  return Number(required.toFixed(2));
}

function applyUserAdaptiveProfileToTradeSetup({
  tradeSetup,
  userAdaptiveProfile,
  activeCfg,
}) {
  if (!tradeSetup || !userAdaptiveProfile?.enabled) {
    return tradeSetup;
  }

  let slPoints = Math.round(
    Number(tradeSetup.sl_points || 0) * Number(userAdaptiveProfile.slMultiplier || 1)
  );
  let tpPoints = Math.round(
    Number(tradeSetup.tp_points || 0) * Number(userAdaptiveProfile.tpMultiplier || 1)
  );
  let retracePoints = Math.round(
    Number(tradeSetup.retrace_points || 0) *
    Number(userAdaptiveProfile.retraceMultiplier || 1)
  );

  let recommendedLot = Number(
    (
      Number(tradeSetup.recommended_lot || 0.01) *
      Number(userAdaptiveProfile.lotMultiplier || 1)
    ).toFixed(2)
  );

  const minSL = Number(activeCfg?.minSL || slPoints || 1);
  const maxSL = Number(activeCfg?.maxSL || slPoints || minSL);
  const minTP = Number(activeCfg?.minTP || tpPoints || 1);
  const maxTP = Number(activeCfg?.maxTP || tpPoints || minTP);

  slPoints = clampNumber(slPoints, minSL, maxSL);
  tpPoints = clampNumber(tpPoints, minTP, maxTP);

  if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
    retracePoints = Math.max(1, Math.round(minSL * 0.2));
  }

  if (!Number.isFinite(recommendedLot) || recommendedLot <= 0) {
    recommendedLot = 0.01;
  }

  if (recommendedLot < 0.01) recommendedLot = 0.01;

  return {
    ...tradeSetup,
    recommended_lot: recommendedLot,
    sl_points: slPoints,
    tp_points: tpPoints,
    retrace_points: retracePoints,
  };
}

function detectRetracementProfile({ side, candles = [], signalStrength = 0, mode = "NORMAL" }) {
  const c1 = getLastCandle(candles, 1);
  const c2 = getLastCandle(candles, 2);
  const c3 = getLastCandle(candles, 3);
  const c4 = getLastCandle(candles, 4);

  const scalpMode = String(mode || "").toUpperCase().includes("SCALP");

  if (!c1 || !c2 || !c3) {
    return {
      profile: "DEFAULT",
      retraceMultiplier: scalpMode ? 0.48 : 0.68,
      impulseCount: 0,
      congestionCount: 0,
      bodyRatio: 0,
      againstWickRatio: 0,
      slCapRatio: scalpMode ? 0.30 : 0.36,
    };
  }

  const recent = [c1, c2, c3, c4].filter(Boolean);
  const recentRanges = recent.map(getCandleRange);
  const recentBodies = recent.map(getBodySize);

  const recentRangeAvg = average(recentRanges);
  const recentBodyAvg = average(recentBodies);
  const bodyRatio = getBodyRatio(c1);

  const againstWick = side === "BUY" ? getUpperWick(c1) : getLowerWick(c1);
  const withWick = side === "BUY" ? getLowerWick(c1) : getUpperWick(c1);

  const againstWickRatio =
    getBodySize(c1) > 0 ? againstWick / Math.max(getBodySize(c1), 0.0000001) : 0;
  const withWickRatio =
    getBodySize(c1) > 0 ? withWick / Math.max(getBodySize(c1), 0.0000001) : 0;

  const impulseCount = countDirectionalImpulse({ side, candles, lookback: 3 });
  const congestionCount = countCongestionBars(candles, 4);

  const latestIsImpulse =
    getCandleRange(c1) >= recentRangeAvg * 1.15 &&
    bodyRatio >= 0.60;

  const strongContinuation =
    impulseCount >= 2 &&
    latestIsImpulse &&
    againstWickRatio <= 0.35;

  const climacticContinuation =
    impulseCount >= 2 &&
    getCandleRange(c1) >= recentRangeAvg * 1.35 &&
    bodyRatio >= 0.68 &&
    againstWickRatio <= 0.25;

  const congested =
    congestionCount >= 2 ||
    (recentRangeAvg > 0 && recentBodyAvg / recentRangeAvg < 0.38);

  const buyReversal =
    side === "BUY" &&
    isBullish(c1) &&
    toNum(c1.close) > toNum(c2.close) &&
    (withWickRatio >= 0.35 || bodyRatio < 0.58) &&
    !strongContinuation;

  const sellReversal =
    side === "SELL" &&
    isBearish(c1) &&
    toNum(c1.close) < toNum(c2.close) &&
    (withWickRatio >= 0.35 || bodyRatio < 0.58) &&
    !strongContinuation;

  if (climacticContinuation) {
    return {
      profile: scalpMode ? "SCALP_CLIMAX_CONTINUATION" : "NORMAL_CLIMAX_CONTINUATION",
      retraceMultiplier: signalStrength >= 6 ? 0.16 : signalStrength >= 4 ? 0.20 : 0.24,
      impulseCount,
      congestionCount,
      bodyRatio,
      againstWickRatio,
      slCapRatio: scalpMode ? 0.20 : 0.24,
    };
  }

  if (strongContinuation) {
    return {
      profile: scalpMode ? "SCALP_CONTINUATION" : "NORMAL_CONTINUATION",
      retraceMultiplier: signalStrength >= 6 ? 0.20 : signalStrength >= 4 ? 0.25 : 0.30,
      impulseCount,
      congestionCount,
      bodyRatio,
      againstWickRatio,
      slCapRatio: scalpMode ? 0.24 : 0.30,
    };
  }

  if (buyReversal || sellReversal) {
    return {
      profile: scalpMode ? "SCALP_REVERSAL" : "NORMAL_REVERSAL",
      retraceMultiplier: scalpMode ? 0.40 : 0.52,
      impulseCount,
      congestionCount,
      bodyRatio,
      againstWickRatio,
      slCapRatio: scalpMode ? 0.34 : 0.42,
    };
  }

  if (congested) {
    return {
      profile: scalpMode ? "SCALP_CONGESTION" : "NORMAL_CONGESTION",
      retraceMultiplier: scalpMode ? 0.52 : 0.74,
      impulseCount,
      congestionCount,
      bodyRatio,
      againstWickRatio,
      slCapRatio: scalpMode ? 0.40 : 0.48,
    };
  }

  return {
    profile: "DEFAULT",
    retraceMultiplier: scalpMode ? 0.46 : 0.64,
    impulseCount,
    congestionCount,
    bodyRatio,
    againstWickRatio,
    slCapRatio: scalpMode ? 0.30 : 0.36,
  };
}

function calculateAdaptiveRetracementPoints({
  side,
  candles = [],
  signalStrength = 0,
  mode = "NORMAL",
  avgRange = 0,
  slPoints = 0,
  pattern = {},
  defensiveFlags = {},
  pipMultiplier = 100,
}) {
  const scalpMode = String(mode || "").toUpperCase().includes("SCALP");
  const profile = detectRetracementProfile({ side, candles, signalStrength, mode });

  let retracePoints = Math.round(Number(avgRange || 0) * Number(profile.retraceMultiplier || 0));

  // impulse แรง -> ย่อตื้นลง
  if (profile.impulseCount >= 3) {
    retracePoints = Math.round(retracePoints * 0.90);
  } else if (profile.impulseCount === 0) {
    retracePoints = Math.round(retracePoints * 1.08);
  }

  // congestion มาก -> ย่อลึกขึ้น
  if (profile.congestionCount >= 3) {
    retracePoints = Math.round(retracePoints * 1.15);
  } else if (profile.congestionCount >= 2) {
    retracePoints = Math.round(retracePoints * 1.08);
  }

  // wick สวนทางเยอะ -> ต้องเผื่อย่อมากขึ้น
  if (profile.againstWickRatio >= 0.55) {
    retracePoints = Math.round(retracePoints * 1.10);
  }

  if (pattern?.isVolumeClimax) {
    retracePoints = Math.round(retracePoints * 0.82);
  }

  if (pattern?.isVolumeDrying) {
    retracePoints = Math.round(retracePoints * 1.10);
  }

  if (defensiveFlags?.warningMatched) {
    retracePoints = Math.round(retracePoints * 1.12);
  }

  const minR = scalpMode
    ? Math.round(10 * (pipMultiplier / 100))
    : Math.round(18 * (pipMultiplier / 100));

  const maxR = scalpMode
    ? Math.round(110 * (pipMultiplier / 100))
    : Math.round(190 * (pipMultiplier / 100));

  const slCapRatio = Number(profile.slCapRatio || (scalpMode ? 0.30 : 0.36));
  const maxRetraceBySL = Math.max(1, Math.round(Number(slPoints || 0) * slCapRatio));

  if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
    retracePoints = minR;
  }

  if (retracePoints < minR) retracePoints = minR;
  if (retracePoints > maxR) retracePoints = maxR;
  if (retracePoints > maxRetraceBySL) retracePoints = maxRetraceBySL;

  return {
    retracePoints,
    retraceProfile: profile.profile,
  };
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number(min || 0);
  return Math.max(Number(min || 0), Math.min(num, Number(max || num)));
}

function buildColdStartProfile({
  closedTradesCount = 0,
  mode = "NORMAL",
} = {}) {
  const closedTrades = Math.max(0, parseInt(closedTradesCount ?? 0, 10) || 0);
  const normalizedMode = String(mode || "NORMAL").trim().toUpperCase();

  const isMicro = normalizedMode === "MICRO_SCALP";
  const isScalp = normalizedMode === "SCALP" || isMicro;

  let profile = {
    enabled: false,
    stage: "MATURE",
    closedTradesCount: closedTrades,
    minRequiredStrength: 0,
    lotMultiplier: 1,
    slMultiplier: 1,
    tpMultiplier: 1,
    retraceMultiplier: 1,
    blockWeakSignals: false,
  };

  if (closedTrades < 12) {
    profile = {
      enabled: true,
      stage: "BOOTSTRAP",
      closedTradesCount: closedTrades,
      minRequiredStrength: isMicro ? 2.15 : isScalp ? 2.45 : 2.75,
      lotMultiplier: 0.50,
      slMultiplier: 1.05,
      tpMultiplier: 0.84,
      retraceMultiplier: 1.18,
      blockWeakSignals: true,
    };
  } else if (closedTrades < 40) {
    profile = {
      enabled: true,
      stage: "EARLY",
      closedTradesCount: closedTrades,
      minRequiredStrength: isMicro ? 2.00 : isScalp ? 2.30 : 2.55,
      lotMultiplier: 0.68,
      slMultiplier: 1.03,
      tpMultiplier: 0.90,
      retraceMultiplier: 1.10,
      blockWeakSignals: true,
    };
  } else if (closedTrades < 100) {
    profile = {
      enabled: true,
      stage: "WARM",
      closedTradesCount: closedTrades,
      minRequiredStrength: isMicro ? 1.90 : isScalp ? 2.15 : 2.35,
      lotMultiplier: 0.85,
      slMultiplier: 1.01,
      tpMultiplier: 0.96,
      retraceMultiplier: 1.04,
      blockWeakSignals: false,
    };
  }

  return profile;
}

function applyColdStartProfileToTradeSetup({
  tradeSetup,
  coldStartProfile,
  activeCfg,
}) {
  if (!tradeSetup || !coldStartProfile?.enabled) {
    return tradeSetup;
  }

  let slPoints = Math.round(
    Number(tradeSetup.sl_points || 0) * Number(coldStartProfile.slMultiplier || 1)
  );
  let tpPoints = Math.round(
    Number(tradeSetup.tp_points || 0) * Number(coldStartProfile.tpMultiplier || 1)
  );
  let retracePoints = Math.round(
    Number(tradeSetup.retrace_points || 0) *
    Number(coldStartProfile.retraceMultiplier || 1)
  );

  let recommendedLot = Number(
    (
      Number(tradeSetup.recommended_lot || 0.01) *
      Number(coldStartProfile.lotMultiplier || 1)
    ).toFixed(2)
  );

  const minSL = Number(activeCfg?.minSL || slPoints || 1);
  const maxSL = Number(activeCfg?.maxSL || slPoints || minSL);
  const minTP = Number(activeCfg?.minTP || tpPoints || 1);
  const maxTP = Number(activeCfg?.maxTP || tpPoints || minTP);

  slPoints = clampNumber(slPoints, minSL, maxSL);
  tpPoints = clampNumber(tpPoints, minTP, maxTP);

  if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
    retracePoints = Math.max(1, Math.round(minSL * 0.2));
  }

  if (!Number.isFinite(recommendedLot) || recommendedLot <= 0) {
    recommendedLot = 0.01;
  }

  if (recommendedLot < 0.01) recommendedLot = 0.01;

  return {
    ...tradeSetup,
    recommended_lot: recommendedLot,
    sl_points: slPoints,
    tp_points: tpPoints,
    retrace_points: retracePoints,
  };
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
  userMaxLotCap,
  coldStartProfile = null
}) {
  let slPoints = 500;
  let tpPoints = 800;
  let lotSize = 0.01;
  let retracePoints = 0;
  let signalStrength = 0;

  if (side === "BUY") signalStrength = Number(score || 0);
  else if (side === "SELL") signalStrength = Math.abs(Number(score || 0));

  const mult = Number(activeCfg?.pipMultiplier || 100);
  const avgRange = calculateAvgRange(candles, 3, mult);

  const detectedMode =
    String(pattern?.tradeMode || pattern?.mode || "").toUpperCase() ||
    (signalStrength >= 2.45 ? "SCALP" : "NORMAL");

  // -----------------------------
  // 1) Base SL / TP จาก pattern + avgRange
  // -----------------------------
  if (side === "BUY") {
    if (Number(pattern?.slPrice || 0) < Number(price || 0)) {
      slPoints = Math.round((Number(price) - Number(pattern.slPrice)) * mult);
    } else {
      slPoints = Math.round(avgRange * 1.4);
    }

    if (Number(pattern?.tpPrice || 0) > Number(price || 0)) {
      tpPoints = Math.round((Number(pattern.tpPrice) - Number(price)) * mult);
    } else {
      tpPoints = Math.round(avgRange * 2.2);
    }

    if (spreadPoints > 0) {
      slPoints += Math.round(Number(spreadPoints) * 1.75);
      tpPoints += Math.round(Number(spreadPoints) * 1.75);
    }
  } else if (side === "SELL") {
    if (Number(pattern?.slPrice || 0) > Number(price || 0)) {
      slPoints = Math.round((Number(pattern.slPrice) - Number(price)) * mult);
    } else {
      slPoints = Math.round(avgRange * 1.4);
    }

    if (Number(pattern?.tpPrice || 0) < Number(price || 0)) {
      tpPoints = Math.round((Number(price) - Number(pattern.tpPrice)) * mult);
    } else {
      tpPoints = Math.round(avgRange * 2.2);
    }

    if (spreadPoints > 0) {
      slPoints += Math.round(Number(spreadPoints) * 1.75);
      tpPoints += Math.round(Number(spreadPoints) * 1.75);
    }
  }

  // กันค่าหลุด/ติดลบตั้งแต่ต้น
  if (!Number.isFinite(slPoints) || slPoints <= 0) slPoints = Math.round(avgRange * 1.4);
  if (!Number.isFinite(tpPoints) || tpPoints <= 0) tpPoints = Math.round(avgRange * 2.2);

  // -----------------------------
  // 2) ปรับ SL / TP ตามคุณภาพสัญญาณก่อน
  // -----------------------------
  if (signalStrength < 3.0) {
    tpPoints = Math.round(tpPoints * 0.6);
    slPoints = Math.round(slPoints * 0.85);
  } else if (signalStrength < 5.5) {
    tpPoints = Math.round(tpPoints * 0.9);
    slPoints = Math.round(slPoints * 0.95);
  } else if (signalStrength >= 6.0) {
    tpPoints = Math.round(tpPoints * 1.15);
  }

  // Defensive flags ควรมีผลกับ TP ก่อนคำนวณ lot
  if (defensiveFlags?.warningMatched) {
    if (Number.isFinite(defensiveFlags?.tpMultiplier) && defensiveFlags.tpMultiplier > 0) {
      tpPoints = Math.round(tpPoints * defensiveFlags.tpMultiplier);
    }

    // รองรับในอนาคตถ้ามี slMultiplier
    if (Number.isFinite(defensiveFlags?.slMultiplier) && defensiveFlags.slMultiplier > 0) {
      slPoints = Math.round(slPoints * defensiveFlags.slMultiplier);
    }
  }

  // Clamp SL / TP ให้เป็นค่าจริงสุดท้ายก่อนคำนวณ lot
  if (slPoints < Number(activeCfg?.minSL || 1)) slPoints = Number(activeCfg.minSL || 1);
  if (tpPoints < Number(activeCfg?.minTP || 1)) tpPoints = Number(activeCfg.minTP || 1);

  if (slPoints > Number(activeCfg?.maxSL || slPoints)) slPoints = Number(activeCfg.maxSL || slPoints);
  if (tpPoints > Number(activeCfg?.maxTP || tpPoints)) tpPoints = Number(activeCfg.maxTP || tpPoints);

  // -----------------------------
  // 3) Retracement ใช้ mode จริง + อิง SL สุดท้าย
  // -----------------------------

  const retraceResult = calculateAdaptiveRetracementPoints({
    side,
    candles,
    signalStrength,
    mode: detectedMode,
    avgRange,
    slPoints,
    pattern,
    defensiveFlags,
    pipMultiplier: mult,
  });

  retracePoints = retraceResult.retracePoints;

  // -----------------------------
  // 4) คำนวณ lot จาก SL สุดท้าย
  // -----------------------------
  const modeBaseRisk = detectedMode === "SCALP" ? 1.2 : 2.0;
  if (balance && Number(balance) > 0) {
    const riskPercent = calculateDynamicRisk(
      signalStrength,
      pattern?.type,
      detectedMode,
      modeBaseRisk
    );

    const riskAmount = Number(balance) * (riskPercent / 100);
    let calculatedLot = riskAmount / slPoints;

    if (signalStrength >= 6) {
      calculatedLot *= 1.1;
    } else if (signalStrength < 3) {
      calculatedLot *= 0.75;
    }

    if (defensiveFlags?.warningMatched) {
      const lotMultiplier = Number(defensiveFlags?.lotMultiplier || 1);
      if (lotMultiplier > 0) {
        calculatedLot *= lotMultiplier;
      }
    }

    lotSize = Number(calculatedLot.toFixed(2));

    if (!Number.isFinite(lotSize) || lotSize <= 0) lotSize = 0.01;
    if (lotSize < 0.01) lotSize = 0.01;
    if (lotSize > 5.0) lotSize = 5.0;
  }

  let tradeSetup = {
    recommended_lot: lotSize,
    sl_points: slPoints,
    tp_points: tpPoints,
    retrace_points: retracePoints
  };

  tradeSetup = applyColdStartProfileToTradeSetup({
    tradeSetup,
    coldStartProfile,
    activeCfg,
  });

  const safeUserMaxLotCap = Number(userMaxLotCap || 0);
  if (
    safeUserMaxLotCap > 0 &&
    Number(tradeSetup.recommended_lot || 0) > safeUserMaxLotCap
  ) {
    tradeSetup.recommended_lot = Number(safeUserMaxLotCap.toFixed(2));
    if (tradeSetup.recommended_lot < 0.01) {
      tradeSetup.recommended_lot = 0.01;
    }
  }

  return tradeSetup;
  // const safeUserMaxLotCap = Number(userMaxLotCap || 0);
  // if (safeUserMaxLotCap > 0 && lotSize > safeUserMaxLotCap) {
  //   lotSize = Number(safeUserMaxLotCap.toFixed(2));
  //   if (lotSize < 0.01) lotSize = 0.01;
  // }

  // return {
  //   recommended_lot: lotSize,
  //   sl_points: slPoints,
  //   tp_points: tpPoints,
  //   retrace_points: retracePoints
  // };
}

// function buildMicroFallbackResponse({
//   microResult,
//   reqBody,
//   resolvedUserId,
//   pattern,
//   historicalVolume,
//   activeCfg,
//   tradingPreferences
// }) {
//   const side = String(reqBody.side || "").toUpperCase();
//   const microSignal = String(microResult.signal || "").toUpperCase();

//   if (microSignal !== side) {
//     return null;
//   }

//   const score = mapMicroScoreToMainScore(microResult.confidenceScore, side);
//   const decision =
//     side === "BUY" ? "ALLOW_BUY_SCALP" : "ALLOW_SELL_SCALP";

//   const defensiveFlags = {
//     warningMatched: false,
//     lotMultiplier: 1,
//     tpMultiplier: 1,
//     reason: "MICRO_SCALP_FALLBACK",
//   };

//   const trade_setup = buildTradeSetupFromPattern({
//     side,
//     price: Number(reqBody.price || 0),
//     pattern,
//     candles: Array.isArray(reqBody.candles) ? reqBody.candles : [],
//     balance: Number(reqBody.balance || 0),
//     spreadPoints: Number(reqBody.spreadPoints || 0),
//     activeCfg,
//     score,
//     defensiveFlags,
//     userMaxLotCap: Number(tradingPreferences?.base_lot_size || 0)
//   });

//   return {
//     decision,
//     score,
//     firebaseUserId: resolvedUserId,
//     mode: "MICRO_SCALP",
//     trend:
//       microSignal === "BUY" ? "BULLISH" :
//         microSignal === "SELL" ? "BEARISH" :
//           "NEUTRAL",
//     pattern,
//     historicalVolume,
//     defensiveFlags,
//     trade_setup,
//   };
// }
function buildMicroFallbackResponse({
  microResult,
  reqBody,
  resolvedUserId,
  pattern,
  historicalVolume,
  activeCfg,
  tradingPreferences,
  totalClosedTrades = 0,
  userAdaptiveProfile = null,
}) {
  const side = String(reqBody.side || "").toUpperCase();
  const microSignal = String(microResult.signal || "").toUpperCase();

  if (microSignal !== side) {
    return null;
  }

  const score = mapMicroScoreToMainScore(microResult.confidenceScore, side);
  const decision =
    side === "BUY" ? "ALLOW_BUY_SCALP" : "ALLOW_SELL_SCALP";

  const coldStartProfile = buildColdStartProfile({
    closedTradesCount: totalClosedTrades,
    mode: "MICRO_SCALP",
  });

  const adaptiveMinScore = getAdaptiveMinRequiredScore({
    baseScore: 0,
    coldStartProfile,
    userAdaptiveProfile,
  });

  if (Math.abs(Number(score || 0)) < adaptiveMinScore) {
    return {
      decision: "NO_TRADE",
      reason: "MICRO_SCALP_ADAPTIVE_MIN_SCORE",
      score,
      firebaseUserId: resolvedUserId,
      mode: "MICRO_SCALP",
      trend:
        microSignal === "BUY" ? "BULLISH" :
          microSignal === "SELL" ? "BEARISH" :
            "NEUTRAL",
      pattern,
      historicalVolume,
      defensiveFlags: {
        warningMatched: false,
        lotMultiplier: 1,
        tpMultiplier: 1,
        reason: "MICRO_SCALP_FALLBACK_ADAPTIVE_BLOCK",
      },
      trade_setup: null,
      cold_start_profile: coldStartProfile,
      user_adaptive_profile: userAdaptiveProfile,
      totalClosedTrades,
    };
  }

  const defensiveFlags = {
    warningMatched: false,
    lotMultiplier: 1,
    tpMultiplier: 1,
    reason: "MICRO_SCALP_FALLBACK",
  };

  const rawLotCap = Number(
    tradingPreferences?.base_log_size ??
    tradingPreferences?.base_lot_size ??
    0
  );

  let trade_setup = buildTradeSetupFromPattern({
    side,
    price: Number(reqBody.price || 0),
    pattern,
    candles: Array.isArray(reqBody.candles) ? reqBody.candles : [],
    balance: Number(reqBody.balance || 0),
    spreadPoints: Number(reqBody.spreadPoints || 0),
    activeCfg,
    score,
    defensiveFlags,
    userMaxLotCap: rawLotCap,
    coldStartProfile,
  });

  trade_setup = applyUserAdaptiveProfileToTradeSetup({
    tradeSetup: trade_setup,
    userAdaptiveProfile,
    activeCfg,
  });

  if (rawLotCap > 0 && Number(trade_setup?.recommended_lot || 0) > rawLotCap) {
    trade_setup.recommended_lot = Number(rawLotCap.toFixed(2));
    if (trade_setup.recommended_lot < 0.01) {
      trade_setup.recommended_lot = 0.01;
    }
  }

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
    cold_start_profile: coldStartProfile,
    user_adaptive_profile: userAdaptiveProfile,
    totalClosedTrades,
  };
}

function buildBlockedSignalResponse({
  reason,
  score = 0,
  firebaseUserId = null,
  mode = "NORMAL",
  trend = "NEUTRAL",
  pattern = null,
  historicalVolume = null,
  defensiveFlags = null,
  trade_setup = null,
  currentOpenPositionsCount = 0,
}) {
  return {
    decision: "NO_TRADE",
    reason,
    score,
    firebaseUserId,
    mode,
    trend,
    pattern,
    historicalVolume,
    defensiveFlags,
    trade_setup,
    currentOpenPositionsCount,
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

  let tradingPreferences = normalizeTradingPreferences(null);
  try {
    if (resolvedUserId) {
      const rawTradingPreferences = await getUserTradingPreferences(
        resolvedUserId,
        accountId ?? null
      );

      tradingPreferences = normalizeTradingPreferences(rawTradingPreferences);
    }
  } catch (prefError) {
    console.error("Load trading preferences error:", prefError.message);
  }

  let totalClosedTrades = 0;

  try {
    if (resolvedUserId) {
      totalClosedTrades = await countTradeHistoryByUser(resolvedUserId);
    }
  } catch (tradeCountError) {
    console.error("Load trade count error:", tradeCountError.message);
  }

  let mainUserRecentPerformance = null;
  let mainUserAdaptiveProfile = null;

  try {
    if (resolvedUserId) {
      mainUserRecentPerformance = await getRecentClosedTradePerformance({
        firebaseUserId: resolvedUserId,
        accountId,
        symbol,
        mode: normalizeAdaptiveMode(evaluateResult?.mode || "NORMAL"),
        limit: 18,
      });
    }
  } catch (recentPerfError) {
    console.error("Load recent performance error:", recentPerfError.message);
  }

  mainUserAdaptiveProfile = buildUserAdaptiveProfile({
    recentPerformance: mainUserRecentPerformance,
    mode: evaluateResult?.mode || "NORMAL",
  });

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
      }
    });

    // const score = evaluateResult.score || 0;
    // const finalDecision = decision(evaluateResult, symbol);

    const score = evaluateResult.score || 0;
    const finalDecisionResult = resolveDecisionWithTradingPreferences(
      evaluateResult,
      symbol,
      { tradingPreferences }
    );

    const finalDecision = finalDecisionResult.decision;
    const finalDecisionReason = finalDecisionResult.reason || null;

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

    // console.log(`\n--- 📊 MARKET STATE LOG [${symbol}] ---`);
    // console.log(`Price: ${price}`);
    // console.log(`H1/H4 Trend: ${evaluateResult.trend} | Mode: ${evaluateResult.mode}`);
    // if (pattern.structure) {
    //   console.log(`M5 Micro-Trend: ${pattern.structure.microTrend}`);
    //   console.log(`Fail to LL: ${pattern.structure.isFailToLL} | Fail to HH: ${pattern.structure.isFailToHH}`);
    //   console.log(`Retesting Support: ${pattern.structure.isRetestingSupport} | Retesting Resistance: ${pattern.structure.isRetestingResistance}`);
    // }
    // console.log(`Volume Climax (VSA): ${pattern.isVolumeClimax} | Volume Drying: ${pattern.isVolumeDrying}`);
    // console.log(`Pattern Detected: ${pattern.pattern} (${pattern.type})`);
    // console.log(`Final Score: ${score.toFixed(2)} | Decision: ${finalDecision}`);
    // console.log(`--------------------------------------\n`);

    // console.log("[DECISION_BREAKDOWN]", {
    //   symbol,
    //   mode: evaluateResult.mode,
    //   trend: evaluateResult.trend,
    //   score: evaluateResult.score,
    //   adaptiveScoreDelta: evaluateResult.adaptiveScoreDelta,
    //   historicalVolumeSignal: evaluateResult.historicalVolumeSignal,
    //   thresholdContext: evaluateResult.thresholdContext,
    //   finalDecision
    // });

    // const activeCfg = symbolConfig[symbol] || symbolConfig["DEFAULT"];
    const activeCfg = getActiveSymbolConfig(symbol, evaluateResult.mode || "NORMAL");

    const coldStartProfile = buildColdStartProfile({
      closedTradesCount: totalClosedTrades,
      mode: evaluateResult.mode || "NORMAL",
    });

    if (
      isOpenDecision(finalDecision) &&
      coldStartProfile.enabled &&
      coldStartProfile.blockWeakSignals &&
      Math.abs(Number(score || 0)) < Number(coldStartProfile.minRequiredStrength || 0)
    ) {
      return res.json({
        ...buildBlockedSignalResponse({
          reason: `COLD_START_${coldStartProfile.stage}_MIN_SCORE`,
          score,
          firebaseUserId: resolvedUserId,
          mode: evaluateResult.mode || "NORMAL",
          trend: evaluateResult.trend || "NEUTRAL",
          pattern,
          historicalVolume,
          defensiveFlags: evaluateResult.defensiveFlags || null,
          trade_setup: null,
          currentOpenPositionsCount: 0,
        }),
        cold_start_profile: coldStartProfile,
        totalClosedTrades,
      });
    }

    if (finalDecision === "NO_TRADE" && finalDecisionReason) {
      return res.json(
        buildBlockedSignalResponse({
          reason: finalDecisionReason,
          score,
          firebaseUserId: resolvedUserId,
          mode: evaluateResult.mode || "NORMAL",
          trend: evaluateResult.trend || "NEUTRAL",
          pattern,
          historicalVolume,
          defensiveFlags: evaluateResult.defensiveFlags || {
            warningMatched: false,
            lotMultiplier: 1,
            tpMultiplier: 1,
            reason: null,
          },
          trade_setup: null,
          currentOpenPositionsCount: 0,
        })
      );
    }

    // ========= FALLBACK TO MICRO SCALP =========
    if (!isPrimaryTradeDecision(finalDecision)) {
      const microResult = microScalpEngine.evaluateMicroScalp({
        candles: Array.isArray(candles) ? candles : [],
        spread: Number(spreadPoints || 0),
        openPositions: [],
        config: MICRO_SCALP_CONFIG,
      });

      if (microResult.allowOpen) {
        // const microResponse = buildMicroFallbackResponse({
        //   microResult,
        //   reqBody: req.body,
        //   resolvedUserId,
        //   pattern,
        //   historicalVolume,
        //   activeCfg,
        //   tradingPreferences
        // });
        const microUserRecentPerformance = await getRecentClosedTradePerformance({
          firebaseUserId: resolvedUserId,
          accountId,
          symbol,
          mode: "SCALP",
          limit: 18,
        });

        const microUserAdaptiveProfile = buildUserAdaptiveProfile({
          recentPerformance: microUserRecentPerformance,
          mode: "MICRO_SCALP",
        });

        const microResponse = buildMicroFallbackResponse({
          microResult,
          reqBody: req.body,
          resolvedUserId,
          pattern,
          historicalVolume,
          activeCfg,
          tradingPreferences,
          totalClosedTrades,
          userAdaptiveProfile: microUserAdaptiveProfile,
        });

        if (microResponse) {
          if (microResponse.decision === "NO_TRADE") {
            return res.json(microResponse);
          }

          const microDirectionResult = enforceDirectionBiasOnDecision(
            microResponse.decision,
            tradingPreferences
          );

          if (microDirectionResult.blocked) {
            return res.json(
              buildBlockedSignalResponse({
                reason: microDirectionResult.reason,
                score: microResponse.score || 0,
                firebaseUserId: resolvedUserId,
                mode: microResponse.mode || "MICRO_SCALP",
                trend: microResponse.trend || "NEUTRAL",
                pattern: microResponse.pattern || null,
                historicalVolume: microResponse.historicalVolume || null,
                defensiveFlags: microResponse.defensiveFlags || null,
                trade_setup: null,
                currentOpenPositionsCount: 0,
              })
            );
          }

          const currentOpenPositionsCount =
            await countOpenPositionsByUserAccountAndSymbol({
              firebaseUserId: resolvedUserId,
              accountId,
              symbol,
            });

          if (
            isMaxOpenPositionsReached(
              currentOpenPositionsCount,
              tradingPreferences.max_open_positions
            )
          ) {
            return res.json(
              buildBlockedSignalResponse({
                reason: "MAX_OPEN_POSITIONS_REACHED",
                score: microResponse.score || 0,
                firebaseUserId: resolvedUserId,
                mode: microResponse.mode || "MICRO_SCALP",
                trend: microResponse.trend || "NEUTRAL",
                pattern: microResponse.pattern || null,
                historicalVolume: microResponse.historicalVolume || null,
                defensiveFlags: microResponse.defensiveFlags || null,
                trade_setup: null,
                currentOpenPositionsCount,
              })
            );
          }
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

    const rawLotCap = Number(
      tradingPreferences?.base_log_size ??
      tradingPreferences?.base_lot_size ??
      0
    );

    let trade_setup = buildTradeSetupFromPattern({
      side,
      price: Number(price || 0),
      pattern,
      candles,
      balance: Number(balance || 0),
      spreadPoints: Number(spreadPoints || 0),
      activeCfg,
      score,
      defensiveFlags,
      userMaxLotCap: rawLotCap,
      coldStartProfile,
    });

    trade_setup = applyUserAdaptiveProfileToTradeSetup({
      tradeSetup: trade_setup,
      userAdaptiveProfile: mainUserAdaptiveProfile,
      activeCfg,
    });

    if (rawLotCap > 0 && Number(trade_setup?.recommended_lot || 0) > rawLotCap) {
      trade_setup.recommended_lot = Number(rawLotCap.toFixed(2));
      if (trade_setup.recommended_lot < 0.01) {
        trade_setup.recommended_lot = 0.01;
      }
    }

    // let signalResponse = {
    //   decision: finalDecision,
    //   score: score,
    //   firebaseUserId: resolvedUserId,
    //   mode: evaluateResult.mode || "NORMAL",
    //   trend: evaluateResult.trend || "NEUTRAL",
    //   pattern: pattern,
    //   historicalVolume: historicalVolume,
    //   defensiveFlags: defensiveFlags,
    //   trade_setup,
    // };

    const adaptiveMinScore = getAdaptiveMinRequiredScore({
      baseScore: 0,
      coldStartProfile,
      userAdaptiveProfile: mainUserAdaptiveProfile,
    });

    if (
      isOpenDecision(finalDecision) &&
      Math.abs(Number(score || 0)) < adaptiveMinScore
    ) {
      return res.json({
        ...buildBlockedSignalResponse({
          reason: "USER_ADAPTIVE_MIN_SCORE",
          score,
          firebaseUserId: resolvedUserId,
          mode: evaluateResult.mode || "NORMAL",
          trend: evaluateResult.trend || "NEUTRAL",
          pattern,
          historicalVolume,
          defensiveFlags: evaluateResult.defensiveFlags || null,
          trade_setup: null,
          currentOpenPositionsCount: 0,
        }),
        cold_start_profile: coldStartProfile,
        user_adaptive_profile: mainUserAdaptiveProfile,
        recent_performance: mainUserRecentPerformance,
        totalClosedTrades,
      });
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
      trade_setup,
      cold_start_profile: coldStartProfile,
      user_adaptive_profile: mainUserAdaptiveProfile,
      recent_performance: mainUserRecentPerformance,
      totalClosedTrades,
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
    //   trade_setup,
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
    symbol,
    openPosition,
    candles,
    currentProfit,
    mode = null,
    price,
    tpPoints = null,
    slPoints = null
  } = req.body;

  // console.log("Early exit body: " + JSON.stringify(req.body));

  const resolvedUserId = firebaseUserId || null;

  const historicalVolume = evaluateCurrentVolumeAgainstHistory({
    firebaseUserId: resolvedUserId,
    symbol,
    candles,
  });

  // console.log("Early exit historical: " + JSON.stringify(historicalVolume));

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

    const pattern = await analyzePattern({
      symbol: symbol,
      candles: candles,
      candlesH1: null,
      candlesH4: null,
      overlapPips: 100,
    });

    const result = await analyzeEarlyExit({
      firebaseUserId: resolvedUserId,
      symbol,
      openPosition,
      currentProfit,
      candles,
      mode: String(resolvedMode || "NORMAL").toUpperCase(),
      price,
      tpPoints: Number.isFinite(resolvedTpPoints) ? resolvedTpPoints : 0,
      slPoints: Number.isFinite(resolvedSlPoints) ? resolvedSlPoints : 0,
      historicalVolume,
      holdingMinutes: 10,
      pattern
    });

    console.log("Early exit result: " + JSON.stringify(result));

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

  // console.log(req.body)

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

app.post("/account-snapshot", async (req, res) => {
  try {
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

function escapeRegex(text = "") {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.get("/candle-training-data/mini-chart", async (req, res) => {
  try {
    const {
      symbol = "",
      timeframe = "M5",
      minutes = 60,
    } = req.query;

    const safeSymbol = String(symbol || "").trim();
    const safeTimeframe = String(timeframe || "M5").trim().toUpperCase();
    const safeMinutes = Math.max(5, Math.min(240, parseInt(minutes, 10) || 60));

    if (!safeSymbol) {
      return res.status(400).json({
        success: false,
        message: "symbol is required",
      });
    }

    const fromTime = new Date(Date.now() - safeMinutes * 60 * 1000);

    const filter = {
      symbol: { $regex: `^${escapeRegex(safeSymbol)}$`, $options: "i" },
      eventTime: { $gte: fromTime },
    };

    const rows = await CandleTrainingData.find(filter)
      .select({
        _id: 0,
        symbol: 1,
        timeframe: 1,
        eventTime: 1,
        price: 1,
        candles: 1,
        mode: 1,
      })
      .sort({ eventTime: 1 })
      .limit(1000)
      .lean();

    const bucketMs =
      safeTimeframe === "M1"
        ? 60 * 1000
        : safeTimeframe === "M15"
          ? 15 * 60 * 1000
          : safeTimeframe === "H1"
            ? 60 * 60 * 1000
            : 5 * 60 * 1000;

    const byBucket = new Map();

    for (const row of rows) {
      const eventDate = new Date(row.eventTime);
      const bucketTime = Math.floor(eventDate.getTime() / bucketMs) * bucketMs;

      const latestCandle =
        Array.isArray(row.candles) && row.candles.length > 0
          ? row.candles[row.candles.length - 1]
          : null;

      const point = {
        time: new Date(bucketTime).toISOString(),
        eventTime: eventDate.toISOString(),
        price: Number(row.price || 0),
        open: latestCandle ? Number(latestCandle.open || 0) : Number(row.price || 0),
        high: latestCandle ? Number(latestCandle.high || 0) : Number(row.price || 0),
        low: latestCandle ? Number(latestCandle.low || 0) : Number(row.price || 0),
        close: latestCandle ? Number(latestCandle.close || 0) : Number(row.price || 0),
        tickVolume: latestCandle ? Number(latestCandle.tickVolume || 0) : 0,
        mode: row.mode || "NORMAL",
      };

      byBucket.set(bucketTime, point);
    }

    const chart = Array.from(byBucket.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value);

    return res.json({
      success: true,
      symbol: safeSymbol.toUpperCase(),
      timeframe: safeTimeframe,
      minutes: safeMinutes,
      count: chart.length,
      chart,
    });
  } catch (error) {
    console.error("mini-chart candle_training_data error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load mini chart data",
      error: error.message || "Internal server error",
    });
  }
});

app.listen(5000, async () => {
  await database.connect();
  //startActivePositionChangeStream();
  console.log("Trading AI Engine running");
});
