"use strict";

const { findFailedPatternForEarly } = require("../failedPattern.repo");
const {
  buildContextFeatures,
  buildContextHashNew,
} = require("../utils/context-features");

function isGoldSymbol(symbol = "") {
  const s = String(symbol || "").toUpperCase();
  return s === "XAUUSD" || s === "XAUUSDM";
}

function isBtcLikeSymbol(symbol = "") {
  return String(symbol || "").toUpperCase().includes("BTC");
}

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

function candleBody(c) {
  return abs(toNumber(c.close) - toNumber(c.open));
}

function candleRange(c) {
  return abs(toNumber(c.high) - toNumber(c.low));
}

function isBull(c) {
  return toNumber(c.close) > toNumber(c.open);
}

function isBear(c) {
  return toNumber(c.close) < toNumber(c.open);
}

function upperWick(c) {
  return Math.max(
    0,
    toNumber(c.high) - Math.max(toNumber(c.close), toNumber(c.open))
  );
}

function lowerWick(c) {
  return Math.max(
    0,
    Math.min(toNumber(c.close), toNumber(c.open)) - toNumber(c.low)
  );
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

// function getExitProfile(mode = "NORMAL") {
//   const normalized = normalizeMode(mode);

//   if (normalized === "MICRO_SCALP") {
//     return {
//       minProfitToProtect: 0.10,
//       minProfitForHighRiskExit: 0.28,
//       minProfitForStrongReversalExit: 0.34,
//       moveToBeMinR: 0.62,
//       moveToBeMinProgressToTarget: 0.38,
//       strongReversalThresholdProfit: 4.7,
//       hardCutLossReversalThreshold: 4.3,
//       mediumBounceThreshold: 2.9,
//       scalpTimeoutLowVolumeMinutes: 15,
//       scalpTimeoutNoProgressMinutes: 17,
//       smallProfitMaxProgressToTarget: 0.24,
//       smallProfitMinPullbackFromPeak: 0.34,
//       scalpMaxHoldingBars: 4,
//       scalpMinExpectedProgressToTarget: 0.30,
//       scalpStructureFailureLoss: -0.22,
//       scalpFailedContinuationLoss: -0.18,
//     };
//   }

//   if (normalized === "SCALP") {
//     return {
//       minProfitToProtect: 0.35,
//       minProfitForHighRiskExit: 0.75,
//       minProfitForStrongReversalExit: 0.95,
//       moveToBeMinR: 0.82,
//       moveToBeMinProgressToTarget: 0.42,
//       strongReversalThresholdProfit: 5.0,
//       hardCutLossReversalThreshold: 4.6,
//       mediumBounceThreshold: 3.2,
//       scalpTimeoutLowVolumeMinutes: 18,
//       scalpTimeoutNoProgressMinutes: 21,
//       smallProfitMaxProgressToTarget: 0.26,
//       smallProfitMinPullbackFromPeak: 0.32,
//       scalpMaxHoldingBars: 5,
//       scalpMinExpectedProgressToTarget: 0.35,
//       scalpStructureFailureLoss: -0.35,
//       scalpFailedContinuationLoss: -0.25,
//     };
//   }

//   return {
//     minProfitToProtect: 0.75,
//     minProfitForHighRiskExit: 1.35,
//     minProfitForStrongReversalExit: 1.65,
//     moveToBeMinR: 1.0,
//     moveToBeMinProgressToTarget: 0.48,
//     strongReversalThresholdProfit: 5.3,
//     hardCutLossReversalThreshold: 4.9,
//     mediumBounceThreshold: 3.4,
//     scalpTimeoutLowVolumeMinutes: 30,
//     scalpTimeoutNoProgressMinutes: 34,
//     smallProfitMaxProgressToTarget: 0.22,
//     smallProfitMinPullbackFromPeak: 0.36,
//     scalpMaxHoldingBars: 8,
//     scalpMinExpectedProgressToTarget: 0.42,
//     scalpStructureFailureLoss: -0.55,
//     scalpFailedContinuationLoss: -0.45,
//   };
// }

function getExitProfile(mode = "NORMAL") {
  const normalized = normalizeMode(mode);

  if (normalized === "MICRO_SCALP") {
    return {
      minProfitToProtect: 0.08,
      minProfitForHighRiskExit: 0.20,
      minProfitForStrongReversalExit: 0.26,
      moveToBeMinR: 0.42,
      moveToBeMinProgressToTarget: 0.24,
      strongReversalThresholdProfit: 3.6,
      hardCutLossReversalThreshold: 3.2,
      mediumBounceThreshold: 2.2,
      scalpTimeoutLowVolumeMinutes: 7,
      scalpTimeoutNoProgressMinutes: 9,
      smallProfitMaxProgressToTarget: 0.52,
      smallProfitMinPullbackFromPeak: 0.22,
      scalpMaxHoldingBars: 2,
      scalpMinExpectedProgressToTarget: 0.18,
      scalpStructureFailureLoss: -0.12,
      scalpFailedContinuationLoss: -0.10,
    };
  }

  if (normalized === "SCALP") {
    return {
      minProfitToProtect: 0.18,
      minProfitForHighRiskExit: 0.42,
      minProfitForStrongReversalExit: 0.56,
      moveToBeMinR: 0.56,
      moveToBeMinProgressToTarget: 0.28,
      strongReversalThresholdProfit: 3.9,
      hardCutLossReversalThreshold: 3.5,
      mediumBounceThreshold: 2.5,
      scalpTimeoutLowVolumeMinutes: 10,
      scalpTimeoutNoProgressMinutes: 12,
      smallProfitMaxProgressToTarget: 0.58,
      smallProfitMinPullbackFromPeak: 0.20,
      scalpMaxHoldingBars: 3,
      scalpMinExpectedProgressToTarget: 0.22,
      scalpStructureFailureLoss: -0.18,
      scalpFailedContinuationLoss: -0.14,
    };
  }

  return {
    minProfitToProtect: 0.75,
    minProfitForHighRiskExit: 1.35,
    minProfitForStrongReversalExit: 1.65,
    moveToBeMinR: 1.0,
    moveToBeMinProgressToTarget: 0.48,
    strongReversalThresholdProfit: 5.3,
    hardCutLossReversalThreshold: 4.9,
    mediumBounceThreshold: 3.4,
    scalpTimeoutLowVolumeMinutes: 30,
    scalpTimeoutNoProgressMinutes: 34,
    smallProfitMaxProgressToTarget: 0.22,
    smallProfitMinPullbackFromPeak: 0.36,
    scalpMaxHoldingBars: 8,
    scalpMinExpectedProgressToTarget: 0.42,
    scalpStructureFailureLoss: -0.55,
    scalpFailedContinuationLoss: -0.45,
  };
}

function getProgressToTarget(openPosition, currentProfit, tpPoints = 0, slPoints = 0) {
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
      entryPrice,
      currentPrice,
      stopLossPrice,
      takeProfitPrice,
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

  const progressToTarget =
    targetDistance > 0 && profitDistance > 0 ? profitDistance / targetDistance : 0;

  const progressToRisk =
    riskDistance > 0 && profitDistance > 0 ? profitDistance / riskDistance : 0;

  return {
    progressToTarget,
    progressToRisk,
    entryPrice,
    currentPrice,
    stopLossPrice,
    takeProfitPrice,
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

function shouldMoveToBreakeven(openPosition, currentProfit, side, tpPoints = 0, slPoints = 0, mode = "NORMAL") {
  const profile = getExitProfile(mode);
  const progress = getProgressToTarget(openPosition, currentProfit, tpPoints, slPoints);

  if (currentProfit <= 0) return false;

  return (
    progress.progressToRisk >= profile.moveToBeMinR &&
    progress.progressToTarget >= profile.moveToBeMinProgressToTarget
  );
}

function detectReversalScore(candles, side, mode = "NORMAL") {
  let score = 0;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const avgB = avgBody(candles, 5) || candleBody(last) || 1;
  const avgR = avgRange(candles, 5) || candleRange(last) || 1;
  const normalizedMode = normalizeMode(mode);

  if (side === "BUY") {
    if (isBear(last)) score += 0.9;
    if (isBear(last) && isBear(prev)) score += 0.7;
  }

  if (side === "SELL") {
    if (isBull(last)) score += 0.9;
    if (isBull(last) && isBull(prev)) score += 0.7;
  }

  const body1 = candleBody(last);
  const body2 = candleBody(prev);
  const body3 = candleBody(prev2);

  if (body1 < body2 && body2 < body3) {
    score += 0.8;
  }

  if (side === "SELL" && isBull(last) && body1 > avgB * 1.2) {
    score += 1.0;
  }
  if (side === "BUY" && isBear(last) && body1 > avgB * 1.2) {
    score += 1.0;
  }

  const upWick = upperWick(last);
  const lowWick = lowerWick(last);

  if (side === "BUY" && upWick > Math.max(body1, 0.0001) * 1.6) {
    score += 1.0;
  }

  if (side === "SELL" && lowWick > Math.max(body1, 0.0001) * 1.6) {
    score += 1.0;
  }

  const lastRange = candleRange(last);
  const prevMid = (toNumber(prev.open) + toNumber(prev.close)) / 2;
  const recentCandles = candles.slice(-5, -1);

  if (side === "BUY") {
    if (
      isBear(last) &&
      lastRange >= avgR * 1.15 &&
      toNumber(last.close) < prevMid
    ) {
      score += 0.9;
    }
  }

  if (side === "SELL") {
    if (
      isBull(last) &&
      lastRange >= avgR * 1.15 &&
      toNumber(last.close) > prevMid
    ) {
      score += 0.9;
    }
  }

  if (recentCandles.length >= 3) {
    const recentHigh = Math.max(...recentCandles.map(c => toNumber(c.high, 0)));
    const recentLow = Math.min(...recentCandles.map(c => toNumber(c.low, 0)));

    if (side === "BUY" && toNumber(last.close) < recentLow) {
      score += 2.2;
    }

    if (side === "SELL" && toNumber(last.close) > recentHigh) {
      score += 2.2;
    }
  }

  const isSmallCounterMove =
    lastRange < avgR * 0.9 &&
    body1 < avgB * 1.0;

  if (isSmallCounterMove) {
    score -= 0.6;
  }

  if (normalizedMode === "NORMAL") {
    score = score * 0.95;
  } else if (normalizedMode === "MICRO_SCALP") {
    score = score * 1.05;
  }

  return Math.max(0, Number(score.toFixed(2)));
}

function detectExitConfirmation(candles = [], side = "") {
  if (!Array.isArray(candles) || candles.length < 3) {
    return {
      level: "NONE",
      score: 0,
      hasFollowThrough: false,
      hasStructureBreak: false,
    };
  }

  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};
  const prev2 = candles[candles.length - 3] || {};
  const avgB = avgBody(candles, 5) || Math.max(candleBody(last), 1);
  const avgR = avgRange(candles, 5) || Math.max(candleRange(last), 1);

  let score = 0;
  let hasFollowThrough = false;
  let hasStructureBreak = false;

  if (side === "BUY") {
    if (isBear(last) && candleBody(last) >= avgB * 1.15) {
      score += 1.2;
      hasFollowThrough = true;
    }
    if (isBear(last) && isBear(prev)) {
      score += 1.0;
      hasFollowThrough = true;
    }
    if (
      isBear(last) &&
      candleRange(last) >= avgR * 1.15 &&
      toNumber(last.close) < ((toNumber(prev.open) + toNumber(prev.close)) / 2)
    ) {
      score += 0.9;
      hasFollowThrough = true;
    }
    if (toNumber(last.close) < Math.min(toNumber(prev.low), toNumber(prev2.low))) {
      score += 1.6;
      hasStructureBreak = true;
    }
  } else if (side === "SELL") {
    if (isBull(last) && candleBody(last) >= avgB * 1.15) {
      score += 1.2;
      hasFollowThrough = true;
    }
    if (isBull(last) && isBull(prev)) {
      score += 1.0;
      hasFollowThrough = true;
    }
    if (
      isBull(last) &&
      candleRange(last) >= avgR * 1.15 &&
      toNumber(last.close) > ((toNumber(prev.open) + toNumber(prev.close)) / 2)
    ) {
      score += 0.9;
      hasFollowThrough = true;
    }
    if (toNumber(last.close) > Math.max(toNumber(prev.high), toNumber(prev2.high))) {
      score += 1.6;
      hasStructureBreak = true;
    }
  }

  let level = "NONE";
  if (score >= 2.4) level = "STRONG";
  else if (score >= 1.2) level = "MEDIUM";
  else if (score > 0) level = "LIGHT";

  return {
    level,
    score: Number(score.toFixed(2)),
    hasFollowThrough,
    hasStructureBreak,
  };
}

function findPivotHighs(candles = []) {
  const result = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (
      toNumber(curr.high) > toNumber(prev.high) &&
      toNumber(curr.high) >= toNumber(next.high)
    ) {
      result.push({ index: i, value: toNumber(curr.high) });
    }
  }
  return result;
}

function findPivotLows(candles = []) {
  const result = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (
      toNumber(curr.low) < toNumber(prev.low) &&
      toNumber(curr.low) <= toNumber(next.low)
    ) {
      result.push({ index: i, value: toNumber(curr.low) });
    }
  }
  return result;
}

function buildShortStructureState(candles = [], lookback = 10) {
  const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
  const highs = findPivotHighs(sample);
  const lows = findPivotLows(sample);

  let hh = false;
  let hl = false;
  let lh = false;
  let ll = false;

  if (highs.length >= 2) {
    const a = highs[highs.length - 2].value;
    const b = highs[highs.length - 1].value;
    if (b > a) hh = true;
    if (b < a) lh = true;
  }

  if (lows.length >= 2) {
    const a = lows[lows.length - 2].value;
    const b = lows[lows.length - 1].value;
    if (b > a) hl = true;
    if (b < a) ll = true;
  }

  let structure = "NEUTRAL";
  if (hh && hl) structure = "HH_HL";
  else if (lh && ll) structure = "LH_LL";
  else if (hh && !hl) structure = "HH_ONLY";
  else if (hl && !hh) structure = "HL_ONLY";
  else if (lh && !ll) structure = "LH_ONLY";
  else if (ll && !lh) structure = "LL_ONLY";

  return {
    structure,
    hh,
    hl,
    lh,
    ll,
    pivotHighCount: highs.length,
    pivotLowCount: lows.length,
  };
}

function detectFailedScalpContinuation(candles = [], side = "") {
  if (!Array.isArray(candles) || candles.length < 4) {
    return {
      failed: false,
      score: 0,
      reason: "NOT_ENOUGH_CANDLES",
    };
  }

  const c1 = candles[candles.length - 1];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 3];
  const c4 = candles[candles.length - 4];

  let score = 0;

  if (side === "BUY") {
    const lowerHigh =
      toNumber(c1.high) < toNumber(c2.high) &&
      toNumber(c2.high) <= toNumber(c3.high);

    const weakBounce =
      toNumber(c1.close) <= toNumber(c2.close) &&
      toNumber(c2.close) <= toNumber(c3.close);

    const failedReclaim =
      toNumber(c2.high) < toNumber(c4.high) &&
      toNumber(c1.close) < toNumber(c2.open);

    if (lowerHigh) score += 1.0;
    if (weakBounce) score += 0.8;
    if (failedReclaim) score += 1.1;
  } else if (side === "SELL") {
    const higherLow =
      toNumber(c1.low) > toNumber(c2.low) &&
      toNumber(c2.low) >= toNumber(c3.low);

    const weakDrop =
      toNumber(c1.close) >= toNumber(c2.close) &&
      toNumber(c2.close) >= toNumber(c3.close);

    const failedBreakdown =
      toNumber(c2.low) > toNumber(c4.low) &&
      toNumber(c1.close) > toNumber(c2.open);

    if (higherLow) score += 1.0;
    if (weakDrop) score += 0.8;
    if (failedBreakdown) score += 1.1;
  }

  return {
    failed: score >= 1.8,
    score: Number(score.toFixed(2)),
    reason: score >= 1.8 ? "FAILED_SCALP_CONTINUATION" : "CONTINUATION_OK",
  };
}

function detectStructureFailure(candles = [], side = "") {
  const structure = buildShortStructureState(candles, 10);

  let failed = false;
  let score = 0;

  if (side === "BUY") {
    if (
      structure.structure === "LH_LL" ||
      structure.structure === "LL_ONLY" ||
      structure.structure === "LH_ONLY"
    ) {
      failed = true;
      score = 2.2;
    }
  } else if (side === "SELL") {
    if (
      structure.structure === "HH_HL" ||
      structure.structure === "HH_ONLY" ||
      structure.structure === "HL_ONLY"
    ) {
      failed = true;
      score = 2.2;
    }
  }

  return {
    failed,
    score,
    structure,
  };
}

function getApproxBarsHeld(holdingMinutes = 0, timeframeMinutes = 5) {
  const mins = Math.max(0, toNumber(holdingMinutes, 0));
  const tf = Math.max(1, toNumber(timeframeMinutes, 5));
  return mins / tf;
}

function getLowVolumeProfitHoldLimitMinutes({ mode = "NORMAL", symbol = "" }) {
  const upperMode = String(mode || "NORMAL").toUpperCase();

  if (isGoldSymbol(symbol)) {
    return upperMode === "MICRO_SCALP" ? 16 : upperMode === "SCALP" ? 20 : 36;
  }

  if (isBtcLikeSymbol(symbol)) {
    return upperMode === "MICRO_SCALP" ? 15 : upperMode === "SCALP" ? 18 : 34;
  }

  return upperMode === "MICRO_SCALP" ? 14 : upperMode === "SCALP" ? 18 : 32;
}

// function shouldExitScalpTimeout({
//   mode = "NORMAL",
//   currentProfit = 0,
//   holdingMinutes = 0,
//   historicalVolumeSignal = null,
//   openPosition = {},
//   tpPoints = 0,
//   slPoints = 0,
//   candles = [],
//   side = "",
// }) {
//   const normalizedMode = String(mode || "NORMAL").toUpperCase();
//   if (normalizedMode !== "SCALP" && normalizedMode !== "MICRO_SCALP") return null;

//   const profit = toNumber(currentProfit, 0);
//   const mins = toNumber(holdingMinutes, 0);
//   const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);
//   const profile = getExitProfile(normalizedMode);
//   const confirmation = detectExitConfirmation(candles, side);
//   const profitRetractionRatio = getProfitRetractionRatio(openPosition, profit);

//   if (
//     String(historicalVolumeSignal || "").toUpperCase() === "LOW_VOLUME" &&
//     mins >= profile.scalpTimeoutLowVolumeMinutes &&
//     profit > 0 &&
//     progress.progressToTarget < profile.smallProfitMaxProgressToTarget &&
//     profitRetractionRatio >= profile.smallProfitMinPullbackFromPeak &&
//     confirmation.level !== "NONE"
//   ) {
//     return {
//       action: "TAKE_SMALL_PROFIT",
//       reason: "SCALP_TIMEOUT_LOW_VOLUME_CONFIRMED",
//     };
//   }

//   if (
//     mins >= profile.scalpTimeoutNoProgressMinutes &&
//     profit < 0 &&
//     progress.progressToTarget < 0.18 &&
//     confirmation.level === "STRONG"
//   ) {
//     return {
//       action: "CUT_LOSS_NOW",
//       reason: "SCALP_TIMEOUT_NO_PROGRESS_CONFIRMED",
//     };
//   }

//   return null;
// }
function shouldExitScalpTimeout({
  mode = "NORMAL",
  currentProfit = 0,
  holdingMinutes = 0,
  historicalVolumeSignal = null,
  openPosition = {},
  tpPoints = 0,
  slPoints = 0,
  candles = [],
  side = "",
}) {
  const normalizedMode = String(mode || "NORMAL").toUpperCase();
  if (normalizedMode !== "SCALP" && normalizedMode !== "MICRO_SCALP") return null;

  const profit = toNumber(currentProfit, 0);
  const mins = toNumber(holdingMinutes, 0);
  const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);
  const profile = getExitProfile(normalizedMode);
  const confirmation = detectExitConfirmation(candles, side);
  const profitRetractionRatio = getProfitRetractionRatio(openPosition, profit);

  if (
    String(historicalVolumeSignal || "").toUpperCase() === "LOW_VOLUME" &&
    mins >= profile.scalpTimeoutLowVolumeMinutes &&
    profit > 0 &&
    progress.progressToTarget < profile.smallProfitMaxProgressToTarget &&
    (
      profitRetractionRatio >= profile.smallProfitMinPullbackFromPeak ||
      confirmation.level === "STRONG"
    )
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: "SCALP_TIMEOUT_LOW_VOLUME_FAST",
    };
  }

  if (
    mins >= profile.scalpTimeoutNoProgressMinutes &&
    profit > 0 &&
    progress.progressToTarget < 0.35 &&
    confirmation.level !== "NONE"
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: "SCALP_TIMEOUT_STALLED_PROFIT",
    };
  }

  if (
    mins >= profile.scalpTimeoutNoProgressMinutes &&
    profit < 0 &&
    progress.progressToTarget < 0.22 &&
    confirmation.level !== "NONE"
  ) {
    return {
      action: "CUT_LOSS_NOW",
      reason: "SCALP_TIMEOUT_NO_PROGRESS_FAST",
    };
  }

  return null;
}

// function shouldCutWeakScalpTrade({
//   mode = "NORMAL",
//   currentProfit = 0,
//   holdingMinutes = 0,
//   reversalScore = 0,
//   candles = [],
//   side = "",
// }) {
//   const normalizedMode = String(mode || "NORMAL").toUpperCase();
//   if (normalizedMode !== "SCALP" && normalizedMode !== "MICRO_SCALP") return false;

//   const profit = toNumber(currentProfit, 0);
//   if (profit > -0.25) return false;
//   if (toNumber(holdingMinutes, 0) < 8) return false;

//   const last = candles[candles.length - 1] || {};
//   const prev = candles[candles.length - 2] || {};
//   const lastBody = candleBody(last);
//   const prevBody = candleBody(prev);
//   const avgB = avgBody(candles, 5) || 1;
//   const confirmation = detectExitConfirmation(candles, side);

//   const weakMomentum =
//     lastBody < avgB * 0.75 &&
//     prevBody < avgB * 0.9;

//   return weakMomentum && reversalScore >= 1.6 && confirmation.level === "STRONG";
// }
function shouldCutWeakScalpTrade({
  mode = "NORMAL",
  currentProfit = 0,
  holdingMinutes = 0,
  reversalScore = 0,
  candles = [],
  side = "",
}) {
  const normalizedMode = String(mode || "NORMAL").toUpperCase();
  if (normalizedMode !== "SCALP" && normalizedMode !== "MICRO_SCALP") return false;

  const profit = toNumber(currentProfit, 0);
  const mins = toNumber(holdingMinutes, 0);

  if (normalizedMode === "MICRO_SCALP") {
    if (profit > -0.12) return false;
    if (mins < 4) return false;
  } else {
    if (profit > -0.18) return false;
    if (mins < 5) return false;
  }

  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};
  const lastBody = candleBody(last);
  const prevBody = candleBody(prev);
  const avgB = avgBody(candles, 5) || 1;
  const confirmation = detectExitConfirmation(candles, side);

  const weakMomentum =
    lastBody < avgB * 0.85 &&
    prevBody < avgB * 0.95;

  return weakMomentum && reversalScore >= 1.2 && confirmation.level !== "NONE";
}

function shouldTakeProfitOnLowVolume({
  symbol = "",
  mode = "NORMAL",
  historicalVolumeSignal = null,
  holdingMinutes = 0,
  currentProfit = 0,
  openPosition = {},
  tpPoints = 0,
  slPoints = 0,
  candles = [],
  side = "",
}) {
  if (String(historicalVolumeSignal || "").toUpperCase() !== "LOW_VOLUME") {
    return false;
  }

  const profit = toNumber(currentProfit, 0);
  if (profit <= 0) return false;

  const minHoldMinutes = getLowVolumeProfitHoldLimitMinutes({ mode, symbol });
  const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);
  const confirmation = detectExitConfirmation(candles, side);
  const profitRetractionRatio = getProfitRetractionRatio(openPosition, profit);

  if (toNumber(holdingMinutes, 0) < minHoldMinutes) return false;
  if (progress.progressToTarget >= 0.30) return false;
  if (profitRetractionRatio < 0.35) return false;
  if (confirmation.level === "NONE") return false;

  return true;
}

function shouldTakeSmallProfitByDanger({
  profit = 0,
  profile,
  progress,
  riskLevel = "LOW",
  adjustedScore = 0,
  confirmation,
  openPosition = {},
}) {
  const profitRetractionRatio = getProfitRetractionRatio(openPosition, profit);

  if (profit < profile.minProfitForHighRiskExit) return false;
  if (progress.progressToTarget >= 0.45) return false;
  if (confirmation.level === "NONE") return false;

  if (
    riskLevel === "CRITICAL" &&
    adjustedScore >= profile.strongReversalThresholdProfit &&
    profitRetractionRatio >= profile.smallProfitMinPullbackFromPeak
  ) {
    return true;
  }

  if (
    riskLevel === "HIGH" &&
    adjustedScore >= profile.strongReversalThresholdProfit + 0.15 &&
    profitRetractionRatio >= profile.smallProfitMinPullbackFromPeak
  ) {
    return true;
  }

  return false;
}

function shouldHardExitProfit({
  profit = 0,
  profile,
  progress,
  riskLevel = "LOW",
  adjustedScore = 0,
  confirmation,
}) {
  if (profit < profile.minProfitForStrongReversalExit) return false;
  if (confirmation.level !== "STRONG") return false;

  if (riskLevel === "CRITICAL" && confirmation.hasStructureBreak) {
    return true;
  }

  if (
    adjustedScore >= profile.strongReversalThresholdProfit + 0.5 &&
    confirmation.hasStructureBreak &&
    progress.progressToTarget < 0.38
  ) {
    return true;
  }

  return false;
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

  if (!candles || candles.length < 5) {
    return {
      action: "HOLD",
      reason: "Not enough candles",
      riskLevel: "UNKNOWN",
      score: 0,
    };
  }

  const historicalVolumeSignal = historicalVolume?.signal || null;
  const side = String(openPosition.side || "").toUpperCase();
  const normalizedMode = normalizeMode(mode || openPosition.mode || "NORMAL");
  const profile = getExitProfile(normalizedMode);
  const profit = toNumber(currentProfit, 0);

  const baseReversalScore = detectReversalScore(candles, side, normalizedMode);
  const confirmation = detectExitConfirmation(candles, side);
  const structureFailure = detectStructureFailure(candles, side);
  const failedContinuation = detectFailedScalpContinuation(candles, side);

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

  let adjustedScore = baseReversalScore;
  let riskLevel = "LOW";
  let failRate = 0;
  let suggestedAction = null;

  if (failedPattern) {
    failRate = parseFloat(failedPattern.fail_rate || 0);
    suggestedAction = failedPattern.suggested_action || null;

    if (suggestedAction === "BLOCK_TRADE") {
      riskLevel = "CRITICAL";
      adjustedScore += 2.2;
    } else if (suggestedAction === "WARNING") {
      riskLevel = "HIGH";
      adjustedScore += 0.95;
    } else if (suggestedAction === "REDUCE_SCORE") {
      riskLevel = "MEDIUM";
      adjustedScore += parseFloat(failedPattern.score_penalty || 0.9);
    } else if (suggestedAction === "REDUCE_RISK") {
      riskLevel = "MEDIUM";
      adjustedScore += 0.75;
    }

    if (failRate >= 0.8) {
      riskLevel = "CRITICAL";
      adjustedScore += 1.5;
    } else if (failRate >= 0.65 && riskLevel !== "CRITICAL") {
      riskLevel = "HIGH";
      adjustedScore += 0.9;
    } else if (failRate >= 0.45 && riskLevel === "LOW") {
      riskLevel = "MEDIUM";
      adjustedScore += 0.45;
    }
  }

  adjustedScore += confirmation.score * 0.8;
  adjustedScore += structureFailure.score * 0.65;
  adjustedScore += failedContinuation.score * 0.55;
  adjustedScore = Number(adjustedScore.toFixed(2));

  const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);
  const approxBarsHeld = getApproxBarsHeld(holdingMinutes, 5);

  if (
    shouldCutWeakScalpTrade({
      mode: normalizedMode,
      currentProfit: profit,
      holdingMinutes,
      reversalScore: adjustedScore,
      candles,
      side,
    })
  ) {
    return {
      action: "CUT_LOSS_NOW",
      reason: `WEAK_SCALP_TRADE_TIMEOUT (${holdingMinutes}m)`,
      riskLevel,
      score: adjustedScore,
    };
  }

  if (normalizedMode === "SCALP" || normalizedMode === "MICRO_SCALP") {
    if (
      profit < 0 &&
      approxBarsHeld >= profile.scalpMaxHoldingBars &&
      progress.progressToTarget < profile.scalpMinExpectedProgressToTarget &&
      failedContinuation.failed
    ) {
      return {
        action: "CUT_LOSS_NOW",
        reason: `FAILED_SCALP_CONTINUATION (${approxBarsHeld.toFixed(1)} bars)`,
        riskLevel,
        score: adjustedScore,
      };
    }

    if (
      profit <= profile.scalpStructureFailureLoss &&
      structureFailure.failed &&
      approxBarsHeld >= Math.max(3, profile.scalpMaxHoldingBars - 1)
    ) {
      return {
        action: "CUT_LOSS_NOW",
        reason: `STRUCTURE_FAILURE_SCALP_CUT (${structureFailure.structure.structure})`,
        riskLevel,
        score: adjustedScore,
      };
    }

    if (
      profit <= profile.scalpFailedContinuationLoss &&
      approxBarsHeld >= profile.scalpMaxHoldingBars + 1 &&
      progress.progressToTarget < profile.scalpMinExpectedProgressToTarget
    ) {
      return {
        action: "CUT_LOSS_NOW",
        reason: `SCALP_TIMEOUT_BY_BARS (${approxBarsHeld.toFixed(1)} bars)`,
        riskLevel,
        score: adjustedScore,
      };
    }
  }

  if (profit < 0) {
    if (riskLevel === "CRITICAL" && adjustedScore >= 2.2 && confirmation.level !== "NONE") {
      return {
        action: "CUT_LOSS_NOW",
        reason: `Critical risk from failed pattern (failRate=${failRate})`,
        riskLevel,
        score: adjustedScore,
      };
    }

    if (riskLevel === "HIGH" && adjustedScore >= 3.2 && confirmation.level === "STRONG") {
      return {
        action: "CUT_LOSS_NOW",
        reason: "High risk + strong reversal confirmed",
        riskLevel,
        score: adjustedScore,
      };
    }

    if (
      adjustedScore >= profile.hardCutLossReversalThreshold &&
      confirmation.level === "STRONG"
    ) {
      return {
        action: "CUT_LOSS_NOW",
        reason: "Strong reversal against position confirmed",
        riskLevel,
        score: adjustedScore,
      };
    }
  }

  if (profit > 0) {
    const profitRetractionRatio = getProfitRetractionRatio(openPosition, profit);

    if (
      riskLevel === "CRITICAL" &&
      adjustedScore >= 4.3 &&
      profit >= profile.minProfitForHighRiskExit &&
      progress.progressToTarget >= 0.24 &&
      progress.progressToTarget < 0.5 &&
      holdingMinutes >=
      (normalizedMode === "MICRO_SCALP" ? 9 : normalizedMode === "SCALP" ? 12 : 16) &&
      profitRetractionRatio >= 0.25 &&
      (confirmation.level === "MEDIUM" || confirmation.level === "STRONG")
    ) {
      return {
        action: "TAKE_SMALL_PROFIT",
        reason: "Critical danger override while profitable",
        riskLevel,
        score: adjustedScore,
      };
    }

    if (
      shouldHardExitProfit({
        profit,
        profile,
        progress,
        riskLevel,
        adjustedScore,
        confirmation,
      })
    ) {
      return {
        action: "TAKE_SMALL_PROFIT",
        reason: "Critical reversal confirmed while position is profitable",
        riskLevel,
        score: adjustedScore,
      };
    }

    if (
      shouldTakeSmallProfitByDanger({
        profit,
        profile,
        progress,
        riskLevel,
        adjustedScore,
        confirmation,
        openPosition,
      })
    ) {
      return {
        action: "TAKE_SMALL_PROFIT",
        reason: "Profit protected due to confirmed reversal danger",
        riskLevel,
        score: adjustedScore,
      };
    }

    const moveToBe = shouldMoveToBreakeven(
      openPosition,
      profit,
      side,
      tpPoints,
      slPoints,
      normalizedMode
    );

    if (moveToBe) {
      return {
        action: "MOVE_TO_BE",
        reason: "Price progressed enough, move SL to breakeven",
        riskLevel,
        score: adjustedScore,
      };
    }
  }

  const scalpTimeoutDecision = shouldExitScalpTimeout({
    mode: normalizedMode,
    currentProfit: profit,
    holdingMinutes,
    historicalVolumeSignal,
    openPosition,
    tpPoints,
    slPoints,
    candles,
    side,
  });

  if (scalpTimeoutDecision) {
    return {
      action: scalpTimeoutDecision.action,
      reason: scalpTimeoutDecision.reason,
      riskLevel,
      score: adjustedScore,
    };
  }

  if (
    shouldTakeProfitOnLowVolume({
      symbol,
      mode: normalizedMode,
      historicalVolumeSignal,
      holdingMinutes,
      currentProfit: profit,
      openPosition,
      tpPoints,
      slPoints,
      candles,
      side,
    })
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: `LOW_VOLUME_HOLD_TOO_LONG_CONFIRMED (${holdingMinutes}m)`,
      riskLevel,
      score: adjustedScore,
    };
  }

  return {
    action: "HOLD",
    reason: `No strong exit signal (score=${adjustedScore}, mode=${normalizedMode}, confirm=${confirmation.level}, bars=${approxBarsHeld.toFixed(1)})`,
    riskLevel,
    score: adjustedScore,
  };
}

module.exports = {
  analyzeEarlyExit,
};
