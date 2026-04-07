"use strict";

/**
 * decision-engine-v6.js
 *
 * แนวคิดหลัก:
 * - ใช้ M15/M30 เป็น higher timeframe หลักสำหรับเทรดสั้น
 * - H1/H4 ยังรองรับใน data structure แต่ยังไม่เปิดใช้งานจริง
 * - คง export หลักให้ server.js ใช้งานต่อได้:
 *   - evaluateDecision()
 *   - decision()
 *   - resolveDecisionWithTradingPreferences()
 */

// --------------------------------------------------
// Basic helpers
// --------------------------------------------------
function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function safeArray(v) {
    return Array.isArray(v) ? v : [];
}

function normalizeCandles(input = []) {
    return safeArray(input)
        .filter(
            (c) =>
                c &&
                Number.isFinite(Number(c.open)) &&
                Number.isFinite(Number(c.high)) &&
                Number.isFinite(Number(c.low)) &&
                Number.isFinite(Number(c.close))
        )
        .map((c) => ({
            open: toNum(c.open),
            high: toNum(c.high),
            low: toNum(c.low),
            close: toNum(c.close),
            tick_volume: toNum(c.tick_volume),
        }));
}

function getLast(candles = [], offset = 0) {
    if (!Array.isArray(candles) || candles.length === 0) return null;
    const idx = candles.length - 1 - offset;
    if (idx < 0) return null;
    return candles[idx] || null;
}

function getBody(c) {
    if (!c) return 0;
    return Math.abs(toNum(c.close) - toNum(c.open));
}

function getRange(c) {
    if (!c) return 0;
    return Math.abs(toNum(c.high) - toNum(c.low));
}

function isBull(c) {
    return c && toNum(c.close) > toNum(c.open);
}

function isBear(c) {
    return c && toNum(c.close) < toNum(c.open);
}

function average(list = []) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    const sum = list.reduce((acc, n) => acc + toNum(n), 0);
    return sum / list.length;
}

function avgBody(candles = []) {
    return average(candles.map(getBody));
}

function avgVolume(candles = []) {
    return average(candles.map((c) => toNum(c?.tick_volume)));
}

// --------------------------------------------------
// Trading preference helpers
// --------------------------------------------------
function normalizeDirectionBias(directionBias = "AUTO") {
    const v = String(directionBias || "AUTO").trim().toUpperCase();

    if (v === "BUY") return "BUY_ONLY";
    if (v === "SELL") return "SELL_ONLY";
    if (v === "BUY_ONLY") return "BUY_ONLY";
    if (v === "SELL_ONLY") return "SELL_ONLY";
    if (v === "DISABLE_NEW_ENTRY") return "DISABLE_NEW_ENTRY";

    return "AUTO";
}

function isTradingEngineEnabled(tradingPreferences = null) {
    if (!tradingPreferences || typeof tradingPreferences !== "object") return true;

    const raw =
        tradingPreferences.engine_enabled ??
        tradingPreferences.engnine_enabled ?? // รองรับชื่อเดิมที่สะกดผิด
        tradingPreferences.is_enabled ??
        true;

    return Boolean(raw);
}

function normalizeTradingPreferences(raw = null) {
    const prefs = raw && typeof raw === "object" ? raw : {};

    return {
        direction_bias: normalizeDirectionBias(
            prefs.direction_bias ?? prefs.directionBias ?? "AUTO"
        ),
        max_open_positions: Math.max(
            0,
            parseInt(
                prefs.max_open_positions ?? prefs.maxOpenPositions ?? 0,
                10
            ) || 0
        ),
        engine_enabled:
            prefs.engine_enabled ??
            prefs.engnine_enabled ??
            prefs.is_enabled ??
            true,
    };
}

function isOpenDecision(v) {
    return v === "ALLOW_BUY" || v === "ALLOW_SELL";
}

function isMaxOpenPositionsReached({
    tradingPreferences = null,
    currentOpenPositionsCount = 0,
} = {}) {
    const prefs = normalizeTradingPreferences(tradingPreferences);
    const maxOpen = toNum(prefs.max_open_positions, 0);

    if (!maxOpen || maxOpen <= 0) return false;
    return toNum(currentOpenPositionsCount, 0) >= maxOpen;
}

function enforceDirectionBiasOnDecision({
    finalDecision,
    tradingPreferences = null,
} = {}) {
    const prefs = normalizeTradingPreferences(tradingPreferences);
    const directionBias = prefs.direction_bias;

    if (directionBias === "DISABLE_NEW_ENTRY") {
        return {
            finalDecision: "NO_TRADE",
            blockedReason: "ENGINE_DIRECTION_DISABLED",
        };
    }

    if (directionBias === "BUY_ONLY" && finalDecision === "ALLOW_SELL") {
        return {
            finalDecision: "NO_TRADE",
            blockedReason: "DIRECTION_BIAS_BUY_ONLY",
        };
    }

    if (directionBias === "SELL_ONLY" && finalDecision === "ALLOW_BUY") {
        return {
            finalDecision: "NO_TRADE",
            blockedReason: "DIRECTION_BIAS_SELL_ONLY",
        };
    }

    return {
        finalDecision,
        blockedReason: null,
    };
}

// --------------------------------------------------
// Market structure / HTF helpers
// --------------------------------------------------
function analyzeTfDirection(candles = [], label = "M15") {
    const safe = normalizeCandles(candles);

    if (safe.length < 3) {
        return {
            label,
            direction: "NEUTRAL",
            strength: "WEAK",
            volumeConfirmed: false,
            bullishCount: 0,
            bearishCount: 0,
            latestBodyExpansion: 0,
            latestRangeExpansion: 0,
        };
    }

    const recent = safe.slice(-3);
    const prevForAvg = safe.slice(-6, -1);
    const recentAvgBody = avgBody(prevForAvg.length > 0 ? prevForAvg : recent);
    const recentAvgVol = avgVolume(prevForAvg.length > 0 ? prevForAvg : recent);

    let bullishCount = 0;
    let bearishCount = 0;

    for (const c of recent) {
        if (isBull(c)) bullishCount++;
        if (isBear(c)) bearishCount++;
    }

    let direction = "NEUTRAL";
    if (bullishCount >= 2) direction = "BUY";
    else if (bearishCount >= 2) direction = "SELL";

    const latest = getLast(recent);
    const latestBody = getBody(latest);
    const latestRange = getRange(latest);
    const latestVol = toNum(latest?.tick_volume);

    const latestBodyExpansion =
        recentAvgBody > 0 ? latestBody / recentAvgBody : 0;
    const latestRangeExpansion =
        recentAvgBody > 0 ? latestRange / recentAvgBody : 0;

    const volumeConfirmed =
        recentAvgVol > 0 && latestVol >= recentAvgVol * 1.05;

    let strength = "WEAK";
    if (
        direction !== "NEUTRAL" &&
        volumeConfirmed &&
        latestBodyExpansion >= 1.10
    ) {
        strength = "STRONG";
    } else if (direction !== "NEUTRAL") {
        strength = "MEDIUM";
    }

    return {
        label,
        direction,
        strength,
        volumeConfirmed,
        bullishCount,
        bearishCount,
        latestBodyExpansion: Number(latestBodyExpansion.toFixed(4)),
        latestRangeExpansion: Number(latestRangeExpansion.toFixed(4)),
    };
}

function resolveTrendContext(market = {}) {
    const candlesM15 = normalizeCandles(
        market.candlesM15 || market.candles_m15 || []
    );
    const candlesM30 = normalizeCandles(
        market.candlesM30 || market.candles_m30 || []
    );
    const candlesH1 = normalizeCandles(
        market.candlesH1 || market.candles_h1 || []
    );
    const candlesH4 = normalizeCandles(
        market.candlesH4 || market.candles_h4 || []
    );

    // ใช้ M15/M30 เป็นหลัก
    const primary = analyzeTfDirection(candlesM15, "M15");
    const secondary = analyzeTfDirection(candlesM30, "M30");

    // เผื่อเปิดใช้ภายหลัง
    // const fallbackPrimary = analyzeTfDirection(candlesH1, "H1");
    // const fallbackSecondary = analyzeTfDirection(candlesH4, "H4");

    let overallTrend = "NEUTRAL";

    if (
        primary.direction !== "NEUTRAL" &&
        secondary.direction !== "NEUTRAL" &&
        primary.direction === secondary.direction
    ) {
        overallTrend = primary.direction;
    } else if (primary.direction !== "NEUTRAL") {
        overallTrend = primary.direction;
    } else if (secondary.direction !== "NEUTRAL") {
        overallTrend = secondary.direction;
    }

    const volumeConfirmed =
        Boolean(primary.volumeConfirmed) || Boolean(secondary.volumeConfirmed);

    let trendStrength = "WEAK";
    if (
        overallTrend !== "NEUTRAL" &&
        primary.strength === "STRONG" &&
        secondary.strength === "STRONG"
    ) {
        trendStrength = "STRONG";
    } else if (overallTrend !== "NEUTRAL") {
        trendStrength = "MEDIUM";
    }

    const isRanging = overallTrend === "NEUTRAL";

    return {
        primary,
        secondary,
        overallTrend, // BUY / SELL / NEUTRAL
        trendStrength,
        volumeConfirmed,
        isRanging,
        source: "M15_M30",
        fallbackDisabled: true,
        // h1: fallbackPrimary,
        // h4: fallbackSecondary,
    };
}

function resolveMicroTrend(candles = []) {
    const safe = normalizeCandles(candles);
    if (safe.length < 4) return "NEUTRAL";

    const last4 = safe.slice(-4);

    let bulls = 0;
    let bears = 0;
    for (const c of last4) {
        if (isBull(c)) bulls++;
        if (isBear(c)) bears++;
    }

    if (bulls >= 3) return "BULLISH";
    if (bears >= 3) return "BEARISH";
    return "NEUTRAL";
}

function resolveHistoricalVolumeSignal({
    candles = [],
    historicalVolume = null,
    pattern = null,
} = {}) {
    const explicit =
        historicalVolume?.signal ||
        historicalVolume?.historicalVolumeSignal ||
        pattern?.historicalVolumeSignal ||
        null;

    if (explicit) {
        return String(explicit).toUpperCase();
    }

    const safe = normalizeCandles(candles);
    if (safe.length < 8) return "NORMAL_VOLUME";

    const recent = safe.slice(-3);
    const prior = safe.slice(-8, -3);

    const recentAvg = avgVolume(recent);
    const priorAvg = avgVolume(prior);

    if (priorAvg <= 0) return "NORMAL_VOLUME";

    if (recentAvg >= priorAvg * 1.20) return "HIGH_VOLUME";
    if (recentAvg <= priorAvg * 0.80) return "LOW_VOLUME";
    return "NORMAL_VOLUME";
}

function resolvePatternDirection(pattern = null) {
    const p = String(pattern?.pattern || "NONE").toUpperCase();
    if (p === "CLAW_BUY") return "BUY";
    if (p === "CLAW_SELL") return "SELL";
    return "NEUTRAL";
}

function resolvePatternType(pattern = null) {
    return String(pattern?.type || "None");
}

function resolvePatternScore(pattern = null) {
    return toNum(pattern?.score, 0);
}

function resolveDefensiveFlags(pattern = null, market = {}) {
    return {
        isFailToLL: Boolean(
            market?.isFailToLL ??
            pattern?.structure?.isFailToLL ??
            pattern?.isFailToLL ??
            false
        ),
        isFailToHH: Boolean(
            market?.isFailToHH ??
            pattern?.structure?.isFailToHH ??
            pattern?.isFailToHH ??
            false
        ),
        retestingSupport: Boolean(
            market?.retestingSupport ??
            pattern?.structure?.retestingSupport ??
            false
        ),
        retestingResistance: Boolean(
            market?.retestingResistance ??
            pattern?.structure?.retestingResistance ??
            false
        ),
        warningMatched: Boolean(pattern?.warningMatched ?? false),
    };
}

// --------------------------------------------------
// Mode / threshold / scoring
// --------------------------------------------------
function resolveMode({
    trendContext,
    microTrend,
    defensiveFlags,
    pattern,
} = {}) {
    let mode = "NORMAL";

    if (!trendContext || trendContext.isRanging) {
        mode = "SCALP";
    }

    if (!trendContext?.volumeConfirmed) {
        mode = "SCALP";
    }

    if (
        defensiveFlags?.isFailToLL ||
        defensiveFlags?.isFailToHH
    ) {
        mode = "SCALP";
    }

    if (
        microTrend === "NEUTRAL" &&
        String(pattern?.pattern || "NONE").toUpperCase() === "NONE"
    ) {
        mode = "SCALP";
    }

    return mode;
}

function getDynamicThresholdContext({
    mode = "NORMAL",
    trend = "NEUTRAL",
    adaptiveScoreDelta = 0,
    historicalVolumeSignal = "NORMAL_VOLUME",
    defensiveFlags = {},
    symbol = "",
} = {}) {
    const symbolUpper = String(symbol || "").toUpperCase();
    const isGold = symbolUpper.includes("XAU");

    let buyThreshold = mode === "SCALP" ? 2.32 : 2.05;
    let sellThreshold = mode === "SCALP" ? -2.32 : -2.05;

    if (trend === "NEUTRAL") {
        buyThreshold += 0.08;
        sellThreshold -= 0.08;
    }

    if (historicalVolumeSignal === "LOW_VOLUME") {
        buyThreshold += isGold ? 0.04 : 0.10;
        sellThreshold -= isGold ? 0.04 : 0.10;
    } else if (
        historicalVolumeSignal === "HIGH_VOLUME" ||
        historicalVolumeSignal === "STRONG_VOLUME"
    ) {
        buyThreshold -= 0.08;
        sellThreshold += 0.08;
    }

    if (defensiveFlags?.isFailToHH || defensiveFlags?.isFailToLL) {
        buyThreshold += 0.06;
        sellThreshold -= 0.06;
    }

    buyThreshold += toNum(adaptiveScoreDelta, 0);
    sellThreshold -= toNum(adaptiveScoreDelta, 0);

    return {
        buyThreshold: Number(buyThreshold.toFixed(4)),
        sellThreshold: Number(sellThreshold.toFixed(4)),
    };
}

function computeAdaptiveScoreDelta({
    recentPerformance = null,
    mode = "NORMAL",
} = {}) {
    const sampleCount = toNum(recentPerformance?.sampleCount, 0);

    if (sampleCount < 6) return 0;

    const winRate = toNum(recentPerformance?.winRate, 0);
    const lossStreak = toNum(recentPerformance?.lossStreak, 0);
    const profitFactor = toNum(recentPerformance?.profitFactor, 1);

    let delta = 0;

    if (winRate < 0.40) delta += mode === "SCALP" ? 0.10 : 0.14;
    if (profitFactor < 1.0) delta += mode === "SCALP" ? 0.06 : 0.08;
    if (lossStreak >= 3) delta += mode === "SCALP" ? 0.08 : 0.10;

    return Number(delta.toFixed(4));
}

function buildScoreComponents({
    market = {},
    pattern = null,
    trendContext = null,
    microTrend = "NEUTRAL",
    historicalVolumeSignal = "NORMAL_VOLUME",
    defensiveFlags = {},
} = {}) {
    const patternDirection = resolvePatternDirection(pattern);
    const patternScore = resolvePatternScore(pattern);

    const components = {
        pattern: 0,
        trendAlignment: 0,
        microTrend: 0,
        volume: 0,
        structure: 0,
        defensivePenalty: 0,
    };

    if (patternDirection === "BUY") {
        components.pattern += Math.abs(patternScore || 0);
    } else if (patternDirection === "SELL") {
        components.pattern -= Math.abs(patternScore || 0);
    }

    if (trendContext?.overallTrend === "BUY") {
        components.trendAlignment += 0.60;
    } else if (trendContext?.overallTrend === "SELL") {
        components.trendAlignment -= 0.60;
    }

    if (microTrend === "BULLISH") {
        components.microTrend += 0.28;
    } else if (microTrend === "BEARISH") {
        components.microTrend -= 0.28;
    }

    if (
        historicalVolumeSignal === "HIGH_VOLUME" ||
        historicalVolumeSignal === "STRONG_VOLUME"
    ) {
        if (patternDirection === "BUY") components.volume += 0.16;
        if (patternDirection === "SELL") components.volume -= 0.16;
    } else if (historicalVolumeSignal === "LOW_VOLUME") {
        const isGold = String(market?.symbol || "")
            .toUpperCase()
            .includes("XAU");

        const penalty = isGold ? 0.12 : 0.22;
        if (patternDirection === "BUY") components.volume -= penalty;
        if (patternDirection === "SELL") components.volume += penalty;
    }

    if (defensiveFlags?.retestingSupport && patternDirection === "BUY") {
        components.structure += 0.22;
    }
    if (defensiveFlags?.retestingResistance && patternDirection === "SELL") {
        components.structure -= 0.22;
    }

    if (defensiveFlags?.isFailToHH && patternDirection === "BUY") {
        components.defensivePenalty -= 0.26;
    }
    if (defensiveFlags?.isFailToLL && patternDirection === "SELL") {
        components.defensivePenalty += 0.26;
    }

    return components;
}

function sumScoreComponents(components = {}) {
    return Object.values(components).reduce((acc, n) => acc + toNum(n, 0), 0);
}

// --------------------------------------------------
// Main evaluator
// --------------------------------------------------
async function evaluateDecision({
    news = null,
    calendar = null,
    session = null,
    risk = null,
    pattern = null,
    ictContext = null,
    historicalVolume = null,
    market = {},
    recentPerformance = null,
    tradingPreferences = null,
} = {}) {
    const candles = normalizeCandles(market?.candles || []);
    const symbol = String(market?.symbol || "").toUpperCase();

    const trendContext =
        pattern?.higherTfContext && typeof pattern.higherTfContext === "object"
            ? {
                primary: pattern.higherTfContext.primary,
                secondary: pattern.higherTfContext.secondary,
                overallTrend:
                    pattern.higherTfContext.overallDirection || "NEUTRAL",
                trendStrength: pattern.higherTfContext.strength || "WEAK",
                volumeConfirmed: Boolean(pattern.higherTfContext.volumeConfirmed),
                isRanging:
                    String(pattern.higherTfContext.overallDirection || "NEUTRAL") ===
                    "NEUTRAL",
                source: pattern.higherTfContext.source || "M15_M30",
            }
            : resolveTrendContext(market);

    const microTrend = resolveMicroTrend(candles);
    const defensiveFlags = resolveDefensiveFlags(pattern, market);

    const mode = resolveMode({
        trendContext,
        microTrend,
        defensiveFlags,
        pattern,
    });

    const adaptiveScoreDelta = computeAdaptiveScoreDelta({
        recentPerformance,
        mode,
    });

    const historicalVolumeSignal = resolveHistoricalVolumeSignal({
        candles,
        historicalVolume,
        pattern,
    });

    const thresholdContext = getDynamicThresholdContext({
        mode,
        trend: trendContext?.overallTrend || "NEUTRAL",
        adaptiveScoreDelta,
        historicalVolumeSignal,
        defensiveFlags,
        symbol,
    });

    const patternDirection = resolvePatternDirection(pattern);
    const patternType = resolvePatternType(pattern);

    const components = buildScoreComponents({
        market,
        pattern,
        trendContext,
        microTrend,
        historicalVolumeSignal,
        defensiveFlags,
    });

    let score = sumScoreComponents(components);
    score = Number(score.toFixed(4));

    let finalDecision = "NO_TRADE";

    if (score >= thresholdContext.buyThreshold) {
        finalDecision = "ALLOW_BUY";
    } else if (score <= thresholdContext.sellThreshold) {
        finalDecision = "ALLOW_SELL";
    }

    const prefs = normalizeTradingPreferences(tradingPreferences);

    if (!isTradingEngineEnabled(prefs)) {
        finalDecision = "NO_TRADE";
    }

    const biasApplied = enforceDirectionBiasOnDecision({
        finalDecision,
        tradingPreferences: prefs,
    });
    finalDecision = biasApplied.finalDecision;

    if (
        isOpenDecision(finalDecision) &&
        isMaxOpenPositionsReached({
            tradingPreferences: prefs,
            currentOpenPositionsCount:
                market?.portfolio?.count ?? market?.currentOpenPositionsCount ?? 0,
        })
    ) {
        finalDecision = "NO_TRADE";
    }

    return {
        symbol,
        mode,
        trend: trendContext?.overallTrend || "NEUTRAL",
        trendContext,
        microTrend,
        pattern: patternDirection === "NEUTRAL" ? "NONE" : pattern?.pattern || "NONE",
        patternType,
        score,
        adaptiveScoreDelta,
        historicalVolumeSignal,
        thresholdContext,
        finalDecision,
        components,
        defensiveFlags,
        sessionName: session?.name || "UNKNOWN",
        tradingPreferences: prefs,
        reason:
            biasApplied.blockedReason ||
            (finalDecision === "NO_TRADE" ? "THRESHOLD_NOT_MET" : "SIGNAL_CONFIRMED"),
    };
}

// --------------------------------------------------
// Compatibility helpers
// --------------------------------------------------
function decision(evaluateResult = {}) {
    return {
        action: evaluateResult?.finalDecision || "NO_TRADE",
        score: toNum(evaluateResult?.score, 0),
        mode: evaluateResult?.mode || "SCALP",
        trend: evaluateResult?.trend || "NEUTRAL",
        pattern: evaluateResult?.pattern || "NONE",
        patternType: evaluateResult?.patternType || "None",
        adaptiveScoreDelta: toNum(evaluateResult?.adaptiveScoreDelta, 0),
        historicalVolumeSignal:
            evaluateResult?.historicalVolumeSignal || "NORMAL_VOLUME",
        thresholdContext: evaluateResult?.thresholdContext || {
            buyThreshold: 2.05,
            sellThreshold: -2.05,
        },
        finalDecision: evaluateResult?.finalDecision || "NO_TRADE",
        defensiveFlags: evaluateResult?.defensiveFlags || {},
        components: evaluateResult?.components || {},
    };
}

function resolveDecisionWithTradingPreferences({
    evaluateResult = {},
    tradingPreferences = null,
    currentOpenPositionsCount = 0,
} = {}) {
    const prefs = normalizeTradingPreferences(tradingPreferences);

    let finalDecision = evaluateResult?.finalDecision || "NO_TRADE";
    let blockedReason = null;

    if (!isTradingEngineEnabled(prefs)) {
        finalDecision = "NO_TRADE";
        blockedReason = "ENGINE_DISABLED";
    }

    if (!blockedReason) {
        const enforced = enforceDirectionBiasOnDecision({
            finalDecision,
            tradingPreferences: prefs,
        });

        finalDecision = enforced.finalDecision;
        blockedReason = enforced.blockedReason;
    }

    if (
        !blockedReason &&
        isOpenDecision(finalDecision) &&
        isMaxOpenPositionsReached({
            tradingPreferences: prefs,
            currentOpenPositionsCount,
        })
    ) {
        finalDecision = "NO_TRADE";
        blockedReason = "MAX_OPEN_POSITIONS_REACHED";
    }

    return {
        ...evaluateResult,
        finalDecision,
        blockedReason,
        tradingPreferences: prefs,
    };
}

module.exports = {
    evaluateDecision,
    decision,
    resolveDecisionWithTradingPreferences,

    // helper export เผื่อ debug
    normalizeTradingPreferences,
    isTradingEngineEnabled,
    isOpenDecision,
    isMaxOpenPositionsReached,
    enforceDirectionBiasOnDecision,
};