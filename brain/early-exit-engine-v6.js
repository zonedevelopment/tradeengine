// "use strict";

// const { findFailedPatternForEarly } = require("../failedPattern.repo");
// const {
//     buildContextFeatures,
//     buildContextHashNew,
// } = require("../utils/context-features");

// function toNumber(v, d = 0) {
//     const n = Number(v);
//     return Number.isFinite(n) ? n : d;
// }

// function abs(v) {
//     return Math.abs(toNumber(v, 0));
// }

// function clamp(v, min, max) {
//     const n = toNumber(v, min);
//     return Math.max(min, Math.min(max, n));
// }

// function normalizeMode(mode = "NORMAL") {
//     const m = String(mode || "NORMAL").trim().toUpperCase();
//     if (m === "MICRO_SCALP") return "MICRO_SCALP";
//     if (m === "SCALP") return "SCALP";
//     return "NORMAL";
// }

// function normalizeSide(side = "") {
//     const s = String(side || "").trim().toUpperCase();
//     if (s === "BUY" || s === "LONG") return "BUY";
//     if (s === "SELL" || s === "SHORT") return "SELL";
//     return s;
// }

// function getExitProfile(mode = "NORMAL") {
//     const normalized = normalizeMode(mode);

//     if (normalized === "MICRO_SCALP") {
//         return {
//             armProfitMin: 0.35,
//             moveToBeMinProfit: 0.26,
//             takeProfitMinProfit: 0.42,
//             minPeakBeforeProtect: 0.45,
//             beMinRetraceRatio: 0.18,
//             tpMinRetraceRatio: 0.32,

//             wrongWayMinMinutes: 1.0,
//             wrongWayCutProfit: -0.06,
//             wrongWayHardCutProfit: -0.12,
//             wrongWayFlowCutScore: 1.95,
//             wrongWayFlowHardScore: 2.55,

//             noFollowThroughMinMinutes: 1.0,
//             noFollowThroughCutProfit: -0.04,
//             noFollowThroughScore: 1.85,

//             takeoverCutProfit: -0.03,
//             takeoverCutScore: 2.05,

//             simpleCutMinutes: 2,
//             simpleCutProfit: -0.18,
//             strongCutProfit: -0.10,
//             reversalCutScore: 1.9,

//             lowVolumeProfitMinutes: 5,
//             failedPatternCutProfit: 0.05,
//             failedPatternTakeProfitMin: 0.25,

//             weakStructureScore: 1.15,
//             strongStructureScore: 1.75,
//         };
//     }

//     if (safeMode === "SCALP") {
//         return {
//             holdToBEProfit: 0.55,

//             simpleCutMinutes: 6,
//             simpleCutProfit: -0.30,

//             strongCutProfit: -0.22,
//             reversalCutScore: 2.55,

//             wrongWayMinMinutes: 4.0,
//             wrongWayCutProfit: -0.16,
//             wrongWayHardCutProfit: -0.30,

//             noFollowThroughMinMinutes: 4.0,
//             noFollowThroughCutProfit: -0.14,
//             noFollowThroughScore: 2.35,

//             failedPatternCutProfit: 0.12,
//             failedPatternTakeProfitMin: 0.40,
//         };
//     }

//     // if (normalized === "SCALP") {
//     //     return {
//     //         armProfitMin: 0.55,
//     //         moveToBeMinProfit: 0.35,
//     //         takeProfitMinProfit: 0.60,
//     //         minPeakBeforeProtect: 0.70,
//     //         beMinRetraceRatio: 0.16,
//     //         tpMinRetraceRatio: 0.28,

//     //         // wrongWayMinMinutes: 1.5,
//     //         // wrongWayCutProfit: -0.10,
//     //         // wrongWayHardCutProfit: -0.20,
//     //         wrongWayFlowCutScore: 2.15,
//     //         wrongWayFlowHardScore: 2.85,

//     //         // noFollowThroughMinMinutes: 1.5,
//     //         // noFollowThroughCutProfit: -0.08,
//     //         // noFollowThroughScore: 2.00,

//     //         takeoverCutProfit: -0.06,
//     //         takeoverCutScore: 2.20,

//     //         // simpleCutMinutes: 4,
//     //         // simpleCutProfit: -0.24,
//     //         // strongCutProfit: -0.14,
//     //         // reversalCutScore: 2.15,

//     //         lowVolumeProfitMinutes: 7,
//     //         // failedPatternCutProfit: 0.08,
//     //         // failedPatternTakeProfitMin: 0.35,

//     //         weakStructureScore: 1.20,
//     //         strongStructureScore: 1.90,

//     //         holdToBEProfit: 0.55,

//     //         simpleCutMinutes: 4,
//     //         simpleCutProfit: -0.24,
//     //         strongCutProfit: -0.18,
//     //         reversalCutScore: 2.35,

//     //         wrongWayMinMinutes: 2.5,
//     //         wrongWayCutProfit: -0.14,
//     //         wrongWayHardCutProfit: -0.26,

//     //         noFollowThroughMinMinutes: 2.5,
//     //         noFollowThroughCutProfit: -0.12,
//     //         noFollowThroughScore: 2.2,

//     //         failedPatternCutProfit: 0.08,
//     //         failedPatternTakeProfitMin: 0.35,
//     //     };
//     // }

//     return {
//         holdToBEProfit: 0.65,

//         simpleCutMinutes: 10,
//         simpleCutProfit: -0.35,

//         strongCutProfit: -0.22,
//         reversalCutScore: 2.2,

//         wrongWayMinMinutes: 3.0,
//         wrongWayCutProfit: -0.15,
//         wrongWayHardCutProfit: -0.30,

//         noFollowThroughMinMinutes: 3.0,
//         noFollowThroughCutProfit: -0.12,
//         noFollowThroughScore: 2.1,

//         failedPatternCutProfit: 0.10,
//         failedPatternTakeProfitMin: 0.35,
//     };
//     // return {
//     //     armProfitMin: 1.10,
//     //     moveToBeMinProfit: 0.75,
//     //     takeProfitMinProfit: 1.20,
//     //     minPeakBeforeProtect: 1.35,
//     //     beMinRetraceRatio: 0.15,
//     //     tpMinRetraceRatio: 0.25,

//     //     wrongWayMinMinutes: 2.0,
//     //     wrongWayCutProfit: -0.15,
//     //     wrongWayHardCutProfit: -0.30,
//     //     wrongWayFlowCutScore: 2.35,
//     //     wrongWayFlowHardScore: 3.05,

//     //     noFollowThroughMinMinutes: 2.0,
//     //     noFollowThroughCutProfit: -0.12,
//     //     noFollowThroughScore: 2.15,

//     //     takeoverCutProfit: -0.10,
//     //     takeoverCutScore: 2.40,

//     //     simpleCutMinutes: 10,
//     //     simpleCutProfit: -0.35,
//     //     strongCutProfit: -0.22,
//     //     reversalCutScore: 2.6,

//     //     normalFastCutMinutes: 3,
//     //     normalFastCutProfit: -0.08,
//     //     normalStructureBreakProfit: -0.03,
//     //     normalFastReversalScore: 1.6,

//     //     lowVolumeProfitMinutes: 15,
//     //     failedPatternCutProfit: 0.12,
//     //     failedPatternTakeProfitMin: 0.65,

//     //     weakStructureScore: 1.30,
//     //     strongStructureScore: 2.10,
//     // };
// }

// function toSafeNumber(value, fallback = 0) {
//     const n = Number(value);
//     return Number.isFinite(n) ? n : fallback;
// }

// function countTrue(list = []) {
//     return list.filter(Boolean).length;
// }

// function buildHardCutGate({
//     mode,
//     holdingMinutes,
//     currentProfit,
//     slPoints,
//     failedPatternRule,
//     wrongWayFlowScore,
//     reversalScore,
//     noFollowThroughScore,
//     hardInvalidation,
//     softInvalidation,
// }) {
//     const safeMode = String(mode || "").toUpperCase();
//     const mins = toSafeNumber(holdingMinutes, 0);
//     const profit = toSafeNumber(currentProfit, 0);
//     const sl = Math.max(toSafeNumber(slPoints, 0), 1);

//     const damageRatio = profit < 0 ? Math.abs(profit) / sl : 0;

//     if (safeMode === "SCALP") {
//         const earlyWindow = mins < 5;

//         const timeReady = mins >= 5;
//         const damageReady =
//             damageRatio >= 0.38 || profit <= -Math.max(180, Math.min(sl * 0.40, 260));

//         const structureReady =
//             Boolean(hardInvalidation) ||
//             (Boolean(failedPatternRule) && mins >= 5) ||
//             toSafeNumber(reversalScore, 0) >= 2.6;

//         const flowReady =
//             toSafeNumber(wrongWayFlowScore, 0) >= 2.6 ||
//             toSafeNumber(noFollowThroughScore, 0) >= 2.35;

//         const emergencyCut =
//             mins >= 2 &&
//             damageRatio >= 0.60 &&
//             (
//                 Boolean(hardInvalidation) ||
//                 toSafeNumber(reversalScore, 0) >= 2.9 ||
//                 toSafeNumber(wrongWayFlowScore, 0) >= 2.9
//             );

//         const suppressFailedPatternAlone =
//             Boolean(failedPatternRule) &&
//             !hardInvalidation &&
//             toSafeNumber(reversalScore, 0) < 2.6 &&
//             toSafeNumber(wrongWayFlowScore, 0) < 2.6 &&
//             toSafeNumber(noFollowThroughScore, 0) < 2.35;

//         const allowHardCut =
//             emergencyCut ||
//             countTrue([timeReady, damageReady, structureReady, flowReady]) >= 2;

//         return {
//             allowHardCut,
//             earlyWindow,
//             damageRatio,
//             suppressFailedPatternAlone,
//             softOnly:
//                 !allowHardCut &&
//                 (
//                     Boolean(softInvalidation) ||
//                     Boolean(failedPatternRule) ||
//                     toSafeNumber(wrongWayFlowScore, 0) >= 2.1 ||
//                     toSafeNumber(noFollowThroughScore, 0) >= 2.0
//                 ),
//         };
//     }

//     const timeReady = mins >= 4;
//     const damageReady =
//         damageRatio >= 0.35 || profit <= -Math.max(220, Math.min(sl * 0.38, 320));
//     const structureReady =
//         Boolean(hardInvalidation) ||
//         Boolean(failedPatternRule) ||
//         toSafeNumber(reversalScore, 0) >= 2.45;
//     const flowReady =
//         toSafeNumber(wrongWayFlowScore, 0) >= 2.45 ||
//         toSafeNumber(noFollowThroughScore, 0) >= 2.2;

//     return {
//         allowHardCut: countTrue([timeReady, damageReady, structureReady, flowReady]) >= 2,
//         earlyWindow: mins < 4,
//         damageRatio,
//         suppressFailedPatternAlone: false,
//         softOnly:
//             Boolean(softInvalidation) ||
//             Boolean(failedPatternRule) ||
//             toSafeNumber(wrongWayFlowScore, 0) >= 2.0 ||
//             toSafeNumber(noFollowThroughScore, 0) >= 2.0,
//     };
// }

// function buildSuppressedHold(reason, extra = {}) {
//     return {
//         action: "HOLD",
//         reason,
//         riskLevel: "MEDIUM",
//         score: 0,
//         meta: {
//             suppressed: true,
//             ...extra,
//         },
//     };
// }

// function getOpenTime(openPosition = {}) {
//     return (
//         openPosition.openTime ||
//         openPosition.open_time ||
//         openPosition.openedAt ||
//         openPosition.opened_at ||
//         openPosition.createdAt ||
//         openPosition.created_at ||
//         openPosition.time ||
//         null
//     );
// }

// function getHoldingMinutes(openPosition = {}) {
//     const raw = getOpenTime(openPosition);
//     if (!raw) return 0;

//     const ts = new Date(raw).getTime();
//     if (!Number.isFinite(ts) || ts <= 0) return 0;

//     const diffMs = Date.now() - ts;
//     if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;

//     return diffMs / 60000;
// }

// function getPeakProfit(openPosition = {}, currentProfit = 0) {
//     const candidates = [
//         openPosition.peakProfit,
//         openPosition.maxProfit,
//         openPosition.max_profit,
//         openPosition.bestProfit,
//         openPosition.best_profit,
//         openPosition.highestProfit,
//         openPosition.highest_profit,
//         currentProfit,
//     ].map((v) => toNumber(v, Number.NEGATIVE_INFINITY));

//     const valid = candidates.filter(Number.isFinite);
//     if (!valid.length) return Math.max(0, toNumber(currentProfit, 0));

//     return Math.max(...valid, toNumber(currentProfit, 0), 0);
// }

// function getProfitRetractionRatio(openPosition = {}, currentProfit = 0) {
//     const peakProfit = getPeakProfit(openPosition, currentProfit);
//     const profit = toNumber(currentProfit, 0);

//     if (peakProfit <= 0) return 0;
//     if (profit >= peakProfit) return 0;

//     return clamp((peakProfit - profit) / peakProfit, 0, 2.0);
// }

// function getCandleBody(c = {}) {
//     return abs(toNumber(c.close, 0) - toNumber(c.open, 0));
// }

// function getCandleRange(c = {}) {
//     return abs(toNumber(c.high, 0) - toNumber(c.low, 0));
// }

// function isBullish(c = {}) {
//     return toNumber(c.close, 0) > toNumber(c.open, 0);
// }

// function isBearish(c = {}) {
//     return toNumber(c.close, 0) < toNumber(c.open, 0);
// }

// function getMidpoint(c = {}) {
//     return (toNumber(c.high, 0) + toNumber(c.low, 0)) / 2;
// }

// function detectExitConfirmation(candles = [], side = "") {
//     if (!Array.isArray(candles) || candles.length < 2) {
//         return { level: "LOW", score: 0 };
//     }

//     const s = normalizeSide(side);
//     const last = candles[candles.length - 1] || {};
//     const prev = candles[candles.length - 2] || {};
//     let score = 0;

//     const lastBody = getCandleBody(last);
//     const prevBody = getCandleBody(prev);
//     const lastRange = getCandleRange(last);
//     const bodyStrength = lastRange > 0 ? lastBody / lastRange : 0;

//     if (s === "BUY") {
//         if (isBearish(last)) score += 0.7;
//         if (isBearish(last) && isBearish(prev)) score += 0.6;
//         if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.8;
//     } else if (s === "SELL") {
//         if (isBullish(last)) score += 0.7;
//         if (isBullish(last) && isBullish(prev)) score += 0.6;
//         if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.8;
//     }

//     if (bodyStrength >= 0.6) score += 0.35;
//     if (lastBody > prevBody && prevBody > 0) score += 0.2;

//     if (score >= 1.8) return { level: "HIGH", score };
//     if (score >= 1.0) return { level: "MEDIUM", score };
//     return { level: "LOW", score };
// }

// function detectReversalScore(candles = [], side = "", mode = "NORMAL") {
//     if (!Array.isArray(candles) || candles.length < 3) return 0;

//     const s = normalizeSide(side);
//     const last = candles[candles.length - 1] || {};
//     const prev = candles[candles.length - 2] || {};
//     const prev2 = candles[candles.length - 3] || {};
//     let score = 0;

//     if (s === "BUY") {
//         if (isBearish(last)) score += 0.7;
//         if (isBearish(last) && isBearish(prev)) score += 0.8;
//         if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.8;
//         if (toNumber(prev.close, 0) < toNumber(prev2.low, 0)) score += 0.35;
//     } else if (s === "SELL") {
//         if (isBullish(last)) score += 0.7;
//         if (isBullish(last) && isBullish(prev)) score += 0.8;
//         if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.8;
//         if (toNumber(prev.close, 0) > toNumber(prev2.high, 0)) score += 0.35;
//     }

//     if (normalizeMode(mode) === "MICRO_SCALP") return score * 0.95;
//     if (normalizeMode(mode) === "SCALP") return score;
//     return score * 1.05;
// }

// function detectContinuationSignal(candles = [], side = "") {
//     if (!Array.isArray(candles) || candles.length < 3) {
//         return { continuation: false, strength: 0 };
//     }

//     const s = normalizeSide(side);
//     const last = candles[candles.length - 1] || {};
//     const prev = candles[candles.length - 2] || {};
//     const prev2 = candles[candles.length - 3] || {};

//     let strength = 0;

//     if (s === "BUY") {
//         if (isBullish(last)) strength += 0.8;
//         if (toNumber(last.close, 0) > toNumber(prev.high, 0)) strength += 0.9;
//         if (isBullish(prev2) && isBullish(last)) strength += 0.25;
//     } else if (s === "SELL") {
//         if (isBearish(last)) strength += 0.8;
//         if (toNumber(last.close, 0) < toNumber(prev.low, 0)) strength += 0.9;
//         if (isBearish(prev2) && isBearish(last)) strength += 0.25;
//     }

//     return {
//         continuation: strength >= 1.3,
//         strength,
//     };
// }

// function hasHardInvalidation(candles = [], side = "") {
//     if (!Array.isArray(candles) || candles.length < 2) return false;

//     const s = normalizeSide(side);
//     const last = candles[candles.length - 1] || {};
//     const prev = candles[candles.length - 2] || {};

//     if (s === "BUY") {
//         return toNumber(last.close, 0) < toNumber(prev.low, 0);
//     }
//     if (s === "SELL") {
//         return toNumber(last.close, 0) > toNumber(prev.high, 0);
//     }
//     return false;
// }

// function hasSoftInvalidation(candles = [], side = "") {
//     if (!Array.isArray(candles) || candles.length < 3) return false;

//     const s = normalizeSide(side);
//     const last = candles[candles.length - 1] || {};
//     const prev = candles[candles.length - 2] || {};
//     const prev2 = candles[candles.length - 3] || {};

//     const lastClose = toNumber(last.close, 0);
//     const prevClose = toNumber(prev.close, 0);
//     const prev2Close = toNumber(prev2.close, 0);

//     const lastLow = toNumber(last.low, 0);
//     const prevLow = toNumber(prev.low, 0);
//     const lastHigh = toNumber(last.high, 0);
//     const prevHigh = toNumber(prev.high, 0);

//     if (s === "BUY") {
//         const bearishPressure =
//             isBearish(last) &&
//             isBearish(prev) &&
//             lastClose < prevClose &&
//             prevClose < prev2Close;

//         const weakStructure =
//             lastClose < prevLow ||
//             lastLow < prevLow;

//         return bearishPressure && weakStructure;
//     }

//     if (s === "SELL") {
//         const bullishPressure =
//             isBullish(last) &&
//             isBullish(prev) &&
//             lastClose > prevClose &&
//             prevClose > prev2Close;

//         const weakStructure =
//             lastClose > prevHigh ||
//             lastHigh > prevHigh;

//         return bullishPressure && weakStructure;
//     }

//     return false;
// }

// function detectWrongWayFlowScore(candles = [], side = "") {
//     const sample = Array.isArray(candles) ? candles.slice(-10) : [];
//     const s = normalizeSide(side);

//     if (!sample.length || (s !== "BUY" && s !== "SELL")) {
//         return {
//             score: 0,
//             breakdown: {},
//         };
//     }

//     const recent5 = sample.slice(-5);
//     const recent4 = sample.slice(-4);
//     const recent3 = sample.slice(-3);

//     let score = 0;

//     const closes = sample.map((c) => toNumber(c.close, 0));
//     const highs = sample.map((c) => toNumber(c.high, 0));
//     const lows = sample.map((c) => toNumber(c.low, 0));
//     const midpoint10 = ((Math.max(...highs) + Math.min(...lows)) / 2);

//     const bearishCount4 = recent4.filter(isBearish).length;
//     const bullishCount4 = recent4.filter(isBullish).length;

//     const last = recent5[recent5.length - 1] || {};
//     const prev = recent5[recent5.length - 2] || {};

//     const avgBullBody5 =
//         recent5.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//         Math.max(1, recent5.filter(isBullish).length);

//     const avgBearBody5 =
//         recent5.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//         Math.max(1, recent5.filter(isBearish).length);

//     const lowerCloseStreak =
//         recent3.length >= 3 &&
//         toNumber(recent3[2].close, 0) < toNumber(recent3[1].close, 0) &&
//         toNumber(recent3[1].close, 0) < toNumber(recent3[0].close, 0);

//     const higherCloseStreak =
//         recent3.length >= 3 &&
//         toNumber(recent3[2].close, 0) > toNumber(recent3[1].close, 0) &&
//         toNumber(recent3[1].close, 0) > toNumber(recent3[0].close, 0);

//     const lowerLowFlow =
//         recent3.length >= 3 &&
//         toNumber(recent3[2].low, 0) < toNumber(recent3[1].low, 0) &&
//         toNumber(recent3[1].low, 0) <= toNumber(recent3[0].low, 0);

//     const higherHighFlow =
//         recent3.length >= 3 &&
//         toNumber(recent3[2].high, 0) > toNumber(recent3[1].high, 0) &&
//         toNumber(recent3[1].high, 0) >= toNumber(recent3[0].high, 0);

//     const closeBelowMidpoint = toNumber(last.close, 0) < midpoint10;
//     const closeAboveMidpoint = toNumber(last.close, 0) > midpoint10;

//     const softInvalidation = hasSoftInvalidation(sample, s);
//     const hardInvalidation = hasHardInvalidation(sample, s);

//     if (s === "BUY") {
//         if (bearishCount4 >= 3) score += 0.65;
//         if (lowerCloseStreak) score += 0.55;
//         if (lowerLowFlow) score += 0.50;
//         if (closeBelowMidpoint) score += 0.40;
//         if (isBearish(last) && isBearish(prev)) score += 0.35;
//         if (getCandleBody(last) >= getCandleBody(prev) * 0.9 && isBearish(last)) score += 0.20;
//         if (avgBearBody5 > avgBullBody5 * 1.25) score += 0.30;
//         if (toNumber(last.high, 0) <= toNumber(prev.high, 0) && isBearish(last)) score += 0.18;
//     } else if (s === "SELL") {
//         if (bullishCount4 >= 3) score += 0.65;
//         if (higherCloseStreak) score += 0.55;
//         if (higherHighFlow) score += 0.50;
//         if (closeAboveMidpoint) score += 0.40;
//         if (isBullish(last) && isBullish(prev)) score += 0.35;
//         if (getCandleBody(last) >= getCandleBody(prev) * 0.9 && isBullish(last)) score += 0.20;
//         if (avgBullBody5 > avgBearBody5 * 1.25) score += 0.30;
//         if (toNumber(last.low, 0) >= toNumber(prev.low, 0) && isBullish(last)) score += 0.18;
//     }

//     if (softInvalidation) score += 0.35;
//     if (hardInvalidation) score += 0.60;

//     return {
//         score: Number(score.toFixed(4)),
//         breakdown: {
//             bearishCount4,
//             bullishCount4,
//             lowerCloseStreak,
//             higherCloseStreak,
//             lowerLowFlow,
//             higherHighFlow,
//             closeBelowMidpoint,
//             closeAboveMidpoint,
//             avgBullBody5: Number(avgBullBody5.toFixed(5)),
//             avgBearBody5: Number(avgBearBody5.toFixed(5)),
//             midpoint10: Number(midpoint10.toFixed(5)),
//             softInvalidation,
//             hardInvalidation,
//         },
//     };
// }

// function detectNoFollowThrough(candles = [], side = "") {
//     const sample = Array.isArray(candles) ? candles.slice(-6) : [];
//     const s = normalizeSide(side);

//     if (sample.length < 5 || (s !== "BUY" && s !== "SELL")) {
//         return {
//             score: 0,
//             detected: false,
//             breakdown: {},
//         };
//     }

//     const highs = sample.map((c) => toNumber(c.high, 0));
//     const lows = sample.map((c) => toNumber(c.low, 0));
//     const closes = sample.map((c) => toNumber(c.close, 0));

//     const last = sample[sample.length - 1] || {};
//     const prev = sample[sample.length - 2] || {};
//     const recent4 = sample.slice(-4);
//     const recent3 = sample.slice(-3);

//     let score = 0;

//     if (s === "SELL") {
//         const noNewLow =
//             Math.min(...recent4.map((c) => toNumber(c.low, 0))) >=
//             Math.min(...sample.slice(0, 2).map((c) => toNumber(c.low, 0)));

//         const bullishInterruptions = recent4.filter(isBullish).length;
//         const closeAboveMidpoint5 =
//             toNumber(last.close, 0) > ((Math.max(...highs) + Math.min(...lows)) / 2);

//         const higherLowShort =
//             recent3.length >= 3 &&
//             toNumber(recent3[2].low, 0) >= toNumber(recent3[1].low, 0) &&
//             toNumber(recent3[1].low, 0) >= toNumber(recent3[0].low, 0);

//         const bullishBodyPressure =
//             recent4.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) >
//             recent4.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0);

//         if (noNewLow) score += 0.70;
//         if (bullishInterruptions >= 2) score += 0.55;
//         if (closeAboveMidpoint5) score += 0.45;
//         if (higherLowShort) score += 0.40;
//         if (bullishBodyPressure) score += 0.30;

//         return {
//             score: Number(score.toFixed(4)),
//             detected: score >= 1.8,
//             breakdown: {
//                 noNewLow,
//                 bullishInterruptions,
//                 closeAboveMidpoint5,
//                 higherLowShort,
//                 bullishBodyPressure,
//             },
//         };
//     }

//     if (s === "BUY") {
//         const noNewHigh =
//             Math.max(...recent4.map((c) => toNumber(c.high, 0))) <=
//             Math.max(...sample.slice(0, 2).map((c) => toNumber(c.high, 0)));

//         const bearishInterruptions = recent4.filter(isBearish).length;
//         const closeBelowMidpoint5 =
//             toNumber(last.close, 0) < ((Math.max(...highs) + Math.min(...lows)) / 2);

//         const lowerHighShort =
//             recent3.length >= 3 &&
//             toNumber(recent3[2].high, 0) <= toNumber(recent3[1].high, 0) &&
//             toNumber(recent3[1].high, 0) <= toNumber(recent3[0].high, 0);

//         const bearishBodyPressure =
//             recent4.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) >
//             recent4.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0);

//         if (noNewHigh) score += 0.70;
//         if (bearishInterruptions >= 2) score += 0.55;
//         if (closeBelowMidpoint5) score += 0.45;
//         if (lowerHighShort) score += 0.40;
//         if (bearishBodyPressure) score += 0.30;

//         return {
//             score: Number(score.toFixed(4)),
//             detected: score >= 1.8,
//             breakdown: {
//                 noNewHigh,
//                 bearishInterruptions,
//                 closeBelowMidpoint5,
//                 lowerHighShort,
//                 bearishBodyPressure,
//             },
//         };
//     }

//     return {
//         score: 0,
//         detected: false,
//         breakdown: {},
//     };
// }

// function detectOppositeTakeover(candles = [], side = "") {
//     const sample = Array.isArray(candles) ? candles.slice(-8) : [];
//     const s = normalizeSide(side);

//     if (sample.length < 5 || (s !== "BUY" && s !== "SELL")) {
//         return {
//             score: 0,
//             detected: false,
//             breakdown: {},
//         };
//     }

//     const last5 = sample.slice(-5);
//     const recent3 = sample.slice(-3);

//     let score = 0;

//     if (s === "SELL") {
//         const bullishCount5 = last5.filter(isBullish).length;
//         const higherLowFlow =
//             recent3.length >= 3 &&
//             toNumber(recent3[2].low, 0) > toNumber(recent3[1].low, 0) &&
//             toNumber(recent3[1].low, 0) >= toNumber(recent3[0].low, 0);

//         const higherCloseFlow =
//             recent3.length >= 3 &&
//             toNumber(recent3[2].close, 0) > toNumber(recent3[1].close, 0) &&
//             toNumber(recent3[1].close, 0) > toNumber(recent3[0].close, 0);

//         const avgBullBody =
//             last5.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, last5.filter(isBullish).length);

//         const avgBearBody =
//             last5.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, last5.filter(isBearish).length);

//         const lastClose = toNumber(last5[last5.length - 1]?.close, 0);
//         const rangeMid =
//             (Math.max(...last5.map((c) => toNumber(c.high, 0))) +
//                 Math.min(...last5.map((c) => toNumber(c.low, 0)))) / 2;

//         if (bullishCount5 >= 3) score += 0.70;
//         if (higherLowFlow) score += 0.55;
//         if (higherCloseFlow) score += 0.50;
//         if (avgBullBody > avgBearBody * 1.20) score += 0.35;
//         if (lastClose > rangeMid) score += 0.30;

//         return {
//             score: Number(score.toFixed(4)),
//             detected: score >= 2.0,
//             breakdown: {
//                 bullishCount5,
//                 higherLowFlow,
//                 higherCloseFlow,
//                 avgBullBody: Number(avgBullBody.toFixed(5)),
//                 avgBearBody: Number(avgBearBody.toFixed(5)),
//                 lastClose,
//                 rangeMid: Number(rangeMid.toFixed(5)),
//             },
//         };
//     }

//     if (s === "BUY") {
//         const bearishCount5 = last5.filter(isBearish).length;
//         const lowerHighFlow =
//             recent3.length >= 3 &&
//             toNumber(recent3[2].high, 0) < toNumber(recent3[1].high, 0) &&
//             toNumber(recent3[1].high, 0) <= toNumber(recent3[0].high, 0);

//         const lowerCloseFlow =
//             recent3.length >= 3 &&
//             toNumber(recent3[2].close, 0) < toNumber(recent3[1].close, 0) &&
//             toNumber(recent3[1].close, 0) < toNumber(recent3[0].close, 0);

//         const avgBearBody =
//             last5.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, last5.filter(isBearish).length);

//         const avgBullBody =
//             last5.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, last5.filter(isBullish).length);

//         const lastClose = toNumber(last5[last5.length - 1]?.close, 0);
//         const rangeMid =
//             (Math.max(...last5.map((c) => toNumber(c.high, 0))) +
//                 Math.min(...last5.map((c) => toNumber(c.low, 0)))) / 2;

//         if (bearishCount5 >= 3) score += 0.70;
//         if (lowerHighFlow) score += 0.55;
//         if (lowerCloseFlow) score += 0.50;
//         if (avgBearBody > avgBullBody * 1.20) score += 0.35;
//         if (lastClose < rangeMid) score += 0.30;

//         return {
//             score: Number(score.toFixed(4)),
//             detected: score >= 2.0,
//             breakdown: {
//                 bearishCount5,
//                 lowerHighFlow,
//                 lowerCloseFlow,
//                 avgBearBody: Number(avgBearBody.toFixed(5)),
//                 avgBullBody: Number(avgBullBody.toFixed(5)),
//                 lastClose,
//                 rangeMid: Number(rangeMid.toFixed(5)),
//             },
//         };
//     }

//     return {
//         score: 0,
//         detected: false,
//         breakdown: {},
//     };
// }

// function shouldTakeProfitOnLowVolume({
//     historicalVolumeSignal = null,
//     holdingMinutes = 0,
//     currentProfit = 0,
//     mode = "NORMAL",
// }) {
//     const hv = String(historicalVolumeSignal || "").toUpperCase();
//     if (hv !== "LOW_VOLUME") return false;
//     if (currentProfit <= 0) return false;

//     const profile = getExitProfile(mode);
//     return holdingMinutes >= profile.lowVolumeProfitMinutes;
// }

// function shouldSimpleWrongWayCut({
//     currentProfit = 0,
//     holdingMinutes = 0,
//     reversalScore = 0,
//     mode = "NORMAL",
//     confirmation = { level: "LOW", score: 0 },
//     softInvalidation = false,
//     hardInvalidation = false,
// }) {
//     const profile = getExitProfile(mode);
//     const profit = toNumber(currentProfit, 0);
//     const mins = toNumber(holdingMinutes, 0);

//     if (
//         profit <= profile.strongCutProfit &&
//         reversalScore >= profile.reversalCutScore &&
//         (softInvalidation || hardInvalidation || confirmation.level !== "LOW")
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: `${normalizeMode(mode)}_STRONG_REVERSAL_CUT`,
//         };
//     }

//     if (
//         mins >= profile.simpleCutMinutes &&
//         profit <= profile.simpleCutProfit &&
//         (softInvalidation || hardInvalidation || confirmation.level === "HIGH")
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: `${normalizeMode(mode)}_TIME_BASED_WRONG_WAY_CUT`,
//         };
//     }

//     return null;
// }

// function shouldNormalFastWrongWayCut({
//     mode = "NORMAL",
//     currentProfit = 0,
//     holdingMinutes = 0,
//     reversalScore = 0,
//     candles = [],
//     side = "",
//     confirmation = { level: "LOW", score: 0 },
// }) {
//     if (normalizeMode(mode) !== "NORMAL") return null;

//     const profile = getExitProfile("NORMAL");
//     const profit = toNumber(currentProfit, 0);
//     const mins = toNumber(holdingMinutes, 0);

//     const hardInvalidation = hasHardInvalidation(candles, side);
//     const softInvalidation = hasSoftInvalidation(candles, side);

//     if (
//         mins >= profile.normalFastCutMinutes &&
//         profit <= profile.normalStructureBreakProfit &&
//         (hardInvalidation || (softInvalidation && confirmation.level !== "LOW"))
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: "NORMAL_STRUCTURE_BREAK_FAST_CUT",
//         };
//     }

//     if (
//         mins >= profile.normalFastCutMinutes &&
//         profit <= profile.normalFastCutProfit &&
//         reversalScore >= profile.normalFastReversalScore &&
//         (hardInvalidation || softInvalidation)
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: "NORMAL_FAST_WRONG_WAY_CUT",
//         };
//     }

//     return null;
// }

// function shouldWrongWayFlowCut({
//     currentProfit = 0,
//     holdingMinutes = 0,
//     wrongWayFlowScore = 0,
//     softInvalidation = false,
//     hardInvalidation = false,
//     confirmation = { level: "LOW", score: 0 },
//     mode = "NORMAL",
// }) {
//     const profile = getExitProfile(mode);
//     const profit = toNumber(currentProfit, 0);
//     const mins = toNumber(holdingMinutes, 0);

//     if (profit > 0) return null;
//     if (mins < profile.wrongWayMinMinutes) return null;

//     const confidenceBoost =
//         (softInvalidation ? 0.25 : 0) +
//         (hardInvalidation ? 0.50 : 0) +
//         (confirmation.level === "HIGH" ? 0.35 : confirmation.level === "MEDIUM" ? 0.18 : 0);

//     const effectiveFlowScore = wrongWayFlowScore + confidenceBoost;

//     if (
//         profit <= profile.wrongWayHardCutProfit &&
//         effectiveFlowScore >= profile.wrongWayFlowHardScore
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: `${normalizeMode(mode)}_WRONG_WAY_FLOW_HARD_CUT`,
//             effectiveFlowScore,
//         };
//     }

//     if (
//         profit <= profile.wrongWayCutProfit &&
//         effectiveFlowScore >= profile.wrongWayFlowCutScore
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: `${normalizeMode(mode)}_WRONG_WAY_FLOW_CUT`,
//             effectiveFlowScore,
//         };
//     }

//     return null;
// }

// function shouldNoFollowThroughCut({
//     currentProfit = 0,
//     holdingMinutes = 0,
//     noFollowThrough = { score: 0, detected: false },
//     mode = "NORMAL",
// }) {
//     const profile = getExitProfile(mode);
//     const profit = toNumber(currentProfit, 0);
//     const mins = toNumber(holdingMinutes, 0);

//     if (profit > 0) return null;
//     if (mins < profile.noFollowThroughMinMinutes) return null;

//     if (
//         profit <= profile.noFollowThroughCutProfit &&
//         toNumber(noFollowThrough.score, 0) >= profile.noFollowThroughScore
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: `${normalizeMode(mode)}_NO_FOLLOW_THROUGH_CUT`,
//         };
//     }

//     return null;
// }

// function shouldTakeoverCut({
//     currentProfit = 0,
//     takeover = { score: 0, detected: false },
//     mode = "NORMAL",
// }) {
//     const profile = getExitProfile(mode);
//     const profit = toNumber(currentProfit, 0);

//     if (profit > 0) return null;

//     if (
//         profit <= profile.takeoverCutProfit &&
//         toNumber(takeover.score, 0) >= profile.takeoverCutScore
//     ) {
//         return {
//             action: "CUT_LOSS_NOW",
//             reason: `${normalizeMode(mode)}_OPPOSITE_TAKEOVER_CUT`,
//         };
//     }

//     return null;
// }

// function shouldEngineTakeSmallProfit({
//     currentProfit = 0,
//     openPosition = {},
//     reversalScore = 0,
//     confirmation = { level: "LOW", score: 0 },
//     continuation = { continuation: false, strength: 0 },
//     failedPatternRule = null,
//     mode = "NORMAL",
// }) {
//     const profile = getExitProfile(mode);
//     const profit = toNumber(currentProfit, 0);
//     const peakProfit = getPeakProfit(openPosition, profit);
//     const retraceRatio = getProfitRetractionRatio(openPosition, profit);

//     if (profit <= 0) return false;
//     if (continuation.continuation) return false;
//     if (peakProfit < profile.minPeakBeforeProtect) return false;
//     if (peakProfit < profile.armProfitMin) return false;
//     if (profit < profile.takeProfitMinProfit) return false;
//     if (retraceRatio < profile.tpMinRetraceRatio) return false;

//     if (failedPatternRule && profit >= profile.failedPatternTakeProfitMin) return true;

//     const strongRisk =
//         confirmation.level === "HIGH" ||
//         reversalScore >= profile.strongStructureScore;

//     return strongRisk;
// }

// function shouldEngineMoveToBE({
//     currentProfit = 0,
//     openPosition = {},
//     reversalScore = 0,
//     confirmation = { level: "LOW", score: 0 },
//     continuation = { continuation: false, strength: 0 },
//     failedPatternRule = null,
//     mode = "NORMAL",
// }) {
//     const profile = getExitProfile(mode);
//     const profit = toNumber(currentProfit, 0);
//     const peakProfit = getPeakProfit(openPosition, profit);
//     const retraceRatio = getProfitRetractionRatio(openPosition, profit);

//     if (profit <= 0) return false;
//     if (continuation.continuation) return false;
//     if (profit < profile.moveToBeMinProfit) return false;
//     if (peakProfit < profile.armProfitMin) return false;
//     if (peakProfit <= profit) return false;
//     if (retraceRatio < profile.beMinRetraceRatio) return false;
//     if (retraceRatio >= profile.tpMinRetraceRatio) return false;

//     const moderateRisk =
//         failedPatternRule ||
//         confirmation.level === "MEDIUM" ||
//         confirmation.level === "HIGH" ||
//         reversalScore >= profile.weakStructureScore;

//     return !!moderateRisk;
// }

// async function findFailedPatternRule({
//     userId,
//     accountId = null,
//     symbol,
//     timeframe,
//     side,
//     mode,
//     pattern,
//     price,
//     candlesM,
// }) {
//     const contextFeatures = buildContextFeatures({
//         symbol,
//         timeframe,
//         side,
//         mode,
//         pattern,
//         marketPrice: price || 0,
//         candlesM,
//         now: new Date(),
//     });

//     const contextHash = buildContextHashNew(contextFeatures);

//     return await findFailedPatternForEarly({
//         userId: userId || null,
//         accountId,
//         symbol,
//         timeframe,
//         side,
//         mode,
//         contextHash,
//     });
// }

// async function analyzeEarlyExit({
//     firebaseUserId,
//     symbol,
//     openPosition,
//     currentProfit = 0,
//     candles = [],
//     mode = "NORMAL",
//     price,
//     timeframe = "M5",
//     historicalVolume = null,
//     pattern = null,
//     accountId = null,
// }) {
//     openPosition = openPosition || {};

//     const side = normalizeSide(
//         openPosition.side ||
//         openPosition.type ||
//         openPosition.positionSide ||
//         ""
//     );

//     const normalizedMode = normalizeMode(mode || openPosition.mode || "NORMAL");
//     const profile = getExitProfile(normalizedMode);
//     const profit = toNumber(currentProfit, 0);
//     const historicalVolumeSignal = historicalVolume?.signal || historicalVolume || null;

//     if (!openPosition.currentPrice && price) {
//         openPosition = {
//             ...openPosition,
//             currentPrice: price,
//         };
//     }

//     const holdingMinutes = getHoldingMinutes(openPosition);
//     const confirmation = detectExitConfirmation(candles, side);
//     const continuation = detectContinuationSignal(candles, side);
//     const hardInvalidation = hasHardInvalidation(candles, side);
//     const softInvalidation = hasSoftInvalidation(candles, side);
//     const wrongWayFlow = detectWrongWayFlowScore(candles, side);
//     const noFollowThrough = detectNoFollowThrough(candles, side);
//     const takeover = detectOppositeTakeover(candles, side);

//     let adjustedScore =
//         detectReversalScore(candles, side, normalizedMode) +
//         toNumber(confirmation.score, 0) * 0.25 -
//         toNumber(continuation.strength, 0) * 0.35;

//     if (!Number.isFinite(adjustedScore)) adjustedScore = 0;

//     let riskLevel = "LOW";

//     const failedPatternRule = await findFailedPatternRule({
//         userId: firebaseUserId,
//         accountId,
//         symbol,
//         timeframe,
//         side,
//         mode: normalizedMode,
//         pattern,
//         price,
//         candlesM: candles,
//     });

//     const failedPatternCandidate = failedPatternRule;

//     const safeHoldingMinutes = Number.isFinite(Number(holdingMinutes))
//         ? Number(holdingMinutes)
//         : 0;

//     // กัน FAILED_PATTERN_EARLY_EXIT เร็วเกินในช่วงต้นไม้ของ SCALP
//     if (failedPatternRule && normalizedMode === "SCALP" && safeHoldingMinutes < 5) {
//         failedPatternRule = null;
//     }

//     if (failedPatternRule) {
//         riskLevel = "CRITICAL";
//         adjustedScore += 0.65;
//     } else if (adjustedScore >= profile.reversalCutScore) {
//         riskLevel = "HIGH";
//     } else if (adjustedScore >= profile.reversalCutScore * 0.7) {
//         riskLevel = "MEDIUM";
//     }

//     // ===== WRONG-WAY CUT LANE =====
//     if (profit <= 0) {
//         if (failedPatternRule && profit <= profile.failedPatternCutProfit) {
//             return {
//                 action: "CUT_LOSS_NOW",
//                 reason: "FAILED_PATTERN_EARLY_EXIT",
//                 riskLevel: "CRITICAL",
//                 score: adjustedScore,
//                 meta: {
//                     wrongWayFlowScore: wrongWayFlow.score,
//                     noFollowThroughScore: noFollowThrough.score,
//                     takeoverScore: takeover.score,
//                     holdingMinutes,
//                     softInvalidation,
//                     hardInvalidation,
//                 },
//             };
//         }

//         const takeoverCut = shouldTakeoverCut({
//             currentProfit: profit,
//             takeover,
//             mode: normalizedMode,
//         });

//         if (takeoverCut) {
//             return {
//                 action: takeoverCut.action,
//                 reason: takeoverCut.reason,
//                 riskLevel: "HIGH",
//                 score: adjustedScore,
//                 meta: {
//                     holdingMinutes,
//                     wrongWayFlowScore: wrongWayFlow.score,
//                     noFollowThroughScore: noFollowThrough.score,
//                     takeoverScore: takeover.score,
//                     takeoverBreakdown: takeover.breakdown,
//                     softInvalidation,
//                     hardInvalidation,
//                     confirmation: confirmation.level,
//                 },
//             };
//         }

//         const noFollowThroughCut = shouldNoFollowThroughCut({
//             currentProfit: profit,
//             holdingMinutes,
//             noFollowThrough,
//             mode: normalizedMode,
//         });

//         if (noFollowThroughCut) {
//             return {
//                 action: noFollowThroughCut.action,
//                 reason: noFollowThroughCut.reason,
//                 riskLevel: "HIGH",
//                 score: adjustedScore,
//                 meta: {
//                     holdingMinutes,
//                     wrongWayFlowScore: wrongWayFlow.score,
//                     noFollowThroughScore: noFollowThrough.score,
//                     takeoverScore: takeover.score,
//                     noFollowThroughBreakdown: noFollowThrough.breakdown,
//                     softInvalidation,
//                     hardInvalidation,
//                     confirmation: confirmation.level,
//                 },
//             };
//         }

//         const wrongWayCut = shouldWrongWayFlowCut({
//             currentProfit: profit,
//             holdingMinutes,
//             wrongWayFlowScore: wrongWayFlow.score,
//             softInvalidation,
//             hardInvalidation,
//             confirmation,
//             mode: normalizedMode,
//         });

//         if (wrongWayCut) {
//             return {
//                 action: wrongWayCut.action,
//                 reason: wrongWayCut.reason,
//                 riskLevel: "HIGH",
//                 score: adjustedScore,
//                 meta: {
//                     holdingMinutes,
//                     wrongWayFlowScore: wrongWayFlow.score,
//                     effectiveFlowScore: wrongWayCut.effectiveFlowScore,
//                     wrongWayBreakdown: wrongWayFlow.breakdown,
//                     noFollowThroughScore: noFollowThrough.score,
//                     takeoverScore: takeover.score,
//                     softInvalidation,
//                     hardInvalidation,
//                     confirmation: confirmation.level,
//                 },
//             };
//         }

//         const simpleCut = shouldSimpleWrongWayCut({
//             currentProfit: profit,
//             holdingMinutes,
//             reversalScore: adjustedScore,
//             mode: normalizedMode,
//             confirmation,
//             softInvalidation,
//             hardInvalidation,
//         });

//         if (simpleCut) {
//             return {
//                 action: simpleCut.action,
//                 reason: simpleCut.reason,
//                 riskLevel: "HIGH",
//                 score: adjustedScore,
//                 meta: {
//                     holdingMinutes,
//                     wrongWayFlowScore: wrongWayFlow.score,
//                     wrongWayBreakdown: wrongWayFlow.breakdown,
//                     noFollowThroughScore: noFollowThrough.score,
//                     takeoverScore: takeover.score,
//                     softInvalidation,
//                     hardInvalidation,
//                     confirmation: confirmation.level,
//                 },
//             };
//         }

//         const normalFastCut = shouldNormalFastWrongWayCut({
//             mode: normalizedMode,
//             currentProfit: profit,
//             holdingMinutes,
//             reversalScore: adjustedScore,
//             candles,
//             side,
//             confirmation,
//         });

//         if (normalFastCut) {
//             return {
//                 action: normalFastCut.action,
//                 reason: normalFastCut.reason,
//                 riskLevel: "HIGH",
//                 score: adjustedScore,
//                 meta: {
//                     holdingMinutes,
//                     wrongWayFlowScore: wrongWayFlow.score,
//                     wrongWayBreakdown: wrongWayFlow.breakdown,
//                     noFollowThroughScore: noFollowThrough.score,
//                     takeoverScore: takeover.score,
//                     softInvalidation,
//                     hardInvalidation,
//                     confirmation: confirmation.level,
//                 },
//             };
//         }

//         return {
//             action: "HOLD",
//             reason: `WRONG_WAY_NOT_CONFIRMED_YET(score=${adjustedScore}, flow=${wrongWayFlow.score}, nf=${noFollowThrough.score}, tk=${takeover.score}, mode=${normalizedMode})`,
//             riskLevel,
//             score: adjustedScore,
//             meta: {
//                 holdingMinutes,
//                 wrongWayFlowScore: wrongWayFlow.score,
//                 wrongWayBreakdown: wrongWayFlow.breakdown,
//                 noFollowThroughScore: noFollowThrough.score,
//                 noFollowThroughBreakdown: noFollowThrough.breakdown,
//                 takeoverScore: takeover.score,
//                 takeoverBreakdown: takeover.breakdown,
//                 softInvalidation,
//                 hardInvalidation,
//                 confirmation: confirmation.level,
//             },
//         };
//     }

//     // ===== PROFIT PROTECT LANE =====
//     if (continuation.continuation) {
//         return {
//             action: "HOLD",
//             reason: `${normalizedMode}_CONTINUATION_HOLD`,
//             riskLevel: "LOW",
//             score: adjustedScore,
//         };
//     }

//     if (
//         shouldTakeProfitOnLowVolume({
//             historicalVolumeSignal,
//             holdingMinutes,
//             currentProfit: profit,
//             mode: normalizedMode,
//         }) &&
//         getPeakProfit(openPosition, profit) >= profile.minPeakBeforeProtect &&
//         getProfitRetractionRatio(openPosition, profit) >= profile.beMinRetraceRatio
//     ) {
//         return {
//             action: "TAKE_SMALL_PROFIT",
//             reason: `${normalizedMode}_LOW_VOLUME_PROTECT`,
//             riskLevel,
//             score: adjustedScore,
//         };
//     }

//     if (
//         shouldEngineTakeSmallProfit({
//             currentProfit: profit,
//             openPosition,
//             reversalScore: adjustedScore,
//             confirmation,
//             continuation,
//             failedPatternRule,
//             mode: normalizedMode,
//         })
//     ) {
//         return {
//             action: "TAKE_SMALL_PROFIT",
//             reason: `${normalizedMode}_REVERSAL_PROFIT_PROTECT`,
//             riskLevel,
//             score: adjustedScore,
//             meta: {
//                 peakProfit: getPeakProfit(openPosition, profit),
//                 retractionRatio: getProfitRetractionRatio(openPosition, profit),
//                 confirmation: confirmation.level,
//                 continuation: continuation.strength,
//             },
//         };
//     }

//     if (
//         shouldEngineMoveToBE({
//             currentProfit: profit,
//             openPosition,
//             reversalScore: adjustedScore,
//             confirmation,
//             continuation,
//             failedPatternRule,
//             mode: normalizedMode,
//         })
//     ) {
//         return {
//             action: "MOVE_TO_BE",
//             reason: `${normalizedMode}_CONTEXTUAL_BREAKEVEN_PROTECT`,
//             riskLevel,
//             score: adjustedScore,
//             meta: {
//                 peakProfit: getPeakProfit(openPosition, profit),
//                 retractionRatio: getProfitRetractionRatio(openPosition, profit),
//                 confirmation: confirmation.level,
//                 continuation: continuation.strength,
//             },
//         };
//     }

//     return {
//         action: "HOLD",
//         reason: `No strong exit signal (score=${adjustedScore}, mode=${normalizedMode}, confirm=${confirmation.level})`,
//         riskLevel,
//         score: adjustedScore,
//     };
// }

// module.exports = {
//     analyzeEarlyExit,
// };
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
            armProfitMin: 0.35,
            moveToBeMinProfit: 0.26,
            takeProfitMinProfit: 0.42,
            minPeakBeforeProtect: 0.45,
            beMinRetraceRatio: 0.18,
            tpMinRetraceRatio: 0.32,

            wrongWayMinMinutes: 1.5,
            wrongWayCutProfit: -0.08,
            wrongWayHardCutProfit: -0.14,
            wrongWayFlowCutScore: 2.05,
            wrongWayFlowHardScore: 2.65,

            noFollowThroughMinMinutes: 1.5,
            noFollowThroughCutProfit: -0.06,
            noFollowThroughScore: 1.95,

            takeoverCutProfit: -0.04,
            takeoverCutScore: 2.10,

            simpleCutMinutes: 3,
            simpleCutProfit: -0.20,
            strongCutProfit: -0.12,
            reversalCutScore: 2.0,

            lowVolumeProfitMinutes: 5,
            failedPatternCutProfit: 0.05,
            failedPatternTakeProfitMin: 0.25,

            weakStructureScore: 1.15,
            strongStructureScore: 1.75,

            normalFastCutMinutes: 2.5,
            normalFastCutProfit: -0.06,
            normalStructureBreakProfit: -0.04,
            normalFastReversalScore: 1.6,
        };
    }

    if (normalized === "SCALP") {
        return {
            armProfitMin: 0.55,
            moveToBeMinProfit: 0.35,
            takeProfitMinProfit: 0.60,
            minPeakBeforeProtect: 0.70,
            beMinRetraceRatio: 0.16,
            tpMinRetraceRatio: 0.28,

            holdToBEProfit: 0.55,

            simpleCutMinutes: 8,
            simpleCutProfit: -0.34,

            strongCutProfit: -0.26,
            reversalCutScore: 2.70,

            wrongWayMinMinutes: 6.0,
            wrongWayCutProfit: -0.20,
            wrongWayHardCutProfit: -0.34,
            wrongWayFlowCutScore: 2.55,
            wrongWayFlowHardScore: 3.05,

            noFollowThroughMinMinutes: 6.0,
            noFollowThroughCutProfit: -0.18,
            noFollowThroughScore: 2.50,

            takeoverCutProfit: -0.08,
            takeoverCutScore: 2.30,

            lowVolumeProfitMinutes: 8,
            failedPatternCutProfit: 0.14,
            failedPatternTakeProfitMin: 0.45,

            weakStructureScore: 1.20,
            strongStructureScore: 1.95,

            normalFastCutMinutes: 5,
            normalFastCutProfit: -0.10,
            normalStructureBreakProfit: -0.06,
            normalFastReversalScore: 2.00,
        };
    }

    return {
        armProfitMin: 1.10,
        moveToBeMinProfit: 0.75,
        takeProfitMinProfit: 1.20,
        minPeakBeforeProtect: 1.35,
        beMinRetraceRatio: 0.15,
        tpMinRetraceRatio: 0.25,

        holdToBEProfit: 0.65,

        simpleCutMinutes: 10,
        simpleCutProfit: -0.35,

        strongCutProfit: -0.24,
        reversalCutScore: 2.30,

        wrongWayMinMinutes: 4.0,
        wrongWayCutProfit: -0.17,
        wrongWayHardCutProfit: -0.32,
        wrongWayFlowCutScore: 2.55,
        wrongWayFlowHardScore: 3.10,

        noFollowThroughMinMinutes: 4.0,
        noFollowThroughCutProfit: -0.14,
        noFollowThroughScore: 2.20,

        takeoverCutProfit: -0.10,
        takeoverCutScore: 2.40,

        lowVolumeProfitMinutes: 15,
        failedPatternCutProfit: 0.10,
        failedPatternTakeProfitMin: 0.35,

        weakStructureScore: 1.30,
        strongStructureScore: 2.10,

        normalFastCutMinutes: 5,
        normalFastCutProfit: -0.10,
        normalStructureBreakProfit: -0.05,
        normalFastReversalScore: 1.8,
    };
}

function toSafeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function countTrue(list = []) {
    return list.filter(Boolean).length;
}

function buildHardCutGate({
    mode,
    holdingMinutes,
    currentProfit,
    slPoints,
    failedPatternRule,
    wrongWayFlowScore,
    reversalScore,
    noFollowThroughScore,
    hardInvalidation,
    softInvalidation,
}) {
    const safeMode = normalizeMode(mode);
    const mins = toSafeNumber(holdingMinutes, 0);
    const profit = toSafeNumber(currentProfit, 0);
    const sl = Math.max(toSafeNumber(slPoints, 0), 1);

    const damageRatio = profit < 0 ? Math.abs(profit) / sl : 0;

    if (safeMode === "SCALP") {
        const timeReady = mins >= 7;

        const damageReady =
            damageRatio >= 0.42 ||
            profit <= -Math.max(220, Math.min(sl * 0.45, 300));

        const structureReady =
            Boolean(hardInvalidation) ||
            (Boolean(failedPatternRule) && mins >= 7) ||
            toSafeNumber(reversalScore, 0) >= 2.75;

        const flowReady =
            toSafeNumber(wrongWayFlowScore, 0) >= 2.75 ||
            toSafeNumber(noFollowThroughScore, 0) >= 2.50;

        const emergencyCut =
            mins >= 3 &&
            damageRatio >= 0.65 &&
            (
                Boolean(hardInvalidation) ||
                toSafeNumber(reversalScore, 0) >= 3.00 ||
                toSafeNumber(wrongWayFlowScore, 0) >= 3.00
            );

        const suppressFailedPatternAlone =
            Boolean(failedPatternRule) &&
            !hardInvalidation &&
            toSafeNumber(reversalScore, 0) < 2.75 &&
            toSafeNumber(wrongWayFlowScore, 0) < 2.75 &&
            toSafeNumber(noFollowThroughScore, 0) < 2.50;

        const allowHardCut =
            emergencyCut ||
            countTrue([timeReady, damageReady, structureReady, flowReady]) >= 2;

        return {
            allowHardCut,
            earlyWindow: mins < 7,
            damageRatio,
            suppressFailedPatternAlone,
            softOnly:
                !allowHardCut &&
                (
                    Boolean(softInvalidation) ||
                    Boolean(failedPatternRule) ||
                    toSafeNumber(wrongWayFlowScore, 0) >= 2.20 ||
                    toSafeNumber(noFollowThroughScore, 0) >= 2.10
                ),
        };
    }

    if (safeMode === "MICRO_SCALP") {
        const timeReady = mins >= 2;
        const damageReady =
            damageRatio >= 0.33 || profit <= -Math.max(100, Math.min(sl * 0.35, 160));
        const structureReady =
            Boolean(hardInvalidation) ||
            Boolean(failedPatternRule) ||
            toSafeNumber(reversalScore, 0) >= 2.2;
        const flowReady =
            toSafeNumber(wrongWayFlowScore, 0) >= 2.25 ||
            toSafeNumber(noFollowThroughScore, 0) >= 2.0;

        return {
            allowHardCut: countTrue([timeReady, damageReady, structureReady, flowReady]) >= 2,
            earlyWindow: mins < 2,
            damageRatio,
            suppressFailedPatternAlone: false,
            softOnly:
                Boolean(softInvalidation) ||
                Boolean(failedPatternRule) ||
                toSafeNumber(wrongWayFlowScore, 0) >= 1.95 ||
                toSafeNumber(noFollowThroughScore, 0) >= 1.85,
        };
    }

    const timeReady = mins >= 4;
    const damageReady =
        damageRatio >= 0.35 || profit <= -Math.max(220, Math.min(sl * 0.38, 320));
    const structureReady =
        Boolean(hardInvalidation) ||
        Boolean(failedPatternRule) ||
        toSafeNumber(reversalScore, 0) >= 2.45;
    const flowReady =
        toSafeNumber(wrongWayFlowScore, 0) >= 2.45 ||
        toSafeNumber(noFollowThroughScore, 0) >= 2.2;

    return {
        allowHardCut: countTrue([timeReady, damageReady, structureReady, flowReady]) >= 2,
        earlyWindow: mins < 4,
        damageRatio,
        suppressFailedPatternAlone: false,
        softOnly:
            Boolean(softInvalidation) ||
            Boolean(failedPatternRule) ||
            toSafeNumber(wrongWayFlowScore, 0) >= 2.0 ||
            toSafeNumber(noFollowThroughScore, 0) >= 2.0,
    };
}

function buildSuppressedHold(reason, extra = {}) {
    return {
        action: "HOLD",
        reason,
        riskLevel: "MEDIUM",
        score: 0,
        meta: {
            suppressed: true,
            ...extra,
        },
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

    if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0) return 0;

        const tsMs = num > 1000000000000 ? num : num * 1000;
        const diffMs = Date.now() - tsMs;
        if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;

        return diffMs / 60000;
    }

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

    return clamp((peakProfit - profit) / peakProfit, 0, 2.0);
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

function getMidpoint(c = {}) {
    return (toNumber(c.high, 0) + toNumber(c.low, 0)) / 2;
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
        if (isBearish(last)) score += 0.7;
        if (isBearish(last) && isBearish(prev)) score += 0.6;
        if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.8;
    } else if (s === "SELL") {
        if (isBullish(last)) score += 0.7;
        if (isBullish(last) && isBullish(prev)) score += 0.6;
        if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.8;
    }

    if (bodyStrength >= 0.6) score += 0.35;
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
        if (isBearish(last)) score += 0.7;
        if (isBearish(last) && isBearish(prev)) score += 0.8;
        if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.8;
        if (toNumber(prev.close, 0) < toNumber(prev2.low, 0)) score += 0.35;
    } else if (s === "SELL") {
        if (isBullish(last)) score += 0.7;
        if (isBullish(last) && isBullish(prev)) score += 0.8;
        if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.8;
        if (toNumber(prev.close, 0) > toNumber(prev2.high, 0)) score += 0.35;
    }

    if (normalizeMode(mode) === "MICRO_SCALP") return score * 0.95;
    if (normalizeMode(mode) === "SCALP") return score;
    return score * 1.05;
}

function detectContinuationSignal(candles = [], side = "") {
    if (!Array.isArray(candles) || candles.length < 3) {
        return { continuation: false, strength: 0 };
    }

    const s = normalizeSide(side);
    const last = candles[candles.length - 1] || {};
    const prev = candles[candles.length - 2] || {};
    const prev2 = candles[candles.length - 3] || {};

    let strength = 0;

    if (s === "BUY") {
        if (isBullish(last)) strength += 0.8;
        if (toNumber(last.close, 0) > toNumber(prev.high, 0)) strength += 0.9;
        if (isBullish(prev2) && isBullish(last)) strength += 0.25;
    } else if (s === "SELL") {
        if (isBearish(last)) strength += 0.8;
        if (toNumber(last.close, 0) < toNumber(prev.low, 0)) strength += 0.9;
        if (isBearish(prev2) && isBearish(last)) strength += 0.25;
    }

    return {
        continuation: strength >= 1.3,
        strength,
    };
}

function hasHardInvalidation(candles = [], side = "") {
    if (!Array.isArray(candles) || candles.length < 2) return false;

    const s = normalizeSide(side);
    const last = candles[candles.length - 1] || {};
    const prev = candles[candles.length - 2] || {};

    if (s === "BUY") {
        return toNumber(last.close, 0) < toNumber(prev.low, 0);
    }
    if (s === "SELL") {
        return toNumber(last.close, 0) > toNumber(prev.high, 0);
    }
    return false;
}

function hasSoftInvalidation(candles = [], side = "") {
    if (!Array.isArray(candles) || candles.length < 3) return false;

    const s = normalizeSide(side);
    const last = candles[candles.length - 1] || {};
    const prev = candles[candles.length - 2] || {};
    const prev2 = candles[candles.length - 3] || {};

    const lastClose = toNumber(last.close, 0);
    const prevClose = toNumber(prev.close, 0);
    const prev2Close = toNumber(prev2.close, 0);

    const lastLow = toNumber(last.low, 0);
    const prevLow = toNumber(prev.low, 0);
    const lastHigh = toNumber(last.high, 0);
    const prevHigh = toNumber(prev.high, 0);

    if (s === "BUY") {
        const bearishPressure =
            isBearish(last) &&
            isBearish(prev) &&
            lastClose < prevClose &&
            prevClose < prev2Close;

        const weakStructure = lastClose < prevLow || lastLow < prevLow;

        return bearishPressure && weakStructure;
    }

    if (s === "SELL") {
        const bullishPressure =
            isBullish(last) &&
            isBullish(prev) &&
            lastClose > prevClose &&
            prevClose > prev2Close;

        const weakStructure = lastClose > prevHigh || lastHigh > prevHigh;

        return bullishPressure && weakStructure;
    }

    return false;
}

function detectWrongWayFlowScore(candles = [], side = "") {
    const sample = Array.isArray(candles) ? candles.slice(-10) : [];
    const s = normalizeSide(side);

    if (!sample.length || (s !== "BUY" && s !== "SELL")) {
        return {
            score: 0,
            breakdown: {},
        };
    }

    const recent5 = sample.slice(-5);
    const recent4 = sample.slice(-4);
    const recent3 = sample.slice(-3);

    let score = 0;

    const highs = sample.map((c) => toNumber(c.high, 0));
    const lows = sample.map((c) => toNumber(c.low, 0));
    const midpoint10 = (Math.max(...highs) + Math.min(...lows)) / 2;

    const bearishCount4 = recent4.filter(isBearish).length;
    const bullishCount4 = recent4.filter(isBullish).length;

    const last = recent5[recent5.length - 1] || {};
    const prev = recent5[recent5.length - 2] || {};

    const avgBullBody5 =
        recent5.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
        Math.max(1, recent5.filter(isBullish).length);

    const avgBearBody5 =
        recent5.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
        Math.max(1, recent5.filter(isBearish).length);

    const lowerCloseStreak =
        recent3.length >= 3 &&
        toNumber(recent3[2].close, 0) < toNumber(recent3[1].close, 0) &&
        toNumber(recent3[1].close, 0) < toNumber(recent3[0].close, 0);

    const higherCloseStreak =
        recent3.length >= 3 &&
        toNumber(recent3[2].close, 0) > toNumber(recent3[1].close, 0) &&
        toNumber(recent3[1].close, 0) > toNumber(recent3[0].close, 0);

    const lowerLowFlow =
        recent3.length >= 3 &&
        toNumber(recent3[2].low, 0) < toNumber(recent3[1].low, 0) &&
        toNumber(recent3[1].low, 0) <= toNumber(recent3[0].low, 0);

    const higherHighFlow =
        recent3.length >= 3 &&
        toNumber(recent3[2].high, 0) > toNumber(recent3[1].high, 0) &&
        toNumber(recent3[1].high, 0) >= toNumber(recent3[0].high, 0);

    const closeBelowMidpoint = toNumber(last.close, 0) < midpoint10;
    const closeAboveMidpoint = toNumber(last.close, 0) > midpoint10;

    const softInvalidation = hasSoftInvalidation(sample, s);
    const hardInvalidation = hasHardInvalidation(sample, s);

    if (s === "BUY") {
        if (bearishCount4 >= 3) score += 0.65;
        if (lowerCloseStreak) score += 0.55;
        if (lowerLowFlow) score += 0.5;
        if (closeBelowMidpoint) score += 0.4;
        if (isBearish(last) && isBearish(prev)) score += 0.35;
        if (getCandleBody(last) >= getCandleBody(prev) * 0.9 && isBearish(last)) score += 0.2;
        if (avgBearBody5 > avgBullBody5 * 1.25) score += 0.3;
        if (toNumber(last.high, 0) <= toNumber(prev.high, 0) && isBearish(last)) score += 0.18;
    } else if (s === "SELL") {
        if (bullishCount4 >= 3) score += 0.65;
        if (higherCloseStreak) score += 0.55;
        if (higherHighFlow) score += 0.5;
        if (closeAboveMidpoint) score += 0.4;
        if (isBullish(last) && isBullish(prev)) score += 0.35;
        if (getCandleBody(last) >= getCandleBody(prev) * 0.9 && isBullish(last)) score += 0.2;
        if (avgBullBody5 > avgBearBody5 * 1.25) score += 0.3;
        if (toNumber(last.low, 0) >= toNumber(prev.low, 0) && isBullish(last)) score += 0.18;
    }

    if (softInvalidation) score += 0.35;
    if (hardInvalidation) score += 0.6;

    return {
        score: Number(score.toFixed(4)),
        breakdown: {
            bearishCount4,
            bullishCount4,
            lowerCloseStreak,
            higherCloseStreak,
            lowerLowFlow,
            higherHighFlow,
            closeBelowMidpoint,
            closeAboveMidpoint,
            avgBullBody5: Number(avgBullBody5.toFixed(5)),
            avgBearBody5: Number(avgBearBody5.toFixed(5)),
            midpoint10: Number(midpoint10.toFixed(5)),
            softInvalidation,
            hardInvalidation,
        },
    };
}

function detectNoFollowThrough(candles = [], side = "") {
    const sample = Array.isArray(candles) ? candles.slice(-6) : [];
    const s = normalizeSide(side);

    if (sample.length < 5 || (s !== "BUY" && s !== "SELL")) {
        return {
            score: 0,
            detected: false,
            breakdown: {},
        };
    }

    const highs = sample.map((c) => toNumber(c.high, 0));
    const lows = sample.map((c) => toNumber(c.low, 0));

    const last = sample[sample.length - 1] || {};
    const recent4 = sample.slice(-4);
    const recent3 = sample.slice(-3);

    let score = 0;

    if (s === "SELL") {
        const noNewLow =
            Math.min(...recent4.map((c) => toNumber(c.low, 0))) >=
            Math.min(...sample.slice(0, 2).map((c) => toNumber(c.low, 0)));

        const bullishInterruptions = recent4.filter(isBullish).length;
        const closeAboveMidpoint5 =
            toNumber(last.close, 0) > (Math.max(...highs) + Math.min(...lows)) / 2;

        const higherLowShort =
            recent3.length >= 3 &&
            toNumber(recent3[2].low, 0) >= toNumber(recent3[1].low, 0) &&
            toNumber(recent3[1].low, 0) >= toNumber(recent3[0].low, 0);

        const bullishBodyPressure =
            recent4.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) >
            recent4.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0);

        if (noNewLow) score += 0.7;
        if (bullishInterruptions >= 2) score += 0.55;
        if (closeAboveMidpoint5) score += 0.45;
        if (higherLowShort) score += 0.4;
        if (bullishBodyPressure) score += 0.3;

        return {
            score: Number(score.toFixed(4)),
            detected: score >= 1.8,
            breakdown: {
                noNewLow,
                bullishInterruptions,
                closeAboveMidpoint5,
                higherLowShort,
                bullishBodyPressure,
            },
        };
    }

    if (s === "BUY") {
        const noNewHigh =
            Math.max(...recent4.map((c) => toNumber(c.high, 0))) <=
            Math.max(...sample.slice(0, 2).map((c) => toNumber(c.high, 0)));

        const bearishInterruptions = recent4.filter(isBearish).length;
        const closeBelowMidpoint5 =
            toNumber(last.close, 0) < (Math.max(...highs) + Math.min(...lows)) / 2;

        const lowerHighShort =
            recent3.length >= 3 &&
            toNumber(recent3[2].high, 0) <= toNumber(recent3[1].high, 0) &&
            toNumber(recent3[1].high, 0) <= toNumber(recent3[0].high, 0);

        const bearishBodyPressure =
            recent4.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) >
            recent4.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0);

        if (noNewHigh) score += 0.7;
        if (bearishInterruptions >= 2) score += 0.55;
        if (closeBelowMidpoint5) score += 0.45;
        if (lowerHighShort) score += 0.4;
        if (bearishBodyPressure) score += 0.3;

        return {
            score: Number(score.toFixed(4)),
            detected: score >= 1.8,
            breakdown: {
                noNewHigh,
                bearishInterruptions,
                closeBelowMidpoint5,
                lowerHighShort,
                bearishBodyPressure,
            },
        };
    }

    return {
        score: 0,
        detected: false,
        breakdown: {},
    };
}

function detectOppositeTakeover(candles = [], side = "") {
    const sample = Array.isArray(candles) ? candles.slice(-8) : [];
    const s = normalizeSide(side);

    if (sample.length < 5 || (s !== "BUY" && s !== "SELL")) {
        return {
            score: 0,
            detected: false,
            breakdown: {},
        };
    }

    const last5 = sample.slice(-5);
    const recent3 = sample.slice(-3);

    let score = 0;

    if (s === "SELL") {
        const bullishCount5 = last5.filter(isBullish).length;
        const higherLowFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].low, 0) > toNumber(recent3[1].low, 0) &&
            toNumber(recent3[1].low, 0) >= toNumber(recent3[0].low, 0);

        const higherCloseFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].close, 0) > toNumber(recent3[1].close, 0) &&
            toNumber(recent3[1].close, 0) > toNumber(recent3[0].close, 0);

        const avgBullBody =
            last5.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, last5.filter(isBullish).length);

        const avgBearBody =
            last5.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, last5.filter(isBearish).length);

        const lastClose = toNumber(last5[last5.length - 1]?.close, 0);
        const rangeMid =
            (Math.max(...last5.map((c) => toNumber(c.high, 0))) +
                Math.min(...last5.map((c) => toNumber(c.low, 0)))) / 2;

        if (bullishCount5 >= 3) score += 0.7;
        if (higherLowFlow) score += 0.55;
        if (higherCloseFlow) score += 0.5;
        if (avgBullBody > avgBearBody * 1.2) score += 0.35;
        if (lastClose > rangeMid) score += 0.3;

        return {
            score: Number(score.toFixed(4)),
            detected: score >= 2.0,
            breakdown: {
                bullishCount5,
                higherLowFlow,
                higherCloseFlow,
                avgBullBody: Number(avgBullBody.toFixed(5)),
                avgBearBody: Number(avgBearBody.toFixed(5)),
                lastClose,
                rangeMid: Number(rangeMid.toFixed(5)),
            },
        };
    }

    if (s === "BUY") {
        const bearishCount5 = last5.filter(isBearish).length;
        const lowerHighFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].high, 0) < toNumber(recent3[1].high, 0) &&
            toNumber(recent3[1].high, 0) <= toNumber(recent3[0].high, 0);

        const lowerCloseFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].close, 0) < toNumber(recent3[1].close, 0) &&
            toNumber(recent3[1].close, 0) < toNumber(recent3[0].close, 0);

        const avgBearBody =
            last5.filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, last5.filter(isBearish).length);

        const avgBullBody =
            last5.filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, last5.filter(isBullish).length);

        const lastClose = toNumber(last5[last5.length - 1]?.close, 0);
        const rangeMid =
            (Math.max(...last5.map((c) => toNumber(c.high, 0))) +
                Math.min(...last5.map((c) => toNumber(c.low, 0)))) / 2;

        if (bearishCount5 >= 3) score += 0.7;
        if (lowerHighFlow) score += 0.55;
        if (lowerCloseFlow) score += 0.5;
        if (avgBearBody > avgBullBody * 1.2) score += 0.35;
        if (lastClose < rangeMid) score += 0.3;

        return {
            score: Number(score.toFixed(4)),
            detected: score >= 2.0,
            breakdown: {
                bearishCount5,
                lowerHighFlow,
                lowerCloseFlow,
                avgBearBody: Number(avgBearBody.toFixed(5)),
                avgBullBody: Number(avgBullBody.toFixed(5)),
                lastClose,
                rangeMid: Number(rangeMid.toFixed(5)),
            },
        };
    }

    return {
        score: 0,
        detected: false,
        breakdown: {},
    };
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

function shouldSimpleWrongWayCut({
    currentProfit = 0,
    holdingMinutes = 0,
    reversalScore = 0,
    mode = "NORMAL",
    confirmation = { level: "LOW", score: 0 },
    softInvalidation = false,
    hardInvalidation = false,
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);

    if (
        profit <= profile.strongCutProfit &&
        reversalScore >= profile.reversalCutScore &&
        (softInvalidation || hardInvalidation || confirmation.level !== "LOW")
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_STRONG_REVERSAL_CUT`,
        };
    }

    if (
        mins >= profile.simpleCutMinutes &&
        profit <= profile.simpleCutProfit &&
        (softInvalidation || hardInvalidation || confirmation.level === "HIGH")
    ) {
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

    const hardInvalidation = hasHardInvalidation(candles, side);
    const softInvalidation = hasSoftInvalidation(candles, side);

    if (
        mins >= profile.normalFastCutMinutes &&
        profit <= profile.normalStructureBreakProfit &&
        (hardInvalidation || (softInvalidation && confirmation.level !== "LOW"))
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: "NORMAL_STRUCTURE_BREAK_FAST_CUT",
        };
    }

    if (
        mins >= profile.normalFastCutMinutes &&
        profit <= profile.normalFastCutProfit &&
        reversalScore >= profile.normalFastReversalScore &&
        (hardInvalidation || softInvalidation)
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: "NORMAL_FAST_WRONG_WAY_CUT",
        };
    }

    return null;
}

function shouldWrongWayFlowCut({
    currentProfit = 0,
    holdingMinutes = 0,
    wrongWayFlowScore = 0,
    softInvalidation = false,
    hardInvalidation = false,
    confirmation = { level: "LOW", score: 0 },
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);

    if (profit > 0) return null;
    if (mins < profile.wrongWayMinMinutes) return null;

    const confidenceBoost =
        (softInvalidation ? 0.25 : 0) +
        (hardInvalidation ? 0.5 : 0) +
        (confirmation.level === "HIGH" ? 0.35 : confirmation.level === "MEDIUM" ? 0.18 : 0);

    const effectiveFlowScore = wrongWayFlowScore + confidenceBoost;

    if (
        profit <= profile.wrongWayHardCutProfit &&
        effectiveFlowScore >= profile.wrongWayFlowHardScore
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_WRONG_WAY_FLOW_HARD_CUT`,
            effectiveFlowScore,
        };
    }

    if (
        profit <= profile.wrongWayCutProfit &&
        effectiveFlowScore >= profile.wrongWayFlowCutScore
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_WRONG_WAY_FLOW_CUT`,
            effectiveFlowScore,
        };
    }

    return null;
}

function shouldNoFollowThroughCut({
    currentProfit = 0,
    holdingMinutes = 0,
    noFollowThrough = { score: 0, detected: false },
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);

    if (profit > 0) return null;
    if (mins < profile.noFollowThroughMinMinutes) return null;

    if (
        profit <= profile.noFollowThroughCutProfit &&
        toNumber(noFollowThrough.score, 0) >= profile.noFollowThroughScore
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_NO_FOLLOW_THROUGH_CUT`,
        };
    }

    return null;
}

function shouldTakeoverCut({
    currentProfit = 0,
    takeover = { score: 0, detected: false },
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);

    if (profit > 0) return null;

    if (
        profit <= profile.takeoverCutProfit &&
        toNumber(takeover.score, 0) >= profile.takeoverCutScore
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_OPPOSITE_TAKEOVER_CUT`,
        };
    }

    return null;
}

function shouldEngineTakeSmallProfit({
    currentProfit = 0,
    openPosition = {},
    reversalScore = 0,
    confirmation = { level: "LOW", score: 0 },
    continuation = { continuation: false, strength: 0 },
    failedPatternRule = null,
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const peakProfit = getPeakProfit(openPosition, profit);
    const retraceRatio = getProfitRetractionRatio(openPosition, profit);

    if (profit <= 0) return false;
    if (continuation.continuation) return false;
    if (peakProfit < profile.minPeakBeforeProtect) return false;
    if (peakProfit < profile.armProfitMin) return false;
    if (profit < profile.takeProfitMinProfit) return false;
    if (retraceRatio < profile.tpMinRetraceRatio) return false;

    if (failedPatternRule && profit >= profile.failedPatternTakeProfitMin) return true;

    const strongRisk =
        confirmation.level === "HIGH" || reversalScore >= profile.strongStructureScore;

    return strongRisk;
}

function shouldEngineMoveToBE({
    currentProfit = 0,
    openPosition = {},
    reversalScore = 0,
    confirmation = { level: "LOW", score: 0 },
    continuation = { continuation: false, strength: 0 },
    failedPatternRule = null,
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const peakProfit = getPeakProfit(openPosition, profit);
    const retraceRatio = getProfitRetractionRatio(openPosition, profit);

    if (profit <= 0) return false;
    if (continuation.continuation) return false;
    if (profit < profile.moveToBeMinProfit) return false;
    if (peakProfit < profile.armProfitMin) return false;
    if (peakProfit <= profit) return false;
    if (retraceRatio < profile.beMinRetraceRatio) return false;
    if (retraceRatio >= profile.tpMinRetraceRatio) return false;

    const moderateRisk =
        failedPatternRule ||
        confirmation.level === "MEDIUM" ||
        confirmation.level === "HIGH" ||
        reversalScore >= profile.weakStructureScore;

    return !!moderateRisk;
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

function buildCutMeta({
    holdingMinutes,
    wrongWayFlow,
    noFollowThrough,
    takeover,
    softInvalidation,
    hardInvalidation,
    confirmation,
    damageRatio,
    symbol,
    mode,
}) {
    return {
        holdingMinutes,
        wrongWayFlowScore: wrongWayFlow.score,
        wrongWayBreakdown: wrongWayFlow.breakdown,
        noFollowThroughScore: noFollowThrough.score,
        noFollowThroughBreakdown: noFollowThrough.breakdown,
        takeoverScore: takeover.score,
        takeoverBreakdown: takeover.breakdown,
        softInvalidation,
        hardInvalidation,
        confirmation: confirmation.level,
        damageRatio,
        symbol,
        mode,
    };
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
    slPoints = 0,
}) {
    openPosition = openPosition || {};

    const side = normalizeSide(
        openPosition.side || openPosition.type || openPosition.positionSide || ""
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

    const derivedSlPoints =
        toNumber(slPoints, 0) ||
        abs(
            toNumber(openPosition.entryPrice || openPosition.openPrice, 0) -
            toNumber(openPosition.sl, 0)
        ) * 100 ||
        0;

    const holdingMinutes = getHoldingMinutes(openPosition);
    const confirmation = detectExitConfirmation(candles, side);
    const continuation = detectContinuationSignal(candles, side);
    const hardInvalidation = hasHardInvalidation(candles, side);
    const softInvalidation = hasSoftInvalidation(candles, side);
    const wrongWayFlow = detectWrongWayFlowScore(candles, side);
    const noFollowThrough = detectNoFollowThrough(candles, side);
    const takeover = detectOppositeTakeover(candles, side);

    let adjustedScore =
        detectReversalScore(candles, side, normalizedMode) +
        toNumber(confirmation.score, 0) * 0.25 -
        toNumber(continuation.strength, 0) * 0.35;

    if (!Number.isFinite(adjustedScore)) adjustedScore = 0;

    let riskLevel = "LOW";

    let failedPatternRule = await findFailedPatternRule({
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

    const hardCutGateBefore = buildHardCutGate({
        mode: normalizedMode,
        holdingMinutes,
        currentProfit: profit,
        slPoints: derivedSlPoints,
        failedPatternRule,
        wrongWayFlowScore: wrongWayFlow.score,
        reversalScore: adjustedScore,
        noFollowThroughScore: noFollowThrough.score,
        hardInvalidation,
        softInvalidation,
    });

    if (
        failedPatternRule &&
        normalizedMode === "SCALP" &&
        (holdingMinutes < 5 || hardCutGateBefore.suppressFailedPatternAlone)
    ) {
        failedPatternRule = null;
    }

    if (failedPatternRule) {
        riskLevel = "CRITICAL";
        adjustedScore += 0.65;
    } else if (adjustedScore >= profile.reversalCutScore) {
        riskLevel = "HIGH";
    } else if (adjustedScore >= profile.reversalCutScore * 0.7) {
        riskLevel = "MEDIUM";
    }

    const hardCutGate = buildHardCutGate({
        mode: normalizedMode,
        holdingMinutes,
        currentProfit: profit,
        slPoints: derivedSlPoints,
        failedPatternRule,
        wrongWayFlowScore: wrongWayFlow.score,
        reversalScore: adjustedScore,
        noFollowThroughScore: noFollowThrough.score,
        hardInvalidation,
        softInvalidation,
    });

    const commonMeta = buildCutMeta({
        holdingMinutes,
        wrongWayFlow,
        noFollowThrough,
        takeover,
        softInvalidation,
        hardInvalidation,
        confirmation,
        damageRatio: hardCutGate.damageRatio,
        symbol,
        mode: normalizedMode,
    });

    if (profit <= 0) {
        if (failedPatternRule && profit <= profile.failedPatternCutProfit) {
            if (!hardCutGate.allowHardCut) {
                return buildSuppressedHold("FAILED_PATTERN_EARLY_EXIT_SUPPRESSED", {
                    rawReason: "FAILED_PATTERN_EARLY_EXIT",
                    ...commonMeta,
                });
            }

            return {
                action: "CUT_LOSS_NOW",
                reason: "FAILED_PATTERN_EARLY_EXIT",
                riskLevel: "CRITICAL",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        const takeoverCut = shouldTakeoverCut({
            currentProfit: profit,
            takeover,
            mode: normalizedMode,
        });

        if (takeoverCut) {
            if (!hardCutGate.allowHardCut) {
                return buildSuppressedHold("OPPOSITE_TAKEOVER_CUT_SUPPRESSED", {
                    rawReason: takeoverCut.reason,
                    ...commonMeta,
                });
            }

            return {
                action: takeoverCut.action,
                reason: takeoverCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        const noFollowThroughCut = shouldNoFollowThroughCut({
            currentProfit: profit,
            holdingMinutes,
            noFollowThrough,
            mode: normalizedMode,
        });

        if (noFollowThroughCut) {
            if (!hardCutGate.allowHardCut) {
                return buildSuppressedHold("NO_FOLLOW_THROUGH_CUT_SUPPRESSED", {
                    rawReason: noFollowThroughCut.reason,
                    ...commonMeta,
                });
            }

            return {
                action: noFollowThroughCut.action,
                reason: noFollowThroughCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        const wrongWayCut = shouldWrongWayFlowCut({
            currentProfit: profit,
            holdingMinutes,
            wrongWayFlowScore: wrongWayFlow.score,
            softInvalidation,
            hardInvalidation,
            confirmation,
            mode: normalizedMode,
        });

        if (wrongWayCut) {
            if (!hardCutGate.allowHardCut) {
                return buildSuppressedHold("WRONG_WAY_FLOW_CUT_SUPPRESSED", {
                    rawReason: wrongWayCut.reason,
                    effectiveFlowScore: wrongWayCut.effectiveFlowScore,
                    ...commonMeta,
                });
            }

            return {
                action: wrongWayCut.action,
                reason: wrongWayCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: {
                    ...commonMeta,
                    effectiveFlowScore: wrongWayCut.effectiveFlowScore,
                },
            };
        }

        const simpleCut = shouldSimpleWrongWayCut({
            currentProfit: profit,
            holdingMinutes,
            reversalScore: adjustedScore,
            mode: normalizedMode,
            confirmation,
            softInvalidation,
            hardInvalidation,
        });

        if (simpleCut) {
            if (!hardCutGate.allowHardCut) {
                return buildSuppressedHold("SIMPLE_WRONG_WAY_CUT_SUPPRESSED", {
                    rawReason: simpleCut.reason,
                    ...commonMeta,
                });
            }

            return {
                action: simpleCut.action,
                reason: simpleCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: commonMeta,
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
            if (!hardCutGate.allowHardCut) {
                return buildSuppressedHold("NORMAL_FAST_CUT_SUPPRESSED", {
                    rawReason: normalFastCut.reason,
                    ...commonMeta,
                });
            }

            return {
                action: normalFastCut.action,
                reason: normalFastCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        if (hardCutGate.softOnly) {
            return buildSuppressedHold("WRONG_WAY_NOT_CONFIRMED_YET", commonMeta);
        }

        return {
            action: "HOLD",
            reason: `WRONG_WAY_NOT_CONFIRMED_YET(score=${adjustedScore}, flow=${wrongWayFlow.score}, nf=${noFollowThrough.score}, tk=${takeover.score}, mode=${normalizedMode})`,
            riskLevel,
            score: adjustedScore,
            meta: commonMeta,
        };
    }

    if (continuation.continuation) {
        return {
            action: "HOLD",
            reason: `${normalizedMode}_CONTINUATION_HOLD`,
            riskLevel: "LOW",
            score: adjustedScore,
        };
    }

    if (
        shouldTakeProfitOnLowVolume({
            historicalVolumeSignal,
            holdingMinutes,
            currentProfit: profit,
            mode: normalizedMode,
        }) &&
        getPeakProfit(openPosition, profit) >= profile.minPeakBeforeProtect &&
        getProfitRetractionRatio(openPosition, profit) >= profile.beMinRetraceRatio
    ) {
        return {
            action: "TAKE_SMALL_PROFIT",
            reason: `${normalizedMode}_LOW_VOLUME_PROTECT`,
            riskLevel,
            score: adjustedScore,
        };
    }

    if (
        shouldEngineTakeSmallProfit({
            currentProfit: profit,
            openPosition,
            reversalScore: adjustedScore,
            confirmation,
            continuation,
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
                continuation: continuation.strength,
            },
        };
    }

    if (
        shouldEngineMoveToBE({
            currentProfit: profit,
            openPosition,
            reversalScore: adjustedScore,
            confirmation,
            continuation,
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
                continuation: continuation.strength,
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