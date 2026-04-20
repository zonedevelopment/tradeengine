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
            // profit protect
            armProfitMin: 0.35,
            moveToBeMinProfit: 0.26,
            takeProfitMinProfit: 0.42,
            minPeakBeforeProtect: 0.45,
            beMinRetraceRatio: 0.18,
            tpMinRetraceRatio: 0.32,

            // wrong-way cut
            wrongWayMinMinutes: 1.0,
            wrongWayCutProfit: -0.06,
            wrongWayHardCutProfit: -0.12,
            wrongWayFlowCutScore: 1.95,
            wrongWayFlowHardScore: 2.55,

            // fallback cut
            simpleCutMinutes: 2,
            simpleCutProfit: -0.18,
            strongCutProfit: -0.10,
            reversalCutScore: 1.9,

            lowVolumeProfitMinutes: 5,
            failedPatternCutProfit: 0.05,
            failedPatternTakeProfitMin: 0.25,

            weakStructureScore: 1.15,
            strongStructureScore: 1.75,
        };
    }

    if (normalized === "SCALP") {
        return {
            // profit protect
            armProfitMin: 0.55,
            moveToBeMinProfit: 0.35,
            takeProfitMinProfit: 0.60,
            minPeakBeforeProtect: 0.70,
            beMinRetraceRatio: 0.16,
            tpMinRetraceRatio: 0.28,

            // wrong-way cut
            wrongWayMinMinutes: 1.5,
            wrongWayCutProfit: -0.10,
            wrongWayHardCutProfit: -0.20,
            wrongWayFlowCutScore: 2.15,
            wrongWayFlowHardScore: 2.85,

            // fallback cut
            simpleCutMinutes: 4,
            simpleCutProfit: -0.24,
            strongCutProfit: -0.14,
            reversalCutScore: 2.15,

            lowVolumeProfitMinutes: 7,
            failedPatternCutProfit: 0.08,
            failedPatternTakeProfitMin: 0.35,

            weakStructureScore: 1.20,
            strongStructureScore: 1.90,
        };
    }

    return {
        // profit protect
        armProfitMin: 1.10,
        moveToBeMinProfit: 0.75,
        takeProfitMinProfit: 1.20,
        minPeakBeforeProtect: 1.35,
        beMinRetraceRatio: 0.15,
        tpMinRetraceRatio: 0.25,

        // wrong-way cut
        wrongWayMinMinutes: 2.0,
        wrongWayCutProfit: -0.15,
        wrongWayHardCutProfit: -0.30,
        wrongWayFlowCutScore: 2.35,
        wrongWayFlowHardScore: 3.05,

        // fallback cut
        simpleCutMinutes: 10,
        simpleCutProfit: -0.35,
        strongCutProfit: -0.22,
        reversalCutScore: 2.6,

        normalFastCutMinutes: 3,
        normalFastCutProfit: -0.08,
        normalStructureBreakProfit: -0.03,
        normalFastReversalScore: 1.6,

        lowVolumeProfitMinutes: 15,
        failedPatternCutProfit: 0.12,
        failedPatternTakeProfitMin: 0.65,

        weakStructureScore: 1.30,
        strongStructureScore: 2.10,
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

    return clamp((peakProfit - profit) / peakProfit, 0, 1.5);
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

        const weakStructure =
            lastClose < prevLow ||
            lastLow < prevLow;

        return bearishPressure && weakStructure;
    }

    if (s === "SELL") {
        const bullishPressure =
            isBullish(last) &&
            isBullish(prev) &&
            lastClose > prevClose &&
            prevClose > prev2Close;

        const weakStructure =
            lastClose > prevHigh ||
            lastHigh > prevHigh;

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

    const closes = sample.map((c) => toNumber(c.close, 0));
    const highs = sample.map((c) => toNumber(c.high, 0));
    const lows = sample.map((c) => toNumber(c.low, 0));
    const midpoint10 = ((Math.max(...highs) + Math.min(...lows)) / 2);

    const bearishCount4 = recent4.filter(isBearish).length;
    const bullishCount4 = recent4.filter(isBullish).length;

    const last = recent5[recent5.length - 1] || {};
    const prev = recent5[recent5.length - 2] || {};
    const prev2 = recent5[recent5.length - 3] || {};

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
        if (lowerLowFlow) score += 0.50;
        if (closeBelowMidpoint) score += 0.40;
        if (isBearish(last) && isBearish(prev)) score += 0.35;
        if (getCandleBody(last) >= getCandleBody(prev) * 0.9 && isBearish(last)) score += 0.20;
        if (avgBearBody5 > avgBullBody5 * 1.25) score += 0.30;
        if (toNumber(last.high, 0) <= toNumber(prev.high, 0) && isBearish(last)) score += 0.18;
    } else if (s === "SELL") {
        if (bullishCount4 >= 3) score += 0.65;
        if (higherCloseStreak) score += 0.55;
        if (higherHighFlow) score += 0.50;
        if (closeAboveMidpoint) score += 0.40;
        if (isBullish(last) && isBullish(prev)) score += 0.35;
        if (getCandleBody(last) >= getCandleBody(prev) * 0.9 && isBullish(last)) score += 0.20;
        if (avgBullBody5 > avgBearBody5 * 1.25) score += 0.30;
        if (toNumber(last.low, 0) >= toNumber(prev.low, 0) && isBullish(last)) score += 0.18;
    }

    if (softInvalidation) score += 0.35;
    if (hardInvalidation) score += 0.60;

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
        (hardInvalidation ? 0.50 : 0) +
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
        confirmation.level === "HIGH" ||
        reversalScore >= profile.strongStructureScore;

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
    const continuation = detectContinuationSignal(candles, side);
    const hardInvalidation = hasHardInvalidation(candles, side);
    const softInvalidation = hasSoftInvalidation(candles, side);
    const wrongWayFlow = detectWrongWayFlowScore(candles, side);

    let adjustedScore =
        detectReversalScore(candles, side, normalizedMode) +
        toNumber(confirmation.score, 0) * 0.25 -
        toNumber(continuation.strength, 0) * 0.35;

    if (!Number.isFinite(adjustedScore)) adjustedScore = 0;

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
        adjustedScore += 0.65;
    } else if (adjustedScore >= profile.reversalCutScore) {
        riskLevel = "HIGH";
    } else if (adjustedScore >= profile.reversalCutScore * 0.7) {
        riskLevel = "MEDIUM";
    }

    // ===== WRONG-WAY CUT LANE =====
    // แยกจาก profit protect ชัดเจน
    if (profit <= 0) {
        if (failedPatternRule && profit <= profile.failedPatternCutProfit) {
            return {
                action: "CUT_LOSS_NOW",
                reason: "FAILED_PATTERN_EARLY_EXIT",
                riskLevel: "CRITICAL",
                score: adjustedScore,
                meta: {
                    wrongWayFlowScore: wrongWayFlow.score,
                    holdingMinutes,
                    softInvalidation,
                    hardInvalidation,
                },
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
            return {
                action: wrongWayCut.action,
                reason: wrongWayCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: {
                    holdingMinutes,
                    wrongWayFlowScore: wrongWayFlow.score,
                    effectiveFlowScore: wrongWayCut.effectiveFlowScore,
                    wrongWayBreakdown: wrongWayFlow.breakdown,
                    softInvalidation,
                    hardInvalidation,
                    confirmation: confirmation.level,
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
            return {
                action: simpleCut.action,
                reason: simpleCut.reason,
                riskLevel: "HIGH",
                score: adjustedScore,
                meta: {
                    holdingMinutes,
                    wrongWayFlowScore: wrongWayFlow.score,
                    wrongWayBreakdown: wrongWayFlow.breakdown,
                    softInvalidation,
                    hardInvalidation,
                    confirmation: confirmation.level,
                },
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
                meta: {
                    holdingMinutes,
                    wrongWayFlowScore: wrongWayFlow.score,
                    wrongWayBreakdown: wrongWayFlow.breakdown,
                    softInvalidation,
                    hardInvalidation,
                    confirmation: confirmation.level,
                },
            };
        }

        return {
            action: "HOLD",
            reason: `WRONG_WAY_NOT_CONFIRMED_YET(score=${adjustedScore}, flow=${wrongWayFlow.score}, mode=${normalizedMode})`,
            riskLevel,
            score: adjustedScore,
            meta: {
                holdingMinutes,
                wrongWayFlowScore: wrongWayFlow.score,
                wrongWayBreakdown: wrongWayFlow.breakdown,
                softInvalidation,
                hardInvalidation,
                confirmation: confirmation.level,
            },
        };
    }

    // ===== PROFIT PROTECT LANE =====
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