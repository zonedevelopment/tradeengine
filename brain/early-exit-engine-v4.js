"use strict";

const { findFailedPatternForEarly } = require("../failedPattern.repo");
const {
  buildContextFeatures,
  buildContextHashNew,
} = require("../utils/context-features");

function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function abs(v) {
  return Math.abs(toNumber(v, 0));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function candleBody(c = {}) {
  return abs(toNumber(c.close) - toNumber(c.open));
}

function candleRange(c = {}) {
  return abs(toNumber(c.high) - toNumber(c.low));
}

function isBull(c = {}) {
  return toNumber(c.close) > toNumber(c.open);
}

function isBear(c = {}) {
  return toNumber(c.close) < toNumber(c.open);
}

function avgBody(candles = [], length = 5) {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const sample = candles.slice(-length);
  if (!sample.length) return 0;
  return sample.reduce((sum, c) => sum + candleBody(c), 0) / sample.length;
}

function avgRange(candles = [], length = 5) {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const sample = candles.slice(-length);
  if (!sample.length) return 0;
  return sample.reduce((sum, c) => sum + candleRange(c), 0) / sample.length;
}

function normalizeMode(mode = "NORMAL") {
  const m = String(mode || "NORMAL").toUpperCase();
  if (m === "MICRO_SCALP") return "MICRO_SCALP";
  if (m === "SCALP") return "SCALP";
  return "NORMAL";
}

function getExitProfile(mode = "NORMAL") {
  const normalized = normalizeMode(mode);

  if (normalized === "MICRO_SCALP") {
    return {
      minProfitToProtect: 0.10,
      moveToBeMinProfit: 0.25,
      takeProfitOnRetractionMinProfit: 0.30,
      simpleCutMinutes: 2,
      simpleCutProfit: -0.12,
      strongCutProfit: -0.08,
      reversalCutScore: 1.6,
    };
  }

  if (normalized === "SCALP") {
    return {
      minProfitToProtect: 0.20,
      moveToBeMinProfit: 0.40,
      takeProfitOnRetractionMinProfit: 0.50,
      simpleCutMinutes: 4,
      simpleCutProfit: -0.20,
      strongCutProfit: -0.12,
      reversalCutScore: 2.0,
    };
  }

  return {
    minProfitToProtect: 0.60,
    moveToBeMinProfit: 0.90,
    takeProfitOnRetractionMinProfit: 1.10,
    simpleCutMinutes: 10,
    simpleCutProfit: -0.35,
    strongCutProfit: -0.20,
    reversalCutScore: 2.6,
  };
}

function getProgressToTarget(openPosition = {}, currentProfit = 0, tpPoints = 0, slPoints = 0) {
  const entryPrice = toNumber(
    openPosition.entryPrice ??
    openPosition.entry ??
    openPosition.openPrice ??
    openPosition.price ??
    0
  );

  const currentPrice = toNumber(
    openPosition.currentPrice ??
    openPosition.current_price ??
    openPosition.marketPrice ??
    openPosition.lastPrice ??
    openPosition.price_now ??
    0
  );

  const stopLossPrice = toNumber(
    openPosition.sl ??
    openPosition.stopLoss ??
    openPosition.stop_loss ??
    0
  );

  const takeProfitPrice = toNumber(
    openPosition.tp ??
    openPosition.takeProfit ??
    openPosition.take_profit ??
    0
  );

  const side = String(openPosition.side || "").toUpperCase();

  let profitDistance = 0;
  let targetDistance = 0;
  let riskDistance = 0;

  if (!entryPrice || !currentPrice || !side) {
    return {
      progressToTarget: 0,
      progressToRisk: 0,
    };
  }

  if (side === "BUY") {
    profitDistance = currentPrice - entryPrice;
    targetDistance =
      takeProfitPrice > entryPrice ? takeProfitPrice - entryPrice : toNumber(tpPoints, 0);
    riskDistance =
      stopLossPrice > 0 && stopLossPrice < entryPrice
        ? entryPrice - stopLossPrice
        : toNumber(slPoints, 0);
  } else if (side === "SELL") {
    profitDistance = entryPrice - currentPrice;
    targetDistance =
      takeProfitPrice > 0 && takeProfitPrice < entryPrice
        ? entryPrice - takeProfitPrice
        : toNumber(tpPoints, 0);
    riskDistance =
      stopLossPrice > entryPrice
        ? stopLossPrice - entryPrice
        : toNumber(slPoints, 0);
  }

  return {
    progressToTarget:
      targetDistance > 0 && profitDistance > 0 ? profitDistance / targetDistance : 0,
    progressToRisk:
      riskDistance > 0 && profitDistance > 0 ? profitDistance / riskDistance : 0,
  };
}

function getPeakProfit(openPosition = {}, currentProfit = 0) {
  const rawPeak =
    openPosition.maxProfit ??
    openPosition.peakProfit ??
    openPosition.maxFloatingProfit ??
    openPosition.max_profit ??
    null;

  const peak = toNumber(rawPeak, toNumber(currentProfit, 0));
  return Math.max(peak, toNumber(currentProfit, 0));
}

function getProfitRetractionRatio(openPosition = {}, currentProfit = 0) {
  const peakProfit = getPeakProfit(openPosition, currentProfit);
  const profit = toNumber(currentProfit, 0);

  if (peakProfit <= 0 || profit <= 0 || peakProfit <= profit) return 0;
  return clamp((peakProfit - profit) / peakProfit, 0, 1);
}

function shouldMoveToBreakeven(currentProfit = 0, mode = "NORMAL") {
  const profile = getExitProfile(mode);
  return currentProfit >= profile.moveToBeMinProfit;
}

function detectReversalScore(candles = [], side = "", mode = "NORMAL") {
  if (!Array.isArray(candles) || candles.length < 3) return 0;

  let score = 0;
  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};
  const prev2 = candles[candles.length - 3] || {};
  const avgB = avgBody(candles, 5) || candleBody(last) || 1;
  const avgR = avgRange(candles, 5) || candleRange(last) || 1;
  const normalizedMode = normalizeMode(mode);

  if (side === "BUY") {
    if (isBear(last)) score += 0.9;
    if (isBear(last) && isBear(prev)) score += 0.8;
    if (candleBody(last) > avgB * 1.1) score += 0.5;
    if (toNumber(last.close) < Math.min(toNumber(prev.low), toNumber(prev2.low))) score += 1.2;
  } else if (side === "SELL") {
    if (isBull(last)) score += 0.9;
    if (isBull(last) && isBull(prev)) score += 0.8;
    if (candleBody(last) > avgB * 1.1) score += 0.5;
    if (toNumber(last.close) > Math.max(toNumber(prev.high), toNumber(prev2.high))) score += 1.2;
  }

  if (candleRange(last) > avgR * 1.1) score += 0.3;

  if (normalizedMode === "MICRO_SCALP") score *= 1.05;
  if (normalizedMode === "NORMAL") score *= 0.95;

  return Number(Math.max(0, score).toFixed(2));
}

function detectExitConfirmation(candles = [], side = "") {
  if (!Array.isArray(candles) || candles.length < 3) {
    return {
      level: "NONE",
      score: 0,
      hasStructureBreak: false,
    };
  }

  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};
  const prev2 = candles[candles.length - 3] || {};
  let score = 0;
  let hasStructureBreak = false;

  if (side === "BUY") {
    if (isBear(last)) score += 0.8;
    if (isBear(last) && isBear(prev)) score += 0.8;
    if (toNumber(last.close) < Math.min(toNumber(prev.low), toNumber(prev2.low))) {
      score += 1.1;
      hasStructureBreak = true;
    }
  } else if (side === "SELL") {
    if (isBull(last)) score += 0.8;
    if (isBull(last) && isBull(prev)) score += 0.8;
    if (toNumber(last.close) > Math.max(toNumber(prev.high), toNumber(prev2.high))) {
      score += 1.1;
      hasStructureBreak = true;
    }
  }

  let level = "NONE";
  if (score >= 1.8) level = "STRONG";
  else if (score >= 1.0) level = "MEDIUM";
  else if (score > 0) level = "LIGHT";

  return {
    level,
    score: Number(score.toFixed(2)),
    hasStructureBreak,
  };
}

function shouldSimpleCutLoss({
  mode = "NORMAL",
  currentProfit = 0,
  holdingMinutes = 0,
  reversalScore = 0,
  confirmation = { hasStructureBreak: false },
}) {
  const safeMode = normalizeMode(mode);
  const profit = Number(currentProfit || 0);
  const mins = Number(holdingMinutes || 0);
  const profile = getExitProfile(safeMode);

  if (profit >= 0) return null;

  if (profit <= profile.simpleCutProfit) {
    return {
      action: "CUT_LOSS_NOW",
      reason: `${safeMode}_SIMPLE_PROFIT_THRESHOLD`,
    };
  }

  if (mins >= profile.simpleCutMinutes && profit < 0) {
    return {
      action: "CUT_LOSS_NOW",
      reason: `${safeMode}_SIMPLE_TIMEOUT_LOSS`,
    };
  }

  if (
    profit <= profile.strongCutProfit &&
    (
      reversalScore >= profile.reversalCutScore ||
      confirmation.hasStructureBreak
    )
  ) {
    return {
      action: "CUT_LOSS_NOW",
      reason: `${safeMode}_REVERSAL_DEFENSIVE_CUT`,
    };
  }

  return null;
}

function shouldTakeProfitOnLowVolume({
  historicalVolumeSignal = null,
  holdingMinutes = 0,
  currentProfit = 0,
  mode = "NORMAL",
}) {
  const hv = String(historicalVolumeSignal || "").toUpperCase();
  if (hv !== "LOW_VOLUME") return false;
  if (currentProfit <= 0) return false;

  const safeMode = normalizeMode(mode);

  if (safeMode === "MICRO_SCALP") return holdingMinutes >= 4;
  if (safeMode === "SCALP") return holdingMinutes >= 6;
  return holdingMinutes >= 15;
}

async function findFailedPatternRule({
  userId,
  accountId = null,
  symbol,
  timeframe,
  side,
  mode,
  pattern,
  price,
  candlesM,
}) {
  const contextFeatures = buildContextFeatures({
    symbol,
    timeframe,
    side,
    mode,
    pattern,
    marketPrice: price || 0,
    candlesM,
    now: new Date(),
  });

  const contextHash = buildContextHashNew(contextFeatures);

  return await findFailedPatternForEarly({
    userId: userId || null,
    accountId,
    symbol,
    timeframe,
    side,
    mode,
    contextHash,
  });
}

async function analyzeEarlyExit({
  firebaseUserId,
  symbol,
  openPosition,
  currentProfit = 0,
  candles = [],
  mode = "NORMAL",
  price,
  tpPoints = 0,
  slPoints = 0,
  historicalVolume = null,
  holdingMinutes = 0,
  pattern,
}) {
  if (!openPosition || !openPosition.side) {
    return {
      action: "HOLD",
      reason: "Invalid position data",
      riskLevel: "UNKNOWN",
      score: 0,
    };
  }

  if (!candles || candles.length < 3) {
    return {
      action: "HOLD",
      reason: "Not enough candles",
      riskLevel: "UNKNOWN",
      score: 0,
    };
  }

  const side = String(openPosition.side || "").toUpperCase();
  const normalizedMode = normalizeMode(mode || openPosition.mode || "NORMAL");
  const profile = getExitProfile(normalizedMode);
  const profit = toNumber(currentProfit, 0);
  const historicalVolumeSignal = historicalVolume?.signal || historicalVolume || null;

  if (!openPosition.currentPrice && price) {
    openPosition = {
      ...openPosition,
      currentPrice: price,
    };
  }

  const confirmation = detectExitConfirmation(candles, side);
  const baseReversalScore = detectReversalScore(candles, side, normalizedMode);

  let adjustedScore = baseReversalScore;
  let riskLevel = "LOW";
  let failRate = 0;

  const failedPattern = await findFailedPatternRule({
    userId: firebaseUserId || null,
    accountId: openPosition?.accountId ?? null,
    symbol,
    timeframe: "M5",
    side,
    mode: normalizedMode,
    pattern,
    price,
    candlesM: candles,
  });

  if (failedPattern) {
    failRate = parseFloat(failedPattern.fail_rate || 0);
    if (failRate >= 0.8) {
      riskLevel = "CRITICAL";
      adjustedScore += 0.8;
    } else if (failRate >= 0.6) {
      riskLevel = "HIGH";
      adjustedScore += 0.5;
    } else if (failRate >= 0.45) {
      riskLevel = "MEDIUM";
      adjustedScore += 0.2;
    }
  }

  adjustedScore += confirmation.score * 0.4;
  adjustedScore = Number(adjustedScore.toFixed(2));

  const simpleCut = shouldSimpleCutLoss({
    mode: normalizedMode,
    currentProfit: profit,
    holdingMinutes,
    reversalScore: adjustedScore,
    confirmation,
  });

  if (simpleCut) {
    return {
      action: simpleCut.action,
      reason: simpleCut.reason,
      riskLevel: "HIGH",
      score: adjustedScore,
    };
  }

  if (
    profit > 0 &&
    shouldMoveToBreakeven(profit, normalizedMode)
  ) {
    return {
      action: "MOVE_TO_BE",
      reason: "Price progressed enough, move SL to breakeven",
      riskLevel,
      score: adjustedScore,
    };
  }

  if (
    profit > 0 &&
    shouldTakeProfitOnLowVolume({
      historicalVolumeSignal,
      holdingMinutes,
      currentProfit: profit,
      mode: normalizedMode,
    })
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: `${normalizedMode}_LOW_VOLUME_PROTECT`,
      riskLevel,
      score: adjustedScore,
    };
  }

  const profitRetractionRatio = getProfitRetractionRatio(openPosition, profit);
  const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);

  if (
    profit > 0 &&
    profit >= profile.takeProfitOnRetractionMinProfit &&
    progress.progressToTarget >= 0.40 &&
    profitRetractionRatio >= 0.30
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: `${normalizedMode}_PROFIT_RETRACTION_PROTECT`,
      riskLevel,
      score: adjustedScore,
    };
  }

  return {
    action: "HOLD",
    reason: `No strong exit signal (score=${adjustedScore}, mode=${normalizedMode}, confirm=${confirmation.level})`,
    riskLevel,
    score: adjustedScore,
  };
}

module.exports = {
  analyzeEarlyExit,
};