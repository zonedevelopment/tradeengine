"use strict";

/**
 * MICRO SCALP ENGINE
 * Standalone module for short momentum-based trading signal detection
 * and emergency exit management.
 *
 * Candle format expected:
 * {
 *   open: number,
 *   high: number,
 *   low: number,
 *   close: number,
 *   tickVolume?: number,
 *   time?: string | number | Date
 * }
 */

/* =========================
 * DEFAULT CONFIG
 * ========================= */
const DEFAULT_CONFIG = {
  enabled: true,

  // Signal thresholds
  minScore: 45,
  minScoreGap: 8,
  maxSpread: 20,

  // Position management
  onePositionOnly: true,
  maxHoldBars: 2,
  maxLossUsd: 8,

  // Optional target logic
  minProfitToClose: 2,

  // Scoring weights
  trendWeight: 1,
  momentumWeight: 1,
  entryWeight: 1,
  volumeWeight: 1,
  penaltyWeight: 1,

  // Extreme candle filter
  extremeBodyMultiplier: 2.5,
  momentumBodyMultiplier: 1.2,

  // Volume filter
  useVolume: true,
  minVolumeRatio: 1.05,
};

/* =========================
 * BASIC HELPERS
 * ========================= */
function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round2(v) {
  return Math.round(toNumber(v) * 100) / 100;
}

function bodySize(c) {
  return Math.abs(toNumber(c.close) - toNumber(c.open));
}

function candleRange(c) {
  return Math.abs(toNumber(c.high) - toNumber(c.low));
}

function candleBody(c = {}) {
  return Math.abs(toNum(c.close) - toNum(c.open));
}

function upperWick(c) {
  return toNumber(c.high) - Math.max(toNumber(c.open), toNumber(c.close));
}

function lowerWick(c) {
  return Math.min(toNumber(c.open), toNumber(c.close)) - toNumber(c.low);
}

function isBull(c) {
  return toNumber(c.close) > toNumber(c.open);
}

function isBear(c) {
  return toNumber(c.close) < toNumber(c.open);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function last(arr, indexFromEnd = 1) {
  const a = safeArray(arr);
  return a[a.length - indexFromEnd];
}

function hasEnoughCandles(candles, min = 5) {
  return Array.isArray(candles) && candles.length >= min;
}

function avg(values = []) {
  const arr = values.filter((v) => Number.isFinite(toNumber(v)));
  if (!arr.length) return 0;
  return arr.reduce((sum, v) => sum + toNumber(v), 0) / arr.length;
}

function avgBody(candles = [], length = 5) {
  const a = safeArray(candles);
  if (a.length < length) return 0;
  return avg(a.slice(-length).map(bodySize));
}

function avgRange(candles = [], length = 5) {
  const a = safeArray(candles);
  if (a.length < length) return 0;
  return avg(a.slice(-length).map(candleRange));
}

function avgTickVolume(candles = [], length = 5) {
  const a = safeArray(candles);
  if (a.length < length) return 0;
  return avg(a.slice(-length).map((c) => toNumber(c.tickVolume, 0)));
}

function normalizeCandles(candles = []) {
  return safeArray(candles)
    .map((c) => ({
      open: toNumber(c.open),
      high: toNumber(c.high),
      low: toNumber(c.low),
      close: toNumber(c.close),
      tickVolume: toNumber(c.tickVolume, 0),
      time: c.time || null,
    }))
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );
}

/* =========================
 * TREND SCORE
 * ========================= */
function calculateTrendScore(candles = []) {
  if (!hasEnoughCandles(candles, 4)) {
    return {
      buy: 0,
      sell: 0,
      reasons: [],
    };
  }

  const c1 = last(candles, 1);
  const c2 = last(candles, 2);
  const c3 = last(candles, 3);

  let buy = 0;
  let sell = 0;
  const reasons = [];

  // Higher high / higher low
  if (c1.high > c2.high && c2.high > c3.high) {
    buy += 15;
    reasons.push("BUY_HH_SEQUENCE");
  }

  if (c1.low > c2.low && c2.low > c3.low) {
    buy += 15;
    reasons.push("BUY_HL_SEQUENCE");
  }

  // Lower high / lower low
  if (c1.high < c2.high && c2.high < c3.high) {
    sell += 15;
    reasons.push("SELL_LH_SEQUENCE");
  }

  if (c1.low < c2.low && c2.low < c3.low) {
    sell += 15;
    reasons.push("SELL_LL_SEQUENCE");
  }

  return { buy, sell, reasons };
}

/* =========================
 * MOMENTUM SCORE
 * ========================= */
function calculateMomentumScore(candles = [], config = DEFAULT_CONFIG) {
  if (!hasEnoughCandles(candles, 3)) {
    return {
      buy: 0,
      sell: 0,
      reasons: [],
    };
  }

  const c1 = last(candles, 1);
  const c2 = last(candles, 2);
  const c3 = last(candles, 3);

  const avgB = avgBody(candles, 5) || bodySize(c1) || 1;
  const avgR = avgRange(candles, 5) || candleRange(c1) || 1;

  let buy = 0;
  let sell = 0;
  const reasons = [];

  if (isBull(c1)) {
    buy += 10;
    reasons.push("BUY_LAST_CANDLE_BULL");
  }

  if (isBear(c1)) {
    sell += 10;
    reasons.push("SELL_LAST_CANDLE_BEAR");
  }

  if (bodySize(c1) > avgB * config.momentumBodyMultiplier) {
    if (isBull(c1)) {
      buy += 12;
      reasons.push("BUY_STRONG_BODY");
    }
    if (isBear(c1)) {
      sell += 12;
      reasons.push("SELL_STRONG_BODY");
    }
  }

  if (isBull(c1) && isBull(c2)) {
    buy += 8;
    reasons.push("BUY_DOUBLE_BULL_MOMENTUM");
  }

  if (isBear(c1) && isBear(c2)) {
    sell += 8;
    reasons.push("SELL_DOUBLE_BEAR_MOMENTUM");
  }

  const range = candleRange(c1) || 1;
  const closeNearHighRatio = (c1.high - c1.close) / range;
  const closeNearLowRatio = (c1.close - c1.low) / range;

  if (isBull(c1) && closeNearHighRatio <= 0.2) {
    buy += 10;
    reasons.push("BUY_CLOSE_NEAR_HIGH");
  }

  if (isBear(c1) && closeNearLowRatio <= 0.2) {
    sell += 10;
    reasons.push("SELL_CLOSE_NEAR_LOW");
  }

  // Too extreme = risk of chasing
  if (bodySize(c1) > avgB * config.extremeBodyMultiplier) {
    if (isBull(c1)) {
      buy -= 8;
      reasons.push("BUY_TOO_EXTREME_CHASING_RISK");
    }
    if (isBear(c1)) {
      sell -= 8;
      reasons.push("SELL_TOO_EXTREME_CHASING_RISK");
    }
  }

  // Small range / indecision penalty embedded in momentum
  if (candleRange(c1) < avgR * 0.6) {
    if (isBull(c1)) {
      buy -= 3;
      reasons.push("BUY_SMALL_RANGE_WEAK_MOMENTUM");
    }
    if (isBear(c1)) {
      sell -= 3;
      reasons.push("SELL_SMALL_RANGE_WEAK_MOMENTUM");
    }
  }

  return { buy, sell, reasons };
}

/* =========================
 * ENTRY TIMING SCORE
 * ========================= */
function getRetraceRatio(baseCandle = {}, pullbackCandle = {}) {
  const baseRange = Math.abs((Number(baseCandle.high || 0)) - (Number(baseCandle.low || 0)));
  const pullbackBody = Math.abs((Number(pullbackCandle.close || 0)) - (Number(pullbackCandle.open || 0)));

  if (baseRange <= 0) return 0;
  return pullbackBody / baseRange;
}

function getPullbackDepthRatio(impulseCandle = {}, pullbackCandle = {}) {
  const impulseRange = candleRange(impulseCandle);
  const pullbackBody = candleBody(pullbackCandle);
  if (impulseRange <= 0) return 0;
  return pullbackBody / impulseRange;
}

function detectScalpContinuationSetup(candles = []) {
  if (!Array.isArray(candles) || candles.length < 4) {
    return {
      buy: { valid: false, score: 0, reason: "NOT_ENOUGH_CANDLES" },
      sell: { valid: false, score: 0, reason: "NOT_ENOUGH_CANDLES" }
    };
  }

  const c1 = candles[candles.length - 1]; // current/last
  const c2 = candles[candles.length - 2]; // pullback candle
  const c3 = candles[candles.length - 3]; // impulse candle

  const c1Bull = toNum(c1.close) > toNum(c1.open);
  const c1Bear = toNum(c1.close) < toNum(c1.open);
  const c2Bull = toNum(c2.close) > toNum(c2.open);
  const c2Bear = toNum(c2.close) < toNum(c2.open);

  const pullbackDepth = getPullbackDepthRatio(c3, c2);

  const shallowPullback = pullbackDepth >= 0.15 && pullbackDepth <= 0.38;
  const mediumPullback = pullbackDepth > 0.38 && pullbackDepth <= 0.52;
  const tooDeepPullback = pullbackDepth > 0.52;

  let buy = { valid: false, score: 0, reason: "NO_BUY_CONTINUATION" };
  let sell = { valid: false, score: 0, reason: "NO_SELL_CONTINUATION" };

  // BUY continuation:
  // c3 แรงขึ้น -> c2 ย่อลง -> c1 กลับขึ้นและทะลุ high ของ c2
  if (c2Bear && c1Bull && toNum(c1.high) > toNum(c2.high)) {
    if (shallowPullback) {
      buy = { valid: true, score: 18, reason: "BUY_CONTINUATION_SHALLOW_PULLBACK" };
    } else if (mediumPullback) {
      buy = { valid: true, score: 10, reason: "BUY_CONTINUATION_MEDIUM_PULLBACK" };
    } else if (tooDeepPullback) {
      buy = { valid: false, score: -8, reason: "BUY_PULLBACK_TOO_DEEP" };
    }
  }

  // SELL continuation:
  // c3 แรงลง -> c2 ย่อขึ้น -> c1 กลับลงและทะลุ low ของ c2
  if (c2Bull && c1Bear && toNum(c1.low) < toNum(c2.low)) {
    if (shallowPullback) {
      sell = { valid: true, score: 18, reason: "SELL_CONTINUATION_SHALLOW_PULLBACK" };
    } else if (mediumPullback) {
      sell = { valid: true, score: 10, reason: "SELL_CONTINUATION_MEDIUM_PULLBACK" };
    } else if (tooDeepPullback) {
      sell = { valid: false, score: -8, reason: "SELL_PULLBACK_TOO_DEEP" };
    }
  }

  return { buy, sell };
}

function validateScalpPullbackQuality(candles = [], side = "") {
  if (!Array.isArray(candles) || candles.length < 4) {
    return { ok: false, reason: "NOT_ENOUGH_CANDLES" };
  }

  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 3];
  const depth = getPullbackDepthRatio(c3, c2);

  if (depth > 0.52) {
    return { ok: false, reason: "PULLBACK_TOO_DEEP", depth };
  }

  if (depth < 0.12) {
    return { ok: false, reason: "PULLBACK_TOO_SHALLOW", depth };
  }

  return { ok: true, reason: "VALID_PULLBACK", depth };
}

function calculateEntryTimingScore(candles = []) {
  if (!Array.isArray(candles) || candles.length < 4) {
    return {
      buy: 0,
      sell: 0,
      reasons: []
    };
  }

  const c1 = candles[candles.length - 1];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 3];

  let buy = 0;
  let sell = 0;
  const reasons = [];

  const continuation = detectScalpContinuationSetup(candles);

  if (continuation.buy.score !== 0) {
    buy += continuation.buy.score;
    reasons.push(continuation.buy.reason);
  }

  if (continuation.sell.score !== 0) {
    sell += continuation.sell.score;
    reasons.push(continuation.sell.reason);
  }

  // breakout follow-through
  if (toNum(c1.close) > toNum(c2.high) && toNum(c2.high) > toNum(c3.high)) {
    buy += 6;
    reasons.push("BUY_BREAKOUT_FOLLOW_THROUGH");
  }

  if (toNum(c1.close) < toNum(c2.low) && toNum(c2.low) < toNum(c3.low)) {
    sell += 6;
    reasons.push("SELL_BREAKDOWN_FOLLOW_THROUGH");
  }

  // ถ้าแท่งล่าสุด body เล็กเกิน ลดความมั่นใจ
  const c1Body = candleBody(c1);
  const c1Range = candleRange(c1);
  const weakLastCandle = c1Range > 0 && c1Body / c1Range < 0.35;

  if (weakLastCandle) {
    buy -= 4;
    sell -= 4;
    reasons.push("WEAK_LAST_CANDLE");
  }

  return { buy, sell, reasons };
}
// function calculateEntryTimingScore(candles = []) {
//   if (!hasEnoughCandles(candles, 4)) {
//     return {
//       buy: 0,
//       sell: 0,
//       reasons: [],
//     };
//   }

//   const c1 = last(candles, 1);
//   const c2 = last(candles, 2);
//   const c3 = last(candles, 3);

//   let buy = 0;
//   let sell = 0;
//   const reasons = [];

//   const retraceRatio = getRetraceRatio(c3, c2);

//   // continuation ที่ดีควรย่อพอดี ไม่ตื้นเกินและไม่ลึกเกิน
//   const validScalpPullback = retraceRatio >= 0.18 && retraceRatio <= 0.38;
//   const validNormalPullback = retraceRatio >= 0.25 && retraceRatio <= 0.50;

//   // SELL continuation
//   if (isBull(c2) && isBear(c1) && c1.low < c2.low) {
//     if (validScalpPullback || validNormalPullback) {
//       sell += 15;
//       reasons.push("SELL_PULLBACK_CONTINUATION_VALID");
//     } else if (retraceRatio < 0.18) {
//       sell += 6;
//       reasons.push("SELL_CONTINUATION_SHALLOW_PULLBACK");
//     } else {
//       sell -= 5;
//       reasons.push("SELL_PULLBACK_TOO_DEEP");
//     }
//   }

//   // BUY continuation
//   if (isBear(c2) && isBull(c1) && c1.high > c2.high) {
//     if (validScalpPullback || validNormalPullback) {
//       buy += 15;
//       reasons.push("BUY_PULLBACK_CONTINUATION_VALID");
//     } else if (retraceRatio < 0.18) {
//       buy += 6;
//       reasons.push("BUY_CONTINUATION_SHALLOW_PULLBACK");
//     } else {
//       buy -= 5;
//       reasons.push("BUY_PULLBACK_TOO_DEEP");
//     }
//   }

//   // break continuation
//   if (isBear(c1) && c1.low < c2.low && c2.low < c3.low) {
//     sell += 8;
//     reasons.push("SELL_BREAKDOWN_CONTINUATION");
//   }

//   if (isBull(c1) && c1.high > c2.high && c2.high > c3.high) {
//     buy += 8;
//     reasons.push("BUY_BREAKOUT_CONTINUATION");
//   }

//   return { buy, sell, reasons };
// }

/* =========================
 * VOLUME SCORE
 * ========================= */
function calculateVolumeScore(candles = [], config = DEFAULT_CONFIG) {
  if (!config.useVolume || !hasEnoughCandles(candles, 5)) {
    return {
      buy: 0,
      sell: 0,
      reasons: [],
    };
  }

  const c1 = last(candles, 1);
  const avgVol = avgTickVolume(candles, 5) || c1.tickVolume || 1;
  const ratio = c1.tickVolume / avgVol;

  let buy = 0;
  let sell = 0;
  const reasons = [];

  if (ratio >= config.minVolumeRatio) {
    if (isBull(c1)) {
      buy += 8;
      reasons.push("BUY_VOLUME_SUPPORT");
    }
    if (isBear(c1)) {
      sell += 8;
      reasons.push("SELL_VOLUME_SUPPORT");
    }
  }

  if (ratio >= 1.5) {
    if (isBull(c1)) {
      buy += 4;
      reasons.push("BUY_HIGH_VOLUME_BONUS");
    }
    if (isBear(c1)) {
      sell += 4;
      reasons.push("SELL_HIGH_VOLUME_BONUS");
    }
  }

  return { buy, sell, reasons };
}

/* =========================
 * RISK PENALTY
 * ========================= */
function calculateRiskPenalty(candles = [], spread = 0, config = DEFAULT_CONFIG) {
  if (!hasEnoughCandles(candles, 2)) {
    return {
      penalty: 0,
      reasons: [],
    };
  }

  const c1 = last(candles, 1);
  const avgB = avgBody(candles, 5) || bodySize(c1) || 1;

  let penalty = 0;
  const reasons = [];

  if (spread > 0) {
    if (spread >= 30) {
      penalty += 20;
      reasons.push("SPREAD_VERY_HIGH");
    } else if (spread >= 20) {
      penalty += 10;
      reasons.push("SPREAD_HIGH");
    }
  }

  if (lowerWick(c1) > bodySize(c1) * 1.5) {
    penalty += 8;
    reasons.push("LONG_LOWER_WICK");
  }

  if (upperWick(c1) > bodySize(c1) * 1.5) {
    penalty += 8;
    reasons.push("LONG_UPPER_WICK");
  }

  if (bodySize(c1) > avgB * config.extremeBodyMultiplier) {
    penalty += 10;
    reasons.push("EXTREME_BODY_CHASING_RISK");
  }

  return { penalty, reasons };
}

/* =========================
 * REVERSAL WARNING
 * ========================= */
function detectReversalWarning(candles = []) {
  if (!hasEnoughCandles(candles, 2)) {
    return {
      buyWarning: false,
      sellWarning: false,
      reasons: [],
    };
  }

  const c1 = last(candles, 1);
  const avgB = avgBody(candles, 5) || bodySize(c1) || 1;

  const buyWarning =
    isBear(c1) &&
    lowerWick(c1) > bodySize(c1) * 1.5 &&
    bodySize(c1) < avgB * 0.8;

  const sellWarning =
    isBull(c1) &&
    upperWick(c1) > bodySize(c1) * 1.5 &&
    bodySize(c1) < avgB * 0.8;

  const reasons = [];
  if (buyWarning) reasons.push("BUY_REVERSAL_WARNING");
  if (sellWarning) reasons.push("SELL_REVERSAL_WARNING");

  return { buyWarning, sellWarning, reasons };
}

/* =========================
 * MASTER SCORE CALCULATION
 * ========================= */
function calculateMicroScalpScore(params = {}) {
  const candles = normalizeCandles(params.candles || []);
  const spread = toNumber(params.spread, 0);
  const config = { ...DEFAULT_CONFIG, ...(params.config || {}) };

  const trend = calculateTrendScore(candles);
  const momentum = calculateMomentumScore(candles, config);
  const entry = calculateEntryTimingScore(candles);
  const volume = calculateVolumeScore(candles, config);
  const risk = calculateRiskPenalty(candles, spread, config);
  const reversal = detectReversalWarning(candles);

  let buy =
    trend.buy * config.trendWeight +
    momentum.buy * config.momentumWeight +
    entry.buy * config.entryWeight +
    volume.buy * config.volumeWeight -
    risk.penalty * config.penaltyWeight;

  let sell =
    trend.sell * config.trendWeight +
    momentum.sell * config.momentumWeight +
    entry.sell * config.entryWeight +
    volume.sell * config.volumeWeight -
    risk.penalty * config.penaltyWeight;

  if (reversal.buyWarning) buy -= 8;
  if (reversal.sellWarning) sell -= 8;

  buy = Math.max(0, Math.round(buy));
  sell = Math.max(0, Math.round(sell));

  return {
    buyScore: buy,
    sellScore: sell,
    detail: {
      trend,
      momentum,
      entry,
      volume,
      risk,
      reversal,
      spread,
    },
  };
}

/* =========================
 * SIGNAL DETECTION
 * ========================= */
function detectMicroScalpSignal(params = {}) {
  const candles = normalizeCandles(params.candles || []);
  const spread = toNumber(params.spread, 0);
  const config = { ...DEFAULT_CONFIG, ...(params.config || {}) };

  if (!config.enabled) {
    return {
      signal: "NONE",
      mode: "MICRO_SCALP",
      score: 0,
      reason: "DISABLED",
    };
  }

  if (!hasEnoughCandles(candles, 5)) {
    return {
      signal: "NONE",
      mode: "MICRO_SCALP",
      score: 0,
      reason: "NOT_ENOUGH_CANDLES",
    };
  }

  if (spread > config.maxSpread) {
    return {
      signal: "NONE",
      mode: "MICRO_SCALP",
      score: 0,
      reason: "SPREAD_TOO_HIGH",
    };
  }

  const { buyScore, sellScore, detail } = calculateMicroScalpScore({
    candles,
    spread,
    config,
  });

  if (sellScore >= config.minScore && sellScore > buyScore + config.minScoreGap) {
    return {
      signal: "SELL",
      mode: "MICRO_SCALP",
      score: sellScore,
      oppositeScore: buyScore,
      reason: "SELL_MICRO_SCALP_CONFIRMED",
      detail,
    };
  }

  if (buyScore >= config.minScore && buyScore > sellScore + config.minScoreGap) {
    return {
      signal: "BUY",
      mode: "MICRO_SCALP",
      score: buyScore,
      oppositeScore: sellScore,
      reason: "BUY_MICRO_SCALP_CONFIRMED",
      detail,
    };
  }

  return {
    signal: "NONE",
    mode: "MICRO_SCALP",
    score: Math.max(buyScore, sellScore),
    oppositeScore: Math.min(buyScore, sellScore),
    reason: "SCORE_NOT_STRONG_ENOUGH",
    detail,
  };
}

/* =========================
 * POSITION EXIT LOGIC
 * ========================= */
function shouldEmergencyCloseByLoss(position = {}, maxLossUsd = 8) {
  return toNumber(position.profit, 0) <= -Math.abs(maxLossUsd);
}

function shouldCloseByProfit(position = {}, minProfitToClose = 2) {
  return toNumber(position.profit, 0) >= toNumber(minProfitToClose, 2);
}

function shouldCloseByMaxHold(openBarIndex, currentBarIndex, maxHoldBars = 2) {
  if (!Number.isFinite(toNumber(openBarIndex)) || !Number.isFinite(toNumber(currentBarIndex))) {
    return false;
  }
  return currentBarIndex - openBarIndex >= maxHoldBars;
}

function isMomentumDeadForSell(candles = []) {
  if (!hasEnoughCandles(candles, 2)) return false;
  const c1 = last(candles, 1);
  const c2 = last(candles, 2);
  return c1.low >= c2.low;
}

function isMomentumDeadForBuy(candles = []) {
  if (!hasEnoughCandles(candles, 2)) return false;
  const c1 = last(candles, 1);
  const c2 = last(candles, 2);
  return c1.high <= c2.high;
}

function isStrongOppositeCandle(side, candles = []) {
  if (!hasEnoughCandles(candles, 1)) return false;

  const c1 = last(candles, 1);
  const avgB = avgBody(candles, 5) || bodySize(c1) || 1;

  if (side === "SELL") {
    return isBull(c1) && bodySize(c1) > avgB * 1.3;
  }

  if (side === "BUY") {
    return isBear(c1) && bodySize(c1) > avgB * 1.3;
  }

  return false;
}

function shouldCloseMicroScalp(params = {}) {
  const side = String(params.side || "").toUpperCase();
  const position = params.position || {};
  const candles = normalizeCandles(params.candles || []);
  const config = { ...DEFAULT_CONFIG, ...(params.config || {}) };
  const openBarIndex = toNumber(params.openBarIndex, NaN);
  const currentBarIndex = toNumber(params.currentBarIndex, NaN);

  if (!side || !["BUY", "SELL"].includes(side)) {
    return {
      close: false,
      reason: "INVALID_SIDE",
    };
  }

  if (shouldEmergencyCloseByLoss(position, config.maxLossUsd)) {
    return {
      close: true,
      reason: "MAX_LOSS_HIT",
    };
  }

  if (shouldCloseByProfit(position, config.minProfitToClose)) {
    return {
      close: true,
      reason: "MIN_PROFIT_REACHED",
    };
  }

  if (shouldCloseByMaxHold(openBarIndex, currentBarIndex, config.maxHoldBars)) {
    return {
      close: true,
      reason: "MAX_HOLD_BARS",
    };
  }

  if (isStrongOppositeCandle(side, candles)) {
    return {
      close: true,
      reason: "STRONG_OPPOSITE_CANDLE",
    };
  }

  if (side === "SELL" && isMomentumDeadForSell(candles)) {
    return {
      close: true,
      reason: "SELL_MOMENTUM_DEAD",
    };
  }

  if (side === "BUY" && isMomentumDeadForBuy(candles)) {
    return {
      close: true,
      reason: "BUY_MOMENTUM_DEAD",
    };
  }

  return {
    close: false,
    reason: "HOLD",
  };
}

/* =========================
 * HIGH LEVEL WRAPPER
 * ========================= */
function evaluateMicroScalp(params = {}) {
  const candles = normalizeCandles(params.candles || []);
  const spread = toNumber(params.spread, 0);
  const config = { ...DEFAULT_CONFIG, ...(params.config || {}) };
  const openPositions = safeArray(params.openPositions || []);

  const signalResult = detectMicroScalpSignal({
    candles,
    spread,
    config,
  });

  if (
    config.onePositionOnly &&
    openPositions.some((p) => ["BUY", "SELL"].includes(String(p.side || "").toUpperCase()))
  ) {
    return {
      allowOpen: false,
      signal: "NONE",
      mode: "MICRO_SCALP",
      reason: "POSITION_ALREADY_OPEN",
      score: signalResult.score || 0,
      detail: signalResult.detail || null,
    };
  }

  if (signalResult.signal === "NONE") {
    return {
      allowOpen: false,
      signal: "NONE",
      mode: "MICRO_SCALP",
      reason: signalResult.reason,
      score: signalResult.score || 0,
      detail: signalResult.detail || null,
    };
  }

  const scalpPullbackCheck = validateScalpPullbackQuality(candles, signalResult?.signal);

  if (!scalpPullbackCheck.ok) {
    return {
      action: "NO_TRADE",
      reason: scalpPullbackCheck.reason,
      score: 0,
    };
  }

  return {
    allowOpen: true,
    signal: signalResult.signal,
    mode: "MICRO_SCALP",
    confidenceScore: signalResult.score,
    oppositeScore: signalResult.oppositeScore,
    reason: signalResult.reason,
    detail: signalResult.detail,
  };
}

/* =========================
 * SAMPLE SELF TEST
 * ========================= */
function runDemo() {
  const candles = [
    { open: 66440, high: 66460, low: 66390, close: 66400, tickVolume: 100 },
    { open: 66400, high: 66410, low: 66350, close: 66360, tickVolume: 110 },
    { open: 66360, high: 66380, low: 66320, close: 66330, tickVolume: 120 },
    { open: 66330, high: 66350, low: 66300, close: 66340, tickVolume: 90 }, // pullback green
    { open: 66340, high: 66345, low: 66270, close: 66280, tickVolume: 140 }, // continuation red
    { open: 66280, high: 66290, low: 66240, close: 66255, tickVolume: 150 },
  ];

  const signal = evaluateMicroScalp({
    candles,
    spread: 8,
    openPositions: [],
    config: {
      enabled: true,
      minScore: 45,
      maxSpread: 20,
      maxHoldBars: 2,
      maxLossUsd: 8,
      minProfitToClose: 2,
    },
  });

  console.log("=== MICRO SCALP SIGNAL ===");
  console.log(JSON.stringify(signal, null, 2));

  const closeDecision = shouldCloseMicroScalp({
    side: "SELL",
    position: { profit: 2.5 },
    candles,
    openBarIndex: 10,
    currentBarIndex: 11,
    config: {
      maxHoldBars: 2,
      maxLossUsd: 8,
      minProfitToClose: 2,
    },
  });

  console.log("=== CLOSE DECISION ===");
  console.log(JSON.stringify(closeDecision, null, 2));
}

/* =========================
 * EXPORTS
 * ========================= */
module.exports = {
  DEFAULT_CONFIG,

  normalizeCandles,
  calculateTrendScore,
  calculateMomentumScore,
  calculateEntryTimingScore,
  calculateVolumeScore,
  calculateRiskPenalty,
  detectReversalWarning,
  calculateMicroScalpScore,
  detectMicroScalpSignal,

  shouldEmergencyCloseByLoss,
  shouldCloseByProfit,
  shouldCloseByMaxHold,
  isMomentumDeadForSell,
  isMomentumDeadForBuy,
  isStrongOppositeCandle,
  shouldCloseMicroScalp,

  evaluateMicroScalp,
  runDemo,
};
