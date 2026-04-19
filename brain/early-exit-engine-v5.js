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
            // Stage 1: เพิ่งเข้าไม้ = รอ
            warmupMinutes: 2,
            warmupBars: 2,

            // Cut loss เมื่อผิดทางจริง
            strongCutProfit: -0.10,
            simpleCutProfit: -0.14,
            simpleCutMinutes: 3,
            reversalCutScore: 1.75,
            wrongWayContinuationBlock: 0.85,

            // เริ่ม protect หลังมีกำไรจริง
            minProfitToProtect: 0.12,
            moveToBeMinProfit: 0.18,
            takeProfitOnRetractionMinProfit: 0.28,
            takeProfitHardProtectMinProfit: 0.40,

            // ต้องย่อจริงก่อนถึงจะ protect
            beRetractionRatioMin: 0.16,
            tpRetractionRatioMin: 0.28,
            hardProtectRetractionRatioMin: 0.36,

            // ถ้ายัง continuation ดีอยู่ ห้าม protect
            continuationHoldThreshold: 1.10,

            // context score
            beReversalScoreMin: 1.15,
            tpReversalScoreMin: 1.65,

            // failed pattern
            failedPatternCutProfitMax: 0.06,
            failedPatternMoveToBeProfit: 0.14,
            failedPatternTakeProfitProfit: 0.24,

            // low volume
            useLowVolumeProtect: false,
            lowVolumeProfitMinutes: 5,
        };
    }

    if (normalized === "SCALP") {
        return {
            warmupMinutes: 3,
            warmupBars: 2,

            strongCutProfit: -0.12,
            simpleCutProfit: -0.20,
            simpleCutMinutes: 4,
            reversalCutScore: 2.00,
            wrongWayContinuationBlock: 0.95,

            minProfitToProtect: 0.22,
            moveToBeMinProfit: 0.30,
            takeProfitOnRetractionMinProfit: 0.45,
            takeProfitHardProtectMinProfit: 0.65,

            beRetractionRatioMin: 0.18,
            tpRetractionRatioMin: 0.30,
            hardProtectRetractionRatioMin: 0.38,

            continuationHoldThreshold: 1.15,

            beReversalScoreMin: 1.35,
            tpReversalScoreMin: 1.95,

            failedPatternCutProfitMax: 0.10,
            failedPatternMoveToBeProfit: 0.20,
            failedPatternTakeProfitProfit: 0.36,

            useLowVolumeProtect: false,
            lowVolumeProfitMinutes: 7,
        };
    }

    return {
        warmupMinutes: 5,
        warmupBars: 2,

        strongCutProfit: -0.18,
        simpleCutProfit: -0.30,
        simpleCutMinutes: 8,
        reversalCutScore: 2.60,
        wrongWayContinuationBlock: 1.00,

        minProfitToProtect: 0.55,
        moveToBeMinProfit: 0.75,
        takeProfitOnRetractionMinProfit: 1.00,
        takeProfitHardProtectMinProfit: 1.40,

        beRetractionRatioMin: 0.16,
        tpRetractionRatioMin: 0.26,
        hardProtectRetractionRatioMin: 0.34,

        continuationHoldThreshold: 1.20,

        beReversalScoreMin: 1.70,
        tpReversalScoreMin: 2.25,

        failedPatternCutProfitMax: 0.15,
        failedPatternMoveToBeProfit: 0.35,
        failedPatternTakeProfitProfit: 0.70,

        useLowVolumeProtect: false,
        lowVolumeProfitMinutes: 12,
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

function detectContinuationScore(candles = [], side = "") {
    if (!Array.isArray(candles) || candles.length < 2) return 0;

    const s = normalizeSide(side);
    const last = candles[candles.length - 1] || {};
    const prev = candles[candles.length - 2] || {};

    let score = 0;
    const lastBody = getCandleBody(last);
    const prevBody = getCandleBody(prev);
    const lastRange = getCandleRange(last);
    const bodyStrength = lastRange > 0 ? lastBody / lastRange : 0;

    if (s === "BUY") {
        if (isBullish(last)) score += 0.8;
        if (isBullish(last) && isBullish(prev)) score += 0.7;
        if (toNumber(last.close, 0) > toNumber(prev.high, 0)) score += 0.8;
    } else if (s === "SELL") {
        if (isBearish(last)) score += 0.8;
        if (isBearish(last) && isBearish(prev)) score += 0.7;
        if (toNumber(last.close, 0) < toNumber(prev.low, 0)) score += 0.8;
    }

    if (bodyStrength >= 0.6) score += 0.4;
    if (lastBody > prevBody && prevBody > 0) score += 0.2;

    return score;
}

function isWarmupStage({
    holdingMinutes = 0,
    candles = [],
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const bars = Array.isArray(candles) ? candles.length : 0;
    return holdingMinutes < profile.warmupMinutes || bars < profile.warmupBars;
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
    if (!profile.useLowVolumeProtect) return false;

    return holdingMinutes >= profile.lowVolumeProfitMinutes;
}

function shouldSimpleWrongWayCut({
    currentProfit = 0,
    holdingMinutes = 0,
    reversalScore = 0,
    continuationScore = 0,
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);

    if (
        profit <= profile.strongCutProfit &&
        reversalScore >= profile.reversalCutScore &&
        continuationScore <= profile.wrongWayContinuationBlock
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_STRONG_REVERSAL_CUT`,
        };
    }

    if (
        mins >= profile.simpleCutMinutes &&
        profit <= profile.simpleCutProfit &&
        continuationScore <= profile.wrongWayContinuationBlock
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_TIME_BASED_WRONG_WAY_CUT`,
        };
    }

    return null;
}

function shouldMoveToBE({
    currentProfit = 0,
    openPosition = {},
    reversalScore = 0,
    continuationScore = 0,
    confirmation = { level: "LOW", score: 0 },
    failedPatternRule = null,
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const peakProfit = getPeakProfit(openPosition, profit);
    const retractionRatio = getProfitRetractionRatio(openPosition, profit);

    if (profit < profile.moveToBeMinProfit) return false;
    if (profit < profile.minProfitToProtect) return false;
    if (peakProfit <= profit) return false;
    if (retractionRatio < profile.beRetractionRatioMin) return false;

    if (continuationScore >= profile.continuationHoldThreshold && !failedPatternRule) {
        return false;
    }

    const riskContext =
        reversalScore >= profile.beReversalScoreMin ||
        confirmation.level === "MEDIUM" ||
        confirmation.level === "HIGH" ||
        !!failedPatternRule;

    if (!riskContext) return false;

    return true;
}

function shouldTakeSmallProfit({
    currentProfit = 0,
    openPosition = {},
    reversalScore = 0,
    continuationScore = 0,
    confirmation = { level: "LOW", score: 0 },
    failedPatternRule = null,
    mode = "NORMAL",
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const peakProfit = getPeakProfit(openPosition, profit);
    const retractionRatio = getProfitRetractionRatio(openPosition, profit);

    if (profit < profile.takeProfitOnRetractionMinProfit) return false;
    if (peakProfit <= profit) return false;

    if (continuationScore >= profile.continuationHoldThreshold && !failedPatternRule) {
        return false;
    }

    if (
        failedPatternRule &&
        profit >= profile.failedPatternTakeProfitProfit &&
        retractionRatio >= profile.beRetractionRatioMin
    ) {
        return true;
    }

    const strongRisk =
        reversalScore >= profile.tpReversalScoreMin ||
        confirmation.level === "HIGH" ||
        (confirmation.level === "MEDIUM" && reversalScore >= profile.beReversalScoreMin + 0.35);

    if (!strongRisk) return false;

    if (peakProfit >= profile.takeProfitHardProtectMinProfit) {
        return retractionRatio >= profile.hardProtectRetractionRatioMin;
    }

    return retractionRatio >= profile.tpRetractionRatioMin;
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
    const reversalScore = detectReversalScore(candles, side, normalizedMode);
    const continuationScore = detectContinuationScore(candles, side);
    let adjustedScore = reversalScore + toNumber(confirmation.score, 0) * 0.35;

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

    // Stage 5: ผิดทางจริง
    if (
        failedPatternRule &&
        profit <= profile.failedPatternCutProfitMax &&
        continuationScore <= profile.wrongWayContinuationBlock
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: "FAILED_PATTERN_EARLY_EXIT",
            riskLevel: "CRITICAL",
            score: adjustedScore,
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
            },
        };
    }

    const simpleCut = shouldSimpleWrongWayCut({
        currentProfit: profit,
        holdingMinutes,
        reversalScore: adjustedScore,
        continuationScore,
        mode: normalizedMode,
    });

    if (simpleCut) {
        return {
            action: simpleCut.action,
            reason: simpleCut.reason,
            riskLevel: "HIGH",
            score: adjustedScore,
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
            },
        };
    }

    // Stage 1: เพิ่งเข้าไม้ = รออย่างเดียว
    if (
        isWarmupStage({
            holdingMinutes,
            candles,
            mode: normalizedMode,
        })
    ) {
        return {
            action: "HOLD",
            reason: `${normalizedMode}_WARMUP_HOLD`,
            riskLevel,
            score: adjustedScore,
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

    // ยังไม่มีกำไร = รอ
    if (profit <= 0) {
        return {
            action: "HOLD",
            reason: `${normalizedMode}_NO_PROFIT_HOLD`,
            riskLevel,
            score: adjustedScore,
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

    // continuation ดี = ถือ
    if (continuationScore >= profile.continuationHoldThreshold && !failedPatternRule) {
        return {
            action: "HOLD",
            reason: `${normalizedMode}_CONTINUATION_HOLD`,
            riskLevel,
            score: adjustedScore,
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

    // failed pattern + มีกำไร + เริ่มย่อ = กันทุน
    if (
        failedPatternRule &&
        profit >= profile.failedPatternMoveToBeProfit &&
        getPeakProfit(openPosition, profit) > profit &&
        getProfitRetractionRatio(openPosition, profit) >= profile.beRetractionRatioMin
    ) {
        return {
            action: "MOVE_TO_BE",
            reason: `${normalizedMode}_FAILED_PATTERN_BREAKEVEN_PROTECT`,
            riskLevel: "CRITICAL",
            score: adjustedScore,
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

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
            meta: {
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

    // Stage 4: มีกำไรและย่อแรง = เก็บกำไร
    if (
        shouldTakeSmallProfit({
            currentProfit: profit,
            openPosition,
            reversalScore: adjustedScore,
            continuationScore,
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
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

    // Stage 2: มีกำไรและเริ่มย่อ = กันทุน
    if (
        shouldMoveToBE({
            currentProfit: profit,
            openPosition,
            reversalScore: adjustedScore,
            continuationScore,
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
                continuationScore,
                reversalScore,
                confirmation: confirmation.level,
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
            },
        };
    }

    return {
        action: "HOLD",
        reason: `${normalizedMode}_PROFIT_CONTINUE_HOLD`,
        riskLevel,
        score: adjustedScore,
        meta: {
            continuationScore,
            reversalScore,
            confirmation: confirmation.level,
            peakProfit: getPeakProfit(openPosition, profit),
            retractionRatio: getProfitRetractionRatio(openPosition, profit),
        },
    };
}

module.exports = {
    analyzeEarlyExit,
};