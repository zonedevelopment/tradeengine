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
    lossPressureContext = null,
}) {
    const safeMode = normalizeMode(mode);
    const mins = toSafeNumber(holdingMinutes, 0);
    const profit = toSafeNumber(currentProfit, 0);
    const sl = Math.max(toSafeNumber(slPoints, 0), 1);

    const damageRatio = profit < 0 ? Math.abs(profit) / sl : 0;

    if (safeMode === "SCALP") {
        const timeReady = mins >= 7 * toSafeNumber(lossPressureContext?.minuteMultiplier, 1);

        const damageReady =
            damageRatio >= 0.42 * toSafeNumber(lossPressureContext?.damageRatioMultiplier, 1) ||
            profit <= -Math.max(220, Math.min(sl * 0.45, 300)) * toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);

        const structureReady =
            Boolean(hardInvalidation) ||
            (Boolean(failedPatternRule) && mins >= 7) ||
            toSafeNumber(reversalScore, 0) >= 2.75 - toSafeNumber(lossPressureContext?.scoreBonus, 0) ||
            Boolean(lossPressureContext?.severeAgainst);

        const flowReady =
            toSafeNumber(wrongWayFlowScore, 0) >= 2.75 - toSafeNumber(lossPressureContext?.scoreBonus, 0) ||
            toSafeNumber(noFollowThroughScore, 0) >= 2.50 - toSafeNumber(lossPressureContext?.scoreBonus, 0);

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
        const timeReady = mins >= 2 * toSafeNumber(lossPressureContext?.minuteMultiplier, 1);
        const damageReady =
            damageRatio >= 0.33 * toSafeNumber(lossPressureContext?.damageRatioMultiplier, 1) ||
            profit <= -Math.max(100, Math.min(sl * 0.35, 160)) * toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
        const structureReady =
            Boolean(hardInvalidation) ||
            Boolean(failedPatternRule) ||
            toSafeNumber(reversalScore, 0) >= 2.2 - toSafeNumber(lossPressureContext?.scoreBonus, 0) ||
            Boolean(lossPressureContext?.severeAgainst);
        const flowReady =
            toSafeNumber(wrongWayFlowScore, 0) >= 2.25 - toSafeNumber(lossPressureContext?.scoreBonus, 0) ||
            toSafeNumber(noFollowThroughScore, 0) >= 2.0 - toSafeNumber(lossPressureContext?.scoreBonus, 0);

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

    const timeReady = mins >= 4 * toSafeNumber(lossPressureContext?.minuteMultiplier, 1);
    const damageReady =
        damageRatio >= 0.35 * toSafeNumber(lossPressureContext?.damageRatioMultiplier, 1) ||
        profit <= -Math.max(220, Math.min(sl * 0.38, 320)) * toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
    const structureReady =
        Boolean(hardInvalidation) ||
        Boolean(failedPatternRule) ||
        toSafeNumber(reversalScore, 0) >= 2.45 - toSafeNumber(lossPressureContext?.scoreBonus, 0) ||
        Boolean(lossPressureContext?.severeAgainst);
    const flowReady =
        toSafeNumber(wrongWayFlowScore, 0) >= 2.45 - toSafeNumber(lossPressureContext?.scoreBonus, 0) ||
        toSafeNumber(noFollowThroughScore, 0) >= 2.2 - toSafeNumber(lossPressureContext?.scoreBonus, 0);

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
    const providedMinutes = toNumber(
        openPosition.holdingMinutes ??
        openPosition.holding_minutes ??
        openPosition.minutesOpen ??
        openPosition.minutes_open,
        Number.NaN
    );

    if (Number.isFinite(providedMinutes) && providedMinutes >= 0) {
        return providedMinutes;
    }

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

function getBodyHigh(c = {}) {
    return Math.max(toNumber(c.open, 0), toNumber(c.close, 0));
}

function getBodyLow(c = {}) {
    return Math.min(toNumber(c.open, 0), toNumber(c.close, 0));
}

function getBodyMid(c = {}) {
    return (getBodyHigh(c) + getBodyLow(c)) / 2;
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

function analyzeExitBodyFlow(candles = [], side = "") {
    const sample = Array.isArray(candles) ? candles.slice(-6) : [];
    const s = normalizeSide(side);

    if (sample.length < 3 || (s !== "BUY" && s !== "SELL")) {
        return {
            supportive: false,
            pullbackContained: false,
            deterioration: false,
            takeoverAgainst: false,
            compression: false,
            score: 0,
            evidence: [],
        };
    }

    const last = sample[sample.length - 1] || {};
    const prev = sample[sample.length - 2] || {};
    const prev2 = sample[sample.length - 3] || {};
    const prior = sample.slice(0, -1);
    const avgBody =
        prior.reduce((sum, c) => sum + getCandleBody(c), 0) / Math.max(1, prior.length);
    const lastBody = getCandleBody(last);
    const prevBody = getCandleBody(prev);
    const prev2Body = getCandleBody(prev2);
    const lastBodyHigh = getBodyHigh(last);
    const lastBodyLow = getBodyLow(last);
    const prevBodyHigh = getBodyHigh(prev);
    const prevBodyLow = getBodyLow(prev);
    const prevBodyMid = getBodyMid(prev);
    const prev2BodyHigh = getBodyHigh(prev2);
    const prev2BodyLow = getBodyLow(prev2);
    const compressionThreshold =
        avgBody > 0 ? avgBody * 0.60 : Math.max(lastBody, prevBody, prev2Body) * 0.70;

    let supportive = false;
    let pullbackContained = false;
    let deterioration = false;
    let takeoverAgainst = false;
    let compression = false;
    let score = 0;
    const evidence = [];

    if (s === "BUY") {
        supportive =
            isBullish(last) &&
            last.close >= prevBodyMid &&
            (lastBodyHigh > prevBodyHigh || (prevBodyLow >= prev2BodyLow && prevBodyHigh >= prev2BodyHigh));

        pullbackContained =
            isBearish(last) &&
            lastBody > 0 &&
            lastBody <= Math.max(avgBody * 1.05, prevBody * 1.10) &&
            last.close >= prevBodyMid &&
            lastBodyLow >= prevBodyLow;

        takeoverAgainst =
            (isBearish(last) && last.close <= prevBodyLow) ||
            (isBearish(last) && isBearish(prev) && toNumber(last.close, 0) < toNumber(prev.close, 0)) ||
            (isBearish(last) && lastBodyHigh >= prevBodyHigh && lastBodyLow <= prevBodyLow);

        deterioration =
            takeoverAgainst ||
            (isBearish(last) && isBearish(prev) && toNumber(last.close, 0) < prevBodyMid) ||
            (lastBodyLow < prev2BodyLow && isBearish(last));
    } else if (s === "SELL") {
        supportive =
            isBearish(last) &&
            last.close <= prevBodyMid &&
            (lastBodyLow < prevBodyLow || (prevBodyHigh <= prev2BodyHigh && prevBodyLow <= prev2BodyLow));

        pullbackContained =
            isBullish(last) &&
            lastBody > 0 &&
            lastBody <= Math.max(avgBody * 1.05, prevBody * 1.10) &&
            last.close <= prevBodyMid &&
            lastBodyHigh <= prevBodyHigh;

        takeoverAgainst =
            (isBullish(last) && last.close >= prevBodyHigh) ||
            (isBullish(last) && isBullish(prev) && toNumber(last.close, 0) > toNumber(prev.close, 0)) ||
            (isBullish(last) && lastBodyHigh >= prevBodyHigh && lastBodyLow <= prevBodyLow);

        deterioration =
            takeoverAgainst ||
            (isBullish(last) && isBullish(prev) && toNumber(last.close, 0) > prevBodyMid) ||
            (lastBodyHigh > prev2BodyHigh && isBullish(last));
    }

    compression =
        lastBody > 0 &&
        prevBody > 0 &&
        lastBody <= compressionThreshold &&
        prevBody <= Math.max(compressionThreshold, prev2Body * 1.05);

    if (supportive) {
        score -= 0.45;
        evidence.push(`${s}_BODY_SUPPORTIVE`);
    }
    if (pullbackContained) {
        score += 0.35;
        evidence.push(`${s}_BODY_PULLBACK_CONTAINED`);
    }
    if (compression) {
        score += 0.20;
        evidence.push(`${s}_BODY_COMPRESSION`);
    }
    if (deterioration) {
        score += 0.90;
        evidence.push(`${s}_BODY_DETERIORATION`);
    }
    if (takeoverAgainst) {
        score += 0.85;
        evidence.push(`${s}_BODY_TAKEOVER_AGAINST`);
    }

    return {
        supportive,
        pullbackContained,
        deterioration,
        takeoverAgainst,
        compression,
        score: Number(score.toFixed(4)),
        evidence,
    };
}

function classifyEntryExitPolicy({
    entryThesis = null,
    pattern = null,
    mode = "NORMAL",
}) {
    const normalizedMode = normalizeMode(mode);
    const sourcePattern = entryThesis?.pattern || pattern || null;
    const patternType = String(
        sourcePattern?.type ||
        sourcePattern?.pattern ||
        sourcePattern?.name ||
        ""
    ).trim().toUpperCase();
    const patternName = String(
        sourcePattern?.name ||
        sourcePattern?.pattern ||
        sourcePattern?.type ||
        ""
    ).trim().toUpperCase();
    const combined = `${patternType} ${patternName}`;

    const breakoutRetest = sourcePattern?.breakoutRetest || null;
    const structure = sourcePattern?.structure || null;

    const continuationLike =
        combined.includes("FIRST_LEG_BREAKOUT") ||
        combined.includes("FIRST_LEG_BREAKDOWN") ||
        combined.includes("CONTINUATION") ||
        combined.includes("BREAKOUT") ||
        combined.includes("BREAKDOWN") ||
        combined.includes("ROCKET") ||
        combined.includes("WATERFALL") ||
        Boolean(breakoutRetest?.breakoutDetected) ||
        Boolean(breakoutRetest?.freshBreakout);

    const reversalLike =
        combined.includes("PIERCING") ||
        combined.includes("DARK_CLOUD") ||
        combined.includes("ENGULF") ||
        combined.includes("HAMMER") ||
        combined.includes("SHOOTING") ||
        combined.includes("PIN") ||
        combined.includes("STAR") ||
        combined.includes("REVERSAL") ||
        Boolean(structure?.possibleReversal);

    let policyType = "DEFAULT";

    if (continuationLike) {
        policyType = "CONTINUATION";
    } else if (reversalLike || normalizedMode === "MICRO_SCALP" || normalizedMode === "SCALP") {
        policyType = "REVERSAL_SCALP";
    }

    return {
        policyType,
        continuationLike,
        reversalLike,
        sourcePatternType: patternType || null,
        sourcePatternName: patternName || null,
    };
}

function applyEntryExitPolicyToProfile(profile = {}, policy = {}) {
    const safeProfile = { ...profile };
    const policyType = String(policy?.policyType || "DEFAULT").toUpperCase();

    if (policyType === "CONTINUATION") {
        safeProfile.armProfitMin = Number((safeProfile.armProfitMin * 1.10).toFixed(4));
        safeProfile.moveToBeMinProfit = Number((safeProfile.moveToBeMinProfit * 1.22).toFixed(4));
        safeProfile.takeProfitMinProfit = Number((safeProfile.takeProfitMinProfit * 1.22).toFixed(4));
        safeProfile.minPeakBeforeProtect = Number((safeProfile.minPeakBeforeProtect * 1.15).toFixed(4));
        safeProfile.beMinRetraceRatio = Number(Math.min(safeProfile.beMinRetraceRatio * 1.12, 0.45).toFixed(4));
        safeProfile.tpMinRetraceRatio = Number(Math.min(safeProfile.tpMinRetraceRatio * 1.12, 0.55).toFixed(4));
        safeProfile.lowVolumeProfitMinutes = Number((safeProfile.lowVolumeProfitMinutes * 1.2).toFixed(4));
        return safeProfile;
    }

    if (policyType === "REVERSAL_SCALP") {
        safeProfile.armProfitMin = Number((safeProfile.armProfitMin * 0.92).toFixed(4));
        safeProfile.moveToBeMinProfit = Number((safeProfile.moveToBeMinProfit * 0.86).toFixed(4));
        safeProfile.takeProfitMinProfit = Number((safeProfile.takeProfitMinProfit * 0.88).toFixed(4));
        safeProfile.minPeakBeforeProtect = Number((safeProfile.minPeakBeforeProtect * 0.90).toFixed(4));
        safeProfile.beMinRetraceRatio = Number(Math.max(safeProfile.beMinRetraceRatio * 0.90, 0.10).toFixed(4));
        safeProfile.tpMinRetraceRatio = Number(Math.max(safeProfile.tpMinRetraceRatio * 0.90, 0.18).toFixed(4));
        safeProfile.lowVolumeProfitMinutes = Number((safeProfile.lowVolumeProfitMinutes * 0.85).toFixed(4));
        return safeProfile;
    }

    return safeProfile;
}

function buildPartialExitMeta({
    closeFraction = 0.5,
    moveToBeAfterPartial = true,
    keepRunner = true,
    extra = {},
}) {
    return {
        partialCloseFraction: Number(closeFraction),
        moveToBeAfterPartial: Boolean(moveToBeAfterPartial),
        keepRunner: Boolean(keepRunner),
        ...extra,
    };
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

function analyzeHigherTimeframeExitContext({
    side = "",
    candlesM15 = [],
    candlesM30 = [],
    candlesH1 = [],
    candlesH4 = [],
}) {
    const s = normalizeSide(side);
    const primary = Array.isArray(candlesM15) && candlesM15.length >= 3
        ? candlesM15
        : Array.isArray(candlesM30) && candlesM30.length >= 3
            ? candlesM30
            : Array.isArray(candlesH1) && candlesH1.length >= 3
                ? candlesH1
                : Array.isArray(candlesH4) && candlesH4.length >= 3
                    ? candlesH4
                    : [];

    if (!primary.length || (s !== "BUY" && s !== "SELL")) {
        return {
            supportive: false,
            opposing: false,
            continuationSupport: false,
            structureBreakAgainst: false,
            score: 0,
            evidence: [],
        };
    }

    const sample = primary.slice(-5);
    const recent3 = sample.slice(-3);
    const last = sample[sample.length - 1] || {};
    const prev = sample[sample.length - 2] || {};
    const prev2 = sample[sample.length - 3] || {};
    const evidence = [];

    let supportive = false;
    let opposing = false;
    let continuationSupport = false;
    let structureBreakAgainst = false;
    let score = 0;

    if (s === "BUY") {
        const higherLowFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].low, 0) >= toNumber(recent3[1].low, 0) &&
            toNumber(recent3[1].low, 0) >= toNumber(recent3[0].low, 0);

        const higherCloseFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].close, 0) >= toNumber(recent3[1].close, 0) &&
            toNumber(recent3[1].close, 0) >= toNumber(recent3[0].close, 0);

        supportive = higherLowFlow || higherCloseFlow;
        continuationSupport =
            isBullish(last) &&
            toNumber(last.close, 0) >= toNumber(prev.close, 0) &&
            toNumber(last.low, 0) >= Math.min(toNumber(prev.low, 0), toNumber(prev2.low, 0));

        structureBreakAgainst =
            toNumber(last.close, 0) < Math.min(toNumber(prev.low, 0), toNumber(prev2.low, 0));

        opposing =
            structureBreakAgainst ||
            (isBearish(last) && isBearish(prev) && toNumber(last.close, 0) < toNumber(prev.close, 0));
    } else {
        const lowerHighFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].high, 0) <= toNumber(recent3[1].high, 0) &&
            toNumber(recent3[1].high, 0) <= toNumber(recent3[0].high, 0);

        const lowerCloseFlow =
            recent3.length >= 3 &&
            toNumber(recent3[2].close, 0) <= toNumber(recent3[1].close, 0) &&
            toNumber(recent3[1].close, 0) <= toNumber(recent3[0].close, 0);

        supportive = lowerHighFlow || lowerCloseFlow;
        continuationSupport =
            isBearish(last) &&
            toNumber(last.close, 0) <= toNumber(prev.close, 0) &&
            toNumber(last.high, 0) <= Math.max(toNumber(prev.high, 0), toNumber(prev2.high, 0));

        structureBreakAgainst =
            toNumber(last.close, 0) > Math.max(toNumber(prev.high, 0), toNumber(prev2.high, 0));

        opposing =
            structureBreakAgainst ||
            (isBullish(last) && isBullish(prev) && toNumber(last.close, 0) > toNumber(prev.close, 0));
    }

    if (supportive) {
        score -= 0.22;
        evidence.push(`${s}_HTF_SUPPORTIVE`);
    }
    if (continuationSupport) {
        score -= 0.18;
        evidence.push(`${s}_HTF_CONTINUATION_SUPPORT`);
    }
    if (opposing) {
        score += 0.28;
        evidence.push(`${s}_HTF_OPPOSING`);
    }
    if (structureBreakAgainst) {
        score += 0.34;
        evidence.push(`${s}_HTF_STRUCTURE_BREAK_AGAINST`);
    }

    return {
        supportive,
        opposing,
        continuationSupport,
        structureBreakAgainst,
        score: Number(score.toFixed(4)),
        evidence,
    };
}

function analyzeLowerTimeframeExitContext({ side = "", candlesM1 = [] }) {
    const s = normalizeSide(side);
    const sample = Array.isArray(candlesM1) ? candlesM1.slice(-6) : [];

    if (sample.length < 3 || (s !== "BUY" && s !== "SELL")) {
        return {
            supportive: false,
            noiseCounter: false,
            takeoverAgainst: false,
            score: 0,
            evidence: [],
        };
    }

    const bodyFlow = analyzeExitBodyFlow(sample, s);
    const wrongWay = detectWrongWayFlowScore(sample, s);
    const takeover = detectOppositeTakeover(sample, s);
    const evidence = [...bodyFlow.evidence];

    const supportive = bodyFlow.supportive;
    const noiseCounter =
        bodyFlow.pullbackContained &&
        !bodyFlow.takeoverAgainst &&
        !bodyFlow.deterioration &&
        wrongWay.score < 1.6 &&
        !takeover.detected;
    const takeoverAgainst =
        bodyFlow.takeoverAgainst ||
        bodyFlow.deterioration ||
        takeover.detected ||
        wrongWay.score >= 2.1;

    let score = 0;
    if (supportive) {
        score -= 0.12;
        evidence.push(`${s}_M1_SUPPORTIVE`);
    }
    if (noiseCounter) {
        score -= 0.08;
        evidence.push(`${s}_M1_NOISE_COUNTER`);
    }
    if (takeoverAgainst) {
        score += 0.18;
        evidence.push(`${s}_M1_TAKEOVER_AGAINST`);
    }

    return {
        supportive,
        noiseCounter,
        takeoverAgainst,
        score: Number(score.toFixed(4)),
        evidence,
    };
}

function buildLossPressureContext({
    bodyFlow = null,
    higherTfContext = null,
    lowerTfContext = null,
    confirmation = { level: "LOW", score: 0 },
    wrongWayFlow = null,
    noFollowThrough = null,
    takeover = null,
    softInvalidation = false,
    hardInvalidation = false,
}) {
    const severeSignalCount = countTrue([
        Boolean(hardInvalidation),
        Boolean(higherTfContext?.structureBreakAgainst),
        Boolean(higherTfContext?.opposing),
        Boolean(lowerTfContext?.takeoverAgainst),
        Boolean(bodyFlow?.takeoverAgainst),
        Boolean(bodyFlow?.deterioration),
        Boolean(takeover?.detected),
        toNumber(wrongWayFlow?.score, 0) >= 2.3,
        Boolean(noFollowThrough?.detected) && toNumber(noFollowThrough?.score, 0) >= 2.0,
        String(confirmation?.level || "LOW").toUpperCase() === "HIGH",
    ]);

    const alignedAgainst = Boolean(
        severeSignalCount >= 2 ||
        (
            (higherTfContext?.opposing || higherTfContext?.structureBreakAgainst) &&
            (
                lowerTfContext?.takeoverAgainst ||
                bodyFlow?.takeoverAgainst ||
                bodyFlow?.deterioration ||
                softInvalidation
            )
        )
    );

    const severeAgainst = Boolean(
        severeSignalCount >= 3 ||
        (
            hardInvalidation &&
            (
                higherTfContext?.structureBreakAgainst ||
                lowerTfContext?.takeoverAgainst ||
                bodyFlow?.takeoverAgainst
            )
        )
    );

    return {
        alignedAgainst,
        severeAgainst,
        severeSignalCount,
        cutProfitMultiplier: severeAgainst ? 0.72 : alignedAgainst ? 0.85 : 1,
        minuteMultiplier: severeAgainst ? 0.55 : alignedAgainst ? 0.75 : 1,
        damageRatioMultiplier: severeAgainst ? 0.82 : alignedAgainst ? 0.90 : 1,
        scoreBonus: severeAgainst ? 0.28 : alignedAgainst ? 0.14 : 0,
    };
}

function shouldTakeProfitOnLowVolume({
    historicalVolumeSignal = null,
    holdingMinutes = 0,
    currentProfit = 0,
    mode = "NORMAL",
    profileOverride = null,
}) {
    const hv = String(historicalVolumeSignal || "").toUpperCase();
    if (hv !== "LOW_VOLUME") return false;
    if (currentProfit <= 0) return false;

    const profile = profileOverride || getExitProfile(mode);
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
    lossPressureContext = null,
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);
    const normalizedMode = normalizeMode(mode);
    const scoreBonus = toSafeNumber(lossPressureContext?.scoreBonus, 0);
    const cutProfitMultiplier = toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
    const minuteMultiplier = toSafeNumber(lossPressureContext?.minuteMultiplier, 1);

    if (
        profit <= profile.strongCutProfit * cutProfitMultiplier &&
        reversalScore >= profile.reversalCutScore - scoreBonus &&
        (softInvalidation || hardInvalidation || confirmation.level !== "LOW")
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizedMode}_STRONG_REVERSAL_CUT`,
        };
    }

    if (
        mins >= profile.simpleCutMinutes * minuteMultiplier &&
        profit <= profile.simpleCutProfit * cutProfitMultiplier &&
        (softInvalidation || hardInvalidation || confirmation.level === "HIGH")
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizedMode}_TIME_BASED_WRONG_WAY_CUT`,
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
    lossPressureContext = null,
}) {
    if (normalizeMode(mode) !== "NORMAL") return null;

    const profile = getExitProfile("NORMAL");
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);
    const scoreBonus = toSafeNumber(lossPressureContext?.scoreBonus, 0);
    const cutProfitMultiplier = toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
    const minuteMultiplier = toSafeNumber(lossPressureContext?.minuteMultiplier, 1);

    const hardInvalidation = hasHardInvalidation(candles, side);
    const softInvalidation = hasSoftInvalidation(candles, side);

    if (
        mins >= profile.normalFastCutMinutes * minuteMultiplier &&
        profit <= profile.normalStructureBreakProfit * cutProfitMultiplier &&
        (hardInvalidation || (softInvalidation && confirmation.level !== "LOW"))
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: "NORMAL_STRUCTURE_BREAK_FAST_CUT",
        };
    }

    if (
        mins >= profile.normalFastCutMinutes * minuteMultiplier &&
        profit <= profile.normalFastCutProfit * cutProfitMultiplier &&
        reversalScore >= profile.normalFastReversalScore - scoreBonus &&
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
    lossPressureContext = null,
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);
    const normalizedMode = normalizeMode(mode);
    const cutProfitMultiplier = toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
    const minuteMultiplier = toSafeNumber(lossPressureContext?.minuteMultiplier, 1);
    const scoreBonus = toSafeNumber(lossPressureContext?.scoreBonus, 0);

    if (profit > 0) return null;
    if (mins < profile.wrongWayMinMinutes * minuteMultiplier) return null;

    const confidenceBoost =
        (softInvalidation ? 0.25 : 0) +
        (hardInvalidation ? 0.5 : 0) +
        (confirmation.level === "HIGH" ? 0.35 : confirmation.level === "MEDIUM" ? 0.18 : 0);

    const effectiveFlowScore = wrongWayFlowScore + confidenceBoost + scoreBonus;

    if (
        profit <= profile.wrongWayHardCutProfit * cutProfitMultiplier &&
        effectiveFlowScore >= profile.wrongWayFlowHardScore - scoreBonus
    ) {
        return {
            action: "CUT_LOSS_NOW",
            reason: `${normalizeMode(mode)}_WRONG_WAY_FLOW_HARD_CUT`,
            effectiveFlowScore,
        };
    }

    if (
        profit <= profile.wrongWayCutProfit * cutProfitMultiplier &&
        effectiveFlowScore >= profile.wrongWayFlowCutScore - scoreBonus
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
    lossPressureContext = null,
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const mins = toNumber(holdingMinutes, 0);
    const normalizedMode = normalizeMode(mode);
    const cutProfitMultiplier = toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
    const minuteMultiplier = toSafeNumber(lossPressureContext?.minuteMultiplier, 1);
    const scoreBonus = toSafeNumber(lossPressureContext?.scoreBonus, 0);

    if (profit > 0) return null;
    if (mins < profile.noFollowThroughMinMinutes * minuteMultiplier) return null;

    if (
        profit <= profile.noFollowThroughCutProfit * cutProfitMultiplier &&
        toNumber(noFollowThrough.score, 0) >= profile.noFollowThroughScore - scoreBonus
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
    lossPressureContext = null,
}) {
    const profile = getExitProfile(mode);
    const profit = toNumber(currentProfit, 0);
    const normalizedMode = normalizeMode(mode);
    const cutProfitMultiplier = toSafeNumber(lossPressureContext?.cutProfitMultiplier, 1);
    const scoreBonus = toSafeNumber(lossPressureContext?.scoreBonus, 0);

    if (profit > 0) return null;

    if (
        profit <= profile.takeoverCutProfit * cutProfitMultiplier &&
        toNumber(takeover.score, 0) >= profile.takeoverCutScore - scoreBonus
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
    bodyFlow = { deterioration: false, takeoverAgainst: false, score: 0 },
    profileOverride = null,
}) {
    const profile = profileOverride || getExitProfile(mode);
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

    const healthyBodyContinuation =
        !bodyFlow.takeoverAgainst &&
        !bodyFlow.deterioration &&
        (bodyFlow.supportive || bodyFlow.pullbackContained) &&
        confirmation.level !== "HIGH" &&
        reversalScore < profile.strongStructureScore + 0.2;

    if (healthyBodyContinuation) return false;

    const strongRisk =
        bodyFlow.takeoverAgainst ||
        bodyFlow.score >= 1.05 ||
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
    bodyFlow = { deterioration: false, takeoverAgainst: false, score: 0 },
    profileOverride = null,
}) {
    const profile = profileOverride || getExitProfile(mode);
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

    const healthyBodyContinuation =
        !bodyFlow.takeoverAgainst &&
        !bodyFlow.deterioration &&
        (bodyFlow.supportive || bodyFlow.pullbackContained) &&
        confirmation.level === "LOW" &&
        reversalScore < profile.strongStructureScore;

    if (healthyBodyContinuation) return false;

    const moderateRisk =
        bodyFlow.deterioration ||
        bodyFlow.score >= 0.75 ||
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
    bodyFlow,
    higherTfContext,
    lowerTfContext,
    entryExitPolicy,
    lossPressureContext,
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
        bodyFlowScore: bodyFlow?.score ?? 0,
        bodyFlowEvidence: bodyFlow?.evidence ?? [],
        bodyFlowSupportive: Boolean(bodyFlow?.supportive),
        bodyFlowPullbackContained: Boolean(bodyFlow?.pullbackContained),
        bodyFlowDeterioration: Boolean(bodyFlow?.deterioration),
        bodyFlowTakeoverAgainst: Boolean(bodyFlow?.takeoverAgainst),
        bodyFlowCompression: Boolean(bodyFlow?.compression),
        higherTfExitScore: higherTfContext?.score ?? 0,
        higherTfExitEvidence: higherTfContext?.evidence ?? [],
        higherTfExitSupportive: Boolean(higherTfContext?.supportive),
        higherTfExitOpposing: Boolean(higherTfContext?.opposing),
        higherTfExitContinuationSupport: Boolean(higherTfContext?.continuationSupport),
        higherTfExitStructureBreakAgainst: Boolean(higherTfContext?.structureBreakAgainst),
        lowerTfExitScore: lowerTfContext?.score ?? 0,
        lowerTfExitEvidence: lowerTfContext?.evidence ?? [],
        lowerTfExitSupportive: Boolean(lowerTfContext?.supportive),
        lowerTfExitNoiseCounter: Boolean(lowerTfContext?.noiseCounter),
        lowerTfExitTakeoverAgainst: Boolean(lowerTfContext?.takeoverAgainst),
        entryExitPolicyType: String(entryExitPolicy?.policyType || "DEFAULT").toUpperCase(),
        entryExitPolicyContinuationLike: Boolean(entryExitPolicy?.continuationLike),
        entryExitPolicyReversalLike: Boolean(entryExitPolicy?.reversalLike),
        entryExitPatternType: entryExitPolicy?.sourcePatternType || null,
        entryExitPatternName: entryExitPolicy?.sourcePatternName || null,
        lossPressureAlignedAgainst: Boolean(lossPressureContext?.alignedAgainst),
        lossPressureSevereAgainst: Boolean(lossPressureContext?.severeAgainst),
        lossPressureSevereSignalCount: Number(lossPressureContext?.severeSignalCount || 0),
        lossPressureCutProfitMultiplier: Number(lossPressureContext?.cutProfitMultiplier || 1),
        lossPressureMinuteMultiplier: Number(lossPressureContext?.minuteMultiplier || 1),
        lossPressureScoreBonus: Number(lossPressureContext?.scoreBonus || 0),
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
    candlesM1 = [],
    candlesM15 = [],
    candlesM30 = [],
    candlesH1 = [],
    candlesH4 = [],
    entryThesis = null,
}) {
    openPosition = openPosition || {};

    const side = normalizeSide(
        openPosition.side || openPosition.type || openPosition.positionSide || ""
    );

    const normalizedMode = normalizeMode(mode || openPosition.mode || "NORMAL");
    const profile = getExitProfile(normalizedMode);
    const entryExitPolicy = classifyEntryExitPolicy({
        entryThesis,
        pattern,
        mode: normalizedMode,
    });
    const protectProfile = applyEntryExitPolicyToProfile(profile, entryExitPolicy);
    const profit = toNumber(currentProfit, 0);
    const historicalVolumeSignal = historicalVolume?.signal || historicalVolume || null;

    if (!openPosition.currentPrice && price) {
        openPosition = {
            ...openPosition,
            currentPrice: price,
        };
    }

    const derivedSlPoints =
        toNumber(openPosition.slPoints ?? openPosition.sl_points, 0) ||
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
    const bodyFlow = analyzeExitBodyFlow(candles, side);
    const higherTfContext = analyzeHigherTimeframeExitContext({
        side,
        candlesM15,
        candlesM30,
        candlesH1,
        candlesH4,
    });
    const lowerTfContext = analyzeLowerTimeframeExitContext({
        side,
        candlesM1,
    });
    const lossPressureContext = buildLossPressureContext({
        bodyFlow,
        higherTfContext,
        lowerTfContext,
        confirmation,
        wrongWayFlow,
        noFollowThrough,
        takeover,
        softInvalidation,
        hardInvalidation,
    });

    let adjustedScore =
        detectReversalScore(candles, side, normalizedMode) +
        toNumber(confirmation.score, 0) * 0.25 -
        toNumber(continuation.strength, 0) * 0.35 +
        toNumber(higherTfContext.score, 0) +
        toNumber(lowerTfContext.score, 0);

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
        lossPressureContext,
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
        lossPressureContext,
    });

    const commonMeta = buildCutMeta({
        holdingMinutes,
        wrongWayFlow,
        noFollowThrough,
        takeover,
        bodyFlow,
        higherTfContext,
        lowerTfContext,
        entryExitPolicy,
        lossPressureContext,
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
            lossPressureContext,
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
            lossPressureContext,
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
            lossPressureContext,
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
            lossPressureContext,
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
            lossPressureContext,
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

    if (continuation.continuation && !bodyFlow.deterioration && !bodyFlow.takeoverAgainst) {
        if (
            higherTfContext.supportive ||
            higherTfContext.continuationSupport ||
            lowerTfContext.supportive ||
            lowerTfContext.noiseCounter
        ) {
            return {
                action: "HOLD",
                reason: `${normalizedMode}_MULTI_TF_CONTINUATION_HOLD`,
                riskLevel: "LOW",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        return {
            action: "HOLD",
            reason: `${normalizedMode}_CONTINUATION_HOLD`,
            riskLevel: "LOW",
            score: adjustedScore,
            meta: commonMeta,
        };
    }

    if (
        profit > 0 &&
        !bodyFlow.deterioration &&
        !bodyFlow.takeoverAgainst &&
        (bodyFlow.supportive || bodyFlow.pullbackContained) &&
        !higherTfContext.opposing &&
        !higherTfContext.structureBreakAgainst &&
        !lowerTfContext.takeoverAgainst &&
        confirmation.level !== "HIGH" &&
        adjustedScore < profile.reversalCutScore
    ) {
        return {
            action: "HOLD",
            reason: `${normalizedMode}_BODY_CONTINUATION_HOLD`,
            riskLevel: "LOW",
            score: adjustedScore,
            meta: commonMeta,
        };
    }

    if (
        shouldTakeProfitOnLowVolume({
            historicalVolumeSignal,
            holdingMinutes,
            currentProfit: profit,
            mode: normalizedMode,
            profileOverride: protectProfile,
        }) &&
        getPeakProfit(openPosition, profit) >= protectProfile.minPeakBeforeProtect &&
        getProfitRetractionRatio(openPosition, profit) >= protectProfile.beMinRetraceRatio
    ) {
        if (entryExitPolicy.policyType === "CONTINUATION") {
            return {
                action: "TAKE_PARTIAL",
                reason: `${normalizedMode}_CONTINUATION_LOW_VOLUME_PARTIAL`,
                riskLevel,
                score: adjustedScore,
                meta: {
                    ...commonMeta,
                    ...buildPartialExitMeta({
                        closeFraction: 0.5,
                        moveToBeAfterPartial: true,
                        keepRunner: true,
                    }),
                },
            };
        }

        return {
            action: "TAKE_SMALL_PROFIT",
            reason: `${normalizedMode}_${entryExitPolicy.policyType}_LOW_VOLUME_PROTECT`,
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
            bodyFlow,
            profileOverride: protectProfile,
        })
    ) {
        if (
            higherTfContext.supportive &&
            !higherTfContext.opposing &&
            (lowerTfContext.supportive || lowerTfContext.noiseCounter) &&
            !lowerTfContext.takeoverAgainst
        ) {
            return {
                action: "HOLD",
                reason: `${normalizedMode}_MULTI_TF_PROFIT_HOLD`,
                riskLevel: "LOW",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        if (entryExitPolicy.policyType === "CONTINUATION") {
            return {
                action: "TAKE_PARTIAL",
                reason: `${normalizedMode}_CONTINUATION_PARTIAL_PROTECT`,
                riskLevel,
                score: adjustedScore,
                meta: {
                    ...commonMeta,
                    peakProfit: getPeakProfit(openPosition, profit),
                    retractionRatio: getProfitRetractionRatio(openPosition, profit),
                    confirmation: confirmation.level,
                    continuation: continuation.strength,
                    bodyFlowScore: bodyFlow.score,
                    bodyFlowEvidence: bodyFlow.evidence,
                    ...buildPartialExitMeta({
                        closeFraction: 0.5,
                        moveToBeAfterPartial: true,
                        keepRunner: true,
                    }),
                },
            };
        }

        return {
            action: "TAKE_SMALL_PROFIT",
            reason: `${normalizedMode}_${entryExitPolicy.policyType}_REVERSAL_PROFIT_PROTECT`,
            riskLevel,
            score: adjustedScore,
            meta: {
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
                confirmation: confirmation.level,
                continuation: continuation.strength,
                bodyFlowScore: bodyFlow.score,
                bodyFlowEvidence: bodyFlow.evidence,
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
            bodyFlow,
            profileOverride: protectProfile,
        })
    ) {
        if (
            higherTfContext.supportive &&
            !higherTfContext.opposing &&
            !higherTfContext.structureBreakAgainst &&
            (lowerTfContext.supportive || lowerTfContext.noiseCounter) &&
            !lowerTfContext.takeoverAgainst
        ) {
            return {
                action: "HOLD",
                reason: `${normalizedMode}_MULTI_TF_HOLD_INSTEAD_OF_BE`,
                riskLevel: "LOW",
                score: adjustedScore,
                meta: commonMeta,
            };
        }

        if (entryExitPolicy.policyType === "CONTINUATION") {
            return {
                action: "TAKE_PARTIAL",
                reason: `${normalizedMode}_CONTINUATION_PARTIAL_BE_PROTECT`,
                riskLevel,
                score: adjustedScore,
                meta: {
                    ...commonMeta,
                    peakProfit: getPeakProfit(openPosition, profit),
                    retractionRatio: getProfitRetractionRatio(openPosition, profit),
                    confirmation: confirmation.level,
                    continuation: continuation.strength,
                    bodyFlowScore: bodyFlow.score,
                    bodyFlowEvidence: bodyFlow.evidence,
                    ...buildPartialExitMeta({
                        closeFraction: 0.5,
                        moveToBeAfterPartial: true,
                        keepRunner: true,
                    }),
                },
            };
        }

        return {
            action: "MOVE_TO_BE",
            reason: `${normalizedMode}_${entryExitPolicy.policyType}_CONTEXTUAL_BREAKEVEN_PROTECT`,
            riskLevel,
            score: adjustedScore,
            meta: {
                peakProfit: getPeakProfit(openPosition, profit),
                retractionRatio: getProfitRetractionRatio(openPosition, profit),
                confirmation: confirmation.level,
                continuation: continuation.strength,
                bodyFlowScore: bodyFlow.score,
                bodyFlowEvidence: bodyFlow.evidence,
            },
        };
    }

    return {
        action: "HOLD",
        reason: `No strong exit signal (score=${adjustedScore}, mode=${normalizedMode}, confirm=${confirmation.level})`,
        riskLevel,
        score: adjustedScore,
        meta: commonMeta,
    };
}

module.exports = {
    analyzeEarlyExit,
};
