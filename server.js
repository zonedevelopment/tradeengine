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
// const { analyzeEarlyExit } = require("./brain/early-exit-engine");
const { analyzeEarlyExit } = require("./brain/early-exit-engine-v6");
const {
  evaluateDecision,
  decision,
  resolveDecisionWithTradingPreferences,
} = require("./brain/decision-engine-v7");
const { getSession } = require("./brain/session-filter");
const { getRiskState, calculateDynamicRisk } = require("./brain/risk-manager");
const { checkCalendar, fetchCalendar } = require("./brain/economic-calendar");
const { analyzePattern } = require("./pattern/pattern-analyzer-v3");
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

// const { syncActivePositionsToFirebase } = require("./firebaseActivePositions.service");

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
const EntryThesisSnapshot = require("./models/EntryThesisSnapshot");
const SignalRefreshAuditLog = require("./models/SignalRefreshAuditLog");

const microScalpEngine = require("./microScalpEngine-v4");

const { getUserTradingPreferences } = require("./userTradingPreferences.repo");
const {
  normalizeTradingPreferences,
  enforceDirectionBiasOnDecision,
  isMaxOpenPositionsReached,
  isOpenDecision,
  isTradingEngineEnabled
} = require("./tradingPreferences.service");

const {
  getPendingTradeConfirmationByKey,
  createPendingTradeConfirmation,
  updatePendingTradeConfirmationStatus,
  appendPendingTradeConfirmationLog,
} = require("./pendingTradeConfirmation.repo");

// Mangmao feature
const {
  getDefaultMangmaoConfig,
  analyzeMangmaoEntry,
  createMangmaoGroup,
  bindMangmaoTickets,
  evaluateMangmaoExit,
  finalizeMangmaoGroup,
} = require("./mangmaoEngine-v1");

function normalizeTicketIdForMangmao(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return /^\d+$/.test(str) ? str : null;
}

function normalizeMangmaoSymbol(value) {
  return String(value || "").trim();
}

function normalizeMangmaoAccountId(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMangmaoActivePositions(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ticketId: row.ticketId ?? row.ticket_id ?? row.ticket ?? null,
    ticket: row.ticketId ?? row.ticket_id ?? row.ticket ?? null,
    symbol: row.symbol,
    side: row.side,
    profit: Number(row.profit || 0),
    swap: Number(row.swap || 0),
    commission: Number(row.commission || 0),
    entryPrice: row.entryPrice ?? row.entry_price ?? null,
    currentPrice: row.currentPrice ?? row.current_price ?? null,
    openTime: row.openTime ?? row.open_time ?? null,
    status: row.status || "OPEN",
  }));
}
// End Mangmao feature


const MICRO_SCALP_CONFIG = {
  enabled: true,

  minScore: 42,
  minScoreGap: 5,
  maxSpread: 25,

  onePositionOnly: true,
  maxHoldBars: 2,

  maxLossUsd: 1,
  minProfitToClose: 1.5,

  trendWeight: 1,
  momentumWeight: 1,
  entryWeight: 1,
  volumeWeight: 1,
  penaltyWeight: 1,

  extremeBodyMultiplier: 2.2,
  momentumBodyMultiplier: 1.10,

  useVolume: true,
  minVolumeRatio: 0.98,
};

const MANGMAO_CONFIG = {
  ...getDefaultMangmaoConfig(),
  enabled: true,
  minScore: MICRO_SCALP_CONFIG.minScore,
  minScoreGap: MICRO_SCALP_CONFIG.minScoreGap,
  maxSpread: MICRO_SCALP_CONFIG.maxSpread,
  lossCutUsdPerOrder: -1,
  requireNoOpenPositions: true,
  allowOnlyOneActiveGroup: true,
  maxLevel: 3,
};

const symbolConfig = {
  NORMAL: {
    "XAUUSD": { maxSpread: 100, pipMultiplier: 100, minSL: 600, maxSL: 850, minTP: 1000, maxTP: 1250 },
    "XAUUSDm": { maxSpread: 100, pipMultiplier: 100, minSL: 600, maxSL: 850, minTP: 1000, maxTP: 1250 },
    "XAUUSDM": { maxSpread: 100, pipMultiplier: 100, minSL: 600, maxSL: 850, minTP: 1000, maxTP: 1250 },
    "XAUUSDc": { maxSpread: 100, pipMultiplier: 100, minSL: 600, maxSL: 850, minTP: 1000, maxTP: 1250 },
    "XAUUSDC": { maxSpread: 100, pipMultiplier: 100, minSL: 600, maxSL: 850, minTP: 1000, maxTP: 1250 },
    "BTCUSD": { maxSpread: 200, pipMultiplier: 100, minSL: 900, maxSL: 1200, minTP: 1200, maxTP: 1500 },
    "BTCUSDm": { maxSpread: 200, pipMultiplier: 100, minSL: 900, maxSL: 1200, minTP: 1200, maxTP: 1500 },
    "BTCUSDM": { maxSpread: 200, pipMultiplier: 100, minSL: 900, maxSL: 1200, minTP: 1200, maxTP: 1500 },
    "DEFAULT": { maxSpread: 30, pipMultiplier: 100, minSL: 100, maxSL: 2000, minTP: 150, maxTP: 4000 }
  },
  SCALP: {
    "XAUUSD": { maxSpread: 50, pipMultiplier: 100, minSL: 420, maxSL: 480, minTP: 600, maxTP: 680 },
    "XAUUSDm": { maxSpread: 50, pipMultiplier: 100, minSL: 420, maxSL: 480, minTP: 600, maxTP: 680 },
    "XAUUSDM": { maxSpread: 50, pipMultiplier: 100, minSL: 420, maxSL: 480, minTP: 600, maxTP: 680 },
    "XAUUSDc": { maxSpread: 50, pipMultiplier: 100, minSL: 420, maxSL: 480, minTP: 600, maxTP: 680 },
    "XAUUSDC": { maxSpread: 50, pipMultiplier: 100, minSL: 420, maxSL: 480, minTP: 600, maxTP: 680 },
    "BTCUSD": { maxSpread: 80, pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1250 },
    "BTCUSDm": { maxSpread: 80, pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1250 },
    "BTCUSDM": { maxSpread: 80, pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1250 },
    "BTCUSDc": { maxSpread: 80, pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1250 },
    "BTCUSDC": { maxSpread: 80, pipMultiplier: 100, minSL: 800, maxSL: 1000, minTP: 850, maxTP: 1250 },
    "DEFAULT": { maxSpread: 20, pipMultiplier: 100, minSL: 300, maxSL: 1000, minTP: 600, maxTP: 2000 }
  },
  MICRO_SCALP: {
    "XAUUSD": { maxSpread: 35, pipMultiplier: 100, minSL: 120, maxSL: 200, minTP: 150, maxTP: 300 },
    "XAUUSDm": { maxSpread: 35, pipMultiplier: 100, minSL: 120, maxSL: 200, minTP: 150, maxTP: 300 },
    "XAUUSDM": { maxSpread: 35, pipMultiplier: 100, minSL: 120, maxSL: 200, minTP: 150, maxTP: 300 },
    "XAUUSDc": { maxSpread: 35, pipMultiplier: 100, minSL: 120, maxSL: 200, minTP: 150, maxTP: 300 },
    "XAUUSDC": { maxSpread: 35, pipMultiplier: 100, minSL: 120, maxSL: 200, minTP: 150, maxTP: 300 },
    "BTCUSD": { maxSpread: 60, pipMultiplier: 100, minSL: 180, maxSL: 320, minTP: 100, maxTP: 200 },
    "BTCUSDm": { maxSpread: 60, pipMultiplier: 100, minSL: 180, maxSL: 320, minTP: 100, maxTP: 200 },
    "BTCUSDM": { maxSpread: 60, pipMultiplier: 100, minSL: 180, maxSL: 320, minTP: 100, maxTP: 200 },
    "DEFAULT": { maxSpread: 20, pipMultiplier: 100, minSL: 100, maxSL: 250, minTP: 100, maxTP: 200 }
  },
};


const app = express();
app.use(express.json());

const whiteList = ['https://koomport.com', 'https://tradeengine.zonedevnode.com'];
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

function isPyramidDecision(decisionValue) {
  return [
    "ALLOW_BUY_PYRAMID",
    "ALLOW_SELL_PYRAMID",
  ].includes(String(decisionValue || "").toUpperCase());
}

function normalizeComparableAccountId(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).trim();
}

function resolvePyramidFirstLot({
  activePositions = [],
  accountId = null,
  symbol = "",
  side = "",
  portfolio = null,
}) {
  const safeAccountId = normalizeComparableAccountId(accountId);
  const safeSymbol = String(symbol || "").trim().toUpperCase();
  const safeSide = String(side || "").trim().toUpperCase();

  const fromPortfolioCandidates = [
    portfolio?.firstLot,
    portfolio?.firstPositionLot,
    portfolio?.leadLot,
    portfolio?.baseLot,
    portfolio?.currentLot,
  ];

  for (const candidate of fromPortfolioCandidates) {
    const lot = roundLot(candidate, 0.01);
    if (lot > 0) {
      return lot;
    }
  }

  const filtered = (Array.isArray(activePositions) ? activePositions : [])
    .filter((position) => {
      if (safeSymbol && String(position?.symbol || "").trim().toUpperCase() !== safeSymbol) {
        return false;
      }

      if (safeSide && String(position?.side || "").trim().toUpperCase() !== safeSide) {
        return false;
      }

      if (
        safeAccountId &&
        normalizeComparableAccountId(position?.accountId) !== safeAccountId
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a?.openTime || a?.eventTime || a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.openTime || b?.eventTime || b?.updatedAt || 0).getTime();
      return aTime - bTime;
    });

  for (const position of filtered) {
    const lot = roundLot(position?.lot, 0.01);
    if (lot > 0) {
      return lot;
    }
  }

  return 0;
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

function toStr(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function toUpper(value, fallback = "") {
  return toStr(value, fallback).toUpperCase();
}

function roundLot(value, step = 0.01) {
  const n = toNum(value, 0);
  return Number((Math.round(n / step) * step).toFixed(2));
}

function resolveTradingPreferenceLotBounds(tradingPreferences = null) {
  const rawBaseLot = Number(
    tradingPreferences?.base_log_size ??
    tradingPreferences?.base_lot_size ??
    tradingPreferences?.baseLotSize ??
    0
  );

  const rawMaxLot = Number(
    tradingPreferences?.max_lot_size ??
    tradingPreferences?.maxLotSize ??
    5
  );

  const minLot = rawBaseLot > 0 ? roundLot(rawBaseLot, 0.01) : 0;
  const maxLotCandidate = rawMaxLot > 0 ? roundLot(rawMaxLot, 0.01) : 5;
  const maxLot = Math.max(minLot || 0.01, maxLotCandidate || 5);

  return {
    minLot,
    maxLot,
  };
}

function clampLotToTradingPreferences(lot, tradingPreferences = null, fallbackMinLot = 0.01) {
  const safeLot = Number(lot || 0);
  const fallbackMin = Math.max(0.01, Number(fallbackMinLot || 0.01));
  const { minLot, maxLot } = resolveTradingPreferenceLotBounds(tradingPreferences);
  const effectiveMin = Math.max(fallbackMin, minLot || 0);
  const effectiveMax = Math.max(effectiveMin, maxLot || 5);

  const normalizedLot = Number.isFinite(safeLot) && safeLot > 0 ? safeLot : effectiveMin;
  return roundLot(clamp(normalizedLot, effectiveMin, effectiveMax), 0.01);
}

function applyTradingPreferenceLotBoundsToTradeSetup(tradeSetup, tradingPreferences = null, fallbackMinLot = 0.01) {
  if (!tradeSetup || typeof tradeSetup !== "object") {
    return tradeSetup;
  }

  return {
    ...tradeSetup,
    recommended_lot: clampLotToTradingPreferences(
      tradeSetup.recommended_lot,
      tradingPreferences,
      fallbackMinLot
    ),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function normalizeCandle(c = {}) {
  return {
    open: toNum(c.open, 0),
    close: toNum(c.close, 0),
    high: toNum(c.high, 0),
    low: toNum(c.low, 0),
    tick_volume: toNum(c.tick_volume ?? c.tickVolume ?? 0, 0),
  };
}

function normalizeCandles(input, minLength = 0) {
  const arr = Array.isArray(input) ? input.map(normalizeCandle) : [];
  return arr.length >= minLength ? arr : [];
}

function normalizeSignalBody(body = {}) {
  const normalized = {
    symbol: toStr(body.symbol),
    firebaseUserId: toStr(body.firebaseUserId),
    accountId: toStr(body.accountId),
    side: toUpper(body.side || "ANY"),
    price: toNum(body.price, 0),
    digits: toNum(body.digits, 2),
    signalName: toStr(body.signalName || "AI_DETECT"),
    timeframe: toUpper(body.timeframe || "M5"),
    balance: toNum(body.balance, 0),
    spreadPoints: toNum(body.spreadPoints, 0),

    portfolio: normalizePortfolio(body.portfolio),

    candles: normalizeCandles(body.candles, 5),
    candlesM15: normalizeCandles(body.candles_m15, 2),
    candlesM30: normalizeCandles(body.candles_m30, 2),
    candlesH1: normalizeCandles(body.candles_h1, 2),
    candlesH4: normalizeCandles(body.candles_h4, 2),

    // refresh-only optional fields
    isRefresh: Boolean(body.isRefresh),
    pendingSide: toUpper(body.pendingSide || ""),
    pendingTarget: toNum(body.pendingTarget, 0),
    pendingLot: toNum(body.pendingLot, 0),
    pendingSlPoints: toNum(body.pendingSlPoints, 0),
    pendingTpPoints: toNum(body.pendingTpPoints, 0),
    pendingRetracePoints: toNum(body.pendingRetracePoints, 0),
    pendingMode: toStr(body.pendingMode || ""),
    refreshAttempt: toNum(body.refreshAttempt, 0),
    refreshStartedAt: toStr(body.refreshStartedAt || ""),
  };

  return normalized;
}

function validateSignalBody(input) {
  const errors = [];

  if (!input.symbol) errors.push("symbol is required");
  if (!input.firebaseUserId) errors.push("firebaseUserId is required");
  if (!input.accountId) errors.push("accountId is required");
  if (input.price <= 0) errors.push("price must be > 0");
  if (!input.candles.length) errors.push("candles must contain at least 5 items");

  return errors;
}

function buildNoTradeResponse(reason, extra = {}) {
  return {
    decision: "NO_TRADE",
    mode: extra.mode || "NORMAL",
    score: 0,
    recommended_lot: extra.recommended_lot || 0,
    sl_points: extra.sl_points || 0,
    tp_points: extra.tp_points || 0,
    retrace_points: extra.retrace_points || 0,
    reason,
    ...extra,
  };
}

function keepPendingSideOnRefresh(result, normalized) {
  if (!normalized.isRefresh || !normalized.pendingSide) {
    return result;
  }

  const pendingSide = normalized.pendingSide;
  const decision = toUpper(result?.decision || "NO_TRADE");

  const isBuyDecision = decision.startsWith("ALLOW_BUY");
  const isSellDecision = decision.startsWith("ALLOW_SELL");

  if (pendingSide === "BUY" && isSellDecision) {
    return buildNoTradeResponse("REFRESH_SIDE_MISMATCH", {
      mode: normalized.pendingMode || result?.mode || "NORMAL",
      recommended_lot: normalized.pendingLot || result?.recommended_lot || 0,
      sl_points: normalized.pendingSlPoints || result?.sl_points || 0,
      tp_points: normalized.pendingTpPoints || result?.tp_points || 0,
      retrace_points: normalized.pendingRetracePoints || result?.retrace_points || 0,
      refreshAttempt: normalized.refreshAttempt,
    });
  }

  if (pendingSide === "SELL" && isBuyDecision) {
    return buildNoTradeResponse("REFRESH_SIDE_MISMATCH", {
      mode: normalized.pendingMode || result?.mode || "NORMAL",
      recommended_lot: normalized.pendingLot || result?.recommended_lot || 0,
      sl_points: normalized.pendingSlPoints || result?.sl_points || 0,
      tp_points: normalized.pendingTpPoints || result?.tp_points || 0,
      retrace_points: normalized.pendingRetracePoints || result?.retrace_points || 0,
      refreshAttempt: normalized.refreshAttempt,
    });
  }

  return result;
}

async function runSignalDecision(normalized) {
  const evalInput = {
    symbol: normalized.symbol,
    firebaseUserId: normalized.firebaseUserId,
    accountId: normalized.accountId,
    side: normalized.side,
    price: normalized.price,
    digits: normalized.digits,
    signalName: normalized.signalName,
    timeframe: normalized.timeframe,
    balance: normalized.balance,
    spreadPoints: normalized.spreadPoints,

    portfolio: normalized.portfolio,

    candles: normalized.candles,
    candles_m15: normalized.candlesM15,
    candles_m30: normalized.candlesM30,
    candles_h1: normalized.candlesH1,
    candles_h4: normalized.candlesH4,
  };

  // ใช้ evaluateDecision เดิมของระบบคุณ
  const result = await evaluateDecision(evalInput);

  return {
    decision: toStr(result?.decision || "NO_TRADE"),
    mode: toStr(result?.mode || "NORMAL"),
    score: toNum(result?.score, 0),
    recommended_lot: toNum(result?.recommended_lot, 0),
    sl_points: toNum(result?.sl_points, 0),
    tp_points: toNum(result?.tp_points, 0),
    retrace_points: toNum(result?.retrace_points, 0),

    // ส่ง reason/debug กลับได้ แต่ EA เดิมจะไม่พังเพราะไม่ใช้ field นี้
    reason: toStr(result?.reason || ""),
    trend: result?.trend || "",
    pattern: result?.pattern || null,
  };
}

/**
 * กติกา:
 * 1) userBaseLot = lot ต่ำสุดเสมอ
 * 2) balance <= 100 => ใช้ base lot
 * 3) 100 < balance <= 200 => เพิ่มได้สูงสุด +0.02 ตามความมั่นใจ
 * 4) balance > 200 => โตต่อแบบค่อยเป็นค่อยไป
 * 5) ไม่แตะ sl/tp/retracement
 */
function calculateProgressiveLotSize({
  userBaseLot = 0,
  userMaxLot = 5,
  score,
  confidenceLevel = "NORMAL",
  balance,
}) {
  const safeConfiguredBaseLot = toNum(userBaseLot, 0);
  const safeConfiguredMaxLot = toNum(userMaxLot, 5);
  const safeBalance = Math.max(0, toNum(balance, 0));
  const safeScore = Math.abs(toNum(score, 0));
  const level = String(confidenceLevel || "NORMAL").toUpperCase();

  const baseLot =
    safeConfiguredBaseLot > 0
      ? Math.max(0.01, Number(safeConfiguredBaseLot.toFixed(2)))
      : 0.01;

  let maxExtraLot = 0.02;
  if (safeBalance > 100) {
    maxExtraLot = 0.02 + Math.ceil((safeBalance - 100) / 100) * 0.01;
  }
  maxExtraLot = Number(maxExtraLot.toFixed(2));

  let scoreFactor = 0;
  if (safeScore >= 4.0) scoreFactor = 1.0;
  else if (safeScore >= 3.5) scoreFactor = 0.85;
  else if (safeScore >= 3.0) scoreFactor = 0.65;
  else if (safeScore >= 2.5) scoreFactor = 0.45;
  else if (safeScore >= 2.0) scoreFactor = 0.25;
  else scoreFactor = 0;

  let confidenceFactor = 0.4;
  if (level === "VERY_HIGH") confidenceFactor = 1.0;
  else if (level === "HIGH") confidenceFactor = 0.8;
  else if (level === "NORMAL") confidenceFactor = 0.6;
  else confidenceFactor = 0.4;

  let extraLot = maxExtraLot * scoreFactor * confidenceFactor;
  extraLot = clamp(Number(extraLot.toFixed(2)), 0, maxExtraLot);

  const maxLot = Math.max(baseLot, safeConfiguredMaxLot > 0 ? roundLot(safeConfiguredMaxLot, 0.01) : 5);
  const systemLot = roundLot(clamp(baseLot + extraLot, baseLot, maxLot), 0.01);

  return {
    baseLot: roundLot(baseLot, 0.01),
    extraLot: roundLot(extraLot, 0.01),
    maxExtraLot: roundLot(maxExtraLot, 0.01),
    systemLot,
    maxLot,
    scoreFactor: Number(scoreFactor.toFixed(2)),
    confidenceFactor: Number(confidenceFactor.toFixed(2)),
    confidenceLevel: level,
    balance: safeBalance,
    hasUserBaseLot: safeConfiguredBaseLot > 0,
  };
}

function resolveConfidenceLevel({
  score,
  patternType = "",
  historicalVolumeSignal = "",
  trend = "",
  mode = "",
}) {
  const safeScore = Math.abs(toNum(score, 0));
  const pt = String(patternType || "").toUpperCase();
  const volume = String(historicalVolumeSignal || "").toUpperCase();
  const safeTrend = String(trend || "").toUpperCase();
  const safeMode = String(mode || "").toUpperCase();

  let level = "LOW";

  if (safeScore >= 1.9) level = "NORMAL";
  if (safeScore >= 2.3) level = "HIGH";
  if (safeScore >= 2.9) level = "VERY_HIGH";

  const strongPattern =
    pt.includes("FIRST_LEG_BREAKOUT") ||
    pt.includes("FIRST_LEG_BREAKDOWN") ||
    pt.includes("ASCENDING_TRIANGLE_BREAKOUT") ||
    pt.includes("DESCENDING_TRIANGLE_BREAKDOWN") ||
    pt.includes("ROCKET_SURGE_CONTINUATION") ||
    pt.includes("WATERFALL_DROP_CONTINUATION");

  if (strongPattern && safeScore >= 2.2) {
    if (level === "NORMAL") level = "HIGH";
    else if (level === "HIGH") level = "VERY_HIGH";
  }

  if (volume === "LOW_VOLUME" && level === "VERY_HIGH") level = "HIGH";
  if (volume === "LOW_VOLUME" && level === "HIGH") level = "NORMAL";

  if (safeTrend === "NEUTRAL" && level === "VERY_HIGH") level = "HIGH";

  if (safeMode === "SCALP" && safeScore < 2.4 && level === "VERY_HIGH") {
    level = "HIGH";
  }

  return level;
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

  // ฟอร์มแย่มาก -> กดหนัก โดยเฉพาะ SCALP
  if (
    lossStreak >= (isScalp ? 3 : 4) ||
    (sampleCount >= 8 && profitFactor > 0 && profitFactor < (isScalp ? 0.95 : 0.85) && netProfit < 0) ||
    (sampleCount >= 8 && winRate < (isScalp ? 42 : 38) && netProfit < 0)
  ) {
    profile.stage = "DEFENSIVE";
    profile.reason = "RECENT_PERFORMANCE_WEAK";

    profile.minScoreBoost = isScalp ? 0.40 : 0.32;
    profile.lotMultiplier = isScalp ? 0.58 : 0.68;
    profile.slMultiplier = 0.96;
    profile.tpMultiplier = isScalp ? 0.90 : 0.94;
    profile.retraceMultiplier = isScalp ? 0.88 : 0.92;

    return profile;
  }

  // ฟอร์มอ่อน -> กดระดับกลาง
  if (
    lossStreak >= 2 ||
    (sampleCount >= 8 && netProfit < 0) ||
    (sampleCount >= 8 && profitFactor > 0 && profitFactor < 1.0)
  ) {
    profile.stage = "CAUTIOUS";
    profile.reason = "RECENT_PERFORMANCE_SOFT";

    profile.minScoreBoost = isScalp ? 0.18 : 0.12;
    profile.lotMultiplier = isScalp ? 0.78 : 0.86;
    profile.slMultiplier = 0.99;
    profile.tpMultiplier = isScalp ? 0.95 : 0.98;
    profile.retraceMultiplier = isScalp ? 0.94 : 0.98;

    return profile;
  }

  // ฟอร์มดี -> เพิ่มเล็กน้อยพอ
  if (
    sampleCount >= 8 &&
    winRate >= 60 &&
    netProfit > 0 &&
    (profitFactor === 99 || profitFactor >= 1.25)
  ) {
    profile.stage = "POSITIVE";
    profile.reason = "RECENT_PERFORMANCE_STRONG";

    profile.minScoreBoost = 0;
    profile.lotMultiplier = isScalp ? 1.02 : 1.05;
    profile.slMultiplier = 1.0;
    profile.tpMultiplier = isScalp ? 1.02 : 1.04;
    profile.retraceMultiplier = isScalp ? 0.96 : 0.95;

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

function resolveBaseLot({
  configuredLot = 0,
  balance = 0,
}) {
  const safeConfiguredLot = Number(configuredLot || 0);

  if (Number.isFinite(safeConfiguredLot) && safeConfiguredLot > 0) {
    return Math.max(0.01, Number(safeConfiguredLot.toFixed(2)));
  }

  return 0;
}

function resolveMicroScalpStrength({
  score = 0,
  confidenceLevel = "LOW",
  historicalVolumeSignal = "",
  trend = "",
  patternType = "",
}) {
  const safeScore = Math.abs(Number(score || 0));
  const level = String(confidenceLevel || "LOW").toUpperCase();
  const volume = String(historicalVolumeSignal || "").toUpperCase();
  const safeTrend = String(trend || "").toUpperCase();
  const pt = String(patternType || "").toUpperCase();

  let points = 0;

  if (safeScore >= 2.9) points += 2;
  else if (safeScore >= 2.2) points += 1;

  if (level === "VERY_HIGH") points += 2;
  else if (level === "HIGH") points += 1;

  if (volume === "ABOVE_AVERAGE" || volume === "HIGH_VOLUME") points += 1;

  if (
    safeTrend === "UP" ||
    safeTrend === "DOWN" ||
    safeTrend === "BULLISH" ||
    safeTrend === "BEARISH"
  ) {
    points += 1;
  }

  if (
    pt.includes("FIRST_LEG_BREAKOUT") ||
    pt.includes("FIRST_LEG_BREAKDOWN") ||
    pt.includes("ROCKET_SURGE_CONTINUATION") ||
    pt.includes("WATERFALL_DROP_CONTINUATION")
  ) {
    points += 1;
  }

  return points >= 4 ? "STRONG" : "WEAK";
}

function resolveMicroScalpFixedTpPoints({
  score = 0,
  confidenceLevel = "LOW",
  historicalVolumeSignal = "",
  trend = "",
  patternType = "",
  activeCfg = null,
}) {
  const strength = resolveMicroScalpStrength({
    score,
    confidenceLevel,
    historicalVolumeSignal,
    trend,
    patternType,
  });

  const pipMultiplier = Number(activeCfg?.pipMultiplier || 100);

  return {
    strength,
    tpPoints: strength === "STRONG" ? pipMultiplier * 2 : pipMultiplier * 1,
  };
}

function applyMicroScalpFixedTargetToTradeSetup({
  tradeSetup,
  mode = "NORMAL",
  score = 0,
  confidenceLevel = "LOW",
  historicalVolumeSignal = "",
  trend = "",
  patternType = "",
  activeCfg = null,
}) {
  if (!tradeSetup) return tradeSetup;

  const safeMode = String(mode || "NORMAL").toUpperCase();
  if (safeMode !== "MICRO_SCALP") return tradeSetup;

  const resolved = resolveMicroScalpFixedTpPoints({
    score,
    confidenceLevel,
    historicalVolumeSignal,
    trend,
    patternType,
    activeCfg,
  });

  const safeTpPoints = Number(resolved.tpPoints || 100);

  return {
    ...tradeSetup,
    tp_points: safeTpPoints,
    retrace_points: Math.max(20, Math.round(safeTpPoints * 0.35)),
    micro_scalp_strength: resolved.strength,
    micro_scalp_fixed_target_usd: resolved.strength === "STRONG" ? 2 : 1,
  };
}

// function applyUserAdaptiveProfileToTradeSetup({
//   tradeSetup,
//   userAdaptiveProfile,
//   activeCfg,
// }) {
//   if (!tradeSetup) {
//     return tradeSetup;
//   }

//   const safeMode = String(tradeSetup.mode || "").toUpperCase();
//   const isMicroScalp = safeMode === "MICRO_SCALP";

//   if (!userAdaptiveProfile?.enabled) {
//     if (isMicroScalp) {
//       const minTP = Number(activeCfg?.minTP || 100);
//       const maxTP = Number(activeCfg?.maxTP || 200);

//       return {
//         ...tradeSetup,
//         tp_points: clampNumber(Number(tradeSetup.tp_points || minTP), minTP, maxTP),
//         retrace_points: Math.max(
//           20,
//           Number(
//             tradeSetup.retrace_points ||
//             Math.round(Number(tradeSetup.tp_points || minTP) * 0.35)
//           )
//         ),
//       };
//     }

//     return tradeSetup;
//   }

//   let slPoints = Math.round(
//     Number(tradeSetup.sl_points || 0) * Number(userAdaptiveProfile.slMultiplier || 1)
//   );

//   let tpPoints = Math.round(
//     Number(tradeSetup.tp_points || 0) * Number(userAdaptiveProfile.tpMultiplier || 1)
//   );

//   const safeRetraceMultiplier = Math.min(
//     1.0,
//     Math.max(0.60, Number(userAdaptiveProfile.retraceMultiplier || 1))
//   );

//   let retracePoints = Math.round(
//     Number(tradeSetup.retrace_points || 0) * safeRetraceMultiplier
//   );

//   const baseRecommendedLot = Number(tradeSetup.recommended_lot || 0);

//   let recommendedLot = Number(
//     (
//       (Number.isFinite(baseRecommendedLot) && baseRecommendedLot > 0 ? baseRecommendedLot : 0.01) *
//       Number(userAdaptiveProfile.lotMultiplier || 1)
//     ).toFixed(2)
//   );

//   const minSL = Number(activeCfg?.minSL || slPoints || 1);
//   const maxSL = Number(activeCfg?.maxSL || slPoints || minSL);

//   slPoints = clampNumber(slPoints, minSL, maxSL);

//   if (isMicroScalp) {
//     const microMinTP = Number(activeCfg?.minTP || 100);
//     const microMaxTP = Number(activeCfg?.maxTP || 200);

//     tpPoints = clampNumber(tpPoints, microMinTP, microMaxTP);
//     retracePoints = Math.max(20, Math.round(tpPoints * 0.35));
//   } else {
//     const minTP = Number(activeCfg?.minTP || tpPoints || 1);
//     const maxTP = Number(activeCfg?.maxTP || tpPoints || minTP);

//     tpPoints = clampNumber(tpPoints, minTP, maxTP);

//     if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
//       retracePoints = Math.max(1, Math.round(minSL * 0.2));
//     }
//   }

//   if (!Number.isFinite(recommendedLot) || recommendedLot <= 0) {
//     recommendedLot =
//       Number.isFinite(baseRecommendedLot) && baseRecommendedLot > 0
//         ? Number(baseRecommendedLot.toFixed(2))
//         : 0.01;
//   }

//   if (recommendedLot < 0.01) recommendedLot = 0.01;

//   return {
//     ...tradeSetup,
//     recommended_lot: recommendedLot,
//     sl_points: slPoints,
//     tp_points: tpPoints,
//     retrace_points: retracePoints,
//   };
// }
function applyUserAdaptiveProfileToTradeSetup({
  tradeSetup,
  userAdaptiveProfile,
  activeCfg,
}) {
  if (!tradeSetup) {
    return tradeSetup;
  }

  const safeMode = String(tradeSetup.mode || "").toUpperCase();
  const isMicroScalp = safeMode === "MICRO_SCALP";

  let slPoints = Math.round(Number(tradeSetup.sl_points || 0));
  let tpPoints = Math.round(Number(tradeSetup.tp_points || 0));
  let retracePoints = Math.round(Number(tradeSetup.retrace_points || 0));
  const baseRecommendedLot = Number(tradeSetup.recommended_lot || 0.01);

  // 1) บังคับกรอบตาม mode/symbol config เสมอ
  const minSL = Number(activeCfg?.minSL || slPoints || 1);
  const maxSL = Number(activeCfg?.maxSL || slPoints || minSL);
  const minTP = Number(activeCfg?.minTP || tpPoints || 1);
  const maxTP = Number(activeCfg?.maxTP || tpPoints || minTP);

  if (Number.isFinite(slPoints) && slPoints > 0) {
    slPoints = clampNumber(slPoints, minSL, maxSL);
  } else {
    slPoints = minSL;
  }

  if (Number.isFinite(tpPoints) && tpPoints > 0) {
    tpPoints = clampNumber(tpPoints, minTP, maxTP);
  } else {
    tpPoints = minTP;
  }

  // if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
  //   retracePoints = isMicroScalp
  //     ? Math.max(20, Math.round(tpPoints * 0.35))
  //     : Math.max(1, Math.round(minSL * 0.2));
  // }
  if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
    if (isMicroScalp) {
      retracePoints = Math.max(20, Math.round(tpPoints * 0.10));
    } else if (safeMode === "SCALP") {
      retracePoints = Math.max(
        35,
        Math.min(
          Math.round(Math.min(tpPoints * 0.10, slPoints * 0.12)),
          65
        )
      );
    } else {
      retracePoints = Math.max(1, Math.round(minSL * 0.10));
    }
  }

  // 2) ถ้า adaptive profile ยังไม่เปิด ให้คืนค่าที่ clamp แล้ว
  if (!userAdaptiveProfile?.enabled) {
    return {
      ...tradeSetup,
      sl_points: slPoints,
      tp_points: tpPoints,
      retrace_points: retracePoints,
    };
  }

  // 3) ถ้า adaptive profile เปิด ค่อยเอา multiplier มาปรับต่อ
  slPoints = Math.round(
    slPoints * Number(userAdaptiveProfile.slMultiplier || 1)
  );

  tpPoints = Math.round(
    tpPoints * Number(userAdaptiveProfile.tpMultiplier || 1)
  );

  retracePoints = Math.round(
    retracePoints * Number(userAdaptiveProfile.retraceMultiplier || 1)
  );

  let recommendedLot = Number(
    (
      (Number.isFinite(baseRecommendedLot) && baseRecommendedLot > 0
        ? baseRecommendedLot
        : 0.01) *
      Number(userAdaptiveProfile.lotMultiplier || 1)
    ).toFixed(2)
  );

  // 4) clamp อีกรอบหลัง adaptive
  slPoints = clampNumber(slPoints, minSL, maxSL);

  if (isMicroScalp) {
    tpPoints = clampNumber(tpPoints, minTP, maxTP);
    retracePoints = Math.max(20, Math.round(tpPoints * 0.10));
  } else {
    tpPoints = clampNumber(tpPoints, minTP, maxTP);

    // if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
    //   retracePoints = Math.max(1, Math.round(minSL * 0.2));
    // }
    if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
      if (safeMode === "SCALP") {
        retracePoints = Math.max(
          35,
          Math.min(
            Math.round(Math.min(tpPoints * 0.10, slPoints * 0.12)),
            65
          )
        );
      } else {
        retracePoints = Math.max(1, Math.round(tpPoints * 0.10));
      }
    }
  }

  if (!Number.isFinite(recommendedLot) || recommendedLot <= 0) {
    recommendedLot = Number.isFinite(baseRecommendedLot) && baseRecommendedLot > 0
      ? Number(baseRecommendedLot.toFixed(2))
      : 0.01;
  }

  return {
    ...tradeSetup,
    recommended_lot: recommendedLot,
    sl_points: slPoints,
    tp_points: tpPoints,
    retrace_points: retracePoints,
    adaptive_profile: {
      enabled: true,
      stage: userAdaptiveProfile.stage,
      sampleCount: userAdaptiveProfile.sampleCount,
      minScoreBoost: userAdaptiveProfile.minScoreBoost,
      lotMultiplier: userAdaptiveProfile.lotMultiplier,
      slMultiplier: userAdaptiveProfile.slMultiplier,
      tpMultiplier: userAdaptiveProfile.tpMultiplier,
      retraceMultiplier: userAdaptiveProfile.retraceMultiplier,
      reason: userAdaptiveProfile.reason,
    },
  };
}

function scoreNextCandleConfirmation({ side, triggerCandle, confirmCandle, avgBody = 0 }) {
  if (!triggerCandle || !confirmCandle) return { passed: false, score: 0, reasons: ["MISSING_CANDLE"] };

  const triggerHigh = Number(triggerCandle.high || 0);
  const triggerLow = Number(triggerCandle.low || 0);
  const triggerClose = Number(triggerCandle.close || 0);
  const triggerOpen = Number(triggerCandle.open || 0);
  const confirmOpen = Number(confirmCandle.open || 0);
  const confirmClose = Number(confirmCandle.close || 0);
  const confirmHigh = Number(confirmCandle.high || 0);
  const confirmLow = Number(confirmCandle.low || 0);

  const triggerMid = (triggerHigh + triggerLow) / 2;
  const body = Math.abs(confirmClose - confirmOpen);
  const upperWick = confirmHigh - Math.max(confirmOpen, confirmClose);
  const lowerWick = Math.min(confirmOpen, confirmClose) - confirmLow;

  let score = 0;
  const reasons = [];

  if (side === "BUY") {
    if (confirmClose > triggerClose) {
      score += 0.25;
      reasons.push("CLOSE_ABOVE_TRIGGER_CLOSE");
    }
    if (confirmHigh > triggerHigh) {
      score += 0.25;
      reasons.push("BREAK_TRIGGER_HIGH");
    }
    if (confirmClose >= triggerMid) {
      score += 0.15;
      reasons.push("CLOSE_ABOVE_TRIGGER_MID");
    }
    if (avgBody > 0 && body >= avgBody * 0.65) {
      score += 0.15;
      reasons.push("BODY_OK");
    }
    if (upperWick <= body * 0.8) {
      score += 0.10;
      reasons.push("NO_STRONG_REJECTION");
    }
    if (confirmClose < triggerMid) {
      score -= 0.35;
      reasons.push("CLOSE_BACK_BELOW_MID");
    }
  } else {
    if (confirmClose < triggerClose) {
      score += 0.25;
      reasons.push("CLOSE_BELOW_TRIGGER_CLOSE");
    }
    if (confirmLow < triggerLow) {
      score += 0.25;
      reasons.push("BREAK_TRIGGER_LOW");
    }
    if (confirmClose <= triggerMid) {
      score += 0.15;
      reasons.push("CLOSE_BELOW_TRIGGER_MID");
    }
    if (avgBody > 0 && body >= avgBody * 0.65) {
      score += 0.15;
      reasons.push("BODY_OK");
    }
    if (lowerWick <= body * 0.8) {
      score += 0.10;
      reasons.push("NO_STRONG_REJECTION");
    }
    if (confirmClose > triggerMid) {
      score -= 0.35;
      reasons.push("CLOSE_BACK_ABOVE_MID");
    }
  }

  return {
    passed: score >= 0.45,
    score: Number(score.toFixed(2)),
    reasons
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

// function calculateAdaptiveRetracementPoints({
//   side,
//   candles = [],
//   signalStrength = 0,
//   mode = "NORMAL",
//   avgRange = 0,
//   slPoints = 0,
//   pattern = {},
//   defensiveFlags = {},
//   pipMultiplier = 100,
//   historicalVolumeSignal = {},
//   symbol = "",
// }) {
//   const profile = detectRetracementProfile({ side, candles, signalStrength, mode });
//   const absStrength = Math.abs(Number(signalStrength || 0));
//   const symbolUpper = String(symbol || "").toUpperCase();
//   const volumeState = String(historicalVolumeSignal.signal || "NORMAL").toUpperCase();

//   let retracePoints = Math.round(
//     Number(avgRange || 0) * Number(profile.retraceMultiplier || 0)
//   );

//   let volumeMultiplier = 1.0;
//   let minR = 0;
//   let maxR = 0;
//   let slCapRatio = Number(profile.slCapRatio || 0.30);

//   if (symbolUpper.includes("BTC")) {
//     if (volumeState === "HISTORICAL_CLIMAX") {
//       volumeMultiplier = 0.45;
//       minR = Math.round(15 * (pipMultiplier / 100));
//       maxR = Math.round(90 * (pipMultiplier / 100));
//       slCapRatio = 0.18;
//     } else if (volumeState === "ABOVE_AVERAGE") {
//       volumeMultiplier = 1.18;
//       minR = Math.round(60 * (pipMultiplier / 100));
//       maxR = Math.round(260 * (pipMultiplier / 100));
//       slCapRatio = 0.36;
//     } else if (volumeState === "LOW_VOLUME") {
//       volumeMultiplier = 0.78;
//       minR = Math.round(30 * (pipMultiplier / 100));
//       maxR = Math.round(180 * (pipMultiplier / 100));
//       slCapRatio = 0.26;
//     }
//   } else {
//     // XAU / pairs / อื่น ๆ
//     if (volumeState === "HISTORICAL_CLIMAX") {
//       volumeMultiplier = 0.42;
//       minR = Math.round(3 * (pipMultiplier / 100));
//       maxR = Math.round(25 * (pipMultiplier / 100));
//       slCapRatio = 0.16;
//     } else if (volumeState === "ABOVE_AVERAGE") {
//       volumeMultiplier = 1.16;
//       minR = Math.round(15 * (pipMultiplier / 100));
//       maxR = Math.round(110 * (pipMultiplier / 100));
//       slCapRatio = 0.32;
//     } else if (volumeState === "LOW_VOLUME") {
//       volumeMultiplier = 0.72;
//       minR = Math.round(8 * (pipMultiplier / 100));
//       maxR = Math.round(70 * (pipMultiplier / 100));
//       slCapRatio = 0.24;
//     }
//   }

//   retracePoints = Math.round(retracePoints * volumeMultiplier);

//   // signal แรง -> ย่อตื้นลงอีก
//   if (absStrength >= 4.0) {
//     retracePoints = Math.round(retracePoints * 0.50);
//   } else if (absStrength >= 3.0) {
//     retracePoints = Math.round(retracePoints * 0.67);
//   } else if (absStrength >= 2.2) {
//     retracePoints = Math.round(retracePoints * 0.83);
//   }

//   // impulse แรง -> ย่อตื้นลง
//   if (profile.impulseCount >= 3) {
//     retracePoints = Math.round(retracePoints * 0.88);
//   } else if (profile.impulseCount === 0) {
//     retracePoints = Math.round(retracePoints * 1.04);
//   }

//   // congestion มาก -> ย่อลึกขึ้นนิดหน่อย
//   if (profile.congestionCount >= 3) {
//     retracePoints = Math.round(retracePoints * 1.10);
//   } else if (profile.congestionCount >= 2) {
//     retracePoints = Math.round(retracePoints * 1.05);
//   }

//   // wick สวนทางเยอะ -> เผื่อย่อเพิ่มเล็กน้อย
//   if (profile.againstWickRatio >= 0.55) {
//     retracePoints = Math.round(retracePoints * 1.60);
//   }

//   // continuation / breakout / volume climax -> เข้าไวขึ้น
//   const patternUpper = String(
//     pattern?.name || pattern?.patternName || pattern?.type || pattern?.signal || ""
//   ).toUpperCase();

//   if (
//     patternUpper.includes("CLAW") ||
//     patternUpper.includes("BREAK") ||
//     patternUpper.includes("MARUBOZU") ||
//     patternUpper.includes("ENGULF")
//   ) {
//     retracePoints = Math.round(retracePoints * 0.72);
//   }

//   if (pattern?.isVolumeClimax) {
//     retracePoints = Math.round(retracePoints * 0.68);
//   }

//   if (pattern?.isVolumeDrying) {
//     retracePoints = Math.round(retracePoints * 1.08);
//   }

//   if (defensiveFlags?.warningMatched) {
//     retracePoints = Math.round(retracePoints * 1.06);
//   }

//   const maxRetraceBySL = Math.max(1, Math.round(Number(slPoints || 0) * slCapRatio));

//   if (!Number.isFinite(retracePoints) || retracePoints <= 0) {
//     retracePoints = minR;
//   }

//   if (retracePoints < minR) retracePoints = minR;
//   if (retracePoints > maxR) retracePoints = maxR;
//   if (retracePoints > maxRetraceBySL) retracePoints = maxRetraceBySL;
//   if (retracePoints < 0) retracePoints = 0;

//   return {
//     retracePoints,
//     retraceProfile: `${profile.profile}_${volumeState}`,
//   };
// }

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

  const safeRetraceMultiplier = Math.min(
    1.0,
    Math.max(0.70, Number(coldStartProfile.retraceMultiplier || 1))
  );

  let retracePoints = Math.round(
    Number(tradeSetup.retrace_points || 0) * safeRetraceMultiplier
  );

  // let retracePoints = Math.round(
  //   Number(tradeSetup.retrace_points || 0) *
  //   Number(coldStartProfile.retraceMultiplier || 1)
  // );

  const baseRecommendedLot = Number(tradeSetup.recommended_lot || 0);

  let recommendedLot = Number(
    (
      (Number.isFinite(baseRecommendedLot) && baseRecommendedLot > 0 ? baseRecommendedLot : 0.01) *
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
    recommendedLot = Number.isFinite(baseRecommendedLot) && baseRecommendedLot > 0
      ? Number(baseRecommendedLot.toFixed(2))
      : 0.01;
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
  userMinLotFloor,
  userMaxLotCap = 5,
  coldStartProfile = null,
  historicalVolumeSignal = null,
  symbol = "",
}) {
  let slPoints = 500;
  let tpPoints = 800;
  // let lotSize = 0.01;
  let retracePoints = 0;
  let signalStrength = 0;

  let lotSize = resolveBaseLot({
    configuredLot: userMinLotFloor,
    balance,
  });

  if (side === "BUY") signalStrength = Number(score || 0);
  else if (side === "SELL") signalStrength = Math.abs(Number(score || 0));

  const mult = Number(activeCfg?.pipMultiplier || 100);
  const avgRange = calculateAvgRange(candles, 3, mult);

  const detectedMode =
    String(pattern?.tradeMode || pattern?.mode || "").toUpperCase() ||
    (signalStrength >= 2.45 ? "NORMAL" : "SCALP");

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
  const normalizedModeForSetup = String(detectedMode || "NORMAL").toUpperCase();
  const isScalpModeForSetup =
    normalizedModeForSetup === "SCALP" || normalizedModeForSetup === "MICRO_SCALP";

  if (isScalpModeForSetup) {
    if (signalStrength < 3.0) {
      tpPoints = Math.round(tpPoints * 0.52);
      slPoints = Math.round(slPoints * 0.82);
    } else if (signalStrength < 5.5) {
      tpPoints = Math.round(tpPoints * 0.72);
      slPoints = Math.round(slPoints * 0.90);
    } else if (signalStrength >= 6.0) {
      tpPoints = Math.round(tpPoints * 0.88); // เดิมขยาย TP, ตอนนี้กดให้สั้นลง
      slPoints = Math.round(slPoints * 0.96);
    }

    // ให้ scalp มี RR แบบเก็บไว ไม่ใช่ถือยาว
    if (tpPoints > Math.round(slPoints * 0.90)) {
      tpPoints = Math.round(slPoints * 0.90);
    }
  } else {
    if (signalStrength < 3.0) {
      tpPoints = Math.round(tpPoints * 0.6);
      slPoints = Math.round(slPoints * 0.85);
    } else if (signalStrength < 5.5) {
      tpPoints = Math.round(tpPoints * 0.9);
      slPoints = Math.round(slPoints * 0.95);
    } else if (signalStrength >= 6.0) {
      tpPoints = Math.round(tpPoints * 1.15);
    }
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
  // 4) Lot size ใหม่
  // - ถ้าผู้ใช้ตั้ง base lot > 0 ใช้เป็น floor
  // - ถ้า user ไม่ได้ตั้งหรือเป็น 0.00 ให้ใช้ lot ที่ระบบคำนวณได้
  // - lot expansion ขึ้นกับ score/confidence + balance
  // -----------------------------
  const resolvedBaseLot = resolveBaseLot({
    configuredLot: userMinLotFloor,
    balance,
  });

  const confidenceLevel = resolveConfidenceLevel({
    score: signalStrength,
    patternType: pattern?.type || "",
    historicalVolumeSignal: historicalVolumeSignal?.signal || historicalVolumeSignal || "",
    trend: pattern?.structure?.microTrend || "",
    mode: detectedMode,
  });

  const lotSizing = calculateProgressiveLotSize({
    userBaseLot: userMinLotFloor,
    userMaxLot: userMaxLotCap,
    score: signalStrength,
    confidenceLevel,
    balance: Number(balance || 0),
  });

  // lot ที่ระบบคำนวณได้
  let calculatedLot = Number(lotSizing.systemLot || 0.01);

  // defensiveFlags ยังมีผลลด/เพิ่ม lot ได้
  if (defensiveFlags?.warningMatched) {
    const lotMultiplier = Number(defensiveFlags?.lotMultiplier || 1);
    if (lotMultiplier > 0) {
      calculatedLot = Number((calculatedLot * lotMultiplier).toFixed(2));
    }
  }

  if (!Number.isFinite(calculatedLot) || calculatedLot <= 0) {
    calculatedLot = 0.01;
  }

  // ถ้าผู้ใช้ตั้ง base lot มา ให้ใช้เป็น floor เท่านั้น
  if (Number(userMinLotFloor || 0) > 0 && calculatedLot < resolvedBaseLot) {
    lotSize = resolvedBaseLot;
  } else {
    lotSize = calculatedLot;
  }

  if (lotSize < 0.01) lotSize = 0.01;
  lotSize = clampLotToTradingPreferences(lotSize, {
    base_log_size: userMinLotFloor,
    max_lot_size: userMaxLotCap,
  });

  let tradeSetup = {
    recommended_lot: lotSize,
    sl_points: slPoints,
    tp_points: tpPoints,
    retrace_points: retracePoints
  };

  tradeSetup = applyMicroScalpFixedTargetToTradeSetup({
    tradeSetup: {
      ...tradeSetup,
      mode: detectedMode,
    },
    mode: detectedMode,
    score: score,
    confidenceLevel,
    historicalVolumeSignal,
    trend: pattern?.structure?.microTrend || "",
    patternType: pattern?.type || "",
    activeCfg,
  });

  tradeSetup = applyColdStartProfileToTradeSetup({
    tradeSetup,
    coldStartProfile,
    activeCfg,
  });

  const safeUserMinLotFloor = Number(userMinLotFloor || 0);
  if (
    safeUserMinLotFloor > 0 &&
    Number(tradeSetup.recommended_lot || 0) < safeUserMinLotFloor
  ) {
    tradeSetup.recommended_lot = Number(safeUserMinLotFloor.toFixed(2));
    if (tradeSetup.recommended_lot < 0.01) {
      tradeSetup.recommended_lot = 0.01;
    }
  }

  tradeSetup = applyTradingPreferenceLotBoundsToTradeSetup(
    tradeSetup,
    {
      base_log_size: userMinLotFloor,
      max_lot_size: userMaxLotCap,
    },
    0.01
  );

  return tradeSetup;
}

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
  symbol = "",
}) {
  const requestSide = String(reqBody.side || "").toUpperCase();
  const microSignal = String(microResult.signal || "").toUpperCase();

  // if (microSignal !== side) {
  //   return null;
  // }
  if (!microSignal) {
    return null;
  }

  if (requestSide && requestSide !== "ANY" && microSignal !== requestSide) {
    return null;
  }

  const side = microSignal;
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

  const rawLotFloor = Number(
    tradingPreferences?.base_log_size ??
    tradingPreferences?.base_lot_size ??
    0
  );
  const rawMaxLotCap = Number(
    tradingPreferences?.max_lot_size ??
    tradingPreferences?.maxLotSize ??
    5
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
    userMinLotFloor: rawLotFloor,
    userMaxLotCap: rawMaxLotCap,
    coldStartProfile,
    historicalVolumeSignal: historicalVolume,
    symbol,
  });

  trade_setup = {
    ...trade_setup,
    mode: "MICRO_SCALP",
  };

  trade_setup = applyMicroScalpFixedTargetToTradeSetup({
    tradeSetup: trade_setup,
    score,
    historicalVolumeSignal: historicalVolume,
    patternType: pattern?.type || pattern?.pattern || "",
    activeCfg,
  });

  trade_setup = applyUserAdaptiveProfileToTradeSetup({
    tradeSetup: trade_setup,
    userAdaptiveProfile,
    activeCfg,
  });

  trade_setup = applyTradingPreferenceLotBoundsToTradeSetup(
    trade_setup,
    tradingPreferences,
    0.01
  );

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

function normalizeCandleArray(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (c) =>
      c &&
      Number.isFinite(Number(c.open)) &&
      Number.isFinite(Number(c.high)) &&
      Number.isFinite(Number(c.low)) &&
      Number.isFinite(Number(c.close))
  );
}

function resolveHigherTimeframes(body = {}) {
  const candlesM15 = normalizeCandleArray(body.candles_m15);
  const candlesM30 = normalizeCandleArray(body.candles_m30);
  const candlesH1 = normalizeCandleArray(body.candles_h1);
  const candlesH4 = normalizeCandleArray(body.candles_h4);

  // ใช้ M15/M30 เป็น HTF หลักสำหรับเทรดสั้น
  const trendPrimaryCandles = candlesM15.length > 0 ? candlesM15 : candlesH1;
  const trendSecondaryCandles = candlesM30.length > 0 ? candlesM30 : candlesH4;

  const trendPrimaryLabel = candlesM15.length > 0 ? "M15" : "H1";
  const trendSecondaryLabel = candlesM30.length > 0 ? "M30" : "H4";

  return {
    candlesM15,
    candlesM30,
    candlesH1,
    candlesH4,
    trendPrimaryCandles,
    trendSecondaryCandles,
    trendPrimaryLabel,
    trendSecondaryLabel,
  };
}

function getClosedCandle(candles = [], indexFromEnd = 1) {
  if (!Array.isArray(candles) || candles.length < indexFromEnd) return null;
  return candles[candles.length - indexFromEnd] || null;
}

function getCandleTimeKey(candle = {}) {
  return String(
    candle.time ||
    candle.timestamp ||
    candle.datetime ||
    candle.date ||
    ""
  ).trim();
}

function getDecisionSideForThesis(decision = "") {
  const upper = String(decision || "").toUpperCase();
  if (upper.includes("BUY")) return "BUY";
  if (upper.includes("SELL")) return "SELL";
  return "";
}

function pickEntryThesisPatternSummary(pattern = null) {
  if (!pattern || typeof pattern !== "object") return null;

  const breakoutRetest = pattern?.breakoutRetest && typeof pattern.breakoutRetest === "object"
    ? {
      direction: String(pattern.breakoutRetest.direction || "").toUpperCase(),
      breakoutDetected: Boolean(pattern.breakoutRetest.breakoutDetected),
      freshBreakout: Boolean(pattern.breakoutRetest.freshBreakout),
      hasRetest: Boolean(pattern.breakoutRetest.hasRetest),
      retestAccepted: Boolean(pattern.breakoutRetest.retestAccepted),
      retestRejected: Boolean(pattern.breakoutRetest.retestRejected),
      breakoutLevel: Number(pattern.breakoutRetest.breakoutLevel || 0) || null,
      breakoutZoneHigh: Number(pattern.breakoutRetest.breakoutZoneHigh || 0) || null,
      breakoutZoneLow: Number(pattern.breakoutRetest.breakoutZoneLow || 0) || null,
    }
    : null;

  const structure = pattern?.structure && typeof pattern.structure === "object"
    ? {
      microTrend: String(pattern.structure.microTrend || "").toUpperCase(),
      triggerWindow: String(pattern.structure.triggerWindow || "").toUpperCase(),
      setupWindow: String(pattern.structure.setupWindow || "").toUpperCase(),
      recentMassiveBull: Boolean(pattern.structure.recentMassiveBull),
      recentMassiveBear: Boolean(pattern.structure.recentMassiveBear),
      possibleReversal: Boolean(pattern.structure.possibleReversal),
    }
    : null;

  return {
    name: String(pattern.pattern || pattern.name || pattern.type || "").trim(),
    type: String(pattern.type || pattern.pattern || "").trim(),
    tradeMode: String(pattern.tradeMode || pattern.mode || "").trim().toUpperCase(),
    breakoutRetest,
    structure,
  };
}

function pickEntryThesisTriggerSummary(candles = []) {
  const triggerCandle = getClosedCandle(candles, 1) || getLastCandle(candles, 1);
  if (!triggerCandle) return null;

  return {
    time: getCandleTimeKey(triggerCandle) || null,
    open: toNum(triggerCandle.open, 0),
    high: toNum(triggerCandle.high, 0),
    low: toNum(triggerCandle.low, 0),
    close: toNum(triggerCandle.close, 0),
    tickVolume: toNum(triggerCandle.tick_volume ?? triggerCandle.tickVolume ?? 0, 0),
  };
}

function buildEntryThesisSnapshotDocument({
  sourceEndpoint,
  reqBody = {},
  payload = {},
  thesisStage,
  executionStatus = "PENDING_EXECUTION",
}) {
  const firebaseUserId = String(
    reqBody?.firebaseUserId ||
    payload?.firebaseUserId ||
    ""
  ).trim();
  const accountId = String(
    reqBody?.accountId ||
    payload?.accountId ||
    ""
  ).trim();
  const symbol = String(
    reqBody?.symbol ||
    payload?.symbol ||
    ""
  ).trim().toUpperCase();
  const decision = String(payload?.decision || "NO_TRADE").trim().toUpperCase();
  const side = String(
    payload?.candidateSide ||
    getDecisionSideForThesis(decision) ||
    reqBody?.side ||
    payload?.side ||
    ""
  ).trim().toUpperCase();
  const mode = String(
    payload?.mode ||
    payload?.trade_setup?.mode ||
    reqBody?.pendingMode ||
    "NORMAL"
  ).trim().toUpperCase();
  const candles = Array.isArray(reqBody?.candles) ? reqBody.candles : [];
  const trigger = pickEntryThesisTriggerSummary(candles);
  const payloadPattern = payload?.pattern || reqBody?.baseSignal?.pattern || null;
  const payloadHistoricalVolume =
    payload?.historicalVolume ??
    reqBody?.baseSignal?.historicalVolume ??
    null;

  if (!firebaseUserId || !symbol || !side) {
    return null;
  }

  return {
    firebaseUserId,
    accountId,
    symbol,
    side,
    mode,
    decision,
    sourceEndpoint: String(sourceEndpoint || "signal").trim(),
    thesisStage: String(thesisStage || "SIGNAL_ENTRY_CANDIDATE").trim(),
    executionStatus: String(executionStatus || "PENDING_EXECUTION").trim(),
    score: Number(payload?.score || 0),
    confidence: Number(payload?.confidence || 0),
    trend: String(payload?.trend || reqBody?.baseSignal?.trend || "NEUTRAL").trim().toUpperCase(),
    reason: String(payload?.reason || "").trim(),
    phase: payload?.phase ? String(payload.phase).trim() : null,
    state: payload?.state ? String(payload.state).trim() : null,
    activeHypothesis: payload?.activeHypothesis ? String(payload.activeHypothesis).trim() : null,
    candidateSide: payload?.candidateSide ? String(payload.candidateSide).trim().toUpperCase() : null,
    pattern: pickEntryThesisPatternSummary(payloadPattern),
    historicalVolume:
      payloadHistoricalVolume && typeof payloadHistoricalVolume === "object"
        ? {
          signal: String(payloadHistoricalVolume.signal || "").trim().toUpperCase(),
          ratio: Number(payloadHistoricalVolume.ratio || 0) || null,
          score: Number(payloadHistoricalVolume.score || 0) || null,
        }
        : payloadHistoricalVolume
          ? { signal: String(payloadHistoricalVolume).trim().toUpperCase() }
          : null,
    defensiveFlags:
      payload?.defensiveFlags && typeof payload.defensiveFlags === "object"
        ? {
          warningMatched: Boolean(payload.defensiveFlags.warningMatched),
          lotMultiplier: Number(payload.defensiveFlags.lotMultiplier || 1),
          tpMultiplier: Number(payload.defensiveFlags.tpMultiplier || 1),
          reason: payload.defensiveFlags.reason || null,
        }
        : null,
    tradeSetup: payload?.trade_setup && typeof payload.trade_setup === "object"
      ? {
        recommended_lot: Number(payload.trade_setup.recommended_lot || 0),
        sl_points: Number(payload.trade_setup.sl_points || 0),
        tp_points: Number(payload.trade_setup.tp_points || 0),
        retrace_points: Number(payload.trade_setup.retrace_points || 0),
        mode: String(payload.trade_setup.mode || mode).trim().toUpperCase(),
      }
      : null,
    hypotheses:
      payload?.hypotheses && typeof payload.hypotheses === "object"
        ? payload.hypotheses
        : null,
    evidence: Array.isArray(payload?.evidence)
      ? payload.evidence
        .map((item) => String(item || "").trim())
        .filter(Boolean)
      : [],
    market: {
      timeframe: String(reqBody?.timeframe || "M5").trim().toUpperCase(),
      requestSide: String(reqBody?.side || "").trim().toUpperCase(),
      requestedPrice: toNum(reqBody?.price, 0),
      spreadPoints: toNum(reqBody?.market?.spreadPoints ?? reqBody?.spreadPoints, 0),
      balance: toNum(reqBody?.balance, 0),
      pendingAgeSec: toNum(reqBody?.refreshContext?.pendingAgeSec, 0),
      refreshAttempt: toNum(reqBody?.refreshContext?.refreshAttempt ?? reqBody?.refreshAttempt, 0),
      baseDecision: String(reqBody?.baseSignal?.decision || "").trim().toUpperCase(),
      baseScore: Number(reqBody?.baseSignal?.score || 0),
    },
    trigger,
    eventTime: new Date(),
    updatedAt: new Date(),
  };
}

function shouldPersistSignalEntryThesis(result = {}) {
  return (
    isOpenDecision(result?.decision) &&
    result?.trade_setup &&
    Number(result?.trade_setup?.recommended_lot || 0) > 0
  );
}

function resolveRefreshEntryThesisStage(payload = {}) {
  const action = String(payload?.action || "").toUpperCase();
  const state = String(payload?.state || "").toUpperCase();

  if (action === "EXECUTE_NOW" && state === "OPEN_REVERSAL") {
    return "REFRESH_REVERSAL_ENTRY";
  }

  if (action === "EXECUTE_NOW") {
    return "REFRESH_CONFIRMED_ENTRY";
  }

  return "";
}

function shouldPersistRefreshEntryThesis(payload = {}) {
  return Boolean(resolveRefreshEntryThesisStage(payload));
}

async function getLatestEntryThesisSnapshotForRefresh({
  firebaseUserId,
  accountId = "",
  symbol = "",
  side = "",
  mode = "",
}) {
  const safeFirebaseUserId = String(firebaseUserId || "").trim();
  const safeAccountId = String(accountId || "").trim();
  const safeSymbol = String(symbol || "").trim().toUpperCase();
  const safeSide = String(side || "").trim().toUpperCase();
  const safeMode = String(mode || "").trim().toUpperCase();

  if (!safeFirebaseUserId || !safeSymbol || !safeSide) {
    return null;
  }

  const filter = {
    firebaseUserId: safeFirebaseUserId,
    symbol: safeSymbol,
    side: safeSide,
    sourceEndpoint: { $in: ["signal", "signal_refresh"] },
    eventTime: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 12) },
  };

  if (safeAccountId) {
    filter.accountId = safeAccountId;
  }

  if (safeMode) {
    filter.mode = safeMode;
  }

  try {
    return await EntryThesisSnapshot.findOne(filter)
      .sort({ eventTime: -1, _id: -1 })
      .lean();
  } catch (error) {
    console.error("[entry-thesis] load refresh snapshot failed:", error.message);
    return null;
  }
}

function writeEntryThesisSnapshot(document) {
  if (!document) return;

  EntryThesisSnapshot.create(document).catch((error) => {
    console.error("[entry-thesis] write failed:", error.message);
  });
}

function linkLatestEntryThesisSnapshotToOpenOrder({
  firebaseUserId,
  accountId = "",
  symbol = "",
  side = "",
  mode = "",
  ticketId = "",
  lot = 0,
  price = 0,
  sl = 0,
  tp = 0,
  eventTime = null,
}) {
  const safeFirebaseUserId = String(firebaseUserId || "").trim();
  const safeAccountId = String(accountId || "").trim();
  const safeSymbol = String(symbol || "").trim().toUpperCase();
  const safeSide = String(side || "").trim().toUpperCase();
  const safeMode = String(mode || "").trim().toUpperCase();
  const safeTicketId = String(ticketId || "").trim();

  if (!safeFirebaseUserId || !safeSymbol || !safeSide || !safeTicketId) {
    return;
  }

  const filter = {
    firebaseUserId: safeFirebaseUserId,
    symbol: safeSymbol,
    side: safeSide,
    linkedTicketId: null,
    eventTime: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 6) },
  };

  if (safeAccountId) {
    filter.accountId = safeAccountId;
  }

  if (safeMode) {
    filter.mode = safeMode;
  }

  EntryThesisSnapshot.findOneAndUpdate(
    filter,
    {
      $set: {
        linkedTicketId: safeTicketId,
        linkedAt: eventTime ? new Date(eventTime) : new Date(),
        executionStatus: "EXECUTED_OPEN_ORDER",
        linkedOpenOrder: {
          lot: toNum(lot, 0),
          price: toNum(price, 0),
          sl: toNum(sl, 0),
          tp: toNum(tp, 0),
          mode: safeMode || null,
        },
        updatedAt: new Date(),
      },
    },
    {
      sort: { eventTime: -1, _id: -1 },
    }
  ).catch((error) => {
    console.error("[entry-thesis] link open order failed:", error.message);
  });
}

function getAverageBody(candles = [], len = 5) {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const recent = candles.slice(-len);
  const values = recent.map(c => Math.abs(Number(c.close || 0) - Number(c.open || 0)));
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / Math.max(1, values.length);
}

function shouldRequireNextCandleConfirmation({
  decision = "",
  score = 0,
  confidenceLevel = "LOW",
  mode = "NORMAL",
  trend = "",
  historicalVolumeSignal = "",
  patternType = "",
  symbol = "",
}) {
  const safeDecision = String(decision || "").toUpperCase();
  const safeConfidence = String(confidenceLevel || "LOW").toUpperCase();
  const safeMode = String(mode || "NORMAL").toUpperCase();
  const safeTrend = String(trend || "").toUpperCase();
  const safeVolume = String(historicalVolumeSignal || "").toUpperCase();
  const safePattern = String(patternType || "").toUpperCase();
  const safeScore = Math.abs(Number(score || 0));

  if (!isPrimaryTradeDecision(safeDecision)) return false;
  if (safeMode === "MICRO_SCALP") return false;
  if (safeConfidence === "VERY_HIGH" && safeScore >= 2.8) return false;

  const firstLegPattern =
    safePattern.includes("FIRST_LEG_BREAKOUT") ||
    safePattern.includes("FIRST_LEG_BREAKDOWN");

  const breakoutPattern =
    safePattern.includes("BREAKOUT") ||
    safePattern.includes("BREAKDOWN");

  const neutralTrend = safeTrend === "NEUTRAL";
  const lowVolume = safeVolume === "LOW_VOLUME";

  if (firstLegPattern) return true;

  if (
    breakoutPattern &&
    (safeConfidence === "NORMAL" || neutralTrend || lowVolume || safeScore < 2.8)
  ) {
    return true;
  }

  return false;
}

async function handleSignalCore(req, { isRefresh = false } = {}) {
  const {
    symbol,
    firebaseUserId,
    accountId,
    side,
    price,
    candles,
    candles_m15,
    candles_m30,
    candles_h1,
    candles_h4,
    balance,
    overlapPips,
  } = req.body || {};

  const resolvedUserId = firebaseUserId || null;
  const resolvedSymbol = String(symbol || "").trim();
  const requestSide = String(side || "").toUpperCase();
  const spreadPoints = Number(req.body?.spreadPoints || 0);

  const noTrade = (extra = {}) => ({
    decision: "NO_TRADE",
    score: 0,
    firebaseUserId: resolvedUserId,
    mode: "NORMAL",
    trend: "NEUTRAL",
    ...extra,
  });

  try {
    const higherTf = resolveHigherTimeframes({
      candles_m15,
      candles_m30,
      candles_h1,
      candles_h4,
    });

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

    if (!isTradingEngineEnabled(tradingPreferences)) {
      return buildBlockedSignalResponse({
        reason: "ENGINE_DISABLED",
        score: 0,
        firebaseUserId: resolvedUserId,
        mode: "NORMAL",
        trend: "NEUTRAL",
        pattern: null,
        historicalVolume: null,
        defensiveFlags: null,
        trade_setup: null,
        currentOpenPositionsCount: 0,
      });
    }

    let totalClosedTrades = 0;
    try {
      if (resolvedUserId) {
        totalClosedTrades = await countTradeHistoryByUser(resolvedUserId);
      }
    } catch (tradeCountError) {
      console.error("Load trade count error:", tradeCountError.message);
    }

    const news = readFilter();
    const calendar = checkCalendar();
    const session = getSession();
    const risk = getRiskState();

    const pattern = await analyzePattern({
      symbol: resolvedSymbol,
      candles,
      candlesM15: higherTf.candlesM15,
      candlesM30: higherTf.candlesM30,
      candlesTrendPrimary: higherTf.trendPrimaryCandles,
      candlesTrendSecondary: higherTf.trendSecondaryCandles,
      candlesH1: higherTf.trendPrimaryCandles,
      candlesH4: higherTf.trendSecondaryCandles,
      overlapPips,
    });

    const ictContext = analyzeICT(candles);

    const historicalVolume = evaluateCurrentVolumeAgainstHistory({
      firebaseUserId: resolvedUserId,
      symbol: resolvedSymbol,
      candles,
    });

    const evaluateResult = await evaluateDecision({
      news,
      calendar,
      session,
      risk,
      pattern,
      trendFollow4: pattern?.trendFollow4 || {},
      ictContext,
      market: {
        userId: resolvedUserId,
        accountId: accountId || null,
        symbol: resolvedSymbol,
        timeframe: "M5",
        price,
        candles: Array.isArray(candles) ? candles : [],
        candlesM15: higherTf.candlesM15,
        candlesM30: higherTf.candlesM30,
        candlesH1: higherTf.trendPrimaryCandles,
        candlesH4: higherTf.trendSecondaryCandles,
        trendPrimaryCandles: higherTf.trendPrimaryCandles,
        trendSecondaryCandles: higherTf.trendSecondaryCandles,
        trendPrimaryLabel: higherTf.trendPrimaryLabel,
        trendSecondaryLabel: higherTf.trendSecondaryLabel,
        portfolio: req.body.portfolio || { currentPosition: "NONE", count: 0 },
        sessionName: session?.name || null,
        historicalVolumeSignal: historicalVolume?.signal || historicalVolume || null,
      }
    });

    console.log("[EVALUATE_DECISION_BREAKDOWN]", {
      action: evaluateResult.finalDecision,
      reason: evaluateResult.reason,
      evaluateResult,
    });

    let mainUserRecentPerformance = null;
    let mainUserAdaptiveProfile = null;

    try {
      if (resolvedUserId) {
        mainUserRecentPerformance = await getRecentClosedTradePerformance({
          firebaseUserId: resolvedUserId,
          accountId,
          symbol: resolvedSymbol,
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

    const score = Number(evaluateResult?.score || 0);

    const finalDecisionResult = resolveDecisionWithTradingPreferences(
      evaluateResult,
      resolvedSymbol,
      { tradingPreferences }
    );

    const finalDecision = finalDecisionResult.decision;
    const finalDecisionReason = finalDecisionResult.reason || null;

    try {
      if (Array.isArray(candles) && candles.length > 0) {
        const contextCandles = candles.map((c) => ({
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
          symbol: resolvedSymbol || "",
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

    console.log("[DECISION_BREAKDOWN]", {
      symbol: resolvedSymbol,
      mode: evaluateResult.mode,
      trend: evaluateResult.trend,
      score: evaluateResult.score,
      adaptiveScoreDelta: evaluateResult.adaptiveScoreDelta,
      historicalVolumeSignal: evaluateResult.historicalVolumeSignal,
      thresholdContext: evaluateResult.thresholdContext,
      finalDecision,
    });

    const effectiveTradeMode = isPyramidDecision(finalDecision)
      ? "MICRO_SCALP"
      : String(evaluateResult.mode || "NORMAL").toUpperCase();

    if (isPyramidDecision(finalDecision) && resolvedUserId) {
      try {
        mainUserRecentPerformance = await getRecentClosedTradePerformance({
          firebaseUserId: resolvedUserId,
          accountId,
          symbol: resolvedSymbol,
          mode: normalizeAdaptiveMode(effectiveTradeMode),
          limit: 18,
        });

        mainUserAdaptiveProfile = buildUserAdaptiveProfile({
          recentPerformance: mainUserRecentPerformance,
          mode: effectiveTradeMode,
        });
      } catch (recentPerfError) {
        console.error("Reload pyramid performance error:", recentPerfError.message);
      }
    }

    const activeCfg = getActiveSymbolConfig(
      resolvedSymbol,
      effectiveTradeMode
    );

    const coldStartProfile = buildColdStartProfile({
      closedTradesCount: totalClosedTrades,
      mode: effectiveTradeMode,
    });

    if (
      isOpenDecision(finalDecision) &&
      coldStartProfile.enabled &&
      coldStartProfile.blockWeakSignals &&
      Math.abs(score) < Number(coldStartProfile.minRequiredStrength || 0)
    ) {
      return {
        ...buildBlockedSignalResponse({
          reason: `COLD_START_${coldStartProfile.stage}_MIN_SCORE`,
          score,
          firebaseUserId: resolvedUserId,
          mode: effectiveTradeMode,
          trend: evaluateResult.trend || "NEUTRAL",
          pattern,
          historicalVolume,
          defensiveFlags: evaluateResult.defensiveFlags || null,
          trade_setup: null,
          currentOpenPositionsCount: 0,
        }),
        cold_start_profile: coldStartProfile,
        totalClosedTrades,
      };
    }

    if (!isPrimaryTradeDecision(finalDecision)) {
      const microResult = microScalpEngine.analyzeMicroScalp({
        symbol: resolvedSymbol,
        candles: Array.isArray(candles) ? candles : [],
        candlesH1: Array.isArray(candles_h1) ? candles_h1 : [],
        candlesH4: Array.isArray(candles_h4) ? candles_h4 : [],
        spread: spreadPoints,
        config: MICRO_SCALP_CONFIG,
      });

      if (microResult.allowOpen) {
        const microUserRecentPerformance = await getRecentClosedTradePerformance({
          firebaseUserId: resolvedUserId,
          accountId,
          symbol: resolvedSymbol,
          mode: "SCALP",
          limit: 18,
        });

        const microUserAdaptiveProfile = buildUserAdaptiveProfile({
          recentPerformance: microUserRecentPerformance,
          mode: "MICRO_SCALP",
        });

        const microActiveCfg = getActiveSymbolConfig(resolvedSymbol, "MICRO_SCALP");

        const microResponse = buildMicroFallbackResponse({
          microResult,
          reqBody: req.body,
          resolvedUserId,
          pattern,
          historicalVolume,
          activeCfg: microActiveCfg,
          tradingPreferences,
          totalClosedTrades,
          userAdaptiveProfile: microUserAdaptiveProfile,
          symbol: resolvedSymbol,
        });

        if (microResponse) {
          if (microResponse.decision === "NO_TRADE") {
            return microResponse;
          }

          const microDirectionResult = enforceDirectionBiasOnDecision(
            microResponse.decision,
            tradingPreferences
          );

          if (microDirectionResult.blocked) {
            return buildBlockedSignalResponse({
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
            });
          }

          const currentOpenPositionsCount =
            await countOpenPositionsByUserAccountAndSymbol({
              firebaseUserId: resolvedUserId,
              accountId,
              symbol: resolvedSymbol,
            });

          if (
            isMaxOpenPositionsReached(
              currentOpenPositionsCount,
              tradingPreferences.max_open_positions
            )
          ) {
            return buildBlockedSignalResponse({
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
            });
          }

          console.log(
            `[MICRO_SCALP FALLBACK] symbol=${resolvedSymbol} side=${requestSide} score=${microResponse.score} decision=${microResponse.decision}`
          );

          return microResponse;
        }
      }
    }

    if (finalDecision === "NO_TRADE" && finalDecisionReason) {
      return buildBlockedSignalResponse({
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
      });
    }

    const defensiveFlags = evaluateResult.defensiveFlags || {
      warningMatched: false,
      lotMultiplier: 1,
      tpMultiplier: 1,
      reason: null,
    };

    const rawLotFloor = Number(
      tradingPreferences?.base_log_size ??
      tradingPreferences?.base_lot_size ??
      0
    );
    const safeLotFloor = rawLotFloor > 0 ? roundLot(rawLotFloor, 0.01) : 0;
    const safeLotCap = roundLot(
      Math.max(
        safeLotFloor || 0.01,
        Number(
          tradingPreferences?.max_lot_size ??
          tradingPreferences?.maxLotSize ??
          5
        ) || 5
      ),
      0.01
    );

    const resolvedTradeSide =
      String(finalDecision || "").includes("BUY")
        ? "BUY"
        : String(finalDecision || "").includes("SELL")
          ? "SELL"
          : String(evaluateResult?.side || requestSide || "").toUpperCase();

    let pyramidReferenceLot = 0;
    if (isPyramidDecision(finalDecision)) {
      let activePositions = [];

      try {
        const rows = await getActivePositionsByUserAndSymbol({
          firebaseUserId: resolvedUserId,
        });
        activePositions = Array.isArray(rows) ? rows : [];
      } catch (activePositionError) {
        console.error("Load active positions for pyramid error:", activePositionError.message);
      }

      pyramidReferenceLot = resolvePyramidFirstLot({
        activePositions,
        accountId,
        symbol: resolvedSymbol,
        side: resolvedTradeSide,
        portfolio: req.body?.portfolio || null,
      });

      if (pyramidReferenceLot <= 0) {
        return buildBlockedSignalResponse({
          reason: "PYRAMID_REFERENCE_LOT_NOT_FOUND",
          score,
          firebaseUserId: resolvedUserId,
          mode: effectiveTradeMode,
          trend: evaluateResult.trend || "NEUTRAL",
          pattern,
          historicalVolume,
          defensiveFlags,
          trade_setup: null,
          currentOpenPositionsCount: Number(req.body?.portfolio?.count || 0),
        });
      }

      const pyramidLotCap = roundLot(pyramidReferenceLot - 0.01, 0.01);
      const minAllowedLot = Math.max(safeLotFloor, 0.01);

      if (pyramidLotCap < minAllowedLot) {
        return buildBlockedSignalResponse({
          reason: "PYRAMID_LOT_CONSTRAINT_CONFLICT",
          score,
          firebaseUserId: resolvedUserId,
          mode: effectiveTradeMode,
          trend: evaluateResult.trend || "NEUTRAL",
          pattern,
          historicalVolume,
          defensiveFlags,
          trade_setup: null,
          currentOpenPositionsCount: Number(req.body?.portfolio?.count || 0),
        });
      }
    }

    let trade_setup = buildTradeSetupFromPattern({
      side: resolvedTradeSide,
      price: Number(price || 0),
      pattern,
      candles,
      balance: Number(balance || 0),
      spreadPoints,
      activeCfg,
      score,
      defensiveFlags,
      userMinLotFloor: rawLotFloor,
      userMaxLotCap: safeLotCap,
      coldStartProfile,
      historicalVolumeSignal: historicalVolume,
      symbol: resolvedSymbol,
    });

    if (effectiveTradeMode === "MICRO_SCALP") {
      const microActiveCfg = getActiveSymbolConfig(resolvedSymbol, "MICRO_SCALP");
      trade_setup = applyMicroScalpFixedTargetToTradeSetup({
        tradeSetup: {
          ...trade_setup,
          mode: "MICRO_SCALP",
        },
        score,
        historicalVolumeSignal:
          historicalVolume?.signal || historicalVolume || "",
        patternType: pattern?.type || pattern?.pattern || "",
        activeCfg: microActiveCfg,
      });
    }

    trade_setup = applyUserAdaptiveProfileToTradeSetup({
      tradeSetup: trade_setup,
      userAdaptiveProfile: mainUserAdaptiveProfile,
      activeCfg,
    });

    trade_setup = applyTradingPreferenceLotBoundsToTradeSetup(
      trade_setup,
      tradingPreferences,
      0.01
    );

    if (isPyramidDecision(finalDecision)) {
      const pyramidLotCap = roundLot(pyramidReferenceLot - 0.01, 0.01);
      const currentRecommendedLot = roundLot(
        Number(trade_setup?.recommended_lot || safeLotFloor || 0.01),
        0.01
      );

      trade_setup = {
        ...trade_setup,
        mode: "MICRO_SCALP",
        recommended_lot: roundLot(
          Math.min(currentRecommendedLot, pyramidLotCap),
          0.01
        ),
        pyramid_reference_lot: pyramidReferenceLot,
        pyramid_lot_cap: pyramidLotCap,
      };
    }

    const adaptiveMinScore = getAdaptiveMinRequiredScore({
      baseScore: 0,
      coldStartProfile,
      userAdaptiveProfile: mainUserAdaptiveProfile,
    });

    if (
      isOpenDecision(finalDecision) &&
      Math.abs(score) < adaptiveMinScore
    ) {
      return {
        ...buildBlockedSignalResponse({
          reason: "USER_ADAPTIVE_MIN_SCORE",
          score,
          firebaseUserId: resolvedUserId,
          mode: effectiveTradeMode,
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
      };
    }

    if (finalDecisionResult?.setupTuning) {
      trade_setup.tp_points = Math.round(
        Number(trade_setup.tp_points || 0) *
        Number(finalDecisionResult.setupTuning.tpMultiplier || 1)
      );

      trade_setup.sl_points = Math.round(
        Number(trade_setup.sl_points || 0) *
        Number(finalDecisionResult.setupTuning.slMultiplier || 1)
      );

      trade_setup.retrace_points = Math.round(
        Number(trade_setup.retrace_points || 0) *
        Number(finalDecisionResult.setupTuning.retraceMultiplier || 1)
      );
    }

    const result = {
      decision: finalDecision,
      score,
      firebaseUserId: resolvedUserId,
      mode: effectiveTradeMode,
      trend: evaluateResult.trend || "NEUTRAL",
      pattern,
      historicalVolume,
      defensiveFlags,
      trade_setup,
      cold_start_profile: coldStartProfile,
      user_adaptive_profile: mainUserAdaptiveProfile,
      recent_performance: mainUserRecentPerformance,
      totalClosedTrades,
    };

    if (isRefresh) {
      const pendingSide = String(req.body?.pendingSide || "").toUpperCase();
      const decisionUpper = String(result.decision || "").toUpperCase();
      const isBuyDecision = decisionUpper.startsWith("ALLOW_BUY");
      const isSellDecision = decisionUpper.startsWith("ALLOW_SELL");

      if (
        (pendingSide === "BUY" && isSellDecision) ||
        (pendingSide === "SELL" && isBuyDecision)
      ) {
        return {
          ...result,
          decision: "NO_TRADE",
          score: 0,
          reason: "REFRESH_SIDE_MISMATCH",
        };
      }
    }

    return result;
  } catch (error) {
    console.error("Signal processing error:", error);
    return noTrade({
      error: error.message || "Internal server error",
    });
  }
}

app.post("/signal", async (req, res) => {
  try {
    const result = await handleSignalCore(req, { isRefresh: false });

    if (shouldPersistSignalEntryThesis(result)) {
      writeEntryThesisSnapshot(
        buildEntryThesisSnapshotDocument({
          sourceEndpoint: "signal",
          reqBody: req.body || {},
          payload: result,
          thesisStage: "SIGNAL_ENTRY_CANDIDATE",
        })
      );
    }

    return res.json(result);
  } catch (error) {
    console.error("[/signal] error:", error);
    return res.status(500).json({
      decision: "NO_TRADE",
      score: 0,
      recommended_lot: 0,
      sl_points: 0,
      tp_points: 0,
      retrace_points: 0,
      mode: "NORMAL",
      error: error.message,
    });
  }
});

function toRefreshServerPoints(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Number((num / 10).toFixed(2));
}

function getRefreshDecisionSide(decision = "") {
  const upper = String(decision || "").toUpperCase();
  if (upper.includes("BUY")) return "BUY";
  if (upper.includes("SELL")) return "SELL";
  return "";
}

function buildRefreshTradeSetup({
  result,
  pendingMode = "NORMAL",
  pendingLot = 0,
  pendingSlPoints = 0,
  pendingTpPoints = 0,
  pendingRetracePoints = 0,
}) {
  const tradeSetup = result?.trade_setup || {};

  return {
    recommended_lot: Number.isFinite(Number(tradeSetup?.recommended_lot))
      ? Number(tradeSetup.recommended_lot)
      : Number(pendingLot || 0),
    sl_points: Number.isFinite(Number(tradeSetup?.sl_points))
      ? Number(tradeSetup.sl_points)
      : toRefreshServerPoints(pendingSlPoints),
    tp_points: Number.isFinite(Number(tradeSetup?.tp_points))
      ? Number(tradeSetup.tp_points)
      : toRefreshServerPoints(pendingTpPoints),
    retrace_points: Number.isFinite(Number(tradeSetup?.retrace_points))
      ? Number(tradeSetup.retrace_points)
      : toRefreshServerPoints(pendingRetracePoints),
    mode: String(result?.mode || pendingMode || "NORMAL").toUpperCase(),
  };
}

function scoreSignalRefreshMomentum({
  pendingSide = "",
  candlesM1 = [],
  liveCandle = null,
}) {
  const side = String(pendingSide || "").toUpperCase();
  const list = Array.isArray(candlesM1) ? candlesM1 : [];
  const lastM1 = list.length >= 1 ? list[list.length - 1] : null;
  const prevM1 = list.length >= 2 ? list[list.length - 2] : null;

  const liveOpen = Number(liveCandle?.open ?? 0);
  const liveClose = Number(liveCandle?.last ?? liveCandle?.close ?? 0);
  const lastClose = Number(lastM1?.close ?? 0);
  const prevClose = Number(prevM1?.close ?? 0);

  let score = 0;
  const reasons = [];

  if (side === "BUY") {
    if (liveClose > liveOpen) {
      score += 0.35;
      reasons.push("LIVE_BULLISH");
    } else if (liveClose < liveOpen) {
      score -= 0.45;
      reasons.push("LIVE_BEARISH");
    }

    if (lastClose > prevClose && prevClose > 0) {
      score += 0.25;
      reasons.push("M1_UP");
    } else if (lastClose < prevClose && prevClose > 0) {
      score -= 0.25;
      reasons.push("M1_DOWN");
    }

    if (liveClose > lastClose && lastClose > 0) {
      score += 0.15;
      reasons.push("LIVE_ABOVE_LAST_M1");
    } else if (liveClose < lastClose && lastClose > 0) {
      score -= 0.15;
      reasons.push("LIVE_BELOW_LAST_M1");
    }
  } else if (side === "SELL") {
    if (liveClose < liveOpen) {
      score += 0.35;
      reasons.push("LIVE_BEARISH");
    } else if (liveClose > liveOpen) {
      score -= 0.45;
      reasons.push("LIVE_BULLISH");
    }

    if (lastClose < prevClose && prevClose > 0) {
      score += 0.25;
      reasons.push("M1_DOWN");
    } else if (lastClose > prevClose && prevClose > 0) {
      score -= 0.25;
      reasons.push("M1_UP");
    }

    if (liveClose < lastClose && lastClose > 0) {
      score += 0.15;
      reasons.push("LIVE_BELOW_LAST_M1");
    } else if (liveClose > lastClose && lastClose > 0) {
      score -= 0.15;
      reasons.push("LIVE_ABOVE_LAST_M1");
    }
  }

  return {
    score: Number(score.toFixed(2)),
    aligned: score >= 0.35,
    opposed: score <= -0.45,
    reasons,
  };
}

function deriveSignalRefreshPendingTarget({
  side = "",
  ask = 0,
  bid = 0,
  retracePoints = 0,
  digits = 2,
}) {
  const pointSize = Math.pow(10, -Math.max(0, Number(digits || 0)));
  const serverRetracePoints = Number(retracePoints || 0);

  if (!Number.isFinite(pointSize) || pointSize <= 0 || serverRetracePoints <= 0) {
    return null;
  }

  const adjustedBrokerPoints = Math.max(0, Math.round(serverRetracePoints * 10) - 80);
  if (adjustedBrokerPoints <= 0) {
    return side === "BUY" ? Number(ask || 0) : side === "SELL" ? Number(bid || 0) : null;
  }

  if (side === "BUY" && Number.isFinite(Number(ask)) && Number(ask) > 0) {
    return Number((Number(ask) - adjustedBrokerPoints * pointSize).toFixed(Math.max(0, Number(digits || 0))));
  }

  if (side === "SELL" && Number.isFinite(Number(bid)) && Number(bid) > 0) {
    return Number((Number(bid) + adjustedBrokerPoints * pointSize).toFixed(Math.max(0, Number(digits || 0))));
  }

  return null;
}

function isRefreshBreakoutLikePattern(pattern = {}) {
  const text = [
    String(pattern?.type || ""),
    String(pattern?.pattern || ""),
  ]
    .join(" ")
    .toUpperCase();

  return (
    text.includes("BREAKOUT") ||
    text.includes("BREAKDOWN") ||
    text.includes("CONTINUATION") ||
    text.includes("FIRST_LEG")
  );
}

function getSignalRefreshBreakoutState(result = {}, baseSignal = {}) {
  const state =
    result?.pattern?.breakoutRetest ||
    result?.pattern?.structure?.breakoutRetest ||
    baseSignal?.pattern?.breakoutRetest ||
    baseSignal?.pattern?.structure?.breakoutRetest ||
    {};

  return {
    direction: String(state?.direction || "").toUpperCase(),
    isBreakoutLike:
      Boolean(state?.isBreakoutLike) ||
      isRefreshBreakoutLikePattern(result?.pattern || {}) ||
      isRefreshBreakoutLikePattern(baseSignal?.pattern || {}),
    breakoutDetected: Boolean(state?.breakoutDetected),
    freshBreakout: Boolean(state?.freshBreakout),
    barsSinceBreakout:
      state?.barsSinceBreakout === null || state?.barsSinceBreakout === undefined
        ? null
        : Number(state.barsSinceBreakout),
    hasRetest: Boolean(state?.hasRetest),
    retestAccepted: Boolean(state?.retestAccepted),
    retestRejected: Boolean(state?.retestRejected),
    breakoutLevel: Number(state?.breakoutLevel || 0),
    breakoutZoneHigh: Number(state?.breakoutZoneHigh || 0),
    breakoutZoneLow: Number(state?.breakoutZoneLow || 0),
  };
}

function mergeSignalRefreshBreakoutState(baseState = {}, entryThesis = null) {
  const thesisBreakout = entryThesis?.pattern?.breakoutRetest || {};

  return {
    direction: String(
      baseState?.direction ||
      thesisBreakout?.direction ||
      ""
    ).toUpperCase(),
    isBreakoutLike:
      Boolean(baseState?.isBreakoutLike) ||
      Boolean(thesisBreakout?.breakoutDetected) ||
      Boolean(thesisBreakout?.hasRetest) ||
      Boolean(thesisBreakout?.retestAccepted) ||
      Boolean(thesisBreakout?.retestRejected),
    breakoutDetected:
      Boolean(baseState?.breakoutDetected) ||
      Boolean(thesisBreakout?.breakoutDetected),
    freshBreakout:
      Boolean(baseState?.freshBreakout) ||
      Boolean(thesisBreakout?.freshBreakout),
    barsSinceBreakout:
      baseState?.barsSinceBreakout === null || baseState?.barsSinceBreakout === undefined
        ? null
        : Number(baseState.barsSinceBreakout),
    hasRetest:
      Boolean(baseState?.hasRetest) ||
      Boolean(thesisBreakout?.hasRetest),
    retestAccepted:
      Boolean(baseState?.retestAccepted) ||
      Boolean(thesisBreakout?.retestAccepted),
    retestRejected:
      Boolean(baseState?.retestRejected) ||
      Boolean(thesisBreakout?.retestRejected),
    breakoutLevel: Number(baseState?.breakoutLevel || thesisBreakout?.breakoutLevel || 0),
    breakoutZoneHigh: Number(baseState?.breakoutZoneHigh || thesisBreakout?.breakoutZoneHigh || 0),
    breakoutZoneLow: Number(baseState?.breakoutZoneLow || thesisBreakout?.breakoutZoneLow || 0),
  };
}

function evaluateSignalRefreshValidation({
  pendingSide = "",
  candles = [],
  liveCandle = null,
  result = {},
  baseSignal = {},
  breakoutState = {},
  score = 0,
  actionScoreFloor = 0,
}) {
  const side = String(pendingSide || "").toUpperCase();
  const safeCandles = normalizeCandles(candles, 0);
  const last = getLastCandle(safeCandles, 1);
  const prev = getLastCandle(safeCandles, 2);
  const priorSample = safeCandles.slice(-7, -1);
  const avgBody = average(priorSample.map((c) => getBodySize(c))) || getBodySize(last || {}) || 0;

  const liveOpen = Number(liveCandle?.open ?? 0);
  const liveClose = Number(liveCandle?.last ?? liveCandle?.close ?? 0);
  const liveBody = Math.abs(liveClose - liveOpen);
  const lastBody = getBodySize(last || {});
  const recentMassiveBull = Boolean(result?.pattern?.recentMassiveBull || baseSignal?.pattern?.recentMassiveBull);
  const recentMassiveBear = Boolean(result?.pattern?.recentMassiveBear || baseSignal?.pattern?.recentMassiveBear);

  const reasons = [];
  let validated = false;
  let waiting = false;
  let invalidated = false;
  let strongCounterImpulse = false;
  let strongFollowThrough = false;

  if (!side) {
    return {
      validated: false,
      waiting: false,
      invalidated: true,
      reason: "REFRESH_PENDING_SIDE_MISSING",
      evidence: [],
      strongCounterImpulse: false,
      strongFollowThrough: false,
    };
  }

  if (side === "BUY") {
    strongFollowThrough = Boolean(
      last &&
      isBullish(last) &&
      lastBody >= avgBody * 0.9 &&
      (
        (prev && Number(last.close || 0) > Number(prev.high || 0)) ||
        (breakoutState.breakoutDetected && Number(last.close || 0) >= Number(breakoutState.breakoutLevel || 0))
      )
    );

    strongCounterImpulse = Boolean(
      (last &&
        isBearish(last) &&
        lastBody >= avgBody * 1.2 &&
        (
          (prev && Number(last.close || 0) < Number(prev.low || 0)) ||
          (breakoutState.breakoutDetected && Number(last.close || 0) < Number(breakoutState.breakoutLevel || 0))
        )) ||
      recentMassiveBear ||
      (liveClose > 0 &&
        liveOpen > 0 &&
        liveClose < liveOpen &&
        liveBody >= avgBody * 0.9 &&
        last &&
        liveClose < Number(last.close || 0))
    );

    if (breakoutState.retestRejected) {
      invalidated = true;
      reasons.push("BREAKOUT_RETEST_REJECTED");
    } else if (
      breakoutState.breakoutDetected &&
      breakoutState.breakoutZoneLow > 0 &&
      Number(last?.close || 0) > 0 &&
      Number(last?.close || 0) < Number(breakoutState.breakoutZoneLow || 0)
    ) {
      invalidated = true;
      reasons.push("BREAKOUT_ZONE_LOST");
    } else if (strongCounterImpulse && score < actionScoreFloor + 0.35) {
      invalidated = true;
      reasons.push("STRONG_BEARISH_COUNTER_IMPULSE");
    } else if (breakoutState.isBreakoutLike && breakoutState.breakoutDetected) {
      if (breakoutState.retestAccepted) {
        validated = true;
        reasons.push("BREAKOUT_RETEST_ACCEPTED");
      } else if (breakoutState.freshBreakout && !breakoutState.hasRetest) {
        waiting = true;
        reasons.push("WAIT_BREAKOUT_RETEST");
      } else if (strongFollowThrough && score >= actionScoreFloor) {
        validated = true;
        reasons.push("BREAKOUT_FOLLOW_THROUGH_CONFIRMED");
      } else {
        waiting = true;
        reasons.push("WAIT_BREAKOUT_CONFIRMATION");
      }
    } else if (strongCounterImpulse && score < actionScoreFloor + 0.15) {
      invalidated = true;
      reasons.push("BUY_SETUP_LOST_TO_COUNTER_IMPULSE");
    } else {
      validated = !strongCounterImpulse;
      if (validated) {
        reasons.push("NON_BREAKOUT_BUY_STRUCTURE_OK");
      }
    }
  } else if (side === "SELL") {
    strongFollowThrough = Boolean(
      last &&
      isBearish(last) &&
      lastBody >= avgBody * 0.9 &&
      (
        (prev && Number(last.close || 0) < Number(prev.low || 0)) ||
        (breakoutState.breakoutDetected && Number(last.close || 0) <= Number(breakoutState.breakoutLevel || 0))
      )
    );

    strongCounterImpulse = Boolean(
      (last &&
        isBullish(last) &&
        lastBody >= avgBody * 1.2 &&
        (
          (prev && Number(last.close || 0) > Number(prev.high || 0)) ||
          (breakoutState.breakoutDetected && Number(last.close || 0) > Number(breakoutState.breakoutLevel || 0))
        )) ||
      recentMassiveBull ||
      (liveClose > 0 &&
        liveOpen > 0 &&
        liveClose > liveOpen &&
        liveBody >= avgBody * 0.9 &&
        last &&
        liveClose > Number(last.close || 0))
    );

    if (breakoutState.retestRejected) {
      invalidated = true;
      reasons.push("BREAKDOWN_RETEST_REJECTED");
    } else if (
      breakoutState.breakoutDetected &&
      breakoutState.breakoutZoneHigh > 0 &&
      Number(last?.close || 0) > Number(breakoutState.breakoutZoneHigh || 0)
    ) {
      invalidated = true;
      reasons.push("BREAKDOWN_ZONE_LOST");
    } else if (strongCounterImpulse && score > -(actionScoreFloor + 0.35)) {
      invalidated = true;
      reasons.push("STRONG_BULLISH_COUNTER_IMPULSE");
    } else if (breakoutState.isBreakoutLike && breakoutState.breakoutDetected) {
      if (breakoutState.retestAccepted) {
        validated = true;
        reasons.push("BREAKDOWN_RETEST_ACCEPTED");
      } else if (breakoutState.freshBreakout && !breakoutState.hasRetest) {
        waiting = true;
        reasons.push("WAIT_BREAKDOWN_RETEST");
      } else if (strongFollowThrough && score <= -actionScoreFloor) {
        validated = true;
        reasons.push("BREAKDOWN_FOLLOW_THROUGH_CONFIRMED");
      } else {
        waiting = true;
        reasons.push("WAIT_BREAKDOWN_CONFIRMATION");
      }
    } else if (strongCounterImpulse && score > -(actionScoreFloor + 0.15)) {
      invalidated = true;
      reasons.push("SELL_SETUP_LOST_TO_COUNTER_IMPULSE");
    } else {
      validated = !strongCounterImpulse;
      if (validated) {
        reasons.push("NON_BREAKOUT_SELL_STRUCTURE_OK");
      }
    }
  }

  return {
    validated,
    waiting,
    invalidated,
    reason: reasons[0] || "REFRESH_VALIDATION_NEUTRAL",
    evidence: reasons,
    strongCounterImpulse,
    strongFollowThrough,
  };
}

function evaluateSignalRefreshEntryPressure({
  pendingSide = "",
  candles = [],
  liveCandle = null,
  breakoutState = {},
  refreshValidation = {},
  score = 0,
  actionScoreFloor = 0,
  entryThesis = null,
}) {
  const side = String(pendingSide || "").toUpperCase();
  const safeCandles = normalizeCandles(candles, 0);
  const last = getLastCandle(safeCandles, 1);
  const prev = getLastCandle(safeCandles, 2);
  const priorSample = safeCandles.slice(-7, -1);
  const avgBody = average(priorSample.map((c) => getBodySize(c))) || getBodySize(last || {}) || 0;
  const lastBody = getBodySize(last || {});
  const liveOpen = Number(liveCandle?.open ?? 0);
  const liveClose = Number(liveCandle?.last ?? liveCandle?.close ?? 0);
  const liveBody = Math.abs(liveClose - liveOpen);
  const breakoutLevel = Number(breakoutState?.breakoutLevel || 0);
  const breakoutZoneHigh = Number(breakoutState?.breakoutZoneHigh || 0);
  const breakoutZoneLow = Number(breakoutState?.breakoutZoneLow || 0);
  const thesisScore = Number(entryThesis?.score || 0);

  let lightPullback = false;
  let heavyCounter = false;
  let lateContinuation = false;
  let thesisIntact = false;
  let classification = "NEUTRAL";
  const evidence = [];

  if (!side || !last) {
    return {
      lightPullback: false,
      heavyCounter: false,
      lateContinuation: false,
      thesisIntact: false,
      classification: "NEUTRAL",
      evidence: [],
    };
  }

  const bodyRatio = avgBody > 0 ? lastBody / avgBody : 0;
  const safeScore = Math.abs(Number(score || 0));
  const scoreFloor = Math.max(1.4, Number(actionScoreFloor || 0));
  const effectiveScore = Math.max(safeScore, Math.abs(thesisScore));

  if (side === "BUY") {
    const lowerWick = Math.max(
      0,
      Math.min(Number(last.open || 0), Number(last.close || 0)) - Number(last.low || 0)
    );
    const zoneHeld =
      !breakoutState?.breakoutDetected ||
      (breakoutZoneLow > 0 && Number(last.close || 0) >= breakoutZoneLow) ||
      (breakoutLevel > 0 && Number(last.close || 0) >= breakoutLevel);
    const reclaiming =
      liveClose > 0 &&
      (
        liveClose >= Number(last.close || 0) ||
        (breakoutLevel > 0 && liveClose >= breakoutLevel)
      );

    lightPullback = Boolean(
      isBearish(last) &&
      bodyRatio > 0 &&
      bodyRatio <= 1.08 &&
      zoneHeld &&
      !refreshValidation?.strongCounterImpulse &&
      (
        lowerWick >= lastBody * 0.45 ||
        reclaiming
      )
    );

    heavyCounter = Boolean(
      refreshValidation?.invalidated ||
      (isBearish(last) &&
        bodyRatio >= 1.18 &&
        (
          (breakoutZoneLow > 0 && Number(last.close || 0) < breakoutZoneLow) ||
          (prev && Number(last.close || 0) < Number(prev.low || 0))
        )) ||
      (liveClose > 0 &&
        liveOpen > 0 &&
        liveClose < liveOpen &&
        liveBody >= avgBody * 1.0 &&
        breakoutLevel > 0 &&
        liveClose < breakoutLevel)
    );

    lateContinuation = Boolean(
      refreshValidation?.validated &&
      effectiveScore >= Math.max(scoreFloor * 0.9, 1.55) &&
      (
        refreshValidation?.strongFollowThrough ||
        (isBullish(last) &&
          bodyRatio >= 0.85 &&
          (
            (prev && Number(last.close || 0) > Number(prev.high || 0)) ||
            (breakoutLevel > 0 && Number(last.close || 0) >= breakoutLevel)
          )) ||
        (liveClose > 0 &&
          liveOpen > 0 &&
          liveClose > liveOpen &&
          liveBody >= avgBody * 0.7 &&
          Number(last.close || 0) > 0 &&
          liveClose >= Number(last.close || 0))
      )
    );
  } else if (side === "SELL") {
    const upperWick = Math.max(
      0,
      Number(last.high || 0) - Math.max(Number(last.open || 0), Number(last.close || 0))
    );
    const zoneHeld =
      !breakoutState?.breakoutDetected ||
      (breakoutZoneHigh > 0 && Number(last.close || 0) <= breakoutZoneHigh) ||
      (breakoutLevel > 0 && Number(last.close || 0) <= breakoutLevel);
    const reclaiming =
      liveClose > 0 &&
      (
        liveClose <= Number(last.close || 0) ||
        (breakoutLevel > 0 && liveClose <= breakoutLevel)
      );

    lightPullback = Boolean(
      isBullish(last) &&
      bodyRatio > 0 &&
      bodyRatio <= 1.08 &&
      zoneHeld &&
      !refreshValidation?.strongCounterImpulse &&
      (
        upperWick >= lastBody * 0.45 ||
        reclaiming
      )
    );

    heavyCounter = Boolean(
      refreshValidation?.invalidated ||
      (isBullish(last) &&
        bodyRatio >= 1.18 &&
        (
          (breakoutZoneHigh > 0 && Number(last.close || 0) > breakoutZoneHigh) ||
          (prev && Number(last.close || 0) > Number(prev.high || 0))
        )) ||
      (liveClose > 0 &&
        liveOpen > 0 &&
        liveClose > liveOpen &&
        liveBody >= avgBody * 1.0 &&
        breakoutLevel > 0 &&
        liveClose > breakoutLevel)
    );

    lateContinuation = Boolean(
      refreshValidation?.validated &&
      effectiveScore >= Math.max(scoreFloor * 0.9, 1.55) &&
      (
        refreshValidation?.strongFollowThrough ||
        (isBearish(last) &&
          bodyRatio >= 0.85 &&
          (
            (prev && Number(last.close || 0) < Number(prev.low || 0)) ||
            (breakoutLevel > 0 && Number(last.close || 0) <= breakoutLevel)
          )) ||
        (liveClose > 0 &&
          liveOpen > 0 &&
          liveClose < liveOpen &&
          liveBody >= avgBody * 0.7 &&
          Number(last.close || 0) > 0 &&
          liveClose <= Number(last.close || 0))
      )
    );
  }

  thesisIntact = Boolean(
    !heavyCounter &&
    (
      refreshValidation?.validated ||
      refreshValidation?.waiting ||
      lightPullback ||
      lateContinuation
    )
  );

  if (heavyCounter) {
    classification = "HEAVY_COUNTER";
    evidence.push(`${side}_HEAVY_COUNTER`);
  } else if (lateContinuation) {
    classification = "LATE_CONTINUATION";
    evidence.push(`${side}_LATE_CONTINUATION`);
  } else if (lightPullback) {
    classification = "LIGHT_PULLBACK";
    evidence.push(`${side}_LIGHT_PULLBACK`);
  } else if (thesisIntact) {
    classification = "THESIS_INTACT";
    evidence.push(`${side}_THESIS_INTACT`);
  }

  return {
    lightPullback,
    heavyCounter,
    lateContinuation,
    thesisIntact,
    classification,
    evidence,
  };
}

function buildSignalRefreshLifecycle({
  action = "KEEP_PENDING",
  reason = "",
  pendingSide = "",
  responseSide = "",
  refreshValidation = {},
  rehypothesis = null,
  reversalConfirmation = null,
}) {
  const normalizedAction = String(action || "KEEP_PENDING").toUpperCase();
  const validationReason = String(refreshValidation?.reason || reason || "").toUpperCase();
  const hasEvidence = Array.isArray(refreshValidation?.evidence) && refreshValidation.evidence.length > 0;

  let phase = "VALIDATE";
  let state = "KEEP_ORIGINAL_BIAS";
  let activeHypothesis = "ORIGINAL";
  let candidateSide = String(responseSide || pendingSide || "").toUpperCase() || "NONE";

  if (
    normalizedAction === "CANCEL_PENDING" ||
    refreshValidation?.invalidated
  ) {
    phase = "INVALIDATE";
    state = "INVALIDATED";
    activeHypothesis = "NONE";
    candidateSide = "NONE";
  } else if (normalizedAction === "EXECUTE_NOW") {
    phase = "VALIDATE";
    state = "CONFIRMED_ENTRY";
  } else if (normalizedAction === "TIGHTEN_ENTRY") {
    phase = "VALIDATE";
    state = "ADJUST_ENTRY";
  } else if (normalizedAction === "FREEZE_PENDING") {
    phase = "VALIDATE";
    state = "FROZEN_ENTRY";
  } else if (refreshValidation?.waiting) {
    phase = "VALIDATE";
    state = "WAIT_CONFIRM";
  }

  if (
    phase === "INVALIDATE" &&
    (
      validationReason.includes("COUNTER_IMPULSE") ||
      validationReason.includes("ZONE_LOST") ||
      validationReason.includes("RETEST_REJECTED")
    )
  ) {
    state = "INVALIDATED_BY_STRUCTURE";
  }

  let evidence = hasEvidence
    ? [...refreshValidation.evidence]
    : reason
      ? [reason]
      : [];

  if (
    rehypothesis?.triggered &&
    normalizedAction !== "EXECUTE_NOW" &&
    normalizedAction !== "TIGHTEN_ENTRY"
  ) {
    phase = "RE_HYPOTHESIS";
    activeHypothesis = "REVERSAL";
    candidateSide = String(rehypothesis?.candidateSide || "NONE").toUpperCase() || "NONE";

    if (normalizedAction === "CANCEL_PENDING" || refreshValidation?.invalidated) {
      state = "INVALIDATED_REANALYZE";
    } else {
      state = "WAIT_REVERSAL_CONFIRM";
    }

    evidence = Array.from(
      new Set([
        ...evidence,
        ...(Array.isArray(rehypothesis?.evidence) ? rehypothesis.evidence : []),
      ].filter(Boolean))
    );
  }

  if (reversalConfirmation?.confirmed && normalizedAction === "EXECUTE_NOW") {
    phase = "RE_HYPOTHESIS";
    state = "OPEN_REVERSAL";
    activeHypothesis = "REVERSAL";
    candidateSide = String(reversalConfirmation?.candidateSide || "NONE").toUpperCase() || "NONE";

    evidence = Array.from(
      new Set([
        ...evidence,
        ...(Array.isArray(reversalConfirmation?.evidence) ? reversalConfirmation.evidence : []),
      ].filter(Boolean))
    );
  }

  return {
    phase,
    state,
    activeHypothesis,
    candidateSide,
    evidence,
  };
}

function shouldCaptureSignalRefreshSnapshot({
  payload = {},
  reqBody = {},
}) {
  const phase = String(payload?.phase || "").toUpperCase();
  const state = String(payload?.state || "").toUpperCase();
  const reason = String(payload?.reason || "").toUpperCase();
  const symbol = String(reqBody?.symbol || "").toUpperCase();

  if (phase === "RE_HYPOTHESIS") return true;
  if (state === "OPEN_REVERSAL" || state === "INVALIDATED_BY_STRUCTURE" || state === "INVALIDATED_REANALYZE") return true;
  if (reason.includes("RETEST_REJECTED") || reason.includes("COUNTER_IMPULSE") || reason.includes("ZONE_LOST")) return true;
  if (["XAUUSD", "XAUUSDM", "BTCUSD", "BTCUSDM"].includes(symbol)) return true;

  return false;
}

function buildSignalRefreshAuditSnapshots(reqBody = {}) {
  const candles = normalizeCandles(reqBody?.candles, 0);
  const candlesM1 = normalizeCandles(reqBody?.candles_m1, 0);
  const liveCandle = reqBody?.candles_live || null;

  const normalizeSnapshotCandles = (list = [], takeLast = 4) =>
    list.slice(-takeLast).map((c) => ({
      time: c?.time || null,
      open: Number(c?.open || 0),
      high: Number(c?.high || 0),
      low: Number(c?.low || 0),
      close: Number(c?.close || 0),
      tickVolume: Number(c?.tick_volume ?? c?.tickVolume ?? 0),
    }));

  return {
    candles: normalizeSnapshotCandles(candles, 4),
    candlesM1: normalizeSnapshotCandles(candlesM1, 6),
    liveCandle: liveCandle
      ? {
        time: liveCandle?.time || null,
        open: Number(liveCandle?.open || 0),
        high: Number(liveCandle?.high || 0),
        low: Number(liveCandle?.low || 0),
        close: Number(liveCandle?.close ?? liveCandle?.last ?? 0),
        last: Number(liveCandle?.last ?? liveCandle?.close ?? 0),
      }
      : null,
  };
}

function buildSignalRefreshAuditLogDocument({
  reqBody = {},
  payload = {},
}) {
  const baseSignal = reqBody?.baseSignal || {};
  const meta = payload?.meta || {};
  const pendingOrder = reqBody?.pendingOrder || {};

  const doc = {
    eventType: "SIGNAL_REFRESH",
    firebaseUserId: String(reqBody?.firebaseUserId || ""),
    accountId: String(reqBody?.accountId || ""),
    symbol: String(reqBody?.symbol || "").toUpperCase(),
    timeframe: String(reqBody?.timeframe || "M5").toUpperCase(),
    eventTime: new Date(),

    baseSide: String(
      reqBody?.pendingSide ||
      pendingOrder?.side ||
      meta?.pendingSide ||
      ""
    ).toUpperCase(),
    baseDecision: String(baseSignal?.decision || meta?.baseDecision || "").toUpperCase(),
    baseScore: Number(baseSignal?.score || 0),
    pendingSide: String(meta?.pendingSide || pendingOrder?.side || "").toUpperCase(),
    pendingMode: String(
      pendingOrder?.mode ||
      reqBody?.pendingMode ||
      baseSignal?.mode ||
      ""
    ).toUpperCase(),

    action: String(payload?.action || "").toUpperCase(),
    decision: String(payload?.decision || "").toUpperCase(),
    reason: String(payload?.reason || "").toUpperCase(),
    phase: String(payload?.phase || "").toUpperCase(),
    state: String(payload?.state || "").toUpperCase(),
    activeHypothesis: String(payload?.activeHypothesis || "").toUpperCase(),
    candidateSide: String(payload?.candidateSide || "").toUpperCase(),

    score: Number(payload?.score || 0),
    confidence: Number(payload?.confidence || 0),
    mode: String(payload?.mode || "").toUpperCase(),

    refreshAttempt: Number(meta?.refreshAttempt || 0),
    pendingAgeSec: Number(meta?.pendingAgeSec || 0),
    spreadPoints: Number(meta?.spreadPoints || 0),
    liveMomentumScore: Number(meta?.liveMomentumScore || 0),
    currentDistancePoints: Number(meta?.currentDistancePoints || 0),
    immediateEntryThreshold: Number(meta?.immediateEntryThreshold || 0),

    refreshValidated: Boolean(meta?.refreshValidated),
    refreshWaiting: Boolean(meta?.refreshWaiting),
    refreshInvalidated: Boolean(meta?.refreshInvalidated),

    reanalysisTriggered: Boolean(meta?.reanalysisTriggered),
    reanalysisReason: String(meta?.reanalysisReason || "").toUpperCase(),
    reversalConfirmed: Boolean(meta?.reversalConfirmed),

    breakoutDetected: Boolean(meta?.breakoutDetected),
    breakoutRetestAccepted: Boolean(meta?.breakoutRetestAccepted),
    breakoutRetestRejected: Boolean(meta?.breakoutRetestRejected),

    evidence: Array.isArray(payload?.evidence)
      ? payload.evidence.map((item) => String(item || ""))
      : [],

    tradeSetup: payload?.trade_setup || null,
    hypotheses: payload?.hypotheses || null,
    requestSummary: {
      price: Number(reqBody?.price || 0),
      balance: Number(reqBody?.balance || 0),
      digits: Number(reqBody?.market?.digits ?? reqBody?.digits ?? 0),
      ask: Number(reqBody?.market?.ask ?? 0),
      bid: Number(reqBody?.market?.bid ?? 0),
      spreadPoints: Number(reqBody?.market?.spreadPoints ?? reqBody?.spreadPoints ?? 0),
      pendingTarget: Number(reqBody?.pendingTarget ?? pendingOrder?.entryTargetPrice ?? 0),
      pendingLot: Number(reqBody?.pendingLot ?? pendingOrder?.recommendedLot ?? 0),
      pendingSlPoints: Number(reqBody?.pendingSlPoints ?? pendingOrder?.slPoints ?? 0),
      pendingTpPoints: Number(reqBody?.pendingTpPoints ?? pendingOrder?.tpPoints ?? 0),
      pendingRetracePoints: Number(reqBody?.pendingRetracePoints ?? pendingOrder?.retracePoints ?? 0),
      windowSec: Number(reqBody?.refreshContext?.windowSec ?? 0),
    },
    snapshots: null,
  };

  if (shouldCaptureSignalRefreshSnapshot({ payload, reqBody })) {
    doc.snapshots = buildSignalRefreshAuditSnapshots(reqBody);
  }

  return doc;
}

function writeSignalRefreshAuditLog({
  reqBody = {},
  payload = {},
}) {
  try {
    const doc = buildSignalRefreshAuditLogDocument({ reqBody, payload });

    Promise.resolve()
      .then(() => SignalRefreshAuditLog.create(doc))
      .catch((error) => {
        console.error("[signal-refresh-audit-log] write failed:", error.message);
      });
  } catch (error) {
    console.error("[signal-refresh-audit-log] build failed:", error.message);
  }
}

function mapSignalRefreshConfidenceToScore(side = "", confidence = 0) {
  const normalizedSide = String(side || "").toUpperCase();
  const base = 1.6 + Number(confidence || 0) * 1.45;
  const signed = normalizedSide === "SELL" ? -base : base;
  return Number(signed.toFixed(2));
}

function buildSignalRefreshReversalTradeSetup(tradeSetup = {}, candidateSide = "") {
  const fallbackLot = Number(tradeSetup?.recommended_lot || 0.01);
  const reducedLot = roundLot(Math.max(0.01, fallbackLot * 0.75), 0.01);

  return {
    recommended_lot: reducedLot > 0 ? reducedLot : 0.01,
    sl_points: Number(tradeSetup?.sl_points || 0),
    tp_points: Number(tradeSetup?.tp_points || 0),
    retrace_points: Number(tradeSetup?.retrace_points || 0),
    mode: "SCALP",
    side: String(candidateSide || "").toUpperCase() || "NONE",
  };
}

function evaluateSignalRefreshReversalConfirmation({
  rehypothesis = null,
  candles = [],
  candlesM1 = [],
  liveCandle = null,
}) {
  const candidateSide = String(rehypothesis?.candidateSide || "NONE").toUpperCase();
  const evidence = Array.isArray(rehypothesis?.evidence) ? [...rehypothesis.evidence] : [];
  const confidence = Number(rehypothesis?.confidence || 0);
  const safeCandles = normalizeCandles(candles, 0);
  const last = getLastCandle(safeCandles, 1);
  const prev = getLastCandle(safeCandles, 2);
  const priorSample = safeCandles.slice(-7, -1);
  const avgBody = average(priorSample.map((c) => getBodySize(c))) || getBodySize(last || {}) || 0;
  const lastBody = getBodySize(last || {});
  const reversalMomentum = scoreSignalRefreshMomentum({
    pendingSide: candidateSide,
    candlesM1,
    liveCandle,
  });

  const hasBullishReclaim = evidence.includes("BULLISH_RECLAIM");
  const hasBearishReclaim = evidence.includes("BEARISH_RECLAIM");
  const hasBullishPattern = evidence.includes("BULLISH_REVERSAL_PATTERN");
  const hasBearishPattern = evidence.includes("BEARISH_REVERSAL_PATTERN");
  const nearBottom = evidence.includes("NEAR_SWING_BOTTOM");
  const nearTop = evidence.includes("NEAR_SWING_TOP");
  const hasBullishCounter = evidence.includes("BULLISH_COUNTER_IMPULSE");
  const hasBearishCounter = evidence.includes("BEARISH_COUNTER_IMPULSE");
  const hasBullishMassive = evidence.includes("RECENT_MASSIVE_BULL");
  const hasBearishMassive = evidence.includes("RECENT_MASSIVE_BEAR");

  let confirmed = false;
  let reason = "";
  const confirmationEvidence = [];

  if (candidateSide === "BUY") {
    const bullishFollowThrough = Boolean(
      last &&
      isBullish(last) &&
      lastBody >= avgBody * 0.95 &&
      (
        (prev && Number(last.close || 0) > Number(prev.high || 0)) ||
        hasBullishReclaim
      )
    );

    confirmed = Boolean(
      rehypothesis?.triggered &&
      confidence >= 0.62 &&
      reversalMomentum.aligned &&
      (
        bullishFollowThrough ||
        (hasBullishPattern && nearBottom) ||
        (hasBullishCounter && hasBullishMassive)
      )
    );

    if (bullishFollowThrough) confirmationEvidence.push("REVERSAL_BULLISH_FOLLOW_THROUGH");
    if (reversalMomentum.aligned) confirmationEvidence.push("REVERSAL_LIVE_MOMENTUM_ALIGNED");
    if (hasBullishPattern) confirmationEvidence.push("REVERSAL_PATTERN_CONFIRMED");
    if (nearBottom) confirmationEvidence.push("REVERSAL_FROM_BOTTOM_ZONE");

    reason = confirmed
      ? "OPEN_REVERSAL_BUY_CONFIRM"
      : "";
  } else if (candidateSide === "SELL") {
    const bearishFollowThrough = Boolean(
      last &&
      isBearish(last) &&
      lastBody >= avgBody * 0.95 &&
      (
        (prev && Number(last.close || 0) < Number(prev.low || 0)) ||
        hasBearishReclaim
      )
    );

    confirmed = Boolean(
      rehypothesis?.triggered &&
      confidence >= 0.62 &&
      reversalMomentum.aligned &&
      (
        bearishFollowThrough ||
        (hasBearishPattern && nearTop) ||
        (hasBearishCounter && hasBearishMassive)
      )
    );

    if (bearishFollowThrough) confirmationEvidence.push("REVERSAL_BEARISH_FOLLOW_THROUGH");
    if (reversalMomentum.aligned) confirmationEvidence.push("REVERSAL_LIVE_MOMENTUM_ALIGNED");
    if (hasBearishPattern) confirmationEvidence.push("REVERSAL_PATTERN_CONFIRMED");
    if (nearTop) confirmationEvidence.push("REVERSAL_FROM_TOP_ZONE");

    reason = confirmed
      ? "OPEN_REVERSAL_SELL_CONFIRM"
      : "";
  }

  return {
    confirmed,
    candidateSide,
    confidence,
    reason,
    evidence: confirmationEvidence,
    momentum: reversalMomentum,
  };
}

function getSignalRefreshOppositeSide(side = "") {
  const normalized = String(side || "").toUpperCase();
  if (normalized === "BUY") return "SELL";
  if (normalized === "SELL") return "BUY";
  return "NONE";
}

function getSignalRefreshRecentZone(candles = []) {
  const safeCandles = normalizeCandles(candles, 0);
  const recent = safeCandles.slice(-10);

  if (recent.length === 0) {
    return {
      swingHigh: 0,
      swingLow: 0,
      nearTop: false,
      nearBottom: false,
    };
  }

  const swingHigh = Math.max(...recent.map((c) => Number(c.high || 0)));
  const swingLow = Math.min(...recent.map((c) => Number(c.low || 0)));
  const last = recent[recent.length - 1] || {};
  const close = Number(last.close || 0);
  const range = Math.max(swingHigh - swingLow, 0.00001);
  const distanceToTopPct = (swingHigh - close) / range;
  const distanceToBottomPct = (close - swingLow) / range;

  return {
    swingHigh,
    swingLow,
    nearTop: distanceToTopPct <= 0.20,
    nearBottom: distanceToBottomPct <= 0.20,
  };
}

function evaluateSignalRefreshRehypothesis({
  pendingSide = "",
  candles = [],
  liveCandle = null,
  result = {},
  baseSignal = {},
  refreshValidation = {},
  breakoutState = {},
}) {
  const originalSide = String(pendingSide || "").toUpperCase();
  const candidateSide = getSignalRefreshOppositeSide(originalSide);
  const safeCandles = normalizeCandles(candles, 0);
  const last = getLastCandle(safeCandles, 1);
  const prev = getLastCandle(safeCandles, 2);
  const priorSample = safeCandles.slice(-7, -1);
  const avgBody = average(priorSample.map((c) => getBodySize(c))) || getBodySize(last || {}) || 0;
  const lastBody = getBodySize(last || {});
  const liveOpen = Number(liveCandle?.open ?? 0);
  const liveClose = Number(liveCandle?.last ?? liveCandle?.close ?? 0);
  const liveBody = Math.abs(liveClose - liveOpen);
  const structure = result?.pattern?.structure || baseSignal?.pattern?.structure || {};
  const recentZone = getSignalRefreshRecentZone(safeCandles);
  const evidence = [];

  let confidence = 0;
  let reason = "";

  if (candidateSide === "NONE") {
    return {
      triggered: false,
      needsConfirmation: false,
      candidateSide: "NONE",
      confidence: 0,
      reason: "",
      evidence: [],
      original: {
        side: originalSide || "NONE",
        status: "UNKNOWN",
        score: Number(result?.score || baseSignal?.score || 0),
        reason: String(refreshValidation?.reason || ""),
      },
      reversal: {
        side: "NONE",
        status: "NONE",
        score: 0,
        reason: "",
        needsConfirmation: false,
      },
    };
  }

  const bullishReversal = Boolean(structure?.bullishReversal);
  const bearishReversal = Boolean(structure?.bearishReversal);
  const microTrend = String(structure?.microTrend || "NEUTRAL").toUpperCase();
  const recentMassiveBull = Boolean(result?.pattern?.recentMassiveBull || baseSignal?.pattern?.recentMassiveBull);
  const recentMassiveBear = Boolean(result?.pattern?.recentMassiveBear || baseSignal?.pattern?.recentMassiveBear);
  const breakoutRejected = Boolean(breakoutState?.retestRejected);
  const breakoutFailedZone =
    originalSide === "BUY"
      ? Boolean(
        breakoutState?.breakoutDetected &&
        breakoutState?.breakoutZoneLow > 0 &&
        Number(last?.close || 0) < Number(breakoutState?.breakoutZoneLow || 0)
      )
      : Boolean(
        breakoutState?.breakoutDetected &&
        breakoutState?.breakoutZoneHigh > 0 &&
        Number(last?.close || 0) > Number(breakoutState?.breakoutZoneHigh || 0)
      );

  const bullishReclaim = Boolean(
    last &&
    prev &&
    isBullish(last) &&
    lastBody >= avgBody * 1.15 &&
    Number(last.close || 0) > Number(prev.high || 0)
  );

  const bearishReclaim = Boolean(
    last &&
    prev &&
    isBearish(last) &&
    lastBody >= avgBody * 1.15 &&
    Number(last.close || 0) < Number(prev.low || 0)
  );

  const liveBullishImpulse = Boolean(
    liveClose > 0 &&
    liveOpen > 0 &&
    liveClose > liveOpen &&
    liveBody >= avgBody * 0.9
  );

  const liveBearishImpulse = Boolean(
    liveClose > 0 &&
    liveOpen > 0 &&
    liveClose < liveOpen &&
    liveBody >= avgBody * 0.9
  );

  if (originalSide === "SELL") {
    if (refreshValidation?.strongCounterImpulse) {
      confidence += 0.28;
      evidence.push("BULLISH_COUNTER_IMPULSE");
    }
    if (breakoutRejected || breakoutFailedZone) {
      confidence += 0.20;
      evidence.push("SELL_BREAKDOWN_FAILED");
    }
    if (bullishReversal) {
      confidence += 0.18;
      evidence.push("BULLISH_REVERSAL_PATTERN");
    }
    if (recentMassiveBull) {
      confidence += 0.16;
      evidence.push("RECENT_MASSIVE_BULL");
    }
    if (microTrend === "BULLISH" || microTrend === "BULLISH_REVERSAL") {
      confidence += microTrend === "BULLISH_REVERSAL" ? 0.16 : 0.10;
      evidence.push(`MICRO_TREND_${microTrend}`);
    }
    if (recentZone.nearBottom) {
      confidence += 0.12;
      evidence.push("NEAR_SWING_BOTTOM");
    }
    if (bullishReclaim || liveBullishImpulse) {
      confidence += bullishReclaim ? 0.20 : 0.10;
      evidence.push(bullishReclaim ? "BULLISH_RECLAIM" : "LIVE_BULLISH_IMPULSE");
    }
    reason = bullishReclaim
      ? "BULLISH_REVERSAL_RECLAIM"
      : breakoutRejected || breakoutFailedZone
        ? "FAILED_SELL_CONTINUATION"
        : "BULLISH_REVERSAL_CANDIDATE";
  } else if (originalSide === "BUY") {
    if (refreshValidation?.strongCounterImpulse) {
      confidence += 0.28;
      evidence.push("BEARISH_COUNTER_IMPULSE");
    }
    if (breakoutRejected || breakoutFailedZone) {
      confidence += 0.20;
      evidence.push("BUY_BREAKOUT_FAILED");
    }
    if (bearishReversal) {
      confidence += 0.18;
      evidence.push("BEARISH_REVERSAL_PATTERN");
    }
    if (recentMassiveBear) {
      confidence += 0.16;
      evidence.push("RECENT_MASSIVE_BEAR");
    }
    if (microTrend === "BEARISH" || microTrend === "BEARISH_REVERSAL") {
      confidence += microTrend === "BEARISH_REVERSAL" ? 0.16 : 0.10;
      evidence.push(`MICRO_TREND_${microTrend}`);
    }
    if (recentZone.nearTop) {
      confidence += 0.12;
      evidence.push("NEAR_SWING_TOP");
    }
    if (bearishReclaim || liveBearishImpulse) {
      confidence += bearishReclaim ? 0.20 : 0.10;
      evidence.push(bearishReclaim ? "BEARISH_RECLAIM" : "LIVE_BEARISH_IMPULSE");
    }
    reason = bearishReclaim
      ? "BEARISH_REVERSAL_RECLAIM"
      : breakoutRejected || breakoutFailedZone
        ? "FAILED_BUY_CONTINUATION"
        : "BEARISH_REVERSAL_CANDIDATE";
  }

  confidence = Number(Math.min(0.95, confidence).toFixed(2));
  const triggered = confidence >= 0.45 && evidence.length >= 2;

  const originalStatus = refreshValidation?.invalidated
    ? "INVALIDATED"
    : refreshValidation?.waiting
      ? "WAIT_CONFIRM"
      : "ACTIVE";

  return {
    triggered,
    needsConfirmation: triggered,
    candidateSide: triggered ? candidateSide : "NONE",
    confidence,
    reason: triggered ? reason : "",
    evidence: triggered ? evidence : [],
    original: {
      side: originalSide || "NONE",
      status: originalStatus,
      score: Number(result?.score || baseSignal?.score || 0),
      reason: String(refreshValidation?.reason || ""),
    },
    reversal: {
      side: triggered ? candidateSide : "NONE",
      status: triggered ? "CANDIDATE" : "NONE",
      score: confidence,
      reason: triggered ? reason : "",
      needsConfirmation: triggered,
    },
  };
}

app.post("/signal-refresh", async (req, res) => {
  try {
    const result = await handleSignalCore(req, { isRefresh: true });

    const refreshContext = req.body?.refreshContext || {};
    const baseSignal = req.body?.baseSignal || {};
    const pendingOrder = req.body?.pendingOrder || {};
    const market = req.body?.market || {};
    const liveCandle = req.body?.candles_live || null;
    const candlesM1 = Array.isArray(req.body?.candles_m1) ? req.body.candles_m1 : [];

    const pendingSide = String(
      pendingOrder?.side || req.body?.pendingSide || ""
    ).toUpperCase();
    const pendingMode = String(
      pendingOrder?.mode || req.body?.pendingMode || baseSignal?.mode || result?.mode || "NORMAL"
    ).toUpperCase();

    const pendingTarget = Number(
      pendingOrder?.entryTargetPrice ?? req.body?.pendingTarget ?? 0
    );
    const pendingLot = Number(
      pendingOrder?.recommendedLot ?? req.body?.pendingLot ?? 0
    );
    const pendingSlPoints = Number(
      pendingOrder?.slPoints ?? req.body?.pendingSlPoints ?? 0
    );
    const pendingTpPoints = Number(
      pendingOrder?.tpPoints ?? req.body?.pendingTpPoints ?? 0
    );
    const pendingRetracePoints = Number(
      pendingOrder?.retracePoints ?? req.body?.pendingRetracePoints ?? 0
    );

    const pendingAgeSec = Number(
      refreshContext?.pendingAgeSec ?? 0
    );
    const windowSec = Number(
      refreshContext?.windowSec ?? 0
    );
    const refreshAttempt = Number(
      refreshContext?.refreshAttempt ?? req.body?.refreshAttempt ?? 0
    );
    const digits = Number(
      market?.digits ?? req.body?.digits ?? 2
    );
    const ask = Number(
      market?.ask ?? req.body?.price ?? 0
    );
    const bid = Number(
      market?.bid ?? req.body?.price ?? 0
    );
    const spreadPoints = Number(
      market?.spreadPoints ?? req.body?.spreadPoints ?? 0
    );

    let currentDistancePoints = Number(
      pendingOrder?.currentDistancePoints ?? 0
    );

    if ((!Number.isFinite(currentDistancePoints) || currentDistancePoints <= 0) && pendingTarget > 0) {
      const pointSize = Math.pow(10, -Math.max(0, digits));
      const referencePrice =
        pendingSide === "BUY" ? ask : pendingSide === "SELL" ? bid : 0;

      if (referencePrice > 0 && pointSize > 0) {
        currentDistancePoints = Math.abs(referencePrice - pendingTarget) / pointSize;
      }
    }

    const baseDecision = String(baseSignal?.decision || "").toUpperCase();
    const baseScore = Number(baseSignal?.score ?? 0);
    const resultDecision = String(result?.decision || "NO_TRADE").toUpperCase();
    const resultSide = getRefreshDecisionSide(resultDecision);

    const refreshTradeSetup = buildRefreshTradeSetup({
      result,
      pendingMode,
      pendingLot,
      pendingSlPoints,
      pendingTpPoints,
      pendingRetracePoints,
    });

    const responseDecision =
      resultDecision !== "NO_TRADE"
        ? resultDecision
        : baseDecision || "NO_TRADE";

    const responseSide =
      getRefreshDecisionSide(responseDecision) || pendingSide;

    const momentum = scoreSignalRefreshMomentum({
      pendingSide: responseSide || pendingSide,
      candlesM1,
      liveCandle,
    });

    const suggestedTarget = deriveSignalRefreshPendingTarget({
      side: responseSide || pendingSide,
      ask,
      bid,
      retracePoints: refreshTradeSetup.retrace_points,
      digits,
    });

    const pointSize = Math.pow(10, -Math.max(0, digits));
    const targetShiftPoints =
      suggestedTarget && pendingTarget > 0 && pointSize > 0
        ? Math.abs(suggestedTarget - pendingTarget) / pointSize
        : 0;

    const immediateEntryThreshold = Math.max(
      25,
      Math.min(
        120,
        Math.round(Math.max(currentDistancePoints || 0, pendingRetracePoints || 0) * 0.18) || 40
      )
    );

    const actionScoreFloor = Math.max(
      1.6,
      baseScore > 0 ? Number((baseScore * 0.72).toFixed(2)) : 1.6
    );

    const entryThesis = await getLatestEntryThesisSnapshotForRefresh({
      firebaseUserId: req.body?.firebaseUserId || result?.firebaseUserId || "",
      accountId: req.body?.accountId || "",
      symbol: req.body?.symbol || "",
      side: responseSide || pendingSide,
      mode: pendingMode,
    });

    const breakoutState = mergeSignalRefreshBreakoutState(
      getSignalRefreshBreakoutState(result, baseSignal),
      entryThesis
    );
    const refreshValidation = evaluateSignalRefreshValidation({
      pendingSide: responseSide || pendingSide,
      candles: Array.isArray(req.body?.candles) ? req.body.candles : [],
      liveCandle,
      result,
      baseSignal,
      breakoutState,
      score: Number(result?.score || baseScore || 0),
      actionScoreFloor,
    });

    const entryPressure = evaluateSignalRefreshEntryPressure({
      pendingSide: responseSide || pendingSide,
      candles: Array.isArray(req.body?.candles) ? req.body.candles : [],
      liveCandle,
      breakoutState,
      refreshValidation,
      score: Number(result?.score || baseScore || 0),
      actionScoreFloor,
      entryThesis,
    });

    const rehypothesis = evaluateSignalRefreshRehypothesis({
      pendingSide,
      candles: Array.isArray(req.body?.candles) ? req.body.candles : [],
      liveCandle,
      result,
      baseSignal,
      refreshValidation,
      breakoutState,
    });

    const reversalConfirmation = evaluateSignalRefreshReversalConfirmation({
      rehypothesis,
      candles: Array.isArray(req.body?.candles) ? req.body.candles : [],
      candlesM1,
      liveCandle,
    });

    let action = "KEEP_PENDING";
    let reason = String(result?.reason || "REFRESH_KEEP_PENDING");
    const windowExpired = windowSec > 0 && pendingAgeSec >= windowSec;

    if (!pendingSide) {
      action = "CANCEL_PENDING";
      reason = "REFRESH_PENDING_SIDE_MISSING";
    } else if (resultDecision === "NO_TRADE") {
      action = "CANCEL_PENDING";
      reason = String(result?.reason || "REFRESH_SIGNAL_INVALIDATED");
    } else if (resultSide && pendingSide && resultSide !== pendingSide) {
      action = "CANCEL_PENDING";
      reason = "REFRESH_SIDE_MISMATCH";
    } else if (refreshValidation.invalidated) {
      action = "CANCEL_PENDING";
      reason = refreshValidation.reason || "REFRESH_STRUCTURE_INVALIDATED";
    } else if (
      windowExpired &&
      entryPressure.lateContinuation &&
      spreadPoints <= Math.max(35, pendingSlPoints * 0.08) &&
      Number(result?.score || 0) >= Math.max(1.5, actionScoreFloor * 0.88)
    ) {
      action = "EXECUTE_NOW";
      reason = "REFRESH_EXPIRED_EXECUTE_CONTINUATION";
    } else if (
      windowExpired &&
      entryPressure.thesisIntact &&
      !entryPressure.heavyCounter
    ) {
      action = "FREEZE_PENDING";
      reason = entryPressure.lightPullback
        ? "REFRESH_PULLBACK_FREEZE_PENDING"
        : "REFRESH_THESIS_INTACT_FREEZE_PENDING";
    } else if (refreshValidation.waiting) {
      action = "KEEP_PENDING";
      reason = entryPressure.lightPullback
        ? "REFRESH_WAIT_PULLBACK_ENTRY"
        : refreshValidation.reason || "REFRESH_WAIT_CONFIRMATION";
    } else if (
      momentum.opposed &&
      pendingAgeSec >= Math.max(5, Math.round(windowSec * 0.4)) &&
      Number(result?.score || 0) < actionScoreFloor &&
      entryPressure.heavyCounter
    ) {
      action = "CANCEL_PENDING";
      reason = "REFRESH_LIVE_MOMENTUM_INVALIDATION";
    } else if (
      refreshValidation.validated &&
      momentum.aligned &&
      currentDistancePoints > 0 &&
      currentDistancePoints <= immediateEntryThreshold &&
      Number(result?.score || 0) >= actionScoreFloor &&
      spreadPoints <= Math.max(35, pendingSlPoints * 0.08)
    ) {
      action = "EXECUTE_NOW";
      reason = "REFRESH_EXECUTE_NOW";
    } else if (
      suggestedTarget &&
      pendingTarget > 0 &&
      targetShiftPoints >= 15 &&
      (
        (responseSide === "BUY" && suggestedTarget < pendingTarget) ||
        (responseSide === "SELL" && suggestedTarget > pendingTarget)
      )
    ) {
      action = "TIGHTEN_ENTRY";
      reason = entryPressure.lightPullback
        ? "REFRESH_PULLBACK_TIGHTEN_ENTRY"
        : "REFRESH_TIGHTEN_ENTRY";
    }

    const fatalRefreshReasons = new Set([
      "REFRESH_PENDING_SIDE_MISSING",
    ]);

    if (
      reversalConfirmation.confirmed &&
      !fatalRefreshReasons.has(String(reason || "").toUpperCase()) &&
      action !== "TIGHTEN_ENTRY" &&
      action !== "EXECUTE_NOW"
    ) {
      action = "EXECUTE_NOW";
      reason = reversalConfirmation.reason || "OPEN_REVERSAL_CONFIRM";
    }

    if (rehypothesis.triggered) {
      if (reversalConfirmation.confirmed) {
        reason = reversalConfirmation.reason || "OPEN_REVERSAL_CONFIRM";
      } else if (action === "CANCEL_PENDING") {
        reason = "INVALIDATED_REANALYZE";
      } else if (action === "KEEP_PENDING" && !refreshValidation.validated) {
        reason = "WAIT_REVERSAL_CONFIRM";
      }
    }

    const isReversalExecution = Boolean(
      reversalConfirmation.confirmed &&
      action === "EXECUTE_NOW" &&
      String(reason || "").toUpperCase().includes("REVERSAL")
    );

    const finalDecision = isReversalExecution
      ? (
        reversalConfirmation.candidateSide === "BUY"
          ? "ALLOW_BUY_SCALP"
          : reversalConfirmation.candidateSide === "SELL"
            ? "ALLOW_SELL_SCALP"
            : responseDecision
      )
      : action === "CANCEL_PENDING"
        ? "NO_TRADE"
        : responseDecision;

    const finalTradeSetup = isReversalExecution
      ? applyTradingPreferenceLotBoundsToTradeSetup(
        buildSignalRefreshReversalTradeSetup(
          refreshTradeSetup,
          reversalConfirmation.candidateSide
        ),
        tradingPreferences,
        0.01
      )
      : {
        recommended_lot: Number(refreshTradeSetup.recommended_lot || 0),
        sl_points: Number(refreshTradeSetup.sl_points || 0),
        tp_points: Number(refreshTradeSetup.tp_points || 0),
        retrace_points: Number(refreshTradeSetup.retrace_points || 0),
        mode: refreshTradeSetup.mode,
      };

    const finalMode = String(finalTradeSetup.mode || refreshTradeSetup.mode || "NORMAL").toUpperCase();
    const finalScore = isReversalExecution
      ? mapSignalRefreshConfidenceToScore(
        reversalConfirmation.candidateSide,
        reversalConfirmation.confidence
      )
      : Number(result?.score || baseScore || 0);

    if (rehypothesis?.reversal && isReversalExecution) {
      rehypothesis.reversal.status = "CONFIRMED_ENTRY";
      rehypothesis.reversal.score = Number(reversalConfirmation.confidence || 0);
      rehypothesis.reversal.reason = reversalConfirmation.reason || rehypothesis.reversal.reason || "";
      rehypothesis.reversal.needsConfirmation = false;
    }

    const refreshLifecycle = buildSignalRefreshLifecycle({
      action,
      reason,
      pendingSide,
      responseSide,
      refreshValidation,
      rehypothesis,
      reversalConfirmation,
    });

    const payload = {
      action,
      reason,
      decision: finalDecision,
      phase: refreshLifecycle.phase,
      state: refreshLifecycle.state,
      activeHypothesis: refreshLifecycle.activeHypothesis,
      candidateSide: refreshLifecycle.candidateSide,
      evidence: refreshLifecycle.evidence,
      confidence: Number(rehypothesis?.confidence || 0),
      mode: finalMode,
      score: finalScore,
      recommended_lot: Number(finalTradeSetup.recommended_lot || 0),
      sl_points: Number(finalTradeSetup.sl_points || 0),
      tp_points: Number(finalTradeSetup.tp_points || 0),
      retrace_points: Number(finalTradeSetup.retrace_points || 0),
      trade_setup: finalTradeSetup,
      hypotheses: {
        original: rehypothesis.original,
        reversal: rehypothesis.reversal,
      },
      meta: {
        baseDecision,
        resultDecision,
        pendingSide,
        responseSide,
        pendingAgeSec,
        refreshAttempt,
        currentDistancePoints: Number.isFinite(currentDistancePoints)
          ? Number(currentDistancePoints.toFixed(1))
          : 0,
        immediateEntryThreshold,
        spreadPoints,
        liveMomentumScore: momentum.score,
        liveMomentumReasons: momentum.reasons,
        refreshValidated: refreshValidation.validated,
        refreshWaiting: refreshValidation.waiting,
        refreshInvalidated: refreshValidation.invalidated,
        refreshValidationReason: refreshValidation.reason,
        refreshValidationEvidence: refreshValidation.evidence,
        refreshStrongCounterImpulse: refreshValidation.strongCounterImpulse,
        refreshStrongFollowThrough: refreshValidation.strongFollowThrough,
        refreshEntryPressure: entryPressure.classification,
        refreshEntryPressureEvidence: entryPressure.evidence,
        refreshLightPullback: entryPressure.lightPullback,
        refreshHeavyCounter: entryPressure.heavyCounter,
        refreshLateContinuation: entryPressure.lateContinuation,
        refreshThesisIntact: entryPressure.thesisIntact,
        breakoutDetected: breakoutState.breakoutDetected,
        breakoutFresh: breakoutState.freshBreakout,
        breakoutHasRetest: breakoutState.hasRetest,
        breakoutRetestAccepted: breakoutState.retestAccepted,
        breakoutRetestRejected: breakoutState.retestRejected,
        breakoutLevel: breakoutState.breakoutLevel || null,
        breakoutZoneHigh: breakoutState.breakoutZoneHigh || null,
        breakoutZoneLow: breakoutState.breakoutZoneLow || null,
        reanalysisTriggered: rehypothesis.triggered,
        reanalysisReason: rehypothesis.reason || null,
        reanalysisNeedsConfirmation: rehypothesis.needsConfirmation,
        reanalysisCandidateSide: rehypothesis.candidateSide,
        reanalysisConfidence: rehypothesis.confidence,
        reanalysisEvidence: rehypothesis.evidence,
        reversalConfirmed: reversalConfirmation.confirmed,
        reversalDecision: isReversalExecution ? finalDecision : null,
        reversalMode: isReversalExecution ? finalMode : null,
        reversalMomentumScore: reversalConfirmation?.momentum?.score ?? null,
        reversalMomentumReasons: reversalConfirmation?.momentum?.reasons ?? [],
        reversalConfirmationEvidence: reversalConfirmation.evidence,
        suggestedTarget,
        pendingTarget: pendingTarget > 0 ? pendingTarget : null,
        targetShiftPoints: Number.isFinite(targetShiftPoints)
          ? Number(targetShiftPoints.toFixed(1))
          : 0,
        thesisSourceEndpoint: entryThesis?.sourceEndpoint || null,
        thesisStage: entryThesis?.thesisStage || null,
        thesisLinkedTicketId: entryThesis?.linkedTicketId || null,
      },
    };

    writeSignalRefreshAuditLog({
      reqBody: req.body || {},
      payload,
    });

    if (shouldPersistRefreshEntryThesis(payload)) {
      writeEntryThesisSnapshot(
        buildEntryThesisSnapshotDocument({
          sourceEndpoint: "signal_refresh",
          reqBody: req.body || {},
          payload: {
            ...payload,
            pattern: result?.pattern || baseSignal?.pattern || null,
            historicalVolume: result?.historicalVolume || baseSignal?.historicalVolume || null,
            defensiveFlags: result?.defensiveFlags || baseSignal?.defensiveFlags || null,
          },
          thesisStage: resolveRefreshEntryThesisStage(payload),
          executionStatus:
            String(payload?.action || "").toUpperCase() === "EXECUTE_NOW"
              ? "EXECUTION_TRIGGERED"
              : "PENDING_EXECUTION",
        })
      );
    }

    return res.json(payload);
  } catch (error) {
    console.error("[/signal-refresh] error:", error);
    return res.status(500).json({
      action: "CANCEL_PENDING",
      reason: error.message || "Internal server error",
      decision: "NO_TRADE",
      phase: "INVALIDATE",
      state: "ERROR",
      activeHypothesis: "NONE",
      candidateSide: "NONE",
      evidence: [error.message || "Internal server error"],
      confidence: 0,
      score: 0,
      recommended_lot: 0,
      sl_points: 0,
      tp_points: 0,
      retrace_points: 0,
      mode: "NORMAL",
      hypotheses: {
        original: {
          side: "NONE",
          status: "ERROR",
          score: 0,
          reason: error.message || "Internal server error",
        },
        reversal: {
          side: "NONE",
          status: "NONE",
          score: 0,
          reason: "",
          needsConfirmation: false,
        },
      },
      error: error.message,
    });
  }
});

app.post("/mangmao/signal", async (req, res) => {
  try {
    const {
      firebaseUserId,
      accountId,
      symbol,
      candles = [],
      candlesH1 = [],
      candlesH4 = [],
      spreadPoints = 0,
      autoCreateGroup = true,
    } = req.body || {};

    if (!firebaseUserId || !symbol) {
      return res.status(400).json({
        status: false,
        message: "firebaseUserId and symbol are required",
      });
    }

    const safeSymbol = normalizeMangmaoSymbol(symbol);
    const safeAccountId = normalizeMangmaoAccountId(accountId);

    let activePositions = [];
    try {
      const rows = await getActivePositionsByUserAndSymbol(firebaseUserId, safeSymbol);
      activePositions = normalizeMangmaoActivePositions(rows);
    } catch (error) {
      console.error("[/mangmao/signal] load active positions error:", error.message);
    }

    const openCount = await countOpenPositionsByUserAccountAndSymbol(
      firebaseUserId,
      safeAccountId,
      safeSymbol
    );

    const entryResult = await analyzeMangmaoEntry({
      firebaseUserId,
      accountId: safeAccountId,
      symbol: safeSymbol,
      candles,
      candlesH1,
      candlesH4,
      spreadPoints,
      activePositions,
      config: {
        ...MANGMAO_CONFIG,
        requireNoOpenPositions: Number(openCount || 0) <= 0,
      },
    });

    if (!autoCreateGroup || entryResult.action !== "OPEN_GROUP") {
      return res.json({
        status: true,
        message: "Mangmao signal analyzed",
        data: entryResult,
      });
    }

    const createResult = await createMangmaoGroup({
      firebaseUserId,
      accountId: safeAccountId,
      symbol: safeSymbol,
      groupId: entryResult.groupId,
      side: entryResult.side,
      orderCount: entryResult.orderCount,
    });

    return res.json({
      status: true,
      message: "Mangmao group created",
      data: {
        ...entryResult,
        createResult,
      },
    });
  } catch (error) {
    console.error("[/mangmao/signal] error:", error);
    return res.status(500).json({
      status: false,
      message: "Mangmao signal failed",
      error: error.message,
    });
  }
});

app.post("/mangmao/bind-tickets", async (req, res) => {
  try {
    const { groupId, tickets = [] } = req.body || {};

    if (!groupId || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({
        status: false,
        message: "groupId and tickets are required",
      });
    }

    const safeTickets = tickets
      .map((item) => ({
        ticketId: normalizeTicketIdForMangmao(item.ticketId ?? item.ticket),
        openPrice: item.openPrice ?? item.entryPrice ?? null,
        openedAt: item.openedAt ?? null,
      }))
      .filter((item) => item.ticketId);

    if (!safeTickets.length) {
      return res.status(400).json({
        status: false,
        message: "No valid ticketId found",
      });
    }

    const result = await bindMangmaoTickets({
      groupId,
      tickets: safeTickets,
    });

    return res.json({
      status: true,
      message: "Mangmao tickets bound",
      data: result,
    });
  } catch (error) {
    console.error("[/mangmao/bind-tickets] error:", error);
    return res.status(500).json({
      status: false,
      message: "Bind mangmao tickets failed",
      error: error.message,
    });
  }
});

app.post("/mangmao/check-exit", async (req, res) => {
  try {
    const {
      firebaseUserId,
      accountId,
      symbol,
      activePositions = [],
      autoFinalize = false,
    } = req.body || {};

    if (!firebaseUserId || !symbol) {
      return res.status(400).json({
        status: false,
        message: "firebaseUserId and symbol are required",
      });
    }

    const safeSymbol = normalizeMangmaoSymbol(symbol);
    const safeAccountId = normalizeMangmaoAccountId(accountId);

    let positions = Array.isArray(activePositions) ? activePositions : [];
    if (!positions.length) {
      try {
        const rows = await getActivePositionsByUserAndSymbol(firebaseUserId, safeSymbol);
        positions = normalizeMangmaoActivePositions(rows);
      } catch (error) {
        console.error("[/mangmao/check-exit] load active positions error:", error.message);
      }
    }

    const exitResult = await evaluateMangmaoExit({
      firebaseUserId,
      accountId: safeAccountId,
      symbol: safeSymbol,
      activePositions: positions,
    });

    if (!autoFinalize || exitResult.action !== "CLOSE_ALL") {
      return res.json({
        status: true,
        message: "Mangmao exit checked",
        data: exitResult,
      });
    }

    const finalizeResult = await finalizeMangmaoGroup({
      firebaseUserId,
      accountId: safeAccountId,
      symbol: safeSymbol,
      groupId: exitResult.groupId,
      result: exitResult.result,
      closedOrders: exitResult.tickets || [],
      note: exitResult.reason || null,
    });

    return res.json({
      status: true,
      message: "Mangmao exit checked and finalized",
      data: {
        exitResult,
        finalizeResult,
      },
    });
  } catch (error) {
    console.error("[/mangmao/check-exit] error:", error);
    return res.status(500).json({
      status: false,
      message: "Mangmao check exit failed",
      error: error.message,
    });
  }
});

app.post("/mangmao/finalize", async (req, res) => {
  try {
    const {
      firebaseUserId,
      accountId,
      symbol,
      groupId,
      result,
      closedOrders = [],
      note = null,
    } = req.body || {};

    if (!firebaseUserId || !symbol || !groupId || !result) {
      return res.status(400).json({
        status: false,
        message: "firebaseUserId, symbol, groupId, result are required",
      });
    }

    const finalizeResult = await finalizeMangmaoGroup({
      firebaseUserId,
      accountId: normalizeMangmaoAccountId(accountId),
      symbol: normalizeMangmaoSymbol(symbol),
      groupId,
      result,
      closedOrders: Array.isArray(closedOrders) ? closedOrders : [],
      note,
    });

    return res.json({
      status: true,
      message: "Mangmao finalized",
      data: finalizeResult,
    });
  } catch (error) {
    console.error("[/mangmao/finalize] error:", error);
    return res.status(500).json({
      status: false,
      message: "Mangmao finalize failed",
      error: error.message,
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

  // try {
  //   if (message) {
  //     await sendTelegram(
  //       process.env.TELEGRAM_BOT_TOKEN,
  //       process.env.TELEGRAM_CHAT_ID,
  //       message
  //     );
  //   }
  // } catch (telegramError) {
  //   console.error("Telegram send error:", telegramError.message);
  // }

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

  if (type === "OPEN_ORDER") {
    linkLatestEntryThesisSnapshotToOpenOrder({
      firebaseUserId: resolvedUserId,
      accountId,
      symbol,
      side,
      mode,
      ticketId: normalizedTicketId,
      lot,
      price,
      sl,
      tp,
      eventTime,
    });
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
  try {
    const {
      firebaseUserId = null,
      symbol = "",
      openPosition = {},
      candles = [],
      currentProfit = 0,
      mode = null,
      price = 0,
      tpPoints = null,
      slPoints = null,
      holdingMinutes = null,
      accountId
    } = req.body || {};

    const resolvedUserId = firebaseUserId || null;
    const resolvedSymbol = String(
      symbol || openPosition?.symbol || ""
    ).trim();

    if (!resolvedSymbol) {
      return res.status(400).json({
        action: "HOLD",
        reason: "Missing symbol",
        riskLevel: "UNKNOWN",
        score: 0,
      });
    }

    if (!openPosition || typeof openPosition !== "object" || !openPosition.side) {
      return res.status(400).json({
        action: "HOLD",
        reason: "Missing or invalid openPosition",
        riskLevel: "UNKNOWN",
        score: 0,
      });
    }

    if (!Array.isArray(candles) || candles.length < 5) {
      return res.status(400).json({
        action: "HOLD",
        reason: "Not enough candles",
        riskLevel: "UNKNOWN",
        score: 0,
      });
    }

    const resolvedMode = String(
      mode ||
      openPosition?.mode ||
      openPosition?.tradeMode ||
      "NORMAL"
    ).toUpperCase();

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

    const resolvedHoldingMinutes = Number(
      holdingMinutes ??
      openPosition?.holdingMinutes ??
      openPosition?.holding_minutes ??
      openPosition?.minutesOpen ??
      openPosition?.minutes_open ??
      0
    );

    const resolvedPrice = Number(
      price ??
      openPosition?.currentPrice ??
      openPosition?.current_price ??
      openPosition?.marketPrice ??
      0
    );

    const resolvedCurrentProfit = Number(
      currentProfit ??
      openPosition?.profit ??
      openPosition?.floatingProfit ??
      0
    );

    const historicalVolume = evaluateCurrentVolumeAgainstHistory({
      firebaseUserId: resolvedUserId,
      symbol: resolvedSymbol,
      candles,
    });

    const pattern = await analyzePattern({
      symbol: resolvedSymbol,
      candles,
      candlesH1: null,
      candlesH4: null,
      overlapPips: 100,
    });

    const normalizedOpenPosition = {
      ...openPosition,
      symbol: resolvedSymbol,
      mode: resolvedMode,
      currentPrice: Number.isFinite(resolvedPrice) ? resolvedPrice : 0,
      current_price: Number.isFinite(resolvedPrice) ? resolvedPrice : 0,
      tpPoints: Number.isFinite(resolvedTpPoints) ? resolvedTpPoints : 0,
      tp_points: Number.isFinite(resolvedTpPoints) ? resolvedTpPoints : 0,
      slPoints: Number.isFinite(resolvedSlPoints) ? resolvedSlPoints : 0,
      sl_points: Number.isFinite(resolvedSlPoints) ? resolvedSlPoints : 0,
      holdingMinutes: Number.isFinite(resolvedHoldingMinutes) ? Math.max(0, resolvedHoldingMinutes) : 0,
      holding_minutes: Number.isFinite(resolvedHoldingMinutes) ? Math.max(0, resolvedHoldingMinutes) : 0,
      profit: Number.isFinite(resolvedCurrentProfit) ? resolvedCurrentProfit : 0,
      floatingProfit: Number.isFinite(resolvedCurrentProfit) ? resolvedCurrentProfit : 0,
    };

    const result = await analyzeEarlyExit({
      firebaseUserId: resolvedUserId,
      symbol: resolvedSymbol,
      openPosition: normalizedOpenPosition,
      currentProfit: Number.isFinite(resolvedCurrentProfit) ? resolvedCurrentProfit : 0,
      candles,
      mode: resolvedMode,
      price: Number.isFinite(resolvedPrice) ? resolvedPrice : 0,
      slPoints: Number.isFinite(resolvedSlPoints) ? resolvedSlPoints : 0,
      timeframe: String(req.body?.timeframe || "M5").toUpperCase(),
      historicalVolume,
      pattern,
      accountId
    });

    // const exitResult = await analyzeEarlyExit({
    //   firebaseUserId,
    //   symbol,
    //   openPosition: {
    //     ...openPosition,
    //     side: String(openPosition?.side || openPosition?.type || "").toUpperCase(),
    //     symbol: openPosition?.symbol || symbol,
    //   },
    //   currentProfit: Number(currentProfit || openPosition?.profit || 0),
    //   candles: Array.isArray(candles) ? candles : [],
    //   mode: String(mode || openPosition?.mode || "NORMAL").toUpperCase(),
    //   price: Number(price || openPosition?.currentPrice || openPosition?.current_price || 0),
    //   timeframe: String(timeframe || "M5").toUpperCase(),
    //   holdingMinutes: Number(holdingMinutes || 0),
    //   historicalVolume: historicalVolume ?? null,
    //   accountId: accountId ?? openPosition?.accountId ?? null,
    // });

    // ถ้า EA ของคุณยังไม่รองรับ action ใหม่
    // ให้ map กลับเป็น action เดิมที่ EA ใช้อยู่
    let responseAction = result?.action || "HOLD";
    let responseReason = result?.reason || "No exit signal";
    let responseRiskLevel = result?.riskLevel || "LOW";
    let responseScore = Number(result?.score || 0);

    if (responseAction === "REDUCE_TARGET") {
      responseAction = "MOVE_TO_BE";
      responseReason = `Mapped from REDUCE_TARGET: ${responseReason}`;
    }

    if (responseAction === "WAIT_FOR_SMALL_BOUNCE") {
      responseAction = "HOLD";
      responseReason = `Mapped from WAIT_FOR_SMALL_BOUNCE: ${responseReason}`;
    }

    const payload = {
      action: responseAction,
      reason: responseReason,
      riskLevel: responseRiskLevel,
      score: responseScore,
      meta: {
        rawAction: result?.action || "HOLD",
        mode: resolvedMode,
        holdingMinutes: Number.isFinite(resolvedHoldingMinutes)
          ? Math.max(0, resolvedHoldingMinutes)
          : 0,
        symbol: resolvedSymbol,
      },
    };

    console.log("Early exit result:", JSON.stringify(payload));

    return res.json(payload);
  } catch (error) {
    console.error("check-exit-signal error:", error);

    return res.status(500).json({
      action: "HOLD",
      reason: error.message || "Internal server error",
      riskLevel: "UNKNOWN",
      score: 0,
    });
  }
});

// app.post("/check-exit-signal", async (req, res) => {
//   const {
//     firebaseUserId,
//     symbol,
//     openPosition,
//     candles,
//     currentProfit,
//     mode = null,
//     price,
//     tpPoints = null,
//     slPoints = null
//   } = req.body;

//   // console.log("Early exit body: " + JSON.stringify(req.body));

//   const resolvedUserId = firebaseUserId || null;

//   const historicalVolume = evaluateCurrentVolumeAgainstHistory({
//     firebaseUserId: resolvedUserId,
//     symbol,
//     candles,
//   });

//   // console.log("Early exit historical: " + JSON.stringify(historicalVolume));

//   try {
//     const resolvedMode =
//       mode ||
//       openPosition?.mode ||
//       openPosition?.tradeMode ||
//       "NORMAL";

//     const resolvedTpPoints = Number(
//       tpPoints ??
//       openPosition?.tpPoints ??
//       openPosition?.tp_points ??
//       0
//     );

//     const resolvedSlPoints = Number(
//       slPoints ??
//       openPosition?.slPoints ??
//       openPosition?.sl_points ??
//       0
//     );

//     const pattern = await analyzePattern({
//       symbol: symbol,
//       candles: candles,
//       candlesH1: null,
//       candlesH4: null,
//       overlapPips: 100,
//     });

//     const result = await analyzeEarlyExit({
//       firebaseUserId: resolvedUserId,
//       symbol,
//       openPosition,
//       currentProfit,
//       candles,
//       mode: String(resolvedMode || "NORMAL").toUpperCase(),
//       price,
//       tpPoints: Number.isFinite(resolvedTpPoints) ? resolvedTpPoints : 0,
//       slPoints: Number.isFinite(resolvedSlPoints) ? resolvedSlPoints : 0,
//       historicalVolume,
//       holdingMinutes: 10,
//       pattern
//     });

//     console.log("Early exit result: " + JSON.stringify(result));

//     return res.json(result);
//   } catch (error) {
//     console.error("check-exit-signal error:", error);

//     return res.status(500).json({
//       action: "HOLD",
//       reason: error.message || "Internal server error",
//       riskLevel: "UNKNOWN",
//       score: 0
//     });
//   }
// });

// app.post("/webhook/mae-pla", async (req, res) => {
//   try {
//     const payload = req.body;
//     console.log(`[Mae Pla Webhook] Received type: ${payload.type}`);

//     const dataPath = ensureDataDir();
//     const logPath = path.join(dataPath, "mae_pla_logs.json");
//     const logs = safeReadJsonArray(logPath);

//     logs.push(payload);
//     safeWriteJson(logPath, logs);

//     if (payload.type === "market_context") {
//       console.log("-> Market Context Updated: recommendation =", payload.recommendation);
//     } else if (payload.type === "signal_validation") {
//       console.log("-> Signal Validation:", payload.action, "Score:", payload.ai_confidence_score);
//     } else if (payload.type === "trade_result") {
//       console.log("-> Trade Learning Logged:", payload.result, "Lesson:", payload.lesson_learned);
//     }

//     res.json({ success: true, message: "Mae Pla data logged & processed" });
//   } catch (error) {
//     console.error("Webhook Error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

app.get("/trade-history/:firebaseUserId", async (req, res) => {
  const { firebaseUserId } = req.params;
  const { limit = 500, page = 1 } = req.query;

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
        totalPages: Math.ceil(total / Number(limit || 500))
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

app.get("/user-trade-history", async (req, res) => {
  try {
    const {
      firebaseUserId,
      accountId = null,
      startDate,
      endDate,
      page = 1,
      limit = 100,
    } = req.query || {};

    const safeFirebaseUserId = String(firebaseUserId || "").trim();
    const safeAccountId =
      accountId === undefined || accountId === null || String(accountId).trim() === ""
        ? null
        : Number(accountId);

    const safeStartDate = String(startDate || "").trim();
    const safeEndDate = String(endDate || "").trim();

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const offset = (safePage - 1) * safeLimit;

    if (!safeFirebaseUserId) {
      return res.status(400).json({
        success: false,
        error: "firebaseUserId is required",
      });
    }

    if (!safeStartDate || !safeEndDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required",
      });
    }

    const where = [
      "firebase_user_id = ?",
      "event_type IN ('CLOSE_ORDER', 'CLOSE_EMERGENCY')",
      "DATE(COALESCE(event_time, created_at)) >= ?",
      "DATE(COALESCE(event_time, created_at)) <= ?",
    ];
    const params = [safeFirebaseUserId, safeStartDate, safeEndDate];

    if (Number.isFinite(safeAccountId)) {
      where.push("account_id = ?");
      params.push(safeAccountId);
    }

    const whereSql = where.join(" AND ");

    const summarySql = `
      SELECT
        COUNT(*) AS closedTrades,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) AS winTrades,
        SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) AS lossTrades,
        SUM(CASE WHEN profit = 0 THEN 1 ELSE 0 END) AS breakevenTrades,
        SUM(profit) AS netProfit,
        SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) AS grossProfit,
        SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END) AS grossLoss,
        AVG(profit) AS avgProfit,
        MAX(profit) AS bestTrade,
        MIN(profit) AS worstTrade,
        SUM(lot) AS totalLot
      FROM trade_history
      WHERE ${whereSql}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM trade_history
      WHERE ${whereSql}
    `;

    const dataSql = `
      SELECT
        id,
        firebase_user_id AS firebaseUserId,
        account_id AS accountId,
        ticket_id AS ticketId,
        event_type AS eventType,
        symbol,
        side,
        lot,
        price,
        sl,
        tp,
        profit,
        mode,
        created_at AS createdAt,
        event_time AS eventTime,
        COALESCE(event_time, created_at) AS sortTime
      FROM trade_history
      WHERE ${whereSql}
      ORDER BY COALESCE(event_time, created_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const summaryRows = await query(summarySql, params, { retries: 2 });
    const countRows = await query(countSql, params, { retries: 2 });
    const dataRows = await query(
      dataSql,
      [...params, safeLimit, offset],
      { retries: 2 }
    );

    const summaryRow = summaryRows?.[0] || {};
    const total = Number(countRows?.[0]?.total || 0);
    const closedTrades = Number(summaryRow.closedTrades || 0);
    const winTrades = Number(summaryRow.winTrades || 0);
    const lossTrades = Number(summaryRow.lossTrades || 0);

    const winRate =
      closedTrades > 0
        ? Number(((winTrades / closedTrades) * 100).toFixed(2))
        : 0;

    const data = Array.isArray(dataRows)
      ? dataRows.map((row) => {
        const profitNum = Number(row.profit || 0);

        let status = "BREAKEVEN";
        if (profitNum > 0) status = "WIN";
        else if (profitNum < 0) status = "LOSS";

        return {
          id: Number(row.id || 0),
          firebaseUserId: row.firebaseUserId || "",
          accountId: row.accountId ?? null,
          ticketId: row.ticketId ?? null,
          eventType: row.eventType || "CLOSE_ORDER",
          symbol: row.symbol || "",
          side: row.side || "",
          lot: Number(row.lot || 0),
          price: Number(row.price || 0),
          sl: Number(row.sl || 0),
          tp: Number(row.tp || 0),
          profit: profitNum,
          mode: row.mode || "",
          status,
          eventTime: row.eventTime || null,
          createdAt: row.createdAt || null,
          sortTime: row.sortTime || row.eventTime || row.createdAt || null,
        };
      })
      : [];

    return res.json({
      success: true,
      filters: {
        firebaseUserId: safeFirebaseUserId,
        accountId: Number.isFinite(safeAccountId) ? safeAccountId : null,
        startDate: safeStartDate,
        endDate: safeEndDate,
        eventType: "CLOSE_ORDER",
      },
      summary: {
        closedTrades,
        winTrades,
        lossTrades,
        breakevenTrades: Number(summaryRow.breakevenTrades || 0),
        winRate,
        netProfit: Number(summaryRow.netProfit || 0),
        grossProfit: Number(summaryRow.grossProfit || 0),
        grossLoss: Number(summaryRow.grossLoss || 0),
        avgProfit: Number(summaryRow.avgProfit || 0),
        bestTrade: Number(summaryRow.bestTrade || 0),
        worstTrade: Number(summaryRow.worstTrade || 0),
        totalLot: Number(summaryRow.totalLot || 0),
      },
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
      data,
    });
  } catch (error) {
    console.error("trade-history dashboard error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
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
  if (origin === "https://koomport.com") {
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
      maxLotSize = 0.05,
      changedBy = null,
      note = null,
    } = req.body || {};

    const safeFirebaseUserId = normalizeNullable(firebaseUserId);
    const safeAccountId = normalizeNullable(accountId);
    const safeEngineEnabled = toBool(engineEnabled, true) ? 1 : 0;
    const safeDirectionBias = normalizeDirectionBias(directionBias);
    const safeMaxOpenPositions = toPositiveInt(maxOpenPositions, 5);
    const safeBaseLotSize = toPositiveDecimal(baseLotSize, 0.01);
    const safeMaxLotSize = toPositiveDecimal(maxLotSize, 5);
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

    if (safeMaxLotSize <= 0 || safeMaxLotSize > 100) {
      return res.status(400).json({
        success: false,
        error: "maxLotSize must be greater than 0 and not exceed 100",
      });
    }

    if (safeMaxLotSize < safeBaseLotSize) {
      return res.status(400).json({
        success: false,
        error: "maxLotSize must be greater than or equal to baseLotSize",
      });
    }

    const upsertSql = `
      INSERT INTO user_trading_preferences (
        firebase_user_id,
        account_id,
        engine_enabled,
        direction_bias,
        max_open_positions,
        base_lot_size,
        max_lot_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        engine_enabled = VALUES(engine_enabled),
        direction_bias = VALUES(direction_bias),
        max_open_positions = VALUES(max_open_positions),
        base_lot_size = VALUES(base_lot_size),
        max_lot_size = VALUES(max_lot_size),
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
        safeMaxLotSize,
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
        max_lot_size AS maxLotSize,
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
        maxLotSize: safeMaxLotSize,
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
        max_lot_size AS maxLotSize,
        updated_at AS updatedAt
      FROM user_trading_preferences
      WHERE firebase_user_id = ? AND account_id = ?
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
        maxLotSize: 5,
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
