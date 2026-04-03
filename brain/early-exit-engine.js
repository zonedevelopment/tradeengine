"use strict";

/**
 * early-exit-engine.js
 * ----------------------------------------
 * วิเคราะห์ว่าควรปิดออเดอร์ก่อน TP หรือไม่
 * เป้าหมายเวอร์ชันนี้:
 * - ลด panic close
 * - แยก pullback ออกจาก reversal
 * - ไม่ปิดกำไรจิ๋วเร็วเกินไป
 * - ใช้ mode / tpPoints / slPoints ช่วยตัดสินใจ
 */
const { findFailedPattern, findFailedPatternForEarly } = require("../failedPattern.repo");
const {
  buildContextFeatures,
  buildContextHashNew,
} = require("../utils/context-features");

function isGoldSymbol(symbol = "") {
  const s = String(symbol || "").toUpperCase();
  return s === "XAUUSD" || s === "XAUUSDM" || s === "XAUUSDm";
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
  return toNumber(c.high) - Math.max(toNumber(c.close), toNumber(c.open));
}

function lowerWick(c) {
  return Math.min(toNumber(c.close), toNumber(c.open)) - toNumber(c.low);
}

function avgBody(candles = [], length = 5) {
  if (!Array.isArray(candles) || candles.length < length) return 0;
  const arr = candles.slice(-length).map(candleBody);
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function avgRange(candles = [], length = 5) {
  if (!Array.isArray(candles) || candles.length < length) return 0;
  const arr = candles.slice(-length).map(candleRange);
  return arr.reduce((s, v) => s + v, 0) / arr.length;
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
      minProfitForHighRiskExit: 0.20,
      minProfitForStrongReversalExit: 0.18,
      moveToBeMinR: 0.45,
      strongReversalThresholdProfit: 3.4,
      hardCutLossReversalThreshold: 3.8,
      mediumBounceThreshold: 2.4,
    };
  }

  if (normalized === "SCALP") {
    return {
      minProfitToProtect: 0.35,
      minProfitForHighRiskExit: 0.60,
      minProfitForStrongReversalExit: 0.55,
      moveToBeMinR: 0.65,
      strongReversalThresholdProfit: 3.8,
      hardCutLossReversalThreshold: 4.1,
      mediumBounceThreshold: 2.6,
    };
  }

  return {
    minProfitToProtect: 0.75,
    minProfitForHighRiskExit: 1.20,
    minProfitForStrongReversalExit: 1.00,
    moveToBeMinR: 0.80,
    strongReversalThresholdProfit: 4.2,
    hardCutLossReversalThreshold: 4.5,
    mediumBounceThreshold: 2.8,
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
    targetDistance = takeProfitPrice > entryPrice ? takeProfitPrice - entryPrice : toNumber(tpPoints, 0);
    riskDistance = stopLossPrice > 0 && stopLossPrice < entryPrice
      ? entryPrice - stopLossPrice
      : toNumber(slPoints, 0);
  } else if (side === "SELL") {
    profitDistance = entryPrice - currentPrice;
    targetDistance = takeProfitPrice > 0 && takeProfitPrice < entryPrice ? entryPrice - takeProfitPrice : toNumber(tpPoints, 0);
    riskDistance = stopLossPrice > entryPrice
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

function shouldMoveToBreakeven(openPosition, currentProfit, side, tpPoints = 0, slPoints = 0, mode = "NORMAL") {
  const profile = getExitProfile(mode);
  const progress = getProgressToTarget(openPosition, currentProfit, tpPoints, slPoints);

  if (currentProfit <= 0) return false;
  if (progress.progressToRisk >= profile.moveToBeMinR) return true;

  return false;
}

function detectReversalScore(candles, side, mode = "NORMAL") {
  let score = 0;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const avgB = avgBody(candles, 5) || candleBody(last) || 1;
  const avgR = avgRange(candles, 5) || candleRange(last) || 1;
  const normalizedMode = normalizeMode(mode);

  // 1) Candle direction
  if (side === "BUY") {
    if (isBear(last)) score += 0.8;
    if (isBear(last) && isBear(prev)) score += 0.6;
  }

  if (side === "SELL") {
    if (isBull(last)) score += 0.8;
    if (isBull(last) && isBull(prev)) score += 0.6;
  }

  // 2) Momentum loss
  const body1 = candleBody(last);
  const body2 = candleBody(prev);
  const body3 = candleBody(prev2);

  if (body1 < body2 && body2 < body3) {
    score += 0.8;
  }

  // ถ้าตรงข้ามแรงกว่าค่าเฉลี่ยจริง ค่อยให้น้ำหนักเพิ่ม
  if (side === "SELL" && isBull(last) && body1 > avgB * 1.2) {
    score += 1.0;
  }
  if (side === "BUY" && isBear(last) && body1 > avgB * 1.2) {
    score += 1.0;
  }

  // 3) Wick rejection
  const upWick = upperWick(last);
  const lowWick = lowerWick(last);

  if (side === "BUY" && upWick > Math.max(body1, 0.0001) * 1.5) {
    score += 1.0;
  }

  if (side === "SELL" && lowWick > Math.max(body1, 0.0001) * 1.5) {
    score += 1.0;
  }

  // 4) Structure break
  // ใช้ 4 แท่งก่อนหน้าโดยไม่รวมแท่งล่าสุด
  const recentCandles = candles.slice(-5, -1);
  if (recentCandles.length >= 3) {
    const recentHigh = Math.max(...recentCandles.map(c => toNumber(c.high, 0)));
    const recentLow = Math.min(...recentCandles.map(c => toNumber(c.low, 0)));

    if (side === "BUY" && toNumber(last.close) < recentLow) {
      score += 2.0;
    }

    if (side === "SELL" && toNumber(last.close) > recentHigh) {
      score += 2.0;
    }
  }

  // 5) Pullback filter
  // ถ้าเป็นแค่แท่งสวนเล็ก ๆ ใน continuation market อย่าเพิ่งให้คะแนนเยอะ
  const lastRange = candleRange(last);
  const isSmallCounterMove =
    lastRange < avgR * 0.9 &&
    body1 < avgB * 1.0;

  if (isSmallCounterMove) {
    score -= 0.6;
  }

  // NORMAL ต้องเข้มกว่าพวก scalp
  if (normalizedMode === "NORMAL") {
    score = score * 0.95;
  } else if (normalizedMode === "MICRO_SCALP") {
    score = score * 1.05;
  }

  return Math.max(0, Number(score.toFixed(2)));
}

function getLowVolumeProfitHoldLimitMinutes({ mode = "NORMAL", symbol = "" }) {
  const upperMode = String(mode || "NORMAL").toUpperCase();

  if (isGoldSymbol(symbol)) {
    return upperMode === "SCALP" ? 15 : 35;
  }

  if (String(symbol || "").toUpperCase().includes("BTC")) {
    return upperMode === "SCALP" ? 10 : 30;
  }

  return upperMode === "SCALP" ? 10 : 30;
}

// function shouldTakeProfitOnLowVolume({
//   symbol = "",
//   mode = "NORMAL",
//   historicalVolumeSignal = null,
//   holdingMinutes = 0,
//   currentProfit = 0,
// }) {
//   if (String(historicalVolumeSignal || "").toUpperCase() !== "LOW_VOLUME") {
//     return false;
//   }

//   if (toNumber(currentProfit, 0) <= 0) {
//     return false;
//   }

//   const minHoldMinutes = getLowVolumeProfitHoldLimitMinutes({ mode, symbol });

//   return toNumber(holdingMinutes, 0) >= minHoldMinutes;
// }

function shouldExitScalpTimeout({
  mode = "NORMAL",
  currentProfit = 0,
  holdingMinutes = 0,
  historicalVolumeSignal = null,
  openPosition = {},
  tpPoints = 0,
  slPoints = 0,
}) {
  const normalizedMode = String(mode || "NORMAL").toUpperCase();
  if (normalizedMode !== "SCALP" && normalizedMode !== "MICRO_SCALP") return false;

  const profit = toNumber(currentProfit, 0);
  const mins = toNumber(holdingMinutes, 0);

  const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);

  // ตลาดแผ่ว + ถือเกิน + กำไรน้อยหรือยังไม่คืบ
  if (
    String(historicalVolumeSignal || "").toUpperCase() === "LOW_VOLUME" &&
    mins >= 10 &&
    profit > 0 &&
    progress.progressToTarget < 0.45
  ) {
    return { action: "TAKE_SMALL_PROFIT", reason: "SCALP_TIMEOUT_LOW_VOLUME" };
  }

  // ถือเกินนาน แต่ยังติดลบและไม่ไปไหน
  if (mins >= 12 && profit < 0 && progress.progressToTarget < 0.20) {
    return { action: "CUT_LOSS_NOW", reason: "SCALP_TIMEOUT_NO_PROGRESS" };
  }

  return null;
}

function shouldCutWeakScalpTrade({
  mode = "NORMAL",
  currentProfit = 0,
  holdingMinutes = 0,
  reversalScore = 0,
  candles = [],
  side = "",
}) {
  const normalizedMode = String(mode || "NORMAL").toUpperCase();
  // if (normalizedMode !== "SCALP" && normalizedMode !== "MICRO_SCALP") return false;

  const profit = toNumber(currentProfit, 0);
  if (profit > -0.20) return false; // ยังไม่ต้องรีบตัดถ้ายังแทบไม่ติดลบ
  if (toNumber(holdingMinutes, 0) < 6) return false; // ให้เวลาไม้ทำงานก่อน

  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};

  const lastBody = candleBody(last);
  const prevBody = candleBody(prev);
  const avgB = avgBody(candles, 5) || 1;

  const weakMomentum =
    lastBody < avgB * 0.75 &&
    prevBody < avgB * 0.9;

  if (weakMomentum && reversalScore >= 1.2) {
    return true;
  }

  return false;
}

function shouldTakeProfitOnLowVolume({
  symbol = "",
  mode = "NORMAL",
  historicalVolumeSignal = null,
  holdingMinutes = 0,
  currentProfit = 0,
}) {
  if (toNumber(currentProfit, 0) <= 0) {
    return false;
  }

  const minHoldMinutes = getLowVolumeProfitHoldLimitMinutes({ mode, symbol });
  return toNumber(holdingMinutes, 0) >= minHoldMinutes;
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
  candlesM
}) {
  // const candles = Array.isArray(candlesM) ? candlesM : [];

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
  pattern
}) {
  if (!openPosition || !openPosition.side) {
    return {
      action: "HOLD",
      reason: "Invalid position data",
      riskLevel: "UNKNOWN",
      score: 0
    };
  }

  if (!candles || candles.length < 5) {
    return {
      action: "HOLD",
      reason: "Not enough candles",
      riskLevel: "UNKNOWN",
      score: 0
    };
  }

  // console.log(`[Early exit] Params symbol: ${symbol}, pattern: ${JSON.stringify(pattern)}`);

  const historicalVolumeSignal = historicalVolume?.signal || null;
  const side = String(openPosition.side || "").toUpperCase();
  const normalizedMode = normalizeMode(mode || openPosition.mode || "NORMAL");
  const profile = getExitProfile(normalizedMode);
  const profit = toNumber(currentProfit, 0);

  const reversalScore = detectReversalScore(candles, side, normalizedMode);

  const failedPattern = await findFailedPatternRule({
    userId: 0 || null,
    accountId: null,
    symbol,
    timeframe: "M5",
    side,
    mode,
    pattern,
    price,
    candles
  });

  // console.log(`[Early exit] Failed pattern ${JSON.stringify(failedPattern)}.`);

  let adjustedScore = reversalScore;
  let riskLevel = "LOW";
  let failRate = 0;
  let suggestedAction = null;

  if (failedPattern) {
    failRate = parseFloat(failedPattern.fail_rate || 0);
    suggestedAction = failedPattern.suggested_action || null;

    if (suggestedAction === "BLOCK_TRADE") {
      riskLevel = "CRITICAL";
      adjustedScore += 2.5;
    } else if (suggestedAction === "WARNING") {
      riskLevel = "HIGH";
      adjustedScore += 1.0;
    } else if (suggestedAction === "REDUCE_SCORE") {
      riskLevel = "MEDIUM";
      adjustedScore += parseFloat(failedPattern.score_penalty || 1);
    } else if (suggestedAction === "REDUCE_RISK") {
      riskLevel = "MEDIUM";
      adjustedScore += .80;
    }

    if (failRate >= 0.8) {
      riskLevel = "CRITICAL";
      adjustedScore += 1.75;
    } else if (failRate >= 0.65 && riskLevel !== "CRITICAL") {
      riskLevel = "HIGH";
      adjustedScore += 1.0;
    } else if (failRate >= 0.45 && riskLevel === "LOW") {
      riskLevel = "MEDIUM";
      adjustedScore += 0.5;
    }

    console.log("Early exit check failed: riskLevel" + JSON.stringify(riskLevel) + ", adjustedScore: " + JSON.stringify(adjustedScore) + ", profit: " + JSON.stringify(profit));
  }

  adjustedScore = Number(adjustedScore.toFixed(2));

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

  let result = {};
  // 1) CUT LOSS NOW
  if (profit < 0) {
    if (riskLevel === "CRITICAL" && adjustedScore >= 2.2) {
      return {
        action: "CUT_LOSS_NOW",
        reason: `Critical risk from failed pattern (failRate=${failRate})`,
        riskLevel,
        score: adjustedScore
      };
    }

    if (riskLevel === "HIGH" && adjustedScore >= 3.2) {
      return {
        action: "CUT_LOSS_NOW",
        reason: "High risk + strong reversal detected",
        riskLevel,
        score: adjustedScore
      };
    }

    if (adjustedScore >= profile.hardCutLossReversalThreshold) {
      return {
        action: "CUT_LOSS_NOW",
        reason: "Strong reversal against position",
        riskLevel,
        score: adjustedScore
      };
    }
  }

  // 2) MOVE TO BE ก่อน
  if (profit > 0) {
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
        reason: "Price moved enough in favor, move SL to breakeven",
        riskLevel,
        score: adjustedScore
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
      mode,
      historicalVolumeSignal,
      holdingMinutes,
      currentProfit,
    })
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: `LOW_VOLUME_HOLD_TOO_LONG (${holdingMinutes}m)`,
      riskLevel,
      score: adjustedScore,
    };
  }

  // 3) TAKE SMALL PROFIT
  // if (profit > 0) {
  //   const progress = getProgressToTarget(openPosition, profit, tpPoints, slPoints);

  //   // CRITICAL: ยอมออกได้เร็วกว่า
  //   if (
  //     riskLevel === "CRITICAL" &&
  //     profit >= profile.minProfitToProtect
  //   ) {
  //     return {
  //       action: "TAKE_SMALL_PROFIT",
  //       reason: "Critical risk but position is profitable",
  //       riskLevel,
  //       score: adjustedScore
  //     };
  //   }

  //   // HIGH: ต้องได้กำไรมากขึ้นก่อน
  //   if (
  //     riskLevel === "HIGH" &&
  //     profit >= profile.minProfitForHighRiskExit &&
  //     adjustedScore >= 2.8
  //   ) {
  //     return {
  //       action: "TAKE_SMALL_PROFIT",
  //       reason: "High risk, secure small profit",
  //       riskLevel,
  //       score: adjustedScore
  //     };
  //   }

  //   // Reversal ชัดจริง + กำไรถึงขั้นต่ำ
  //   if (
  //     adjustedScore >= profile.strongReversalThresholdProfit &&
  //     profit >= profile.minProfitForStrongReversalExit
  //   ) {
  //     return {
  //       action: "TAKE_SMALL_PROFIT",
  //       reason: "Strong reversal detected with enough profit",
  //       riskLevel,
  //       score: adjustedScore
  //     };
  //   }

  //   // ถ้าไปได้ไกลจาก entry พอสมควรแล้วและเริ่มมี reversal ชัด
  //   if (
  //     progress.progressToTarget >= 0.55 &&
  //     adjustedScore >= 3.2 &&
  //     profit >= profile.minProfitToProtect
  //   ) {
  //     return {
  //       action: "TAKE_SMALL_PROFIT",
  //       reason: "Trade already progressed well, protect profit",
  //       riskLevel,
  //       score: adjustedScore
  //     };
  //   }
  // }

  // 4) WAIT FOR SMALL BOUNCE
  // if (profit <= 0) {
  //   if (
  //     riskLevel === "HIGH" ||
  //     (riskLevel === "MEDIUM" && adjustedScore >= profile.mediumBounceThreshold)
  //   ) {
  //     return {
  //       action: "WAIT_FOR_SMALL_BOUNCE",
  //       reason: "Risk detected, wait for small recovery before exit",
  //       riskLevel,
  //       score: adjustedScore
  //     };
  //   }
  // }

  return {
    action: "HOLD",
    reason: `No strong exit signal (score=${adjustedScore}, mode=${normalizedMode})`,
    riskLevel,
    score: adjustedScore
  };
}

module.exports = {
  analyzeEarlyExit
};
