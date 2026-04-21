// const { detectTrendAndRange } = require("../pattern/pattern-rules");
// const { findFailedPattern } = require("../failedPattern.repo");
// const { getPatternWeight } = require("../strategyWeights.repo");
// const {
//     buildContextFeatures,
//     buildContextHashNew,
// } = require("../utils/context-features");
// const { findAdaptiveScoreRule } = require("../adaptiveScore.repo");
// const {
//     enforceDirectionBiasOnDecision,
// } = require("../tradingPreferences.service");

// function toNumber(value, fallback = 0) {
//     const num = Number(value);
//     return Number.isFinite(num) ? num : fallback;
// }

// function clamp(num, min, max) {
//     return Math.max(min, Math.min(max, Number(num || 0)));
// }

// function clampThreshold(value, min, max) {
//     const num = Number(value || 0);
//     if (num < min) return min;
//     if (num > max) return max;
//     return num;
// }

// function getCandleDirection(candle = {}) {
//     const open = toNumber(candle.open);
//     const close = toNumber(candle.close);
//     const high = toNumber(candle.high);
//     const low = toNumber(candle.low);

//     return {
//         open,
//         close,
//         high,
//         low,
//         body: Math.abs(close - open),
//         range: Math.max(high - low, 0),
//         isBull: close > open,
//         isBear: close < open,
//     };
// }

// function averageBody(candles = [], lookback = 5) {
//     if (!Array.isArray(candles) || candles.length === 0) return 0;
//     const sample = candles.slice(-lookback);
//     if (!sample.length) return 0;
//     return (
//         sample.reduce((sum, candle) => sum + getCandleDirection(candle).body, 0) /
//         sample.length
//     );
// }

// function averageRange(candles = [], lookback = 5) {
//     if (!Array.isArray(candles) || candles.length === 0) return 0;
//     const sample = candles.slice(-lookback);
//     if (!sample.length) return 0;
//     return (
//         sample.reduce((sum, candle) => sum + getCandleDirection(candle).range, 0) /
//         sample.length
//     );
// }

// function detectEarlyBuyMomentum(candles = []) {
//     if (!Array.isArray(candles) || candles.length < 4) return 0;

//     const c1 = getCandleDirection(candles[candles.length - 1]);
//     const c2 = getCandleDirection(candles[candles.length - 2]);
//     const c3 = getCandleDirection(candles[candles.length - 3]);
//     const avgRecentBody = averageBody(candles.slice(0, -1), 5);

//     let scoreBoost = 0;

//     const hasTwoBullishCandles = c1.isBull && c2.isBull;
//     const higherHigh = c1.high > c2.high || c2.high > c3.high;
//     const higherLow = c1.low > c2.low || c2.low > c3.low;
//     const higherClose = c1.close > c2.close && c2.close >= c3.close;

//     const bodyStrength =
//         avgRecentBody > 0 &&
//         (c1.body >= avgRecentBody * 0.8 || c2.body >= avgRecentBody * 0.8);

//     if (hasTwoBullishCandles) scoreBoost += 0.12;
//     if (higherHigh) scoreBoost += 0.08;
//     if (higherLow) scoreBoost += 0.08;
//     if (higherClose) scoreBoost += 0.1;
//     if (bodyStrength) scoreBoost += 0.07;

//     if (c1.close > c2.high) scoreBoost += 0.1;
//     if (c2.close > c3.high) scoreBoost += 0.08;

//     return Number(scoreBoost.toFixed(4));
// }

// function detectEarlySellMomentum(candles = []) {
//     if (!Array.isArray(candles) || candles.length < 4) return 0;

//     const c1 = getCandleDirection(candles[candles.length - 1]);
//     const c2 = getCandleDirection(candles[candles.length - 2]);
//     const c3 = getCandleDirection(candles[candles.length - 3]);
//     const avgRecentBody = averageBody(candles.slice(0, -1), 5);

//     let scoreBoost = 0;

//     const hasTwoBearishCandles = c1.isBear && c2.isBear;
//     const lowerLow = c1.low < c2.low || c2.low < c3.low;
//     const lowerHigh = c1.high < c2.high || c2.high < c3.high;
//     const lowerClose = c1.close < c2.close && c2.close <= c3.close;

//     const bodyStrength =
//         avgRecentBody > 0 &&
//         (c1.body >= avgRecentBody * 0.8 || c2.body >= avgRecentBody * 0.8);

//     if (hasTwoBearishCandles) scoreBoost -= 0.12;
//     if (lowerLow) scoreBoost -= 0.08;
//     if (lowerHigh) scoreBoost -= 0.08;
//     if (lowerClose) scoreBoost -= 0.1;
//     if (bodyStrength) scoreBoost -= 0.07;

//     if (c1.close < c2.low) scoreBoost -= 0.1;
//     if (c2.close < c3.low) scoreBoost -= 0.08;

//     return Number(scoreBoost.toFixed(4));
// }

// function detectWeakPullbackContinuation(candles = [], side = "NEUTRAL") {
//     const sample = Array.isArray(candles) ? candles.slice(-8) : [];
//     const normalizedSide = String(side || "NEUTRAL").toUpperCase();

//     if (sample.length < 6 || (normalizedSide !== "BUY" && normalizedSide !== "SELL")) {
//         return {
//             detected: false,
//             score: 0,
//             breakdown: {},
//         };
//     }

//     const trigger = sample[sample.length - 1] || {};
//     const pullbackWindow = sample.slice(-5, -1); // 4 แท่งก่อน trigger
//     const anchor = sample[sample.length - 6] || {};
//     const recentAvgBody = averageBody(sample, 6) || 0;

//     const triggerBody = getCandleBody(trigger);
//     const pullbackHigh = Math.max(...pullbackWindow.map((c) => toNumber(c.high, 0)));
//     const pullbackLow = Math.min(...pullbackWindow.map((c) => toNumber(c.low, 0)));
//     const pullbackMid = (pullbackHigh + pullbackLow) / 2;

//     let score = 0;
//     let detected = false;
//     const breakdown = {};

//     if (normalizedSide === "SELL") {
//         const bullishPullbacks = pullbackWindow.filter(isBullish);
//         const bearishPullbacks = pullbackWindow.filter(isBearish);

//         const bullishCount = bullishPullbacks.length;
//         const avgBullPullbackBody =
//             bullishPullbacks.reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, bullishCount);

//         const avgBearBodyContext =
//             sample.slice(0, -1).filter(isBearish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, sample.slice(0, -1).filter(isBearish).length);

//         const weakPullback =
//             bullishCount >= 1 &&
//             bullishCount <= 4 &&
//             avgBullPullbackBody <= Math.max(avgBearBodyContext, recentAvgBody) * 0.95;

//         const lowerHighPreserved =
//             pullbackHigh <= toNumber(anchor.high, 0) &&
//             pullbackWindow.every((c) => toNumber(c.close, 0) <= toNumber(anchor.high, 0));

//         const bearishTrigger =
//             isBearish(trigger) &&
//             (
//                 toNumber(trigger.close, 0) < toNumber(pullbackWindow[pullbackWindow.length - 1]?.low, 0) ||
//                 toNumber(trigger.close, 0) < pullbackMid
//             );

//         const triggerBodyStrong =
//             triggerBody >= recentAvgBody * 0.85;

//         if (weakPullback) score += 0.40;
//         if (lowerHighPreserved) score += 0.42;
//         if (bearishTrigger) score += 0.52;
//         if (triggerBodyStrong) score += 0.22;
//         if (bearishPullbacks.length >= 1) score += 0.10;

//         detected = weakPullback && lowerHighPreserved && bearishTrigger && score >= 1.10;

//         breakdown.bullishCount = bullishCount;
//         breakdown.avgBullPullbackBody = Number(avgBullPullbackBody.toFixed(5));
//         breakdown.avgBearBodyContext = Number(avgBearBodyContext.toFixed(5));
//         breakdown.weakPullback = weakPullback;
//         breakdown.lowerHighPreserved = lowerHighPreserved;
//         breakdown.bearishTrigger = bearishTrigger;
//         breakdown.triggerBodyStrong = triggerBodyStrong;
//     }

//     if (normalizedSide === "BUY") {
//         const bearishPullbacks = pullbackWindow.filter(isBearish);
//         const bullishPullbacks = pullbackWindow.filter(isBullish);

//         const bearishCount = bearishPullbacks.length;
//         const avgBearPullbackBody =
//             bearishPullbacks.reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, bearishCount);

//         const avgBullBodyContext =
//             sample.slice(0, -1).filter(isBullish).reduce((sum, c) => sum + getCandleBody(c), 0) /
//             Math.max(1, sample.slice(0, -1).filter(isBullish).length);

//         const weakPullback =
//             bearishCount >= 1 &&
//             bearishCount <= 4 &&
//             avgBearPullbackBody <= Math.max(avgBullBodyContext, recentAvgBody) * 0.95;

//         const higherLowPreserved =
//             pullbackLow >= toNumber(anchor.low, 0) &&
//             pullbackWindow.every((c) => toNumber(c.close, 0) >= toNumber(anchor.low, 0));

//         const bullishTrigger =
//             isBullish(trigger) &&
//             (
//                 toNumber(trigger.close, 0) > toNumber(pullbackWindow[pullbackWindow.length - 1]?.high, 0) ||
//                 toNumber(trigger.close, 0) > pullbackMid
//             );

//         const triggerBodyStrong =
//             triggerBody >= recentAvgBody * 0.85;

//         if (weakPullback) score += 0.40;
//         if (higherLowPreserved) score += 0.42;
//         if (bullishTrigger) score += 0.52;
//         if (triggerBodyStrong) score += 0.22;
//         if (bullishPullbacks.length >= 1) score += 0.10;

//         detected = weakPullback && higherLowPreserved && bullishTrigger && score >= 1.10;

//         breakdown.bearishCount = bearishCount;
//         breakdown.avgBearPullbackBody = Number(avgBearPullbackBody.toFixed(5));
//         breakdown.avgBullBodyContext = Number(avgBullBodyContext.toFixed(5));
//         breakdown.weakPullback = weakPullback;
//         breakdown.higherLowPreserved = higherLowPreserved;
//         breakdown.bullishTrigger = bullishTrigger;
//         breakdown.triggerBodyStrong = triggerBodyStrong;
//     }

//     return {
//         detected,
//         score: Number(score.toFixed(4)),
//         breakdown,
//     };
// }

// function isGoldSymbol(symbol = "") {
//     const s = String(symbol || "").toUpperCase();
//     return s === "XAUUSD" || s === "XAUUSDM";
// }

// function normalizeHigherTimeframeCandles(candles = []) {
//     return Array.isArray(candles) ? candles.filter(Boolean) : [];
// }

// function getSafeTrendContext(
//     candlesM15 = [],
//     candlesM30 = [],
//     candlesH1 = [],
//     candlesH4 = []
// ) {
//     try {
//         const safeM15 = normalizeHigherTimeframeCandles(candlesM15);
//         const safeM30 = normalizeHigherTimeframeCandles(candlesM30);
//         const safeH1 = normalizeHigherTimeframeCandles(candlesH1);
//         const safeH4 = normalizeHigherTimeframeCandles(candlesH4);

//         let trend = null;
//         let trendSource = "M15_M30";

//         if (safeM15.length > 0 && safeM30.length > 0) {
//             trend = detectTrendAndRange(safeM15, safeM30) || {};
//         }

//         return {
//             overallTrend: trend.overallTrend || "NEUTRAL",
//             trendStrength: trend.trendStrength || "WEAK",
//             isRanging: Boolean(trend.isRanging),
//             volumeConfirmed: Boolean(trend.volumeConfirmed),
//             trendSource,
//         };
//     } catch (_error) {
//         return {
//             overallTrend: "NEUTRAL",
//             trendStrength: "WEAK",
//             isRanging: false,
//             volumeConfirmed: false,
//             trendSource: "ERROR_FALLBACK",
//         };
//     }
// }

// function resolvePatternSide(pattern = {}) {
//     const rawPattern = String(pattern?.pattern || "").toUpperCase();
//     const rawType = String(pattern?.type || "").toUpperCase();
//     const bias = String(pattern?.bias || "").toUpperCase();
//     const structure = pattern?.structure || {};

//     if (
//         rawPattern.includes("BUY") ||
//         rawType.includes("BULLISH") ||
//         rawType.includes("BREAKOUT") ||
//         bias === "BUY"
//     ) {
//         return "BUY";
//     }

//     if (
//         rawPattern.includes("SELL") ||
//         rawType.includes("BEARISH") ||
//         rawType.includes("BREAKDOWN") ||
//         bias === "SELL"
//     ) {
//         return "SELL";
//     }

//     const microTrend = String(structure?.microTrend || "NEUTRAL").toUpperCase();

//     if (
//         structure?.firstLegBreakSell ||
//         structure?.isRetestingResistance ||
//         microTrend === "BEARISH" ||
//         microTrend === "BEARISH_REVERSAL"
//     ) {
//         return "SELL";
//     }

//     if (
//         structure?.firstLegBreakBuy ||
//         structure?.isRetestingSupport ||
//         microTrend === "BULLISH" ||
//         microTrend === "BULLISH_REVERSAL"
//     ) {
//         return "BUY";
//     }

//     return "NEUTRAL";
// }

// function getDirectionSign(side = "NEUTRAL") {
//     if (side === "BUY") return 1;
//     if (side === "SELL") return -1;
//     return 0;
// }

// function normalizeMicroTrend(microTrend = "NEUTRAL") {
//     return String(microTrend || "NEUTRAL").toUpperCase();
// }

// function isTrendAligned(side, trend) {
//     if (side === "BUY") return trend === "BULLISH";
//     if (side === "SELL") return trend === "BEARISH";
//     return false;
// }

// function isTrendCounter(side, trend) {
//     if (side === "BUY") return trend === "BEARISH";
//     if (side === "SELL") return trend === "BULLISH";
//     return false;
// }

// function isMicroTrendAligned(side, microTrend) {
//     const t = normalizeMicroTrend(microTrend);
//     if (side === "BUY") return t === "BULLISH" || t === "BULLISH_REVERSAL";
//     if (side === "SELL") return t === "BEARISH" || t === "BEARISH_REVERSAL";
//     return false;
// }

// function isMicroTrendReversal(side, microTrend) {
//     const t = normalizeMicroTrend(microTrend);
//     if (side === "BUY") return t === "BULLISH_REVERSAL";
//     if (side === "SELL") return t === "BEARISH_REVERSAL";
//     return false;
// }

// function isMicroTrendCounter(side, microTrend) {
//     const t = normalizeMicroTrend(microTrend);
//     if (side === "BUY") return t === "BEARISH" || t === "BEARISH_REVERSAL";
//     if (side === "SELL") return t === "BULLISH" || t === "BULLISH_REVERSAL";
//     return false;
// }

// function getSwingBias(candles = []) {
//     if (!Array.isArray(candles) || candles.length < 2) {
//         return { direction: "NEUTRAL", strength: 0, slope: 0 };
//     }

//     const first = getCandleDirection(candles[0]);
//     const last = getCandleDirection(candles[candles.length - 1]);
//     const bodyAvg = averageBody(candles, Math.min(candles.length, 5)) || 1;

//     const closeSlope = last.close - first.close;
//     const normalizedSlope = closeSlope / bodyAvg;

//     let direction = "NEUTRAL";
//     if (normalizedSlope >= 1.2) direction = "UP";
//     else if (normalizedSlope <= -1.2) direction = "DOWN";

//     return {
//         direction,
//         strength: Math.abs(normalizedSlope),
//         slope: normalizedSlope,
//     };
// }

// function findPivotHighs(candles = []) {
//     const result = [];
//     for (let i = 1; i < candles.length - 1; i++) {
//         const prev = getCandleDirection(candles[i - 1]);
//         const curr = getCandleDirection(candles[i]);
//         const next = getCandleDirection(candles[i + 1]);
//         if (curr.high > prev.high && curr.high >= next.high) {
//             result.push({ index: i, value: curr.high });
//         }
//     }
//     return result;
// }

// function findPivotLows(candles = []) {
//     const result = [];
//     for (let i = 1; i < candles.length - 1; i++) {
//         const prev = getCandleDirection(candles[i - 1]);
//         const curr = getCandleDirection(candles[i]);
//         const next = getCandleDirection(candles[i + 1]);
//         if (curr.low < prev.low && curr.low <= next.low) {
//             result.push({ index: i, value: curr.low });
//         }
//     }
//     return result;
// }

// function buildStructureState(candles = [], lookback = 10) {
//     const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
//     const highs = findPivotHighs(sample);
//     const lows = findPivotLows(sample);

//     let hh = false;
//     let hl = false;
//     let lh = false;
//     let ll = false;

//     if (highs.length >= 2) {
//         const a = highs[highs.length - 2].value;
//         const b = highs[highs.length - 1].value;
//         if (b > a) hh = true;
//         if (b < a) lh = true;
//     }

//     if (lows.length >= 2) {
//         const a = lows[lows.length - 2].value;
//         const b = lows[lows.length - 1].value;
//         if (b > a) hl = true;
//         if (b < a) ll = true;
//     }

//     let structure = "NEUTRAL";
//     if (hh && hl) structure = "HH_HL";
//     else if (lh && ll) structure = "LH_LL";
//     else if (hh && !hl) structure = "HH_ONLY";
//     else if (hl && !hh) structure = "HL_ONLY";
//     else if (lh && !ll) structure = "LH_ONLY";
//     else if (ll && !lh) structure = "LL_ONLY";

//     return {
//         structure,
//         hh,
//         hl,
//         lh,
//         ll,
//         pivotHighCount: highs.length,
//         pivotLowCount: lows.length,
//     };
// }

// function getWindowState(candles = [], lookback = 20, side = "NEUTRAL") {
//     const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
//     const bias = getSwingBias(sample);
//     const avgB = averageBody(sample, Math.min(sample.length, 5)) || 0;
//     const avgR = averageRange(sample, Math.min(sample.length, 5)) || 0;

//     let bullishCount = 0;
//     let bearishCount = 0;
//     let impulseCount = 0;

//     for (const c of sample) {
//         const cd = getCandleDirection(c);
//         if (cd.isBull) bullishCount += 1;
//         if (cd.isBear) bearishCount += 1;
//         if (avgB > 0 && cd.body >= avgB * 1.15) impulseCount += 1;
//     }

//     const last = getCandleDirection(sample[sample.length - 1] || {});
//     const prev = getCandleDirection(sample[sample.length - 2] || {});

//     let direction = "NEUTRAL";
//     if (bias.direction === "UP" && bullishCount >= bearishCount) direction = "UP";
//     if (bias.direction === "DOWN" && bearishCount >= bullishCount) direction = "DOWN";

//     const followThroughUp = last.close > prev.high;
//     const followThroughDown = last.close < prev.low;

//     return {
//         direction,
//         strength: bias.strength,
//         slope: bias.slope,
//         bullishCount,
//         bearishCount,
//         impulseCount,
//         avgBody: avgB,
//         avgRange: avgR,
//         followThroughUp,
//         followThroughDown,
//         isCompression: avgR > 0 && last.range <= avgR * 0.8,
//         dominantSide:
//             bullishCount > bearishCount
//                 ? "BUY"
//                 : bearishCount > bullishCount
//                     ? "SELL"
//                     : "NEUTRAL",
//         sampleSize: sample.length,
//     };
// }

// function getSwingZoneState(candles = [], lookback = 10, price = 0) {
//     const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
//     if (!sample.length) {
//         return {
//             nearTop: false,
//             nearBottom: false,
//             distanceToTopPct: 1,
//             distanceToBottomPct: 1,
//         };
//     }

//     const highs = sample.map((c) => toNumber(c.high));
//     const lows = sample.map((c) => toNumber(c.low));
//     const swingHigh = Math.max(...highs);
//     const swingLow = Math.min(...lows);
//     const range = Math.max(swingHigh - swingLow, 0.00001);
//     const currentPrice = toNumber(price, toNumber(sample[sample.length - 1]?.close, 0));

//     const distanceToTopPct = (swingHigh - currentPrice) / range;
//     const distanceToBottomPct = (currentPrice - swingLow) / range;

//     return {
//         swingHigh,
//         swingLow,
//         range,
//         nearTop: distanceToTopPct <= 0.18,
//         nearBottom: distanceToBottomPct <= 0.18,
//         distanceToTopPct: Number(distanceToTopPct.toFixed(4)),
//         distanceToBottomPct: Number(distanceToBottomPct.toFixed(4)),
//     };
// }

// function getLocationState(candles = [], lookback = 10) {
//     const sample = Array.isArray(candles) ? candles.slice(-(lookback + 1)) : [];

//     if (sample.length < 2) {
//         return {
//             state: "MID_RANGE",
//             priorHigh: 0,
//             priorLow: 0,
//             range: 0,
//             atTop: false,
//             atBottom: false,
//             isBreakoutUp: false,
//             isBreakdownDown: false,
//             isRetestBrokenHigh: false,
//             isRetestBrokenLow: false,
//         };
//     }

//     const current = getCandleDirection(sample[sample.length - 1] || {});
//     const base = sample.slice(0, -1);

//     const highs = base.map((c) => toNumber(c.high));
//     const lows = base.map((c) => toNumber(c.low));

//     const priorHigh = highs.length ? Math.max(...highs) : toNumber(current.high, 0);
//     const priorLow = lows.length ? Math.min(...lows) : toNumber(current.low, 0);
//     const range = Math.max(priorHigh - priorLow, 0.00001);

//     const close = toNumber(current.close, 0);
//     const high = toNumber(current.high, close);
//     const low = toNumber(current.low, close);

//     const nearPct = 0.18;
//     const retestBuffer = range * 0.06;

//     const isBreakoutUp = close > priorHigh;
//     const isBreakdownDown = close < priorLow;

//     const isRetestBrokenHigh =
//         close > priorHigh &&
//         low <= priorHigh + retestBuffer;

//     const isRetestBrokenLow =
//         close < priorLow &&
//         high >= priorLow - retestBuffer;

//     const atTop = !isBreakoutUp && close >= priorHigh - range * nearPct;
//     const atBottom = !isBreakdownDown && close <= priorLow + range * nearPct;

//     let state = "MID_RANGE";
//     if (isBreakoutUp) state = "BREAKOUT_UP";
//     else if (isBreakdownDown) state = "BREAKDOWN_DOWN";
//     else if (atTop) state = "AT_TOP";
//     else if (atBottom) state = "AT_BOTTOM";

//     return {
//         state,
//         priorHigh,
//         priorLow,
//         range,
//         atTop,
//         atBottom,
//         isBreakoutUp,
//         isBreakdownDown,
//         isRetestBrokenHigh,
//         isRetestBrokenLow,
//     };
// }

// function buildHierarchicalContext(candles = [], side = "NEUTRAL") {
//     const longWindow = getWindowState(candles, 20, side);
//     const mediumWindow = getWindowState(candles, 10, side);
//     const setupWindow = getWindowState(candles, 5, side);
//     const triggerWindow = getWindowState(candles, 3, side);
//     const structure10 = buildStructureState(candles, 10);
//     const swingZone10 = getSwingZoneState(candles, 10);
//     const location = getLocationState(candles, 10);

//     const longAligned =
//         (side === "BUY" && longWindow.direction === "UP") ||
//         (side === "SELL" && longWindow.direction === "DOWN");

//     const mediumAligned =
//         (side === "BUY" && mediumWindow.direction === "UP") ||
//         (side === "SELL" && mediumWindow.direction === "DOWN");

//     const setupAligned =
//         (side === "BUY" && setupWindow.direction === "UP") ||
//         (side === "SELL" && setupWindow.direction === "DOWN");

//     const triggerAligned =
//         (side === "BUY" && triggerWindow.direction === "UP") ||
//         (side === "SELL" && triggerWindow.direction === "DOWN");

//     let structureAligned = false;
//     let structureCounter = false;

//     if (side === "BUY") {
//         structureAligned =
//             structure10.structure === "HH_HL" ||
//             structure10.structure === "HL_ONLY";

//         structureCounter =
//             structure10.structure === "LH_LL" ||
//             structure10.structure === "LL_ONLY";
//     } else if (side === "SELL") {
//         structureAligned =
//             structure10.structure === "LH_LL" ||
//             structure10.structure === "LH_ONLY" ||
//             structure10.structure === "LL_ONLY";

//         structureCounter =
//             structure10.structure === "HH_HL" ||
//             structure10.structure === "HH_ONLY";
//     }

//     let score = 0;
//     const reasons = [];

//     if (longAligned) {
//         score += 0.42;
//         reasons.push("L20_ALIGNED");
//     } else if (longWindow.direction !== "NEUTRAL") {
//         score -= 0.50;
//         reasons.push("L20_COUNTER");
//     }

//     if (mediumAligned) {
//         score += 0.22;
//         reasons.push("L10_DIR_ALIGNED");
//     } else if (mediumWindow.direction !== "NEUTRAL") {
//         score -= 0.26;
//         reasons.push("L10_DIR_COUNTER");
//     }

//     if (structureAligned) {
//         score += 0.34;
//         reasons.push("L10_STRUCTURE_ALIGNED");
//     } else if (structureCounter) {
//         score -= 0.40;
//         reasons.push("L10_STRUCTURE_COUNTER");
//     }

//     if (setupAligned) {
//         score += 0.16;
//         reasons.push("L5_SETUP_OK");
//     } else if (setupWindow.direction !== "NEUTRAL") {
//         score -= 0.22;
//         reasons.push("L5_SETUP_COUNTER");
//     }

//     if (triggerAligned) {
//         score += 0.12;
//         reasons.push("L3_TRIGGER_OK");
//     } else if (triggerWindow.direction !== "NEUTRAL") {
//         score -= 0.16;
//         reasons.push("L3_TRIGGER_COUNTER");
//     }

//     if (side === "BUY" && location.isBreakoutUp) {
//         score += 0.72;
//         reasons.push("LOCATION_BREAKOUT_UP");
//     }

//     if (side === "SELL" && location.isBreakdownDown) {
//         score += 0.82;
//         reasons.push("LOCATION_BREAKDOWN_DOWN");
//     }

//     if (side === "BUY" && location.isRetestBrokenHigh) {
//         score += 0.24;
//         reasons.push("LOCATION_RETEST_BROKEN_HIGH");
//     }

//     if (side === "SELL" && location.isRetestBrokenLow) {
//         score += 0.28;
//         reasons.push("LOCATION_RETEST_BROKEN_LOW");
//     }

//     const strongContinuation =
//         (
//             longAligned &&
//             mediumAligned &&
//             structureAligned &&
//             longWindow.strength >= 2.0 &&
//             mediumWindow.impulseCount >= 2
//         ) ||
//         (
//             side === "BUY" &&
//             location.isBreakoutUp &&
//             mediumAligned &&
//             (setupAligned || triggerAligned)
//         ) ||
//         (
//             side === "SELL" &&
//             location.isBreakdownDown &&
//             mediumAligned &&
//             (setupAligned || triggerAligned)
//         );

//     const possibleReversal =
//         !longAligned &&
//         mediumAligned &&
//         triggerAligned &&
//         !structureCounter &&
//         (
//             (side === "BUY" && location.atBottom) ||
//             (side === "SELL" && location.atTop)
//         );

//     const noisySetup =
//         setupWindow.isCompression &&
//         triggerWindow.direction === "NEUTRAL";

//     const bullishContinuationBlock =
//         side === "SELL" &&
//         longWindow.direction === "UP" &&
//         mediumWindow.direction === "UP" &&
//         (setupWindow.direction === "UP" || triggerWindow.direction === "UP") &&
//         !structureCounter &&
//         !possibleReversal &&
//         !location.isBreakdownDown;

//     const bearishContinuationBlock =
//         side === "BUY" &&
//         longWindow.direction === "DOWN" &&
//         mediumWindow.direction === "DOWN" &&
//         (setupWindow.direction === "DOWN" || triggerWindow.direction === "DOWN") &&
//         !structureCounter &&
//         !possibleReversal &&
//         !location.isBreakoutUp;

//     const continuationBlockAgainstSide =
//         bullishContinuationBlock || bearishContinuationBlock;

//     if (strongContinuation) {
//         score += 0.28;
//         reasons.push("CONTINUATION_STACKED");
//     }

//     if (possibleReversal) {
//         score += 0.08;
//         reasons.push("REVERSAL_EARLY_OK");
//     }

//     if (noisySetup) {
//         score -= 0.12;
//         reasons.push("NOISY_TRIGGER");
//     }

//     if (continuationBlockAgainstSide) {
//         score -= 0.55;
//         reasons.push("COUNTER_CONTINUATION_BLOCK");
//     }

//     if (side === "BUY" && location.atTop && !location.isBreakoutUp) {
//         score -= 0.42;
//         reasons.push("NEAR_SWING_HIGH_BLOCK");
//     }

//     if (side === "SELL" && location.atBottom && !location.isBreakdownDown) {
//         score -= 0.42;
//         reasons.push("NEAR_SWING_LOW_BLOCK");
//     }

//     return {
//         longWindow,
//         mediumWindow,
//         setupWindow,
//         triggerWindow,
//         structure10,
//         swingZone10,
//         location,
//         longAligned,
//         mediumAligned,
//         setupAligned,
//         triggerAligned,
//         structureAligned,
//         structureCounter,
//         strongContinuation,
//         possibleReversal,
//         noisySetup,
//         bullishContinuationBlock,
//         bearishContinuationBlock,
//         continuationBlockAgainstSide,
//         score: Number(score.toFixed(4)),
//         reasons,
//     };
// }

// function getBreakoutRetestState(pattern = {}) {
//     const state = pattern?.breakoutRetest || pattern?.structure?.breakoutRetest || {};

//     return {
//         direction: String(state?.direction || "NEUTRAL").toUpperCase(),
//         isBreakoutLike: Boolean(state?.isBreakoutLike),
//         breakoutDetected: Boolean(state?.breakoutDetected),
//         freshBreakout: Boolean(state?.freshBreakout),
//         barsSinceBreakout:
//             state?.barsSinceBreakout === null || state?.barsSinceBreakout === undefined
//                 ? null
//                 : Number(state.barsSinceBreakout),
//         hasRetest: Boolean(state?.hasRetest),
//         retestTouched: Boolean(state?.retestTouched),
//         retestAccepted: Boolean(state?.retestAccepted),
//         retestRejected: Boolean(state?.retestRejected),
//         breakoutLevel: toNumber(state?.breakoutLevel, 0),
//         breakoutZoneHigh: toNumber(state?.breakoutZoneHigh, 0),
//         breakoutZoneLow: toNumber(state?.breakoutZoneLow, 0),
//         retestDepth: toNumber(state?.retestDepth, 0),
//         retestDistance: toNumber(state?.retestDistance, 0),
//     };
// }

// function resolveTradeMode({
//     pattern = {},
//     trendContext = {},
//     trendFollow4 = {},
//     market = {},
//     hierarchical = null,
// }) {
//     const symbol = market?.symbol || "";
//     const gold = isGoldSymbol(symbol);

//     const overallTrend = String(
//         trendContext?.overallTrend || "NEUTRAL"
//     ).toUpperCase();

//     const trendStrength = String(
//         trendContext?.trendStrength || "WEAK"
//     ).toUpperCase();

//     const followDirection = String(
//         trendFollow4?.direction || "NEUTRAL"
//     ).toUpperCase();

//     const followVolumeConfirmed = Boolean(trendFollow4?.volumeConfirmed);

//     let side = resolvePatternSide(pattern);
//     const reasons = [];

//     if (
//         hierarchical?.location?.isBreakdownDown &&
//         (side === "NEUTRAL" || side === "BUY") &&
//         overallTrend !== "BULLISH"
//     ) {
//         side = "SELL";
//         reasons.push("SIDE_OVERRIDE_BY_BREAKDOWN_LOCATION");
//     } else if (
//         hierarchical?.location?.isBreakoutUp &&
//         (side === "NEUTRAL" || side === "SELL") &&
//         overallTrend !== "BEARISH"
//     ) {
//         side = "BUY";
//         reasons.push("SIDE_OVERRIDE_BY_BREAKOUT_LOCATION");
//     }

//     const isMomentumPattern = new Set([
//         "WATERFALL_DROP_CONTINUATION",
//         "ROCKET_SURGE_CONTINUATION",
//         "DESCENDING_TRIANGLE_BREAKDOWN",
//         "ASCENDING_TRIANGLE_BREAKOUT",
//         "FIRST_LEG_BREAKDOWN",
//         "FIRST_LEG_BREAKOUT",
//     ]).has(String(pattern?.type || "").toUpperCase());

//     const hasRetestSupport = Boolean(pattern?.structure?.isRetestingSupport);
//     const hasRetestResistance = Boolean(pattern?.structure?.isRetestingResistance);
//     const isFailToHH = Boolean(pattern?.structure?.isFailToHH);
//     const isFailToLL = Boolean(pattern?.structure?.isFailToLL);

//     const trendAligned = isTrendAligned(side, overallTrend);
//     const trendCounter = isTrendCounter(side, overallTrend);

//     const breakoutRetest = getBreakoutRetestState(pattern);
//     const breakoutAligned =
//         breakoutRetest.isBreakoutLike &&
//         breakoutRetest.direction === side;

//     let mode = "NORMAL";
//     let regime = "BALANCED";
//     let quality = 0;

//     if (trendContext?.isRanging && !trendContext?.volumeConfirmed) {
//         mode = "SCALP";
//         regime = "RANGING";
//         quality -= 1;
//         reasons.push("RANGING_WITHOUT_HTF_VOLUME");
//     }

//     if (overallTrend === "MIXED") {
//         mode = "SCALP";
//         regime = "MIXED";
//         quality -= 1;
//         reasons.push("MIXED_HTF_TREND");
//     }

//     if (pattern?.isVolumeDrying) {
//         mode = "SCALP";
//         quality -= gold ? 0.5 : 1;
//         reasons.push("VOLUME_DRYING");
//     }

//     if (isFailToHH || isFailToLL) {
//         mode = "SCALP";
//         quality -= 1;
//         reasons.push("STRUCTURE_FAILURE");
//     }

//     if (trendCounter && trendStrength === "STRONG") {
//         mode = "SCALP";
//         quality -= 1;
//         reasons.push("COUNTER_STRONG_TREND");
//     }

//     if (
//         isMomentumPattern &&
//         trendAligned &&
//         (trendContext?.volumeConfirmed || followVolumeConfirmed)
//     ) {
//         mode = "NORMAL";
//         regime = "MOMENTUM_CONTINUATION";
//         quality += 2;
//         reasons.push("MOMENTUM_PATTERN_WITH_ALIGNMENT");
//     }

//     if ((hasRetestSupport || hasRetestResistance) && trendAligned) {
//         mode = "NORMAL";
//         regime = "STRUCTURE_RETEST";
//         quality += 2;
//         reasons.push("STRUCTURE_RETEST_ALIGNED");
//     }

//     if (followDirection === side && followVolumeConfirmed) {
//         quality += 1;
//         reasons.push("M5_DIRECTIONAL_CONFIRMATION");
//     } else if (followDirection !== "NEUTRAL" && followDirection !== side) {
//         quality -= 1;
//         reasons.push("M5_DIRECTIONAL_CONFLICT");
//     }

//     if (pattern?.isVolumeClimax && trendAligned) {
//         quality += 1;
//         reasons.push("VOLUME_CLIMAX_ALIGNED");
//     }

//     if (hierarchical) {
//         quality += hierarchical.score;
//         reasons.push(...hierarchical.reasons);

//         if (
//             hierarchical.strongContinuation &&
//             trendAligned
//         ) {
//             mode = "NORMAL";
//             regime = "HIERARCHICAL_CONTINUATION";
//         }

//         if (
//             hierarchical.structureCounter &&
//             mode === "NORMAL" &&
//             !hierarchical.possibleReversal
//         ) {
//             mode = "SCALP";
//             quality -= 0.35;
//             reasons.push("DOWNGRADE_BY_STRUCTURE_COUNTER");
//         }

//         const nearSwingEdge =
//             (side === "BUY" && hierarchical.location?.atTop) ||
//             (side === "SELL" && hierarchical.location?.atBottom);

//         const continuationAllowed =
//             hierarchical.strongContinuation ||
//             (side === "BUY" && hierarchical.location?.isBreakoutUp) ||
//             (side === "SELL" && hierarchical.location?.isBreakdownDown);

//         if (nearSwingEdge && !continuationAllowed) {
//             mode = "SCALP";
//             quality -= 0.25;
//             reasons.push("PRICE_NEAR_SWING_EDGE");
//         }
//     }

//     if (breakoutAligned && breakoutRetest.breakoutDetected) {
//         if (breakoutRetest.retestAccepted) {
//             quality += 0.65;
//             reasons.push("BREAKOUT_RETEST_ACCEPTED");
//         } else if (breakoutRetest.retestRejected) {
//             quality -= 0.85;
//             mode = "SCALP";
//             reasons.push("BREAKOUT_RETEST_REJECTED");
//         } else if (breakoutRetest.freshBreakout && !breakoutRetest.hasRetest) {
//             quality -= 0.20;
//             if (mode === "NORMAL") mode = "SCALP";
//             reasons.push("FRESH_BREAKOUT_WAIT_RETEST");
//         }
//     }

//     if (mode === "NORMAL" && quality <= -2) {
//         mode = "SCALP";
//         reasons.push("DOWNGRADE_TO_SCALP_BY_QUALITY");
//     }

//     return {
//         side,
//         mode,
//         regime,
//         quality,
//         reasons,
//     };
// }

// function applyLearnedPatternWeight(patternScore, learnedWeight) {
//     const base = toNumber(patternScore, 0);
//     const weight = clamp(learnedWeight, -2.5, 2.5);
//     const mildMultiplier = 1 + weight * 0.06;
//     return Number((base * clamp(mildMultiplier, 0.85, 1.15)).toFixed(4));
// }

// function getPatternClassBonus(patternType = "", tradeMode = "NORMAL") {
//     const type = String(patternType || "").toUpperCase();
//     const isScalp = tradeMode === "SCALP";

//     const strongPatterns = new Set([
//         "BULLISH_ENGULFING",
//         "BEARISH_ENGULFING",
//         "MORNING_STAR_BASE_BREAK",
//         "EVENING_STAR_BASE_BREAK",
//     ]);

//     const momentumPatterns = new Set([
//         "WATERFALL_DROP_CONTINUATION",
//         "ROCKET_SURGE_CONTINUATION",
//         "DESCENDING_TRIANGLE_BREAKDOWN",
//         "ASCENDING_TRIANGLE_BREAKOUT",
//         "FIRST_LEG_BREAKDOWN",
//         "FIRST_LEG_BREAKOUT",
//     ]);

//     if (momentumPatterns.has(type)) {
//         return isScalp ? 0.22 : 0.32;
//     }

//     if (strongPatterns.has(type)) {
//         return isScalp ? 0.14 : 0.22;
//     }

//     return 0;
// }

// function getNewsScore(news = null, market = {}) {
//     const symbol = market?.symbol || "";
//     if (!isGoldSymbol(symbol) || !news) return 0;

//     if (news.goldImpact === "bullish") return 0.18;
//     if (news.goldImpact === "bearish") return -0.18;
//     return 0;
// }

// function buildContextComponents({
//     side,
//     tradeMode,
//     pattern,
//     trendContext,
//     trendFollow4,
//     historicalVolumeSignal,
//     defensiveFlags,
//     market,
//     news,
//     learnedWeight,
//     adaptiveScoreDelta,
//     ictContext,
//     hierarchical,
// }) {
//     const sign = getDirectionSign(side);
//     const microTrend = pattern?.structure?.microTrend || "NEUTRAL";
//     const symbol = market?.symbol || "";
//     const gold = isGoldSymbol(symbol);
//     const overallTrend = String(
//         trendContext?.overallTrend || "NEUTRAL"
//     ).toUpperCase();

//     let score = 0;
//     const components = [];

//     const pushComponent = (label, value) => {
//         const val = Number((value || 0).toFixed(4));
//         score += val;
//         components.push({ label, value: val });
//     };

//     const basePatternScore = toNumber(pattern?.score, 0);
//     const weightedPatternScore = applyLearnedPatternWeight(
//         basePatternScore,
//         learnedWeight
//     );
//     pushComponent("PATTERN_BASE", weightedPatternScore);

//     const patternClassBonus = getPatternClassBonus(pattern?.type, tradeMode) * sign;
//     if (patternClassBonus !== 0) {
//         pushComponent("PATTERN_CLASS_BONUS", patternClassBonus);
//     }

//     if (isTrendAligned(side, overallTrend)) {
//         pushComponent("HTF_TREND_ALIGNED", 0.62 * sign);
//     } else if (isTrendCounter(side, overallTrend)) {
//         pushComponent("HTF_TREND_COUNTER", -0.42 * sign);
//     }

//     if (trendContext?.trendStrength === "STRONG") {
//         if (isTrendAligned(side, overallTrend)) {
//             pushComponent("HTF_TREND_STRONG", 0.26 * sign);
//         } else if (isTrendCounter(side, overallTrend)) {
//             pushComponent("HTF_TREND_STRONG_COUNTER", -0.14 * sign);
//         }
//     }

//     if (isMicroTrendAligned(side, microTrend)) {
//         pushComponent("MICRO_TREND_ALIGNED", 0.30 * sign);
//     } else if (isMicroTrendCounter(side, microTrend)) {
//         pushComponent("MICRO_TREND_COUNTER", -0.18 * sign);
//     }

//     if (isMicroTrendReversal(side, microTrend)) {
//         pushComponent("MICRO_REVERSAL_HINT", 0.14 * sign);
//     }

//     const m5Direction = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();
//     if (m5Direction === side) {
//         pushComponent("M5_ALIGNED", 0.24 * sign);
//     } else if (m5Direction !== "NEUTRAL") {
//         pushComponent("M5_COUNTER", -0.12 * sign);
//     }

//     if (trendFollow4?.volumeConfirmed) {
//         pushComponent("M5_VOLUME_CONFIRMED", 0.12 * sign);
//     }

//     if (pattern?.isVolumeClimax) {
//         pushComponent("VOLUME_CLIMAX", 0.16 * sign);
//     }

//     if (pattern?.isVolumeDrying) {
//         pushComponent("VOLUME_DRYING", -0.08 * sign);
//     }

//     if (historicalVolumeSignal === "LOW_VOLUME") {
//         pushComponent("LOW_VOLUME", gold ? -0.02 * sign : -0.07 * sign);
//     }

//     if (historicalVolumeSignal === "HIGH_VOLUME") {
//         pushComponent("HIGH_VOLUME", 0.12 * sign);
//     }

//     const earlyBuyMomentum = detectEarlyBuyMomentum(market?.candlesM5 || []);
//     const earlySellMomentum = detectEarlySellMomentum(market?.candlesM5 || []);
//     const earlyMomentumComponent = side === "BUY" ? earlyBuyMomentum : earlySellMomentum;
//     if (earlyMomentumComponent !== 0) {
//         pushComponent("EARLY_MOMENTUM", earlyMomentumComponent * 1.35);
//     }

//     const weakPullbackContinuation = detectWeakPullbackContinuation(
//         market?.candlesM5 || [],
//         side
//     );

//     if (weakPullbackContinuation.detected) {
//         const continuationBonus =
//             tradeMode === "SCALP"
//                 ? weakPullbackContinuation.score * 1.10
//                 : weakPullbackContinuation.score * 0.85;

//         pushComponent("WEAK_PULLBACK_CONTINUATION", continuationBonus * sign);
//     }

//     const hasRetestSupport =
//         Boolean(pattern?.structure?.isRetestingSupport) ||
//         Boolean(pattern?.structure?.retestingSupport);
//     const hasRetestResistance =
//         Boolean(pattern?.structure?.isRetestingResistance) ||
//         Boolean(pattern?.structure?.retestingResistance);

//     if (side === "BUY" && hasRetestSupport) {
//         pushComponent("RETEST_SUPPORT", 0.32);
//     }

//     if (side === "SELL" && hasRetestResistance) {
//         pushComponent("RETEST_RESISTANCE", -0.32);
//     }

//     const patternType = String(pattern?.type || "").toUpperCase();

//     if (side === "BUY" && patternType.includes("FIRST_LEG_BREAKOUT")) {
//         pushComponent("FIRST_LEG_BREAKOUT_BONUS", 0.28);
//     }

//     if (side === "SELL" && patternType.includes("FIRST_LEG_BREAKDOWN")) {
//         pushComponent("FIRST_LEG_BREAKDOWN_BONUS", -0.28);
//     }

//     if (side === "BUY" && patternType.includes("REVERSAL")) {
//         pushComponent("REVERSAL_PATTERN_BONUS", 0.18);
//     }

//     if (side === "SELL" && patternType.includes("REVERSAL")) {
//         pushComponent("REVERSAL_PATTERN_BONUS", -0.18);
//     }

//     const breakoutRetest = getBreakoutRetestState(pattern);
//     const breakoutAligned =
//         breakoutRetest.isBreakoutLike &&
//         breakoutRetest.direction === side;

//     if (breakoutAligned && breakoutRetest.breakoutDetected) {
//         if (breakoutRetest.retestAccepted) {
//             pushComponent("BREAKOUT_RETEST_ACCEPTED", 0.26 * sign);
//         } else if (breakoutRetest.retestRejected) {
//             pushComponent("BREAKOUT_RETEST_REJECTED", -0.34 * sign);
//         } else if (breakoutRetest.freshBreakout && !breakoutRetest.hasRetest) {
//             pushComponent("FRESH_BREAKOUT_NO_RETEST", -0.12 * sign);
//         } else if (breakoutRetest.hasRetest && breakoutRetest.retestTouched) {
//             pushComponent("BREAKOUT_RETEST_TOUCHED", 0.08 * sign);
//         }
//     }

//     const newsScore = getNewsScore(news, market) * sign;
//     if (newsScore !== 0) {
//         pushComponent("NEWS_CONTEXT", newsScore);
//     }

//     if (ictContext?.signalBias === side) {
//         pushComponent("ICT_SIGNAL_ALIGNED", 0.12 * sign);
//     } else if (ictContext?.signalBias && ictContext.signalBias !== "NEUTRAL") {
//         pushComponent("ICT_SIGNAL_COUNTER", -0.06 * sign);
//     }

//     if (adaptiveScoreDelta !== 0) {
//         pushComponent("ADAPTIVE_DELTA", adaptiveScoreDelta);
//     }

//     if (hierarchical?.score) {
//         pushComponent("HIERARCHICAL_CONTEXT", hierarchical.score);
//     }

//     if (hierarchical?.possibleReversal) {
//         pushComponent("HIERARCHICAL_REVERSAL_OK", 0.12 * sign);
//     }

//     if (defensiveFlags?.warningMatched) {
//         const penalty = Math.abs(toNumber(defensiveFlags.scorePenalty, 0.5));
//         const reducedPenalty = clamp(penalty * 0.55, 0.12, 0.45);
//         pushComponent("FAILED_PATTERN_PENALTY", -reducedPenalty * sign);
//     }

//     return {
//         score,
//         components,
//     };
// }

// function getDynamicThresholdContext({
//     mode = "NORMAL",
//     trend = "NEUTRAL",
//     adaptiveScoreDelta = 0,
//     historicalVolumeSignal = null,
//     defensiveFlags = {},
//     symbol = "",
//     regimeQuality = 0,
//     hierarchical = null,
// }) {
//     const normalizedMode = String(mode || "NORMAL").toUpperCase();
//     const normalizedTrend = String(trend || "NEUTRAL").toUpperCase();
//     const isScalp = normalizedMode === "SCALP";
//     const gold = isGoldSymbol(symbol);

//     let buyThreshold = isScalp ? 1.68 : 1.88;
//     let sellThreshold = isScalp ? -1.68 : -1.88;
//     const reasons = [];

//     if (normalizedTrend === "NEUTRAL") {
//         buyThreshold += 0.06;
//         sellThreshold -= 0.06;
//         reasons.push("NEUTRAL_TREND");
//     }

//     if (normalizedTrend === "MIXED") {
//         buyThreshold += 0.10;
//         sellThreshold -= 0.10;
//         reasons.push("MIXED_TREND");
//     }

//     if (historicalVolumeSignal === "LOW_VOLUME") {
//         buyThreshold += gold ? 0.03 : 0.08;
//         sellThreshold -= gold ? 0.03 : 0.08;
//         reasons.push("LOW_VOLUME");
//     }

//     if (historicalVolumeSignal === "HIGH_VOLUME") {
//         buyThreshold -= 0.10;
//         sellThreshold += 0.10;
//         reasons.push("HIGH_VOLUME");
//     }

//     if (adaptiveScoreDelta < 0) {
//         const penalty = Math.min(Math.abs(adaptiveScoreDelta) * 0.08, 0.12);
//         buyThreshold += penalty;
//         sellThreshold -= penalty;
//         reasons.push("NEGATIVE_ADAPTIVE_DELTA");
//     }

//     if (adaptiveScoreDelta > 0) {
//         const bonus = Math.min(Math.abs(adaptiveScoreDelta) * 0.08, 0.12);
//         buyThreshold -= bonus;
//         sellThreshold += bonus;
//         reasons.push("POSITIVE_ADAPTIVE_DELTA");
//     }

//     if (defensiveFlags?.warningMatched) {
//         buyThreshold += 0.05;
//         sellThreshold -= 0.05;
//         reasons.push("FAILED_PATTERN_WARNING");
//     }

//     if (regimeQuality <= -2) {
//         buyThreshold += 0.04;
//         sellThreshold -= 0.04;
//         reasons.push("LOW_REGIME_QUALITY");
//     }

//     if (hierarchical?.continuationBlockAgainstSide) {
//         buyThreshold += 0.08;
//         sellThreshold -= 0.08;
//         reasons.push("CONTINUATION_BLOCK");
//     }

//     if (hierarchical?.noisySetup) {
//         buyThreshold += 0.04;
//         sellThreshold -= 0.04;
//         reasons.push("NOISY_SETUP");
//     }

//     if (hierarchical?.possibleReversal) {
//         buyThreshold -= 0.06;
//         sellThreshold += 0.06;
//         reasons.push("POSSIBLE_REVERSAL");
//     }

//     buyThreshold = clampThreshold(Number(buyThreshold.toFixed(4)), 1.45, 3.2);
//     sellThreshold = clampThreshold(Number(sellThreshold.toFixed(4)), -3.2, -1.45);

//     return {
//         buyThreshold,
//         sellThreshold,
//         reasons,
//     };
// }

// function isSellStructureContinuationReady(hierarchical = {}, trendFollow4 = {}) {
//     const location = hierarchical?.location || {};
//     const structure = String(hierarchical?.structure10?.structure || "NEUTRAL").toUpperCase();
//     const triggerDirection = String(hierarchical?.triggerWindow?.direction || "NEUTRAL").toUpperCase();
//     const setupDirection = String(hierarchical?.setupWindow?.direction || "NEUTRAL").toUpperCase();
//     const followDirection = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();

//     const structureBearish =
//         structure === "LH_LL" ||
//         structure === "LH_ONLY" ||
//         structure === "LL_ONLY";

//     const triggerBearish =
//         triggerDirection === "DOWN" || setupDirection === "DOWN";

//     const breakdownReady =
//         Boolean(location?.isBreakdownDown) ||
//         Boolean(location?.isRetestBrokenLow);

//     const followBearish = followDirection === "SELL";

//     return breakdownReady && structureBearish && triggerBearish && followBearish;
// }

// function isBuyStructureContinuationReady(hierarchical = {}, trendFollow4 = {}) {
//     const location = hierarchical?.location || {};
//     const structure = String(hierarchical?.structure10?.structure || "NEUTRAL").toUpperCase();
//     const triggerDirection = String(hierarchical?.triggerWindow?.direction || "NEUTRAL").toUpperCase();
//     const setupDirection = String(hierarchical?.setupWindow?.direction || "NEUTRAL").toUpperCase();
//     const followDirection = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();

//     const structureBullish =
//         structure === "HH_HL" ||
//         structure === "HH_ONLY" ||
//         structure === "HL_ONLY";

//     const triggerBullish =
//         triggerDirection === "UP" || setupDirection === "UP";

//     const breakoutReady =
//         Boolean(location?.isBreakoutUp) ||
//         Boolean(location?.isRetestBrokenHigh);

//     const followBullish = followDirection === "BUY";

//     return breakoutReady && structureBullish && triggerBullish && followBullish;
// }

// async function findFailedPatternRule({
//     userId = null,
//     accountId = null,
//     symbol = "XAUUSDm",
//     timeframe = "M5",
//     side = "NEUTRAL",
//     mode = "NORMAL",
//     pattern = {},
//     market = {},
// }) {
//     try {
//         const contextFeatures = buildContextFeatures({
//             pattern,
//             market,
//             timeframe,
//             side,
//             mode,
//         });

//         const contextHash = buildContextHashNew(contextFeatures);

//         return await findFailedPattern({
//             userId,
//             accountId,
//             symbol,
//             timeframe,
//             side,
//             mode,
//             contextHash,
//         });
//     } catch (_error) {
//         return null;
//     }
// }

// async function evaluateDecision({
//     pattern,
//     candlesM15 = [],
//     candlesM30 = [],
//     candlesH1 = [],
//     candlesH4 = [],
//     trendFollow4 = {},
//     market = {},
//     news = null,
//     session = null,
//     ictContext = null,
// }) {
//     if (!pattern) {
//         return {
//             action: "NO_TRADE",
//             reason: "NO_PATTERN",
//             score: 0,
//         };
//     }

//     const trendContext = getSafeTrendContext(
//         market?.candlesM15,
//         market?.candlesM30,
//         market?.candlesH1,
//         market?.candlesH4
//     );

//     const baseSide = resolvePatternSide(pattern);

//     if (baseSide === "NEUTRAL") {
//         return {
//             action: "NO_TRADE",
//             reason: "UNKNOWN_PATTERN_SIDE",
//             score: 0,
//         };
//     }

//     const timeframe = market?.timeframe || "M5";
//     const marketCandles = Array.isArray(market?.candles) ? market.candles : [];

//     let hierarchical = buildHierarchicalContext(marketCandles, baseSide);
//     let regimeContext = resolveTradeMode({
//         pattern,
//         trendContext,
//         trendFollow4,
//         market,
//         hierarchical,
//     });

//     let effectiveSide = String(regimeContext?.side || baseSide).toUpperCase();

//     if (effectiveSide !== baseSide) {
//         hierarchical = buildHierarchicalContext(marketCandles, effectiveSide);
//         regimeContext = resolveTradeMode({
//             pattern,
//             trendContext,
//             trendFollow4,
//             market,
//             hierarchical,
//         });
//         effectiveSide = String(regimeContext?.side || effectiveSide).toUpperCase();
//     }

//     let tradeMode = regimeContext.mode || "NORMAL";
//     let defensiveFlags = {
//         warningMatched: false,
//         lotMultiplier: 1,
//         tpMultiplier: 1,
//         scorePenalty: 0,
//         failedPatternAction: null,
//         matchLevel: null,
//         reason: null,
//     };

//     if (hierarchical?.continuationBlockAgainstSide && !hierarchical?.strongContinuation) {
//         return {
//             action: "NO_TRADE",
//             reason: "COUNTER_CONTINUATION_BLOCK",
//             score: 0,
//             side: effectiveSide,
//             mode: tradeMode,
//             trend: trendContext.overallTrend,
//             defensiveFlags,
//             adaptiveScoreDelta: 0,
//             historicalVolumeSignal: market?.historicalVolumeSignal || null,
//             thresholdContext: getDynamicThresholdContext({
//                 mode: tradeMode,
//                 trend: trendContext.overallTrend,
//                 adaptiveScoreDelta: 0,
//                 historicalVolumeSignal: market?.historicalVolumeSignal || null,
//                 defensiveFlags,
//                 symbol: market?.symbol,
//                 regimeQuality: regimeContext.quality,
//                 hierarchical,
//             }),
//             scoreBreakdown: null,
//             regimeContext,
//             hierarchical,
//         };
//     }

//     const historicalVolumeSignal = market?.historicalVolumeSignal || null;

//     if (
//         (
//             effectiveSide === "BUY" &&
//             hierarchical?.location?.atTop &&
//             !hierarchical?.location?.isBreakoutUp &&
//             !hierarchical?.possibleReversal
//         ) ||
//         (
//             effectiveSide === "SELL" &&
//             hierarchical?.location?.atBottom &&
//             !hierarchical?.location?.isBreakdownDown &&
//             !hierarchical?.possibleReversal
//         )
//     ) {
//         return {
//             action: "NO_TRADE",
//             reason:
//                 effectiveSide === "BUY"
//                     ? "BUY_NEAR_SWING_HIGH"
//                     : "SELL_NEAR_SWING_LOW",
//             score: 0,
//             side: effectiveSide,
//             mode: tradeMode,
//             trend: trendContext.overallTrend,
//             defensiveFlags,
//             adaptiveScoreDelta: 0,
//             historicalVolumeSignal,
//             thresholdContext: getDynamicThresholdContext({
//                 mode: tradeMode,
//                 trend: trendContext.overallTrend,
//                 adaptiveScoreDelta: 0,
//                 historicalVolumeSignal,
//                 defensiveFlags,
//                 symbol: market?.symbol,
//                 regimeQuality: regimeContext.quality,
//                 hierarchical,
//             }),
//             scoreBreakdown: null,
//             regimeContext,
//             hierarchical,
//         };
//     }

//     let adaptiveScoreDelta = 0;
//     const sessionName = market?.sessionName || session?.name || null;

//     const adaptiveRule = await findAdaptiveScoreRule({
//         firebaseUserId: market?.userId || null,
//         accountId: market?.accountId || null,
//         symbol: market?.symbol || "XAUUSDm",
//         timeframe: timeframe,
//         patternType: pattern?.type || "Unknown",
//         side: effectiveSide,
//         mode: tradeMode,
//         sessionName,
//         microTrend: pattern?.structure?.microTrend || null,
//         volumeProfile: pattern?.volumeProfile || null,
//         rangeState: pattern?.rangeState || null,
//     });

//     if (adaptiveRule) {
//         adaptiveScoreDelta = Number(adaptiveRule.adaptive_score_delta || 0);
//     }

//     const learnedWeight = await getPatternWeight({
//         firebaseUserId: market?.userId || null,
//         accountId: market?.accountId || "",
//         symbol: market?.symbol || "DEFAULT",
//         patternName: pattern?.type || "",
//     });

//     const scoreContext = buildContextComponents({
//         side: effectiveSide,
//         tradeMode,
//         pattern,
//         trendContext,
//         trendFollow4,
//         historicalVolumeSignal,
//         defensiveFlags,
//         market,
//         news,
//         learnedWeight,
//         adaptiveScoreDelta,
//         ictContext,
//         hierarchical,
//     });

//     const score = Number(scoreContext.score.toFixed(4));

//     if (defensiveFlags.warningMatched && tradeMode === "NORMAL" && score < 0) {
//         tradeMode = "SCALP";
//     }

//     if (
//         tradeMode === "NORMAL" &&
//         regimeContext.quality <= -2 &&
//         !isGoldSymbol(market?.symbol)
//     ) {
//         tradeMode = "SCALP";
//     }

//     if (market && market.portfolio) {
//         const { currentPosition, count } = market.portfolio;
//         const pyramidThreshold = tradeMode === "SCALP" ? 2.6 : 2.25;

//         if (currentPosition !== "NONE") {
//             if (currentPosition === "BUY" && score <= -2.15) {
//                 return {
//                     action: "NO_TRADE",
//                     reason: "ANTI_HEDGE_BLOCK",
//                     score,
//                     side: effectiveSide,
//                 };
//             }

//             if (currentPosition === "SELL" && score >= 2.15) {
//                 return {
//                     action: "NO_TRADE",
//                     reason: "ANTI_HEDGE_BLOCK",
//                     score,
//                     side: effectiveSide,
//                 };
//             }

//             if (currentPosition === "BUY" && score >= pyramidThreshold) {
//                 if (count >= 3) {
//                     return {
//                         action: "NO_TRADE",
//                         reason: "MAX_PYRAMID_ORDERS_REACHED",
//                         score,
//                         side: effectiveSide,
//                     };
//                 }

//                 return {
//                     action: "ALLOW_BUY_PYRAMID",
//                     score,
//                     side: effectiveSide,
//                     mode: tradeMode,
//                     trend: trendContext.overallTrend,
//                     defensiveFlags,
//                 };
//             }

//             if (currentPosition === "SELL" && score <= -pyramidThreshold) {
//                 if (count >= 3) {
//                     return {
//                         action: "NO_TRADE",
//                         reason: "MAX_PYRAMID_ORDERS_REACHED",
//                         score,
//                         side: effectiveSide,
//                     };
//                 }

//                 return {
//                     action: "ALLOW_SELL_PYRAMID",
//                     score,
//                     side: effectiveSide,
//                     mode: tradeMode,
//                     trend: trendContext.overallTrend,
//                     defensiveFlags,
//                 };
//             }

//             return {
//                 action: "NO_TRADE",
//                 reason: "SCORE_TOO_LOW_FOR_PYRAMIDING",
//                 score,
//                 side: effectiveSide,
//             };
//         }
//     }

//     const thresholdContext = getDynamicThresholdContext({
//         mode: tradeMode,
//         trend: trendContext.overallTrend,
//         adaptiveScoreDelta,
//         historicalVolumeSignal,
//         defensiveFlags,
//         symbol: market?.symbol,
//         regimeQuality: regimeContext.quality,
//         hierarchical,
//     });

//     console.log("[EVALUATE_BREAKDOWN]", {
//         symbol: market?.symbol,
//         side: effectiveSide,
//         mode: tradeMode,
//         trend: trendContext?.overallTrend,
//         patternType: pattern?.type || "Unknown",
//         breakoutRetest: pattern?.breakoutRetest || null,
//         adaptiveScoreDelta,
//         historicalVolumeSignal,
//         warningMatched: defensiveFlags?.warningMatched,
//         failedPatternAction: defensiveFlags?.failedPatternAction || null,
//         failedPatternMatchLevel: defensiveFlags?.matchLevel || null,
//         finalScore: score,
//         thresholdContext,
//         regimeContext,
//         hierarchical,
//         scoreBreakdown: scoreContext.components,
//     });

//     return {
//         score,
//         side: effectiveSide,
//         patternType: pattern ? pattern.type : "Unknown",
//         trend: trendContext.overallTrend,
//         mode: tradeMode,
//         defensiveFlags,
//         adaptiveScoreDelta,
//         historicalVolumeSignal,
//         thresholdContext,
//         scoreBreakdown: scoreContext.components,
//         trendFollow4,
//         regimeContext,
//         hierarchical,
//     };
// }

// function decision(evaluation, symbol) {
//     if (evaluation.action === "NO_TRADE") {
//         return evaluation.action;
//     }

//     if (
//         evaluation.action === "ALLOW_BUY_PYRAMID" ||
//         evaluation.action === "ALLOW_SELL_PYRAMID"
//     ) {
//         return evaluation.action;
//     }

//     const {
//         score,
//         mode,
//         trend,
//         adaptiveScoreDelta = 0,
//         historicalVolumeSignal = null,
//         defensiveFlags = {},
//         thresholdContext,
//         regimeContext = {},
//         hierarchical = null,
//         patternType = "",
//         scoreBreakdown = [],
//         trendFollow4 = {},
//         side = "NEUTRAL",
//     } = evaluation;

//     const dynamicThreshold =
//         thresholdContext ||
//         getDynamicThresholdContext({
//             mode,
//             trend,
//             adaptiveScoreDelta,
//             historicalVolumeSignal,
//             defensiveFlags,
//             symbol,
//             regimeQuality: regimeContext?.quality || 0,
//             hierarchical,
//         });

//     const buyThreshold = Number(dynamicThreshold.buyThreshold || 1.88);
//     const sellThreshold = Number(dynamicThreshold.sellThreshold || -1.88);
//     const normalizedPatternType = String(patternType || "").toUpperCase();

//     const hasBreakoutType =
//         normalizedPatternType.includes("FIRST_LEG_BREAKOUT") ||
//         normalizedPatternType.includes("ASCENDING_TRIANGLE_BREAKOUT") ||
//         normalizedPatternType.includes("ROCKET_SURGE_CONTINUATION") ||
//         normalizedPatternType.includes("STRUCTURE_BREAKOUT_CONTINUATION");

//     const hasBreakdownType =
//         normalizedPatternType.includes("FIRST_LEG_BREAKDOWN") ||
//         normalizedPatternType.includes("DESCENDING_TRIANGLE_BREAKDOWN") ||
//         normalizedPatternType.includes("WATERFALL_DROP_CONTINUATION") ||
//         normalizedPatternType.includes("STRUCTURE_BREAKDOWN_CONTINUATION");

//     const hasStrongEarlyMomentum = Array.isArray(scoreBreakdown)
//         ? scoreBreakdown.some(
//             (item) =>
//                 item?.label === "EARLY_MOMENTUM" &&
//                 Math.abs(Number(item?.value || 0)) >= 0.28
//         )
//         : false;

//     const hasRetestSupport = Array.isArray(scoreBreakdown)
//         ? scoreBreakdown.some((item) => item?.label === "RETEST_SUPPORT")
//         : false;

//     const hasRetestResistance = Array.isArray(scoreBreakdown)
//         ? scoreBreakdown.some((item) => item?.label === "RETEST_RESISTANCE")
//         : false;

//     const hasAcceptedBreakoutRetest = Array.isArray(scoreBreakdown)
//         ? scoreBreakdown.some((item) => item?.label === "BREAKOUT_RETEST_ACCEPTED")
//         : false;

//     const hasRejectedBreakoutRetest = Array.isArray(scoreBreakdown)
//         ? scoreBreakdown.some((item) => item?.label === "BREAKOUT_RETEST_REJECTED")
//         : false;

//     const hasFreshBreakoutNoRetest = Array.isArray(scoreBreakdown)
//         ? scoreBreakdown.some((item) => item?.label === "FRESH_BREAKOUT_NO_RETEST")
//         : false;

//     const sellStructureReady = isSellStructureContinuationReady(
//         hierarchical,
//         trendFollow4
//     );

//     const buyStructureReady = isBuyStructureContinuationReady(
//         hierarchical,
//         trendFollow4
//     );

//     const buyFastLane =
//         score >= buyThreshold ||
//         (
//             score >= buyThreshold - 0.22 &&
//             hasStrongEarlyMomentum &&
//             (hasBreakoutType || hasRetestSupport)
//         ) ||
//         (
//             score >= buyThreshold - 0.18 &&
//             historicalVolumeSignal === "HIGH_VOLUME" &&
//             hasBreakoutType
//         ) ||
//         (
//             score >= buyThreshold - 0.16 &&
//             hierarchical?.possibleReversal &&
//             hasRetestSupport
//         ) ||
//         (
//             side === "BUY" &&
//             buyStructureReady &&
//             mode === "SCALP" &&
//             score >= buyThreshold - 0.42
//         ) ||
//         (
//             side === "BUY" &&
//             hasAcceptedBreakoutRetest &&
//             score >= buyThreshold - 0.18
//         );

//     const sellFastLane =
//         score <= sellThreshold ||
//         (
//             score <= sellThreshold + 0.22 &&
//             hasStrongEarlyMomentum &&
//             (hasBreakdownType || hasRetestResistance)
//         ) ||
//         (
//             score <= sellThreshold + 0.18 &&
//             historicalVolumeSignal === "HIGH_VOLUME" &&
//             hasBreakdownType
//         ) ||
//         (
//             score <= sellThreshold + 0.16 &&
//             hierarchical?.possibleReversal &&
//             hasRetestResistance
//         ) ||
//         (
//             side === "SELL" &&
//             sellStructureReady &&
//             mode === "SCALP" &&
//             score <= sellThreshold + 0.42
//         ) ||
//         (
//             side === "SELL" &&
//             hasAcceptedBreakoutRetest &&
//             score <= sellThreshold + 0.18
//         );

//     if (hasRejectedBreakoutRetest) {
//         return "NO_TRADE";
//     }

//     if (hasFreshBreakoutNoRetest) {
//         if (side === "BUY" && !hasRetestSupport && score < buyThreshold) {
//             return "NO_TRADE";
//         }
//         if (side === "SELL" && !hasRetestResistance && score > sellThreshold) {
//             return "NO_TRADE";
//         }
//     }

//     if (buyFastLane) {
//         return mode === "SCALP" ? "ALLOW_BUY_SCALP" : "ALLOW_BUY";
//     }

//     if (sellFastLane) {
//         return mode === "SCALP" ? "ALLOW_SELL_SCALP" : "ALLOW_SELL";
//     }

//     return "NO_TRADE";
// }

// function resolveDecisionWithTradingPreferences(
//     evaluation,
//     symbol,
//     options = {}
// ) {
//     const rawDecision = decision(evaluation, symbol);

//     const directionResult = enforceDirectionBiasOnDecision(
//         rawDecision,
//         options.tradingPreferences
//     );

//     return {
//         decision: directionResult.decision,
//         reason: directionResult.reason,
//         blocked: directionResult.blocked,
//     };
// }

// module.exports = {
//     evaluateDecision,
//     decision,
//     resolveDecisionWithTradingPreferences,
// };
const { detectTrendAndRange } = require("../pattern/pattern-rules");
const { findFailedPattern } = require("../failedPattern.repo");
const { getPatternWeight } = require("../strategyWeights.repo");
const {
    buildContextFeatures,
    buildContextHashNew,
} = require("../utils/context-features");
const { findAdaptiveScoreRule } = require("../adaptiveScore.repo");
const {
    enforceDirectionBiasOnDecision,
} = require("../tradingPreferences.service");

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, Number(num || 0)));
}

function clampThreshold(value, min, max) {
    const num = Number(value || 0);
    if (num < min) return min;
    if (num > max) return max;
    return num;
}

function getCandleDirection(candle = {}) {
    const open = toNumber(candle.open);
    const close = toNumber(candle.close);
    const high = toNumber(candle.high);
    const low = toNumber(candle.low);

    return {
        open,
        close,
        high,
        low,
        body: Math.abs(close - open),
        range: Math.max(high - low, 0),
        isBull: close > open,
        isBear: close < open,
    };
}

function getCandleBody(candle = {}) {
    return getCandleDirection(candle).body;
}

function isBullish(candle = {}) {
    return getCandleDirection(candle).isBull;
}

function isBearish(candle = {}) {
    return getCandleDirection(candle).isBear;
}

function averageBody(candles = [], lookback = 5) {
    if (!Array.isArray(candles) || candles.length === 0) return 0;
    const sample = candles.slice(-lookback);
    if (!sample.length) return 0;
    return (
        sample.reduce((sum, candle) => sum + getCandleDirection(candle).body, 0) /
        sample.length
    );
}

function averageRange(candles = [], lookback = 5) {
    if (!Array.isArray(candles) || candles.length === 0) return 0;
    const sample = candles.slice(-lookback);
    if (!sample.length) return 0;
    return (
        sample.reduce((sum, candle) => sum + getCandleDirection(candle).range, 0) /
        sample.length
    );
}

function detectEarlyBuyMomentum(candles = []) {
    if (!Array.isArray(candles) || candles.length < 4) return 0;

    const c1 = getCandleDirection(candles[candles.length - 1]);
    const c2 = getCandleDirection(candles[candles.length - 2]);
    const c3 = getCandleDirection(candles[candles.length - 3]);
    const avgRecentBody = averageBody(candles.slice(0, -1), 5);

    let scoreBoost = 0;

    const hasTwoBullishCandles = c1.isBull && c2.isBull;
    const higherHigh = c1.high > c2.high || c2.high > c3.high;
    const higherLow = c1.low > c2.low || c2.low > c3.low;
    const higherClose = c1.close > c2.close && c2.close >= c3.close;

    const bodyStrength =
        avgRecentBody > 0 &&
        (c1.body >= avgRecentBody * 0.8 || c2.body >= avgRecentBody * 0.8);

    if (hasTwoBullishCandles) scoreBoost += 0.12;
    if (higherHigh) scoreBoost += 0.08;
    if (higherLow) scoreBoost += 0.08;
    if (higherClose) scoreBoost += 0.10;
    if (bodyStrength) scoreBoost += 0.07;

    if (c1.close > c2.high) scoreBoost += 0.10;
    if (c2.close > c3.high) scoreBoost += 0.08;

    return Number(scoreBoost.toFixed(4));
}

function detectEarlySellMomentum(candles = []) {
    if (!Array.isArray(candles) || candles.length < 4) return 0;

    const c1 = getCandleDirection(candles[candles.length - 1]);
    const c2 = getCandleDirection(candles[candles.length - 2]);
    const c3 = getCandleDirection(candles[candles.length - 3]);
    const avgRecentBody = averageBody(candles.slice(0, -1), 5);

    let scoreBoost = 0;

    const hasTwoBearishCandles = c1.isBear && c2.isBear;
    const lowerLow = c1.low < c2.low || c2.low < c3.low;
    const lowerHigh = c1.high < c2.high || c2.high < c3.high;
    const lowerClose = c1.close < c2.close && c2.close <= c3.close;

    const bodyStrength =
        avgRecentBody > 0 &&
        (c1.body >= avgRecentBody * 0.8 || c2.body >= avgRecentBody * 0.8);

    if (hasTwoBearishCandles) scoreBoost -= 0.12;
    if (lowerLow) scoreBoost -= 0.08;
    if (lowerHigh) scoreBoost -= 0.08;
    if (lowerClose) scoreBoost -= 0.10;
    if (bodyStrength) scoreBoost -= 0.07;

    if (c1.close < c2.low) scoreBoost -= 0.10;
    if (c2.close < c3.low) scoreBoost -= 0.08;

    return Number(scoreBoost.toFixed(4));
}

function detectWeakPullbackContinuation(candles = [], side = "NEUTRAL") {
    const sample = Array.isArray(candles) ? candles.slice(-8) : [];
    const normalizedSide = String(side || "NEUTRAL").toUpperCase();

    if (sample.length < 6 || (normalizedSide !== "BUY" && normalizedSide !== "SELL")) {
        return {
            detected: false,
            score: 0,
            breakdown: {},
        };
    }

    const trigger = sample[sample.length - 1] || {};
    const pullbackWindow = sample.slice(-5, -1);
    const anchor = sample[sample.length - 6] || {};
    const recentAvgBody = averageBody(sample, 6) || 0;

    const triggerBody = getCandleBody(trigger);
    const pullbackHigh = Math.max(...pullbackWindow.map((c) => toNumber(c.high, 0)));
    const pullbackLow = Math.min(...pullbackWindow.map((c) => toNumber(c.low, 0)));
    const pullbackMid = (pullbackHigh + pullbackLow) / 2;

    let score = 0;
    let detected = false;
    const breakdown = {};

    if (normalizedSide === "SELL") {
        const bullishPullbacks = pullbackWindow.filter(isBullish);
        const bearishPullbacks = pullbackWindow.filter(isBearish);

        const bullishCount = bullishPullbacks.length;
        const avgBullPullbackBody =
            bullishPullbacks.reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, bullishCount);

        const avgBearBodyContext =
            sample
                .slice(0, -1)
                .filter(isBearish)
                .reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, sample.slice(0, -1).filter(isBearish).length);

        const weakPullback =
            bullishCount >= 1 &&
            bullishCount <= 4 &&
            avgBullPullbackBody <= Math.max(avgBearBodyContext, recentAvgBody) * 0.95;

        const lowerHighPreserved =
            pullbackHigh <= toNumber(anchor.high, 0) &&
            pullbackWindow.every((c) => toNumber(c.close, 0) <= toNumber(anchor.high, 0));

        const lastPullback = pullbackWindow[pullbackWindow.length - 1] || {};
        const bearishTrigger =
            isBearish(trigger) &&
            (
                toNumber(trigger.close, 0) < toNumber(lastPullback.low, 0) ||
                toNumber(trigger.close, 0) < pullbackMid
            );

        const triggerBodyStrong = triggerBody >= recentAvgBody * 0.85;

        if (weakPullback) score += 0.40;
        if (lowerHighPreserved) score += 0.42;
        if (bearishTrigger) score += 0.52;
        if (triggerBodyStrong) score += 0.22;
        if (bearishPullbacks.length >= 1) score += 0.10;

        detected = weakPullback && lowerHighPreserved && bearishTrigger && score >= 1.10;

        breakdown.bullishCount = bullishCount;
        breakdown.avgBullPullbackBody = Number(avgBullPullbackBody.toFixed(5));
        breakdown.avgBearBodyContext = Number(avgBearBodyContext.toFixed(5));
        breakdown.weakPullback = weakPullback;
        breakdown.lowerHighPreserved = lowerHighPreserved;
        breakdown.bearishTrigger = bearishTrigger;
        breakdown.triggerBodyStrong = triggerBodyStrong;
    }

    if (normalizedSide === "BUY") {
        const bearishPullbacks = pullbackWindow.filter(isBearish);
        const bullishPullbacks = pullbackWindow.filter(isBullish);

        const bearishCount = bearishPullbacks.length;
        const avgBearPullbackBody =
            bearishPullbacks.reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, bearishCount);

        const avgBullBodyContext =
            sample
                .slice(0, -1)
                .filter(isBullish)
                .reduce((sum, c) => sum + getCandleBody(c), 0) /
            Math.max(1, sample.slice(0, -1).filter(isBullish).length);

        const weakPullback =
            bearishCount >= 1 &&
            bearishCount <= 4 &&
            avgBearPullbackBody <= Math.max(avgBullBodyContext, recentAvgBody) * 0.95;

        const higherLowPreserved =
            pullbackLow >= toNumber(anchor.low, 0) &&
            pullbackWindow.every((c) => toNumber(c.close, 0) >= toNumber(anchor.low, 0));

        const lastPullback = pullbackWindow[pullbackWindow.length - 1] || {};
        const bullishTrigger =
            isBullish(trigger) &&
            (
                toNumber(trigger.close, 0) > toNumber(lastPullback.high, 0) ||
                toNumber(trigger.close, 0) > pullbackMid
            );

        const triggerBodyStrong = triggerBody >= recentAvgBody * 0.85;

        if (weakPullback) score += 0.40;
        if (higherLowPreserved) score += 0.42;
        if (bullishTrigger) score += 0.52;
        if (triggerBodyStrong) score += 0.22;
        if (bullishPullbacks.length >= 1) score += 0.10;

        detected = weakPullback && higherLowPreserved && bullishTrigger && score >= 1.10;

        breakdown.bearishCount = bearishCount;
        breakdown.avgBearPullbackBody = Number(avgBearPullbackBody.toFixed(5));
        breakdown.avgBullBodyContext = Number(avgBullBodyContext.toFixed(5));
        breakdown.weakPullback = weakPullback;
        breakdown.higherLowPreserved = higherLowPreserved;
        breakdown.bullishTrigger = bullishTrigger;
        breakdown.triggerBodyStrong = triggerBodyStrong;
    }

    return {
        detected,
        score: Number(score.toFixed(4)),
        breakdown,
    };
}

function isGoldSymbol(symbol = "") {
    const s = String(symbol || "").toUpperCase();
    return s === "XAUUSD" || s === "XAUUSDM";
}

function normalizeHigherTimeframeCandles(candles = []) {
    return Array.isArray(candles) ? candles.filter(Boolean) : [];
}

function getSafeTrendContext(
    candlesM15 = [],
    candlesM30 = [],
    candlesH1 = [],
    candlesH4 = []
) {
    try {
        const safeM15 = normalizeHigherTimeframeCandles(candlesM15);
        const safeM30 = normalizeHigherTimeframeCandles(candlesM30);
        const safeH1 = normalizeHigherTimeframeCandles(candlesH1);
        const safeH4 = normalizeHigherTimeframeCandles(candlesH4);

        let trend = null;
        let trendSource = "M15_M30";

        if (safeM15.length > 0 && safeM30.length > 0) {
            trend = detectTrendAndRange(safeM15, safeM30) || {};
        }

        return {
            overallTrend: trend.overallTrend || "NEUTRAL",
            trendStrength: trend.trendStrength || "WEAK",
            isRanging: Boolean(trend.isRanging),
            volumeConfirmed: Boolean(trend.volumeConfirmed),
            trendSource,
        };
    } catch (_error) {
        return {
            overallTrend: "NEUTRAL",
            trendStrength: "WEAK",
            isRanging: false,
            volumeConfirmed: false,
            trendSource: "ERROR_FALLBACK",
        };
    }
}

function resolvePatternSide(pattern = {}) {
    const rawPattern = String(pattern?.pattern || "").toUpperCase();
    const rawType = String(pattern?.type || "").toUpperCase();
    const bias = String(pattern?.bias || "").toUpperCase();
    const structure = pattern?.structure || {};

    if (
        rawPattern.includes("BUY") ||
        rawType.includes("BULLISH") ||
        rawType.includes("BREAKOUT") ||
        bias === "BUY"
    ) {
        return "BUY";
    }

    if (
        rawPattern.includes("SELL") ||
        rawType.includes("BEARISH") ||
        rawType.includes("BREAKDOWN") ||
        bias === "SELL"
    ) {
        return "SELL";
    }

    const microTrend = String(structure?.microTrend || "NEUTRAL").toUpperCase();

    if (
        structure?.firstLegBreakSell ||
        structure?.isRetestingResistance ||
        microTrend === "BEARISH" ||
        microTrend === "BEARISH_REVERSAL"
    ) {
        return "SELL";
    }

    if (
        structure?.firstLegBreakBuy ||
        structure?.isRetestingSupport ||
        microTrend === "BULLISH" ||
        microTrend === "BULLISH_REVERSAL"
    ) {
        return "BUY";
    }

    return "NEUTRAL";
}

function getDirectionSign(side = "NEUTRAL") {
    if (side === "BUY") return 1;
    if (side === "SELL") return -1;
    return 0;
}

function normalizeMicroTrend(microTrend = "NEUTRAL") {
    return String(microTrend || "NEUTRAL").toUpperCase();
}

function isTrendAligned(side, trend) {
    if (side === "BUY") return trend === "BULLISH";
    if (side === "SELL") return trend === "BEARISH";
    return false;
}

function isTrendCounter(side, trend) {
    if (side === "BUY") return trend === "BEARISH";
    if (side === "SELL") return trend === "BULLISH";
    return false;
}

function isMicroTrendAligned(side, microTrend) {
    const t = normalizeMicroTrend(microTrend);
    if (side === "BUY") return t === "BULLISH" || t === "BULLISH_REVERSAL";
    if (side === "SELL") return t === "BEARISH" || t === "BEARISH_REVERSAL";
    return false;
}

function isMicroTrendReversal(side, microTrend) {
    const t = normalizeMicroTrend(microTrend);
    if (side === "BUY") return t === "BULLISH_REVERSAL";
    if (side === "SELL") return t === "BEARISH_REVERSAL";
    return false;
}

function isMicroTrendCounter(side, microTrend) {
    const t = normalizeMicroTrend(microTrend);
    if (side === "BUY") return t === "BEARISH" || t === "BEARISH_REVERSAL";
    if (side === "SELL") return t === "BULLISH" || t === "BULLISH_REVERSAL";
    return false;
}

function getSwingBias(candles = []) {
    if (!Array.isArray(candles) || candles.length < 2) {
        return { direction: "NEUTRAL", strength: 0, slope: 0 };
    }

    const first = getCandleDirection(candles[0]);
    const last = getCandleDirection(candles[candles.length - 1]);
    const bodyAvg = averageBody(candles, Math.min(candles.length, 5)) || 1;

    const closeSlope = last.close - first.close;
    const normalizedSlope = closeSlope / bodyAvg;

    let direction = "NEUTRAL";
    if (normalizedSlope >= 1.2) direction = "UP";
    else if (normalizedSlope <= -1.2) direction = "DOWN";

    return {
        direction,
        strength: Math.abs(normalizedSlope),
        slope: normalizedSlope,
    };
}

function findPivotHighs(candles = []) {
    const result = [];
    for (let i = 1; i < candles.length - 1; i++) {
        const prev = getCandleDirection(candles[i - 1]);
        const curr = getCandleDirection(candles[i]);
        const next = getCandleDirection(candles[i + 1]);
        if (curr.high > prev.high && curr.high >= next.high) {
            result.push({ index: i, value: curr.high });
        }
    }
    return result;
}

function findPivotLows(candles = []) {
    const result = [];
    for (let i = 1; i < candles.length - 1; i++) {
        const prev = getCandleDirection(candles[i - 1]);
        const curr = getCandleDirection(candles[i]);
        const next = getCandleDirection(candles[i + 1]);
        if (curr.low < prev.low && curr.low <= next.low) {
            result.push({ index: i, value: curr.low });
        }
    }
    return result;
}

function buildStructureState(candles = [], lookback = 10) {
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

function getWindowState(candles = [], lookback = 20, side = "NEUTRAL") {
    const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
    const bias = getSwingBias(sample);
    const avgB = averageBody(sample, Math.min(sample.length, 5)) || 0;
    const avgR = averageRange(sample, Math.min(sample.length, 5)) || 0;

    let bullishCount = 0;
    let bearishCount = 0;
    let impulseCount = 0;

    for (const c of sample) {
        const cd = getCandleDirection(c);
        if (cd.isBull) bullishCount += 1;
        if (cd.isBear) bearishCount += 1;
        if (avgB > 0 && cd.body >= avgB * 1.15) impulseCount += 1;
    }

    const last = getCandleDirection(sample[sample.length - 1] || {});
    const prev = getCandleDirection(sample[sample.length - 2] || {});

    let direction = "NEUTRAL";
    if (bias.direction === "UP" && bullishCount >= bearishCount) direction = "UP";
    if (bias.direction === "DOWN" && bearishCount >= bullishCount) direction = "DOWN";

    const followThroughUp = last.close > prev.high;
    const followThroughDown = last.close < prev.low;

    return {
        direction,
        strength: bias.strength,
        slope: bias.slope,
        bullishCount,
        bearishCount,
        impulseCount,
        avgBody: avgB,
        avgRange: avgR,
        followThroughUp,
        followThroughDown,
        isCompression: avgR > 0 && last.range <= avgR * 0.8,
        dominantSide:
            bullishCount > bearishCount
                ? "BUY"
                : bearishCount > bullishCount
                    ? "SELL"
                    : "NEUTRAL",
        sampleSize: sample.length,
    };
}

function getSwingZoneState(candles = [], lookback = 10, price = 0) {
    const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
    if (!sample.length) {
        return {
            nearTop: false,
            nearBottom: false,
            distanceToTopPct: 1,
            distanceToBottomPct: 1,
        };
    }

    const highs = sample.map((c) => toNumber(c.high));
    const lows = sample.map((c) => toNumber(c.low));
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);
    const range = Math.max(swingHigh - swingLow, 0.00001);
    const currentPrice = toNumber(price, toNumber(sample[sample.length - 1]?.close, 0));

    const distanceToTopPct = (swingHigh - currentPrice) / range;
    const distanceToBottomPct = (currentPrice - swingLow) / range;

    return {
        swingHigh,
        swingLow,
        range,
        nearTop: distanceToTopPct <= 0.18,
        nearBottom: distanceToBottomPct <= 0.18,
        distanceToTopPct: Number(distanceToTopPct.toFixed(4)),
        distanceToBottomPct: Number(distanceToBottomPct.toFixed(4)),
    };
}

function getLocationState(candles = [], lookback = 10) {
    const sample = Array.isArray(candles) ? candles.slice(-(lookback + 1)) : [];

    if (sample.length < 2) {
        return {
            state: "MID_RANGE",
            priorHigh: 0,
            priorLow: 0,
            range: 0,
            atTop: false,
            atBottom: false,
            isBreakoutUp: false,
            isBreakdownDown: false,
            isRetestBrokenHigh: false,
            isRetestBrokenLow: false,
        };
    }

    const current = getCandleDirection(sample[sample.length - 1] || {});
    const base = sample.slice(0, -1);

    const highs = base.map((c) => toNumber(c.high));
    const lows = base.map((c) => toNumber(c.low));

    const priorHigh = highs.length ? Math.max(...highs) : toNumber(current.high, 0);
    const priorLow = lows.length ? Math.min(...lows) : toNumber(current.low, 0);
    const range = Math.max(priorHigh - priorLow, 0.00001);

    const close = toNumber(current.close, 0);
    const high = toNumber(current.high, close);
    const low = toNumber(current.low, close);

    const nearPct = 0.18;
    const retestBuffer = range * 0.06;

    const isBreakoutUp = close > priorHigh;
    const isBreakdownDown = close < priorLow;

    const isRetestBrokenHigh =
        close > priorHigh &&
        low <= priorHigh + retestBuffer;

    const isRetestBrokenLow =
        close < priorLow &&
        high >= priorLow - retestBuffer;

    const atTop = !isBreakoutUp && close >= priorHigh - range * nearPct;
    const atBottom = !isBreakdownDown && close <= priorLow + range * nearPct;

    let state = "MID_RANGE";
    if (isBreakoutUp) state = "BREAKOUT_UP";
    else if (isBreakdownDown) state = "BREAKDOWN_DOWN";
    else if (atTop) state = "AT_TOP";
    else if (atBottom) state = "AT_BOTTOM";

    return {
        state,
        priorHigh,
        priorLow,
        range,
        atTop,
        atBottom,
        isBreakoutUp,
        isBreakdownDown,
        isRetestBrokenHigh,
        isRetestBrokenLow,
    };
}

function buildHierarchicalContext(candles = [], side = "NEUTRAL") {
    const longWindow = getWindowState(candles, 20, side);
    const mediumWindow = getWindowState(candles, 10, side);
    const setupWindow = getWindowState(candles, 5, side);
    const triggerWindow = getWindowState(candles, 3, side);
    const structure10 = buildStructureState(candles, 10);
    const swingZone10 = getSwingZoneState(candles, 10);
    const location = getLocationState(candles, 10);

    const longAligned =
        (side === "BUY" && longWindow.direction === "UP") ||
        (side === "SELL" && longWindow.direction === "DOWN");

    const mediumAligned =
        (side === "BUY" && mediumWindow.direction === "UP") ||
        (side === "SELL" && mediumWindow.direction === "DOWN");

    const setupAligned =
        (side === "BUY" && setupWindow.direction === "UP") ||
        (side === "SELL" && setupWindow.direction === "DOWN");

    const triggerAligned =
        (side === "BUY" && triggerWindow.direction === "UP") ||
        (side === "SELL" && triggerWindow.direction === "DOWN");

    let structureAligned = false;
    let structureCounter = false;

    if (side === "BUY") {
        structureAligned =
            structure10.structure === "HH_HL" ||
            structure10.structure === "HL_ONLY";

        structureCounter =
            structure10.structure === "LH_LL" ||
            structure10.structure === "LL_ONLY";
    } else if (side === "SELL") {
        structureAligned =
            structure10.structure === "LH_LL" ||
            structure10.structure === "LH_ONLY" ||
            structure10.structure === "LL_ONLY";

        structureCounter =
            structure10.structure === "HH_HL" ||
            structure10.structure === "HH_ONLY";
    }

    let score = 0;
    const reasons = [];

    if (longAligned) {
        score += 0.42;
        reasons.push("L20_ALIGNED");
    } else if (longWindow.direction !== "NEUTRAL") {
        score -= 0.50;
        reasons.push("L20_COUNTER");
    }

    if (mediumAligned) {
        score += 0.22;
        reasons.push("L10_DIR_ALIGNED");
    } else if (mediumWindow.direction !== "NEUTRAL") {
        score -= 0.26;
        reasons.push("L10_DIR_COUNTER");
    }

    if (structureAligned) {
        score += 0.34;
        reasons.push("L10_STRUCTURE_ALIGNED");
    } else if (structureCounter) {
        score -= 0.40;
        reasons.push("L10_STRUCTURE_COUNTER");
    }

    if (setupAligned) {
        score += 0.16;
        reasons.push("L5_SETUP_OK");
    } else if (setupWindow.direction !== "NEUTRAL") {
        score -= 0.22;
        reasons.push("L5_SETUP_COUNTER");
    }

    if (triggerAligned) {
        score += 0.12;
        reasons.push("L3_TRIGGER_OK");
    } else if (triggerWindow.direction !== "NEUTRAL") {
        score -= 0.16;
        reasons.push("L3_TRIGGER_COUNTER");
    }

    if (side === "BUY" && location.isBreakoutUp) {
        score += 0.72;
        reasons.push("LOCATION_BREAKOUT_UP");
    }

    if (side === "SELL" && location.isBreakdownDown) {
        score += 0.82;
        reasons.push("LOCATION_BREAKDOWN_DOWN");
    }

    if (side === "BUY" && location.isRetestBrokenHigh) {
        score += 0.24;
        reasons.push("LOCATION_RETEST_BROKEN_HIGH");
    }

    if (side === "SELL" && location.isRetestBrokenLow) {
        score += 0.28;
        reasons.push("LOCATION_RETEST_BROKEN_LOW");
    }

    const strongContinuation =
        (
            longAligned &&
            mediumAligned &&
            structureAligned &&
            longWindow.strength >= 2.0 &&
            mediumWindow.impulseCount >= 2
        ) ||
        (
            side === "BUY" &&
            location.isBreakoutUp &&
            mediumAligned &&
            (setupAligned || triggerAligned)
        ) ||
        (
            side === "SELL" &&
            location.isBreakdownDown &&
            mediumAligned &&
            (setupAligned || triggerAligned)
        );

    const possibleReversal =
        !longAligned &&
        mediumAligned &&
        triggerAligned &&
        !structureCounter &&
        (
            (side === "BUY" && location.atBottom) ||
            (side === "SELL" && location.atTop)
        );

    const noisySetup =
        setupWindow.isCompression &&
        triggerWindow.direction === "NEUTRAL";

    const bullishContinuationBlock =
        side === "SELL" &&
        longWindow.direction === "UP" &&
        mediumWindow.direction === "UP" &&
        (setupWindow.direction === "UP" || triggerWindow.direction === "UP") &&
        !structureCounter &&
        !possibleReversal &&
        !location.isBreakdownDown;

    const bearishContinuationBlock =
        side === "BUY" &&
        longWindow.direction === "DOWN" &&
        mediumWindow.direction === "DOWN" &&
        (setupWindow.direction === "DOWN" || triggerWindow.direction === "DOWN") &&
        !structureCounter &&
        !possibleReversal &&
        !location.isBreakoutUp;

    const continuationBlockAgainstSide =
        bullishContinuationBlock || bearishContinuationBlock;

    if (strongContinuation) {
        score += 0.28;
        reasons.push("CONTINUATION_STACKED");
    }

    if (possibleReversal) {
        score += 0.08;
        reasons.push("REVERSAL_EARLY_OK");
    }

    if (noisySetup) {
        score -= 0.12;
        reasons.push("NOISY_TRIGGER");
    }

    if (continuationBlockAgainstSide) {
        score -= 0.55;
        reasons.push("COUNTER_CONTINUATION_BLOCK");
    }

    if (side === "BUY" && location.atTop && !location.isBreakoutUp) {
        score -= 0.42;
        reasons.push("NEAR_SWING_HIGH_BLOCK");
    }

    if (side === "SELL" && location.atBottom && !location.isBreakdownDown) {
        score -= 0.42;
        reasons.push("NEAR_SWING_LOW_BLOCK");
    }

    return {
        longWindow,
        mediumWindow,
        setupWindow,
        triggerWindow,
        structure10,
        swingZone10,
        location,
        longAligned,
        mediumAligned,
        setupAligned,
        triggerAligned,
        structureAligned,
        structureCounter,
        strongContinuation,
        possibleReversal,
        noisySetup,
        bullishContinuationBlock,
        bearishContinuationBlock,
        continuationBlockAgainstSide,
        score: Number(score.toFixed(4)),
        reasons,
    };
}

function getBreakoutRetestState(pattern = {}) {
    const state = pattern?.breakoutRetest || pattern?.structure?.breakoutRetest || {};

    return {
        direction: String(state?.direction || "NEUTRAL").toUpperCase(),
        isBreakoutLike: Boolean(state?.isBreakoutLike),
        breakoutDetected: Boolean(state?.breakoutDetected),
        freshBreakout: Boolean(state?.freshBreakout),
        barsSinceBreakout:
            state?.barsSinceBreakout === null || state?.barsSinceBreakout === undefined
                ? null
                : Number(state.barsSinceBreakout),
        hasRetest: Boolean(state?.hasRetest),
        retestTouched: Boolean(state?.retestTouched),
        retestAccepted: Boolean(state?.retestAccepted),
        retestRejected: Boolean(state?.retestRejected),
        breakoutLevel: toNumber(state?.breakoutLevel, 0),
        breakoutZoneHigh: toNumber(state?.breakoutZoneHigh, 0),
        breakoutZoneLow: toNumber(state?.breakoutZoneLow, 0),
        retestDepth: toNumber(state?.retestDepth, 0),
        retestDistance: toNumber(state?.retestDistance, 0),
    };
}

function resolveTradeMode({
    pattern = {},
    trendContext = {},
    trendFollow4 = {},
    market = {},
    hierarchical = null,
}) {
    const symbol = market?.symbol || "";
    const gold = isGoldSymbol(symbol);

    const overallTrend = String(
        trendContext?.overallTrend || "NEUTRAL"
    ).toUpperCase();

    const trendStrength = String(
        trendContext?.trendStrength || "WEAK"
    ).toUpperCase();

    const followDirection = String(
        trendFollow4?.direction || "NEUTRAL"
    ).toUpperCase();

    const followVolumeConfirmed = Boolean(trendFollow4?.volumeConfirmed);

    let side = resolvePatternSide(pattern);
    const reasons = [];

    if (
        hierarchical?.location?.isBreakdownDown &&
        (side === "NEUTRAL" || side === "BUY") &&
        overallTrend !== "BULLISH"
    ) {
        side = "SELL";
        reasons.push("SIDE_OVERRIDE_BY_BREAKDOWN_LOCATION");
    } else if (
        hierarchical?.location?.isBreakoutUp &&
        (side === "NEUTRAL" || side === "SELL") &&
        overallTrend !== "BEARISH"
    ) {
        side = "BUY";
        reasons.push("SIDE_OVERRIDE_BY_BREAKOUT_LOCATION");
    }

    const isMomentumPattern = new Set([
        "WATERFALL_DROP_CONTINUATION",
        "ROCKET_SURGE_CONTINUATION",
        "DESCENDING_TRIANGLE_BREAKDOWN",
        "ASCENDING_TRIANGLE_BREAKOUT",
        "FIRST_LEG_BREAKDOWN",
        "FIRST_LEG_BREAKOUT",
    ]).has(String(pattern?.type || "").toUpperCase());

    const hasRetestSupport = Boolean(pattern?.structure?.isRetestingSupport);
    const hasRetestResistance = Boolean(pattern?.structure?.isRetestingResistance);
    const isFailToHH = Boolean(pattern?.structure?.isFailToHH);
    const isFailToLL = Boolean(pattern?.structure?.isFailToLL);

    const trendAligned = isTrendAligned(side, overallTrend);
    const trendCounter = isTrendCounter(side, overallTrend);

    const breakoutRetest = getBreakoutRetestState(pattern);
    const breakoutAligned =
        breakoutRetest.isBreakoutLike &&
        breakoutRetest.direction === side;

    let mode = "NORMAL";
    let regime = "BALANCED";
    let quality = 0;

    if (trendContext?.isRanging && !trendContext?.volumeConfirmed) {
        mode = "SCALP";
        regime = "RANGING";
        quality -= 1;
        reasons.push("RANGING_WITHOUT_HTF_VOLUME");
    }

    if (overallTrend === "MIXED") {
        mode = "SCALP";
        regime = "MIXED";
        quality -= 1;
        reasons.push("MIXED_HTF_TREND");
    }

    if (pattern?.isVolumeDrying) {
        mode = "SCALP";
        quality -= gold ? 0.5 : 1;
        reasons.push("VOLUME_DRYING");
    }

    if (isFailToHH || isFailToLL) {
        mode = "SCALP";
        quality -= 1;
        reasons.push("STRUCTURE_FAILURE");
    }

    if (trendCounter && trendStrength === "STRONG") {
        mode = "SCALP";
        quality -= 1;
        reasons.push("COUNTER_STRONG_TREND");
    }

    if (
        isMomentumPattern &&
        trendAligned &&
        (trendContext?.volumeConfirmed || followVolumeConfirmed)
    ) {
        mode = "NORMAL";
        regime = "MOMENTUM_CONTINUATION";
        quality += 2;
        reasons.push("MOMENTUM_PATTERN_WITH_ALIGNMENT");
    }

    if ((hasRetestSupport || hasRetestResistance) && trendAligned) {
        mode = "NORMAL";
        regime = "STRUCTURE_RETEST";
        quality += 2;
        reasons.push("STRUCTURE_RETEST_ALIGNED");
    }

    if (followDirection === side && followVolumeConfirmed) {
        quality += 1;
        reasons.push("M5_DIRECTIONAL_CONFIRMATION");
    } else if (followDirection !== "NEUTRAL" && followDirection !== side) {
        quality -= 1;
        reasons.push("M5_DIRECTIONAL_CONFLICT");
    }

    if (pattern?.isVolumeClimax && trendAligned) {
        quality += 1;
        reasons.push("VOLUME_CLIMAX_ALIGNED");
    }

    if (hierarchical) {
        quality += hierarchical.score;
        reasons.push(...hierarchical.reasons);

        if (
            hierarchical.strongContinuation &&
            trendAligned
        ) {
            mode = "NORMAL";
            regime = "HIERARCHICAL_CONTINUATION";
        }

        if (
            hierarchical.structureCounter &&
            mode === "NORMAL" &&
            !hierarchical.possibleReversal
        ) {
            mode = "SCALP";
            quality -= 0.35;
            reasons.push("DOWNGRADE_BY_STRUCTURE_COUNTER");
        }

        const nearSwingEdge =
            (side === "BUY" && hierarchical.location?.atTop) ||
            (side === "SELL" && hierarchical.location?.atBottom);

        const continuationAllowed =
            hierarchical.strongContinuation ||
            (side === "BUY" && hierarchical.location?.isBreakoutUp) ||
            (side === "SELL" && hierarchical.location?.isBreakdownDown);

        if (nearSwingEdge && !continuationAllowed) {
            mode = "SCALP";
            quality -= 0.25;
            reasons.push("PRICE_NEAR_SWING_EDGE");
        }
    }

    if (breakoutAligned && breakoutRetest.breakoutDetected) {
        if (breakoutRetest.retestAccepted) {
            quality += 0.65;
            reasons.push("BREAKOUT_RETEST_ACCEPTED");
        } else if (breakoutRetest.retestRejected) {
            quality -= 0.85;
            mode = "SCALP";
            reasons.push("BREAKOUT_RETEST_REJECTED");
        } else if (breakoutRetest.freshBreakout && !breakoutRetest.hasRetest) {
            quality -= 0.20;
            if (mode === "NORMAL") mode = "SCALP";
            reasons.push("FRESH_BREAKOUT_WAIT_RETEST");
        }
    }

    if (mode === "NORMAL" && quality <= -2) {
        mode = "SCALP";
        reasons.push("DOWNGRADE_TO_SCALP_BY_QUALITY");
    }

    return {
        side,
        mode,
        regime,
        quality,
        reasons,
    };
}

function applyLearnedPatternWeight(patternScore, learnedWeight) {
    const base = toNumber(patternScore, 0);
    const weight = clamp(learnedWeight, -2.5, 2.5);
    const mildMultiplier = 1 + weight * 0.06;
    return Number((base * clamp(mildMultiplier, 0.85, 1.15)).toFixed(4));
}

function getPatternClassBonus(patternType = "", tradeMode = "NORMAL") {
    const type = String(patternType || "").toUpperCase();
    const isScalp = tradeMode === "SCALP";

    const strongPatterns = new Set([
        "BULLISH_ENGULFING",
        "BEARISH_ENGULFING",
        "MORNING_STAR_BASE_BREAK",
        "EVENING_STAR_BASE_BREAK",
    ]);

    const momentumPatterns = new Set([
        "WATERFALL_DROP_CONTINUATION",
        "ROCKET_SURGE_CONTINUATION",
        "DESCENDING_TRIANGLE_BREAKDOWN",
        "ASCENDING_TRIANGLE_BREAKOUT",
        "FIRST_LEG_BREAKDOWN",
        "FIRST_LEG_BREAKOUT",
    ]);

    if (momentumPatterns.has(type)) {
        return isScalp ? 0.22 : 0.32;
    }

    if (strongPatterns.has(type)) {
        return isScalp ? 0.14 : 0.22;
    }

    return 0;
}

function getNewsScore(news = null, market = {}) {
    const symbol = market?.symbol || "";
    if (!isGoldSymbol(symbol) || !news) return 0;

    if (news.goldImpact === "bullish") return 0.18;
    if (news.goldImpact === "bearish") return -0.18;
    return 0;
}

function buildContextComponents({
    side,
    tradeMode,
    pattern,
    trendContext,
    trendFollow4,
    historicalVolumeSignal,
    defensiveFlags,
    market,
    news,
    learnedWeight,
    adaptiveScoreDelta,
    ictContext,
    hierarchical,
}) {
    const sign = getDirectionSign(side);
    const microTrend = pattern?.structure?.microTrend || "NEUTRAL";
    const symbol = market?.symbol || "";
    const gold = isGoldSymbol(symbol);
    const overallTrend = String(
        trendContext?.overallTrend || "NEUTRAL"
    ).toUpperCase();

    let score = 0;
    const components = [];

    const pushComponent = (label, value) => {
        const val = Number((value || 0).toFixed(4));
        score += val;
        components.push({ label, value: val });
    };

    const basePatternScore = toNumber(pattern?.score, 0);
    const weightedPatternScore = applyLearnedPatternWeight(
        basePatternScore,
        learnedWeight
    );
    pushComponent("PATTERN_BASE", weightedPatternScore);

    const patternClassBonus = getPatternClassBonus(pattern?.type, tradeMode) * sign;
    if (patternClassBonus !== 0) {
        pushComponent("PATTERN_CLASS_BONUS", patternClassBonus);
    }

    if (isTrendAligned(side, overallTrend)) {
        pushComponent("HTF_TREND_ALIGNED", 0.62 * sign);
    } else if (isTrendCounter(side, overallTrend)) {
        pushComponent("HTF_TREND_COUNTER", -0.42 * sign);
    }

    if (trendContext?.trendStrength === "STRONG") {
        if (isTrendAligned(side, overallTrend)) {
            pushComponent("HTF_TREND_STRONG", 0.26 * sign);
        } else if (isTrendCounter(side, overallTrend)) {
            pushComponent("HTF_TREND_STRONG_COUNTER", -0.14 * sign);
        }
    }

    if (isMicroTrendAligned(side, microTrend)) {
        pushComponent("MICRO_TREND_ALIGNED", 0.30 * sign);
    } else if (isMicroTrendCounter(side, microTrend)) {
        pushComponent("MICRO_TREND_COUNTER", -0.18 * sign);
    }

    if (isMicroTrendReversal(side, microTrend)) {
        pushComponent("MICRO_REVERSAL_HINT", 0.14 * sign);
    }

    const m5Direction = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();
    if (m5Direction === side) {
        pushComponent("M5_ALIGNED", 0.24 * sign);
    } else if (m5Direction !== "NEUTRAL") {
        pushComponent("M5_COUNTER", -0.12 * sign);
    }

    if (trendFollow4?.volumeConfirmed) {
        pushComponent("M5_VOLUME_CONFIRMED", 0.12 * sign);
    }

    if (pattern?.isVolumeClimax) {
        pushComponent("VOLUME_CLIMAX", 0.16 * sign);
    }

    if (pattern?.isVolumeDrying) {
        pushComponent("VOLUME_DRYING", -0.08 * sign);
    }

    if (historicalVolumeSignal === "LOW_VOLUME") {
        pushComponent("LOW_VOLUME", gold ? -0.02 * sign : -0.07 * sign);
    }

    if (historicalVolumeSignal === "HIGH_VOLUME") {
        pushComponent("HIGH_VOLUME", 0.12 * sign);
    }

    const earlyBuyMomentum = detectEarlyBuyMomentum(market?.candlesM5 || []);
    const earlySellMomentum = detectEarlySellMomentum(market?.candlesM5 || []);
    const earlyMomentumComponent = side === "BUY" ? earlyBuyMomentum : earlySellMomentum;
    if (earlyMomentumComponent !== 0) {
        pushComponent("EARLY_MOMENTUM", earlyMomentumComponent * 1.35);
    }

    const weakPullbackContinuation = detectWeakPullbackContinuation(
        market?.candlesM5 || [],
        side
    );

    if (weakPullbackContinuation.detected) {
        const continuationBonus =
            tradeMode === "SCALP"
                ? weakPullbackContinuation.score * 1.10
                : weakPullbackContinuation.score * 0.85;

        pushComponent("WEAK_PULLBACK_CONTINUATION", continuationBonus * sign);
    }

    const hasRetestSupport =
        Boolean(pattern?.structure?.isRetestingSupport) ||
        Boolean(pattern?.structure?.retestingSupport);
    const hasRetestResistance =
        Boolean(pattern?.structure?.isRetestingResistance) ||
        Boolean(pattern?.structure?.retestingResistance);

    if (side === "BUY" && hasRetestSupport) {
        pushComponent("RETEST_SUPPORT", 0.32);
    }

    if (side === "SELL" && hasRetestResistance) {
        pushComponent("RETEST_RESISTANCE", -0.32);
    }

    const patternType = String(pattern?.type || "").toUpperCase();

    if (side === "BUY" && patternType.includes("FIRST_LEG_BREAKOUT")) {
        pushComponent("FIRST_LEG_BREAKOUT_BONUS", 0.28);
    }

    if (side === "SELL" && patternType.includes("FIRST_LEG_BREAKDOWN")) {
        pushComponent("FIRST_LEG_BREAKDOWN_BONUS", -0.28);
    }

    if (side === "BUY" && patternType.includes("REVERSAL")) {
        pushComponent("REVERSAL_PATTERN_BONUS", 0.18);
    }

    if (side === "SELL" && patternType.includes("REVERSAL")) {
        pushComponent("REVERSAL_PATTERN_BONUS", -0.18);
    }

    const breakoutRetest = getBreakoutRetestState(pattern);
    const breakoutAligned =
        breakoutRetest.isBreakoutLike &&
        breakoutRetest.direction === side;

    if (breakoutAligned && breakoutRetest.breakoutDetected) {
        if (breakoutRetest.retestAccepted) {
            pushComponent("BREAKOUT_RETEST_ACCEPTED", 0.26 * sign);
        } else if (breakoutRetest.retestRejected) {
            pushComponent("BREAKOUT_RETEST_REJECTED", -0.34 * sign);
        } else if (breakoutRetest.freshBreakout && !breakoutRetest.hasRetest) {
            pushComponent("FRESH_BREAKOUT_NO_RETEST", -0.12 * sign);
        } else if (breakoutRetest.hasRetest && breakoutRetest.retestTouched) {
            pushComponent("BREAKOUT_RETEST_TOUCHED", 0.08 * sign);
        }
    }

    const newsScore = getNewsScore(news, market) * sign;
    if (newsScore !== 0) {
        pushComponent("NEWS_CONTEXT", newsScore);
    }

    if (ictContext?.signalBias === side) {
        pushComponent("ICT_SIGNAL_ALIGNED", 0.12 * sign);
    } else if (ictContext?.signalBias && ictContext.signalBias !== "NEUTRAL") {
        pushComponent("ICT_SIGNAL_COUNTER", -0.06 * sign);
    }

    if (adaptiveScoreDelta !== 0) {
        pushComponent("ADAPTIVE_DELTA", adaptiveScoreDelta);
    }

    if (hierarchical?.score) {
        pushComponent("HIERARCHICAL_CONTEXT", hierarchical.score);
    }

    if (hierarchical?.possibleReversal) {
        pushComponent("HIERARCHICAL_REVERSAL_OK", 0.12 * sign);
    }

    if (defensiveFlags?.warningMatched) {
        const penalty = Math.abs(toNumber(defensiveFlags.scorePenalty, 0.5));
        const reducedPenalty = clamp(penalty * 0.55, 0.12, 0.45);
        pushComponent("FAILED_PATTERN_PENALTY", -reducedPenalty * sign);
    }

    return {
        score,
        components,
    };
}

function getDynamicThresholdContext({
    mode = "NORMAL",
    trend = "NEUTRAL",
    adaptiveScoreDelta = 0,
    historicalVolumeSignal = null,
    defensiveFlags = {},
    symbol = "",
    regimeQuality = 0,
    hierarchical = null,
}) {
    const normalizedMode = String(mode || "NORMAL").toUpperCase();
    const normalizedTrend = String(trend || "NEUTRAL").toUpperCase();
    const isScalp = normalizedMode === "SCALP";
    const gold = isGoldSymbol(symbol);

    let buyThreshold = isScalp ? 1.68 : 1.88;
    let sellThreshold = isScalp ? -1.68 : -1.88;
    const reasons = [];

    if (normalizedTrend === "NEUTRAL") {
        buyThreshold += 0.06;
        sellThreshold -= 0.06;
        reasons.push("NEUTRAL_TREND");
    }

    if (normalizedTrend === "MIXED") {
        buyThreshold += 0.10;
        sellThreshold -= 0.10;
        reasons.push("MIXED_TREND");
    }

    if (historicalVolumeSignal === "LOW_VOLUME") {
        buyThreshold += gold ? 0.03 : 0.08;
        sellThreshold -= gold ? 0.03 : 0.08;
        reasons.push("LOW_VOLUME");
    }

    if (historicalVolumeSignal === "HIGH_VOLUME") {
        buyThreshold -= 0.10;
        sellThreshold += 0.10;
        reasons.push("HIGH_VOLUME");
    }

    if (adaptiveScoreDelta < 0) {
        const penalty = Math.min(Math.abs(adaptiveScoreDelta) * 0.08, 0.12);
        buyThreshold += penalty;
        sellThreshold -= penalty;
        reasons.push("NEGATIVE_ADAPTIVE_DELTA");
    }

    if (adaptiveScoreDelta > 0) {
        const bonus = Math.min(Math.abs(adaptiveScoreDelta) * 0.08, 0.12);
        buyThreshold -= bonus;
        sellThreshold += bonus;
        reasons.push("POSITIVE_ADAPTIVE_DELTA");
    }

    if (defensiveFlags?.warningMatched) {
        buyThreshold += 0.05;
        sellThreshold -= 0.05;
        reasons.push("FAILED_PATTERN_WARNING");
    }

    if (regimeQuality <= -2) {
        buyThreshold += 0.04;
        sellThreshold -= 0.04;
        reasons.push("LOW_REGIME_QUALITY");
    }

    if (hierarchical?.continuationBlockAgainstSide) {
        buyThreshold += 0.08;
        sellThreshold -= 0.08;
        reasons.push("CONTINUATION_BLOCK");
    }

    if (hierarchical?.noisySetup) {
        buyThreshold += 0.04;
        sellThreshold -= 0.04;
        reasons.push("NOISY_SETUP");
    }

    if (hierarchical?.possibleReversal) {
        buyThreshold -= 0.06;
        sellThreshold += 0.06;
        reasons.push("POSSIBLE_REVERSAL");
    }

    buyThreshold = clampThreshold(Number(buyThreshold.toFixed(4)), 1.45, 3.2);
    sellThreshold = clampThreshold(Number(sellThreshold.toFixed(4)), -3.2, -1.45);

    return {
        buyThreshold,
        sellThreshold,
        reasons,
    };
}

function isSellStructureContinuationReady(hierarchical = {}, trendFollow4 = {}) {
    const location = hierarchical?.location || {};
    const structure = String(hierarchical?.structure10?.structure || "NEUTRAL").toUpperCase();
    const triggerDirection = String(hierarchical?.triggerWindow?.direction || "NEUTRAL").toUpperCase();
    const setupDirection = String(hierarchical?.setupWindow?.direction || "NEUTRAL").toUpperCase();
    const followDirection = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();

    const structureBearish =
        structure === "LH_LL" ||
        structure === "LH_ONLY" ||
        structure === "LL_ONLY";

    const triggerBearish =
        triggerDirection === "DOWN" || setupDirection === "DOWN";

    const breakdownReady =
        Boolean(location?.isBreakdownDown) ||
        Boolean(location?.isRetestBrokenLow);

    const followBearish = followDirection === "SELL";

    return breakdownReady && structureBearish && triggerBearish && followBearish;
}

function isBuyStructureContinuationReady(hierarchical = {}, trendFollow4 = {}) {
    const location = hierarchical?.location || {};
    const structure = String(hierarchical?.structure10?.structure || "NEUTRAL").toUpperCase();
    const triggerDirection = String(hierarchical?.triggerWindow?.direction || "NEUTRAL").toUpperCase();
    const setupDirection = String(hierarchical?.setupWindow?.direction || "NEUTRAL").toUpperCase();
    const followDirection = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();

    const structureBullish =
        structure === "HH_HL" ||
        structure === "HH_ONLY" ||
        structure === "HL_ONLY";

    const triggerBullish =
        triggerDirection === "UP" || setupDirection === "UP";

    const breakoutReady =
        Boolean(location?.isBreakoutUp) ||
        Boolean(location?.isRetestBrokenHigh);

    const followBullish = followDirection === "BUY";

    return breakoutReady && structureBullish && triggerBullish && followBullish;
}

async function findFailedPatternRule({
    userId = null,
    accountId = null,
    symbol = "XAUUSDm",
    timeframe = "M5",
    side = "NEUTRAL",
    mode = "NORMAL",
    pattern = {},
    market = {},
}) {
    try {
        const contextFeatures = buildContextFeatures({
            pattern,
            market,
            timeframe,
            side,
            mode,
        });

        const contextHash = buildContextHashNew(contextFeatures);

        return await findFailedPattern({
            userId,
            accountId,
            symbol,
            timeframe,
            side,
            mode,
            contextHash,
        });
    } catch (_error) {
        return null;
    }
}

async function evaluateDecision({
    pattern,
    candlesM15 = [],
    candlesM30 = [],
    candlesH1 = [],
    candlesH4 = [],
    trendFollow4 = {},
    market = {},
    news = null,
    session = null,
    ictContext = null,
}) {
    if (!pattern) {
        return {
            action: "NO_TRADE",
            reason: "NO_PATTERN",
            score: 0,
        };
    }

    const trendContext = getSafeTrendContext(
        market?.candlesM15,
        market?.candlesM30,
        market?.candlesH1,
        market?.candlesH4
    );

    const baseSide = resolvePatternSide(pattern);

    if (baseSide === "NEUTRAL") {
        return {
            action: "NO_TRADE",
            reason: "UNKNOWN_PATTERN_SIDE",
            score: 0,
        };
    }

    const timeframe = market?.timeframe || "M5";
    const marketCandles = Array.isArray(market?.candles) ? market.candles : [];

    let hierarchical = buildHierarchicalContext(marketCandles, baseSide);
    let regimeContext = resolveTradeMode({
        pattern,
        trendContext,
        trendFollow4,
        market,
        hierarchical,
    });

    let effectiveSide = String(regimeContext?.side || baseSide).toUpperCase();

    if (effectiveSide !== baseSide) {
        hierarchical = buildHierarchicalContext(marketCandles, effectiveSide);
        regimeContext = resolveTradeMode({
            pattern,
            trendContext,
            trendFollow4,
            market,
            hierarchical,
        });
        effectiveSide = String(regimeContext?.side || effectiveSide).toUpperCase();
    }

    let tradeMode = regimeContext.mode || "NORMAL";
    let defensiveFlags = {
        warningMatched: false,
        lotMultiplier: 1,
        tpMultiplier: 1,
        scorePenalty: 0,
        failedPatternAction: null,
        matchLevel: null,
        reason: null,
    };

    if (hierarchical?.continuationBlockAgainstSide && !hierarchical?.strongContinuation) {
        return {
            action: "NO_TRADE",
            reason: "COUNTER_CONTINUATION_BLOCK",
            score: 0,
            side: effectiveSide,
            mode: tradeMode,
            trend: trendContext.overallTrend,
            defensiveFlags,
            adaptiveScoreDelta: 0,
            historicalVolumeSignal: market?.historicalVolumeSignal || null,
            thresholdContext: getDynamicThresholdContext({
                mode: tradeMode,
                trend: trendContext.overallTrend,
                adaptiveScoreDelta: 0,
                historicalVolumeSignal: market?.historicalVolumeSignal || null,
                defensiveFlags,
                symbol: market?.symbol,
                regimeQuality: regimeContext.quality,
                hierarchical,
            }),
            scoreBreakdown: null,
            regimeContext,
            hierarchical,
        };
    }

    const historicalVolumeSignal = market?.historicalVolumeSignal || null;

    if (
        (
            effectiveSide === "BUY" &&
            hierarchical?.location?.atTop &&
            !hierarchical?.location?.isBreakoutUp &&
            !hierarchical?.possibleReversal
        ) ||
        (
            effectiveSide === "SELL" &&
            hierarchical?.location?.atBottom &&
            !hierarchical?.location?.isBreakdownDown &&
            !hierarchical?.possibleReversal
        )
    ) {
        return {
            action: "NO_TRADE",
            reason:
                effectiveSide === "BUY"
                    ? "BUY_NEAR_SWING_HIGH"
                    : "SELL_NEAR_SWING_LOW",
            score: 0,
            side: effectiveSide,
            mode: tradeMode,
            trend: trendContext.overallTrend,
            defensiveFlags,
            adaptiveScoreDelta: 0,
            historicalVolumeSignal,
            thresholdContext: getDynamicThresholdContext({
                mode: tradeMode,
                trend: trendContext.overallTrend,
                adaptiveScoreDelta: 0,
                historicalVolumeSignal,
                defensiveFlags,
                symbol: market?.symbol,
                regimeQuality: regimeContext.quality,
                hierarchical,
            }),
            scoreBreakdown: null,
            regimeContext,
            hierarchical,
        };
    }

    let adaptiveScoreDelta = 0;
    const sessionName = market?.sessionName || session?.name || null;

    const adaptiveRule = await findAdaptiveScoreRule({
        firebaseUserId: market?.userId || null,
        accountId: market?.accountId || null,
        symbol: market?.symbol || "XAUUSDm",
        timeframe: timeframe,
        patternType: pattern?.type || "Unknown",
        side: effectiveSide,
        mode: tradeMode,
        sessionName,
        microTrend: pattern?.structure?.microTrend || null,
        volumeProfile: pattern?.volumeProfile || null,
        rangeState: pattern?.rangeState || null,
    });

    if (adaptiveRule) {
        adaptiveScoreDelta = Number(adaptiveRule.adaptive_score_delta || 0);
    }

    const learnedWeight = await getPatternWeight({
        firebaseUserId: market?.userId || null,
        accountId: market?.accountId || "",
        symbol: market?.symbol || "DEFAULT",
        patternName: pattern?.type || "",
    });

    const scoreContext = buildContextComponents({
        side: effectiveSide,
        tradeMode,
        pattern,
        trendContext,
        trendFollow4,
        historicalVolumeSignal,
        defensiveFlags,
        market,
        news,
        learnedWeight,
        adaptiveScoreDelta,
        ictContext,
        hierarchical,
    });

    const score = Number(scoreContext.score.toFixed(4));

    if (defensiveFlags.warningMatched && tradeMode === "NORMAL" && score < 0) {
        tradeMode = "SCALP";
    }

    if (
        tradeMode === "NORMAL" &&
        regimeContext.quality <= -2 &&
        !isGoldSymbol(market?.symbol)
    ) {
        tradeMode = "SCALP";
    }

    if (market && market.portfolio) {
        const { currentPosition, count } = market.portfolio;
        const pyramidThreshold = tradeMode === "SCALP" ? 2.6 : 2.25;

        if (currentPosition !== "NONE") {
            if (currentPosition === "BUY" && score <= -2.15) {
                return {
                    action: "NO_TRADE",
                    reason: "ANTI_HEDGE_BLOCK",
                    score,
                    side: effectiveSide,
                };
            }

            if (currentPosition === "SELL" && score >= 2.15) {
                return {
                    action: "NO_TRADE",
                    reason: "ANTI_HEDGE_BLOCK",
                    score,
                    side: effectiveSide,
                };
            }

            if (currentPosition === "BUY" && score >= pyramidThreshold) {
                if (count >= 3) {
                    return {
                        action: "NO_TRADE",
                        reason: "MAX_PYRAMID_ORDERS_REACHED",
                        score,
                        side: effectiveSide,
                    };
                }

                return {
                    action: "ALLOW_BUY_PYRAMID",
                    score,
                    side: effectiveSide,
                    mode: tradeMode,
                    trend: trendContext.overallTrend,
                    defensiveFlags,
                };
            }

            if (currentPosition === "SELL" && score <= -pyramidThreshold) {
                if (count >= 3) {
                    return {
                        action: "NO_TRADE",
                        reason: "MAX_PYRAMID_ORDERS_REACHED",
                        score,
                        side: effectiveSide,
                    };
                }

                return {
                    action: "ALLOW_SELL_PYRAMID",
                    score,
                    side: effectiveSide,
                    mode: tradeMode,
                    trend: trendContext.overallTrend,
                    defensiveFlags,
                };
            }

            return {
                action: "NO_TRADE",
                reason: "SCORE_TOO_LOW_FOR_PYRAMIDING",
                score,
                side: effectiveSide,
            };
        }
    }

    const thresholdContext = getDynamicThresholdContext({
        mode: tradeMode,
        trend: trendContext.overallTrend,
        adaptiveScoreDelta,
        historicalVolumeSignal,
        defensiveFlags,
        symbol: market?.symbol,
        regimeQuality: regimeContext.quality,
        hierarchical,
    });

    console.log("[EVALUATE_BREAKDOWN]", {
        symbol: market?.symbol,
        side: effectiveSide,
        mode: tradeMode,
        trend: trendContext?.overallTrend,
        patternType: pattern?.type || "Unknown",
        breakoutRetest: pattern?.breakoutRetest || null,
        adaptiveScoreDelta,
        historicalVolumeSignal,
        warningMatched: defensiveFlags?.warningMatched,
        failedPatternAction: defensiveFlags?.failedPatternAction || null,
        failedPatternMatchLevel: defensiveFlags?.matchLevel || null,
        finalScore: score,
        thresholdContext,
        regimeContext,
        hierarchical,
        scoreBreakdown: scoreContext.components,
    });

    return {
        score,
        side: effectiveSide,
        patternType: pattern ? pattern.type : "Unknown",
        trend: trendContext.overallTrend,
        mode: tradeMode,
        defensiveFlags,
        adaptiveScoreDelta,
        historicalVolumeSignal,
        thresholdContext,
        scoreBreakdown: scoreContext.components,
        trendFollow4,
        regimeContext,
        hierarchical,
    };
}

function decision(evaluation, symbol) {
    if (evaluation.action === "NO_TRADE") {
        return evaluation.action;
    }

    if (
        evaluation.action === "ALLOW_BUY_PYRAMID" ||
        evaluation.action === "ALLOW_SELL_PYRAMID"
    ) {
        return evaluation.action;
    }

    const {
        score,
        mode,
        trend,
        adaptiveScoreDelta = 0,
        historicalVolumeSignal = null,
        defensiveFlags = {},
        thresholdContext,
        regimeContext = {},
        hierarchical = null,
        patternType = "",
        scoreBreakdown = [],
        trendFollow4 = {},
        side = "NEUTRAL",
    } = evaluation;

    const dynamicThreshold =
        thresholdContext ||
        getDynamicThresholdContext({
            mode,
            trend,
            adaptiveScoreDelta,
            historicalVolumeSignal,
            defensiveFlags,
            symbol,
            regimeQuality: regimeContext?.quality || 0,
            hierarchical,
        });

    const buyThreshold = Number(dynamicThreshold.buyThreshold || 1.88);
    const sellThreshold = Number(dynamicThreshold.sellThreshold || -1.88);
    const normalizedPatternType = String(patternType || "").toUpperCase();

    const hasBreakoutType =
        normalizedPatternType.includes("FIRST_LEG_BREAKOUT") ||
        normalizedPatternType.includes("ASCENDING_TRIANGLE_BREAKOUT") ||
        normalizedPatternType.includes("ROCKET_SURGE_CONTINUATION") ||
        normalizedPatternType.includes("STRUCTURE_BREAKOUT_CONTINUATION");

    const hasBreakdownType =
        normalizedPatternType.includes("FIRST_LEG_BREAKDOWN") ||
        normalizedPatternType.includes("DESCENDING_TRIANGLE_BREAKDOWN") ||
        normalizedPatternType.includes("WATERFALL_DROP_CONTINUATION") ||
        normalizedPatternType.includes("STRUCTURE_BREAKDOWN_CONTINUATION");

    const hasStrongEarlyMomentum = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some(
            (item) =>
                item?.label === "EARLY_MOMENTUM" &&
                Math.abs(Number(item?.value || 0)) >= 0.28
        )
        : false;

    const hasRetestSupport = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some((item) => item?.label === "RETEST_SUPPORT")
        : false;

    const hasRetestResistance = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some((item) => item?.label === "RETEST_RESISTANCE")
        : false;

    const hasAcceptedBreakoutRetest = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some((item) => item?.label === "BREAKOUT_RETEST_ACCEPTED")
        : false;

    const hasRejectedBreakoutRetest = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some((item) => item?.label === "BREAKOUT_RETEST_REJECTED")
        : false;

    const hasFreshBreakoutNoRetest = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some((item) => item?.label === "FRESH_BREAKOUT_NO_RETEST")
        : false;

    const hasWeakPullbackContinuation = Array.isArray(scoreBreakdown)
        ? scoreBreakdown.some((item) => item?.label === "WEAK_PULLBACK_CONTINUATION")
        : false;

    const sellStructureReady = isSellStructureContinuationReady(
        hierarchical,
        trendFollow4
    );

    const buyStructureReady = isBuyStructureContinuationReady(
        hierarchical,
        trendFollow4
    );

    const buyFastLane =
        score >= buyThreshold ||
        (
            score >= buyThreshold - 0.22 &&
            hasStrongEarlyMomentum &&
            (hasBreakoutType || hasRetestSupport)
        ) ||
        (
            score >= buyThreshold - 0.18 &&
            historicalVolumeSignal === "HIGH_VOLUME" &&
            hasBreakoutType
        ) ||
        (
            score >= buyThreshold - 0.16 &&
            hierarchical?.possibleReversal &&
            hasRetestSupport
        ) ||
        (
            side === "BUY" &&
            buyStructureReady &&
            mode === "SCALP" &&
            score >= buyThreshold - 0.42
        ) ||
        (
            side === "BUY" &&
            hasAcceptedBreakoutRetest &&
            score >= buyThreshold - 0.18
        ) ||
        (
            side === "BUY" &&
            buyStructureReady &&
            hasWeakPullbackContinuation &&
            mode === "SCALP" &&
            score >= buyThreshold - 0.26
        );

    const sellFastLane =
        score <= sellThreshold ||
        (
            score <= sellThreshold + 0.22 &&
            hasStrongEarlyMomentum &&
            (hasBreakdownType || hasRetestResistance)
        ) ||
        (
            score <= sellThreshold + 0.18 &&
            historicalVolumeSignal === "HIGH_VOLUME" &&
            hasBreakdownType
        ) ||
        (
            score <= sellThreshold + 0.16 &&
            hierarchical?.possibleReversal &&
            hasRetestResistance
        ) ||
        (
            side === "SELL" &&
            sellStructureReady &&
            mode === "SCALP" &&
            score <= sellThreshold + 0.42
        ) ||
        (
            side === "SELL" &&
            hasAcceptedBreakoutRetest &&
            score <= sellThreshold + 0.18
        ) ||
        (
            side === "SELL" &&
            sellStructureReady &&
            hasWeakPullbackContinuation &&
            mode === "SCALP" &&
            score <= sellThreshold + 0.26
        );

    if (hasRejectedBreakoutRetest) {
        return "NO_TRADE";
    }

    if (hasFreshBreakoutNoRetest) {
        if (side === "BUY" && !hasRetestSupport && score < buyThreshold) {
            return "NO_TRADE";
        }
        if (side === "SELL" && !hasRetestResistance && score > sellThreshold) {
            return "NO_TRADE";
        }
    }

    if (buyFastLane) {
        return mode === "SCALP" ? "ALLOW_BUY_SCALP" : "ALLOW_BUY";
    }

    if (sellFastLane) {
        return mode === "SCALP" ? "ALLOW_SELL_SCALP" : "ALLOW_SELL";
    }

    return "NO_TRADE";
}

function resolveDecisionWithTradingPreferences(
    evaluation,
    symbol,
    options = {}
) {
    const rawDecision = decision(evaluation, symbol);

    const directionResult = enforceDirectionBiasOnDecision(
        rawDecision,
        options.tradingPreferences
    );

    return {
        decision: directionResult.decision,
        reason: directionResult.reason,
        blocked: directionResult.blocked,
    };
}

module.exports = {
    evaluateDecision,
    decision,
    resolveDecisionWithTradingPreferences,
};