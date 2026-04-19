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
  const n = toNumber(v, min);
  return Math.max(min, Math.min(max, n));
}

function normalizeMode(mode = "NORMAL") {
  const m = String(mode || "NORMAL").trim().toUpperCase();
  if (m === "MICRO_SCALP") return "MICRO_SCALP";
  if (m === "SCALP") return "SCALP";
  return "NORMAL";
}

function normalizeSide(side = "") {
  const s = String(side || "").trim().toUpperCase();
  if (s === "BUY" || s === "LONG") return "BUY";
  if (s === "SELL" || s === "SHORT") return "SELL";
  return s;
}

function getExitProfile(mode = "NORMAL") {
  const normalized = normalizeMode(mode);

  if (normalized === "MICRO_SCALP") {
    return {
      // ต้องมีกำไรก่อนถึงจะเริ่มพิจารณาป้องกัน
      minProfitToProtect: 0.12,

      // BE ของ engine จะไม่ยิงง่ายๆ ต้องมีกำไรขั้นต่ำก่อน
      moveToBeMinProfit: 0.22,

      // ปิดกำไรเล็กน้อยเมื่อเริ่มเห็นการย้อนจริง
      takeProfitOnRetractionMinProfit: 0.14,
      takeProfitHardProtectMinProfit: 0.24,

      // cut loss ฝั่งผิดทาง
      simpleCutMinutes: 2,
      simpleCutProfit: -0.12,
      strongCutProfit: -0.08,
      reversalCutScore: 1.6,

      // low volume
      lowVolumeProfitMinutes: 4,

      // เกณฑ์แยก BE กับ take profit
      beMaxRetractionRatio: 0.22,
      tpRetractionRatio: 0.30,

      // reversal score
      beReversalScoreMin: 1.05,
      takeProfitReversalScoreMin: 1.45,

      // confirmation
      beAllowLowConfirmation: false,
      protectOnFailedPatternProfit: 0.08,
    };
  }

  if (normalized === "SCALP") {
    return {
      minProfitToProtect: 0.28,
      moveToBeMinProfit: 0.38,
      takeProfitOnRetractionMinProfit: 0.24,
      takeProfitHardProtectMinProfit: 0.42,

      simpleCutMinutes: 4,
      simpleCutProfit: -0.20,
      strongCutProfit: -0.12,
      reversalCutScore: 2.0,

      lowVolumeProfitMinutes: 6,

      beMaxRetractionRatio: 0.20,
      tpRetractionRatio: 0.28,

      beReversalScoreMin: 1.20,
      takeProfitReversalScoreMin: 1.70,

      beAllowLowConfirmation: false,
      protectOnFailedPatternProfit: 0.12,
    };
  }

  return {
    minProfitToProtect: 0.75,
    moveToBeMinProfit: 0.90,
    takeProfitOnRetractionMinProfit: 0.70,
    takeProfitHardProtectMinProfit: 1.00,

    simpleCutMinutes: 10,
    simpleCutProfit: -0.35,
    strongCutProfit: -0.20,
    reversalCutScore: 2.6,

    normalFastCutMinutes: 3,
    normalFastCutProfit: -0.08,
    normalStructureBreakProfit: -0.03,
    normalFastReversalScore: 1.6,

    lowVolumeProfitMinutes: 15,

    beMaxRetractionRatio: 0.18,
    tpRetractionRatio: 0.25,

    beReversalScoreMin: 1.35,
    takeProfitReversalScoreMin: 1.95,

    beAllowLowConfirmation: false,
    protectOnFailedPatternProfit: 0.18,
  };
}

function getOpenTime(openPosition = {}) {
  return (
    openPosition.openTime ||
    openPosition.open_time ||
    openPosition.openedAt ||
    openPosition.opened_at ||
    openPosition.createdAt ||
    openPosition.created_at ||
    openPosition.time ||
    null
  );
}

function getHoldingMinutes(openPosition = {}) {
  const raw = getOpenTime(openPosition);
  if (!raw) return 0;

  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 0;

  const diffMs = Date.now() - ts;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;

  return diffMs / 60000;
}

function getPeakProfit(openPosition = {}, currentProfit = 0) {
  const candidates = [
    openPosition.peakProfit,
    openPosition.maxProfit,
    openPosition.max_profit,
    openPosition.bestProfit,
    openPosition.best_profit,
    openPosition.highestProfit,
    openPosition.highest_profit,
    currentProfit,
  ].map((v) => toNumber(v, Number.NEGATIVE_INFINITY));

  const valid = candidates.filter(Number.isFinite);
  if (!valid.length) return Math.max(0, toNumber(currentProfit, 0));

  return Math.max(...valid, toNumber(currentProfit, 0), 0);
}

function getProfitRetractionRatio(openPosition = {}, currentProfit = 0) {
  const peakProfit = getPeakProfit(openPosition, currentProfit);
  const profit = toNumber(currentProfit, 0);

  if (peakProfit <= 0) return 0;
  if (profit >= peakProfit) return 0;

  const retraced = peakProfit - profit;
  return clamp(retraced / peakProfit, 0, 1.5);
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

  const profile = getExitProfile(mode);
  return holdingMinutes >= profile.lowVolumeProfitMinutes;
}

function getCandleBody(c = {}) {
  return abs(toNumber(c.close, 0) - toNumber(c.open, 0));
}

function getCandleRange(c = {}) {
  return abs(toNumber(c.high, 0) - toNumber(c.low, 0));
}

function isBullish(c = {}) {
  return toNumber(c.close, 0) > toNumber(c.open, 0);
}

function isBearish(c = {}) {
  return toNumber(c.close, 0) < toNumber(c.open, 0);
}

function detectExitConfirmation(candles = [], side = "") {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { level: "LOW", score: 0 };
  }

  const s = normalizeSide(side);
  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};

  let score = 0;

  const lastBody = getCandleBody(last);
  const prevBody = getCandleBody(prev);
  const lastRange = getCandleRange(last);
  const bodyStrength = lastRange > 0 ? lastBody / lastRange : 0;

  if (s === "BUY") {
    if (isBearish(last)) score += 0.9;
    if (isBearish(last) && isBearish(prev)) score += 0.7;
    if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.8;
  } else if (s === "SELL") {
    if (isBullish(last)) score += 0.9;
    if (isBullish(last) && isBullish(prev)) score += 0.7;
    if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.8;
  }

  if (bodyStrength >= 0.6) score += 0.4;
  if (lastBody > prevBody && prevBody > 0) score += 0.2;

  if (score >= 1.8) return { level: "HIGH", score };
  if (score >= 1.0) return { level: "MEDIUM", score };
  return { level: "LOW", score };
}

function detectReversalScore(candles = [], side = "", mode = "NORMAL") {
  if (!Array.isArray(candles) || candles.length < 3) return 0;

  const s = normalizeSide(side);
  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};
  const prev2 = candles[candles.length - 3] || {};

  let score = 0;

  if (s === "BUY") {
    if (isBearish(last)) score += 0.8;
    if (isBearish(last) && isBearish(prev)) score += 0.9;
    if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.7;
    if (toNumber(prev.close, 0) < toNumber(prev2.low, 0)) score += 0.4;
  } else if (s === "SELL") {
    if (isBullish(last)) score += 0.8;
    if (isBullish(last) && isBullish(prev)) score += 0.9;
    if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.7;
    if (toNumber(prev.close, 0) > toNumber(prev2.high, 0)) score += 0.4;
  }

  if (normalizeMode(mode) === "MICRO_SCALP") return score * 0.95;
  if (normalizeMode(mode) === "SCALP") return score;
  return score * 1.05;
}

function shouldSimpleWrongWayCut({
  currentProfit = 0,
  holdingMinutes = 0,
  reversalScore = 0,
  mode = "NORMAL",
}) {
  const profile = getExitProfile(mode);
  const profit = toNumber(currentProfit, 0);
  const mins = toNumber(holdingMinutes, 0);

  if (profit <= profile.strongCutProfit && reversalScore >= profile.reversalCutScore) {
    return {
      action: "CUT_LOSS_NOW",
      reason: `${normalizeMode(mode)}_STRONG_REVERSAL_CUT`,
    };
  }

  if (mins >= profile.simpleCutMinutes && profit <= profile.simpleCutProfit) {
    return {
      action: "CUT_LOSS_NOW",
      reason: `${normalizeMode(mode)}_TIME_BASED_WRONG_WAY_CUT`,
    };
  }

  return null;
}

function shouldNormalFastWrongWayCut({
  mode = "NORMAL",
  currentProfit = 0,
  holdingMinutes = 0,
  reversalScore = 0,
  candles = [],
  side = "",
  confirmation = { level: "LOW", score: 0 },
}) {
  if (normalizeMode(mode) !== "NORMAL") return null;

  const profile = getExitProfile("NORMAL");
  const profit = toNumber(currentProfit, 0);
  const mins = toNumber(holdingMinutes, 0);

  const last = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : {};
  const prev = Array.isArray(candles) && candles.length > 1 ? candles[candles.length - 2] : {};
  const s = normalizeSide(side);

  let structureBreak = false;

  if (s === "BUY") {
    structureBreak = toNumber(last.close, 0) < toNumber(prev.low, 0);
  } else if (s === "SELL") {
    structureBreak = toNumber(last.close, 0) > toNumber(prev.high, 0);
  }

  if (
    mins >= profile.normalFastCutMinutes &&
    profit <= profile.normalStructureBreakProfit &&
    structureBreak &&
    confirmation.level !== "LOW"
  ) {
    return {
      action: "CUT_LOSS_NOW",
      reason: "NORMAL_STRUCTURE_BREAK_FAST_CUT",
    };
  }

  if (
    mins >= profile.normalFastCutMinutes &&
    profit <= profile.normalFastCutProfit &&
    reversalScore >= profile.normalFastReversalScore
  ) {
    return {
      action: "CUT_LOSS_NOW",
      reason: "NORMAL_FAST_WRONG_WAY_CUT",
    };
  }

  return null;
}

function shouldEngineMoveToBE({
  currentProfit = 0,
  openPosition = {},
  reversalScore = 0,
  confirmation = { level: "LOW", score: 0 },
  failedPatternRule = null,
  mode = "NORMAL",
}) {
  const profile = getExitProfile(mode);
  const profit = toNumber(currentProfit, 0);
  const peakProfit = getPeakProfit(openPosition, profit);
  const retractionRatio = getProfitRetractionRatio(openPosition, profit);

  if (profit < profile.moveToBeMinProfit) return false;

  // Engine จะขยับ BE เฉพาะเมื่อ "เริ่มเสี่ยงย้อน"
  const hasContextRisk =
    reversalScore >= profile.beReversalScoreMin ||
    confirmation.level === "MEDIUM" ||
    confirmation.level === "HIGH" ||
    !!failedPatternRule;

  if (!hasContextRisk) return false;

  // ถ้าย่อแรงเกินไป ให้ไป TAKE_SMALL_PROFIT แทน
  if (retractionRatio >= profile.beMaxRetractionRatio) return false;

  // ต้องเคยมีกำไรมากกว่าตอนนี้พอสมควร หรือมี failed pattern ช่วยยืนยัน
  if (!failedPatternRule && peakProfit <= profit) return false;

  if (!profile.beAllowLowConfirmation && confirmation.level === "LOW" && !failedPatternRule) {
    return false;
  }

  return true;
}

function shouldEngineTakeSmallProfit({
  currentProfit = 0,
  openPosition = {},
  reversalScore = 0,
  confirmation = { level: "LOW", score: 0 },
  failedPatternRule = null,
  mode = "NORMAL",
}) {
  const profile = getExitProfile(mode);
  const profit = toNumber(currentProfit, 0);
  const peakProfit = getPeakProfit(openPosition, profit);
  const retractionRatio = getProfitRetractionRatio(openPosition, profit);

  if (profit < profile.takeProfitOnRetractionMinProfit) return false;

  const strongContextRisk =
    reversalScore >= profile.takeProfitReversalScoreMin ||
    confirmation.level === "HIGH" ||
    (confirmation.level === "MEDIUM" && reversalScore >= profile.beReversalScoreMin + 0.25) ||
    !!failedPatternRule;

  if (!strongContextRisk) return false;

  if (failedPatternRule && profit >= profile.protectOnFailedPatternProfit) return true;

  if (peakProfit >= profile.takeProfitHardProtectMinProfit && retractionRatio >= 0.22) return true;

  if (peakProfit >= profile.minProfitToProtect && retractionRatio >= profile.tpRetractionRatio) return true;

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
  timeframe = "M5",
  historicalVolume = null,
  pattern = null,
  accountId = null,
}) {
  openPosition = openPosition || {};

  const side = normalizeSide(
    openPosition.side ||
      openPosition.type ||
      openPosition.positionSide ||
      ""
  );

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

  const holdingMinutes = getHoldingMinutes(openPosition);
  const confirmation = detectExitConfirmation(candles, side);
  let adjustedScore =
    detectReversalScore(candles, side, normalizedMode) +
    toNumber(confirmation.score, 0) * 0.35;

  let riskLevel = "LOW";

  const failedPatternRule = await findFailedPatternRule({
    userId: firebaseUserId,
    accountId,
    symbol,
    timeframe,
    side,
    mode: normalizedMode,
    pattern,
    price,
    candlesM: candles,
  });

  if (failedPatternRule) {
    riskLevel = "CRITICAL";
    adjustedScore += 0.8;
  } else if (adjustedScore >= profile.reversalCutScore) {
    riskLevel = "HIGH";
  } else if (adjustedScore >= profile.reversalCutScore * 0.7) {
    riskLevel = "MEDIUM";
  }

  // ผิดทางตั้งแต่ต้นและมี failed pattern ชัด
  if (failedPatternRule && profit <= 0.15) {
    return {
      action: "CUT_LOSS_NOW",
      reason: "FAILED_PATTERN_EARLY_EXIT",
      riskLevel,
      score: adjustedScore,
    };
  }

  const simpleCut = shouldSimpleWrongWayCut({
    currentProfit: profit,
    holdingMinutes,
    reversalScore: adjustedScore,
    mode: normalizedMode,
  });

  if (simpleCut) {
    return {
      action: simpleCut.action,
      reason: simpleCut.reason,
      riskLevel: "HIGH",
      score: adjustedScore,
    };
  }

  const normalFastCut = shouldNormalFastWrongWayCut({
    mode: normalizedMode,
    currentProfit: profit,
    holdingMinutes,
    reversalScore: adjustedScore,
    candles,
    side,
    confirmation,
  });

  if (normalFastCut) {
    return {
      action: normalFastCut.action,
      reason: normalFastCut.reason,
      riskLevel: "HIGH",
      score: adjustedScore,
    };
  }

  // มี failed pattern + มีกำไรแล้ว => เก็บกำไรก่อน
  if (
    profit > 0 &&
    failedPatternRule &&
    profit >= profile.protectOnFailedPatternProfit
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: `${normalizedMode}_FAILED_PATTERN_PROFIT_PROTECT`,
      riskLevel: "CRITICAL",
      score: adjustedScore,
    };
  }

  // volume แผ่ว + ถือมาสักพัก + มีกำไร => เก็บกำไรก่อน
  if (
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

  // ถ้าบริบทเสี่ยงย้อนแรง ให้เก็บกำไรเลย
  if (
    shouldEngineTakeSmallProfit({
      currentProfit: profit,
      openPosition,
      reversalScore: adjustedScore,
      confirmation,
      failedPatternRule,
      mode: normalizedMode,
    })
  ) {
    return {
      action: "TAKE_SMALL_PROFIT",
      reason: `${normalizedMode}_REVERSAL_PROFIT_PROTECT`,
      riskLevel,
      score: adjustedScore,
      meta: {
        peakProfit: getPeakProfit(openPosition, profit),
        retractionRatio: getProfitRetractionRatio(openPosition, profit),
        confirmation: confirmation.level,
      },
    };
  }

  // ถ้าเริ่มมีสัญญาณย้อน แต่ยังไม่แรงพอจะปิดกำไร ให้แค่กันทุน
  if (
    shouldEngineMoveToBE({
      currentProfit: profit,
      openPosition,
      reversalScore: adjustedScore,
      confirmation,
      failedPatternRule,
      mode: normalizedMode,
    })
  ) {
    return {
      action: "MOVE_TO_BE",
      reason: `${normalizedMode}_CONTEXTUAL_BREAKEVEN_PROTECT`,
      riskLevel,
      score: adjustedScore,
      meta: {
        peakProfit: getPeakProfit(openPosition, profit),
        retractionRatio: getProfitRetractionRatio(openPosition, profit),
        confirmation: confirmation.level,
      },
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
