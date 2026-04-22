const { query } = require("../db");
const { detectMotherFishPattern } = require("./pattern-rules");

const initialDefaultWeights = {
    CLAW_BUY: 0,
    CLAW_SELL: 0,
    Rocket_Surge_Continuation: 0,
    Waterfall_Drop_Continuation: 0,
    Ascending_Triangle_Breakout: 0,
    Descending_Triangle_Breakdown: 0,
};

function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeCandles(input = []) {
    if (!Array.isArray(input)) return [];
    return input
        .filter(
            (c) =>
                c &&
                Number.isFinite(Number(c.open)) &&
                Number.isFinite(Number(c.high)) &&
                Number.isFinite(Number(c.low)) &&
                Number.isFinite(Number(c.close))
        )
        .map((c) => ({
            ...c,
            open: toNum(c.open),
            high: toNum(c.high),
            low: toNum(c.low),
            close: toNum(c.close),
            tick_volume: toNum(c.tick_volume),
            structure:
                c && typeof c.structure === "object" && c.structure !== null
                    ? { ...c.structure }
                    : {},
        }));
}

function getCandleBody(c = {}) {
    return Math.abs(toNum(c.close) - toNum(c.open));
}

function getCandleRange(c = {}) {
    return Math.abs(toNum(c.high) - toNum(c.low));
}

function isBull(c = {}) {
    return toNum(c.close) > toNum(c.open);
}

function isBear(c = {}) {
    return toNum(c.close) < toNum(c.open);
}

function getBreakoutDirectionFromContexts(baseResult = {}, softContext = {}) {
    const candidates = [
        String(baseResult?.type || ""),
        String(baseResult?.pattern || ""),
        String(softContext?.type || ""),
        String(softContext?.pattern || ""),
    ]
        .join(" ")
        .toUpperCase();

    if (
        candidates.includes("BREAKOUT") ||
        candidates.includes("SURGE_CONTINUATION") ||
        candidates.includes("FIRST_LEG_BREAKOUT") ||
        candidates.includes("CLAW_BUY")
    ) {
        return "BUY";
    }

    if (
        candidates.includes("BREAKDOWN") ||
        candidates.includes("DROP_CONTINUATION") ||
        candidates.includes("FIRST_LEG_BREAKDOWN") ||
        candidates.includes("CLAW_SELL")
    ) {
        return "SELL";
    }

    return "NEUTRAL";
}

function isBreakoutLikeContext(baseResult = {}, softContext = {}) {
    const text = [
        String(baseResult?.type || ""),
        String(baseResult?.pattern || ""),
        String(softContext?.type || ""),
        String(softContext?.pattern || ""),
    ]
        .join(" ")
        .toUpperCase();

    return (
        text.includes("BREAKOUT") ||
        text.includes("BREAKDOWN") ||
        text.includes("CONTINUATION") ||
        text.includes("FIRST_LEG_BREAKOUT") ||
        text.includes("FIRST_LEG_BREAKDOWN")
    );
}

function analyzeBreakoutRetestState(candles = [], baseResult = {}, softContext = {}) {
    const safe = normalizeCandles(candles);
    const len = safe.length;

    const empty = {
        direction: "NEUTRAL",
        isBreakoutLike: false,
        breakoutLevel: null,
        breakoutZoneHigh: null,
        breakoutZoneLow: null,
        breakoutCandleIndex: -1,
        breakoutDetected: false,
        freshBreakout: false,
        barsSinceBreakout: null,
        hasRetest: false,
        retestTouched: false,
        retestAccepted: false,
        retestRejected: false,
        retestCandleIndex: -1,
        retestDepth: 0,
        retestDistance: 0,
    };

    if (len < 4) return empty;

    const direction = getBreakoutDirectionFromContexts(baseResult, softContext);
    const breakoutLike = isBreakoutLikeContext(baseResult, softContext);

    if (!breakoutLike || direction === "NEUTRAL") {
        return {
            ...empty,
            direction,
            isBreakoutLike: breakoutLike,
        };
    }

    const last = safe[len - 1];
    const prev = safe[len - 2];

    let breakoutCandleIndex = -1;
    let breakoutLevel = null;

    for (let i = 3; i < len; i++) {
        const c = safe[i];
        const ref = safe.slice(Math.max(0, i - 3), i);

        if (ref.length < 3) continue;

        const refHigh = Math.max(...ref.map((x) => toNum(x.high)));
        const refLow = Math.min(...ref.map((x) => toNum(x.low)));

        if (direction === "BUY") {
            const broke = toNum(c.close) > refHigh && isBull(c);
            if (broke) {
                breakoutCandleIndex = i;
                breakoutLevel = refHigh;
            }
        } else if (direction === "SELL") {
            const broke = toNum(c.close) < refLow && isBear(c);
            if (broke) {
                breakoutCandleIndex = i;
                breakoutLevel = refLow;
            }
        }
    }

    if (breakoutCandleIndex < 0 || breakoutLevel === null) {
        return {
            ...empty,
            direction,
            isBreakoutLike: breakoutLike,
        };
    }

    const breakoutCandle = safe[breakoutCandleIndex];
    const breakoutRange = Math.max(getCandleRange(breakoutCandle), 0.00001);
    const zoneBuffer = breakoutRange * 0.18;

    let breakoutZoneHigh = breakoutLevel;
    let breakoutZoneLow = breakoutLevel;

    if (direction === "BUY") {
        breakoutZoneLow = breakoutLevel - zoneBuffer;
        breakoutZoneHigh = breakoutLevel + zoneBuffer;
    } else {
        breakoutZoneLow = breakoutLevel - zoneBuffer;
        breakoutZoneHigh = breakoutLevel + zoneBuffer;
    }

    let hasRetest = false;
    let retestTouched = false;
    let retestAccepted = false;
    let retestRejected = false;
    let retestCandleIndex = -1;
    let retestDepth = 0;
    let retestDistance = 0;

    for (let i = breakoutCandleIndex + 1; i < len; i++) {
        const c = safe[i];

        if (direction === "BUY") {
            const touched = toNum(c.low) <= breakoutZoneHigh && toNum(c.low) >= breakoutZoneLow;
            const deepTouched = toNum(c.low) < breakoutZoneLow && toNum(c.high) >= breakoutZoneLow;
            const accepted = touched && toNum(c.close) >= breakoutLevel;
            const rejected = toNum(c.close) < breakoutZoneLow;

            if (touched || deepTouched) {
                hasRetest = true;
                retestTouched = true;
                retestCandleIndex = i;
                retestDistance = Math.abs(toNum(c.low) - breakoutLevel);
                retestDepth =
                    breakoutRange > 0
                        ? Number((retestDistance / breakoutRange).toFixed(4))
                        : 0;

                if (accepted) retestAccepted = true;
                if (rejected) retestRejected = true;
                break;
            }
        } else if (direction === "SELL") {
            const touched = toNum(c.high) >= breakoutZoneLow && toNum(c.high) <= breakoutZoneHigh;
            const deepTouched = toNum(c.high) > breakoutZoneHigh && toNum(c.low) <= breakoutZoneHigh;
            const accepted = touched && toNum(c.close) <= breakoutLevel;
            const rejected = toNum(c.close) > breakoutZoneHigh;

            if (touched || deepTouched) {
                hasRetest = true;
                retestTouched = true;
                retestCandleIndex = i;
                retestDistance = Math.abs(toNum(c.high) - breakoutLevel);
                retestDepth =
                    breakoutRange > 0
                        ? Number((retestDistance / breakoutRange).toFixed(4))
                        : 0;

                if (accepted) retestAccepted = true;
                if (rejected) retestRejected = true;
                break;
            }
        }
    }

    const barsSinceBreakout =
        breakoutCandleIndex >= 0 ? Math.max(0, len - 1 - breakoutCandleIndex) : null;

    const freshBreakout =
        breakoutCandleIndex >= 0 &&
        barsSinceBreakout !== null &&
        barsSinceBreakout <= 1 &&
        !hasRetest;

    return {
        direction,
        isBreakoutLike: breakoutLike,
        breakoutLevel: Number(breakoutLevel.toFixed(5)),
        breakoutZoneHigh: Number(breakoutZoneHigh.toFixed(5)),
        breakoutZoneLow: Number(breakoutZoneLow.toFixed(5)),
        breakoutCandleIndex,
        breakoutDetected: true,
        freshBreakout,
        barsSinceBreakout,
        hasRetest,
        retestTouched,
        retestAccepted,
        retestRejected,
        retestCandleIndex,
        retestDepth: Number(toNum(retestDepth).toFixed(4)),
        retestDistance: Number(toNum(retestDistance).toFixed(5)),
    };
}

function getSoftPatternContext(candles = [], higherTfContext = {}) {
    const safe = normalizeCandles(candles);
    const last = safe[safe.length - 1];
    const prev = safe[safe.length - 2];
    const prev2 = safe[safe.length - 3];

    if (!last || !prev) {
        return {
            pattern: "NONE",
            type: "None",
            score: 0,
            strength: 0,
            bias: "NEUTRAL",
            structure: {},
            isVolumeClimax: false,
            isVolumeDrying: false,
            recentMassiveBear: false,
            recentMassiveBull: false,
            trendFollow4: analyzeM5FourCandleFollow(safe),
        };
    }

    const toNumSafe = (v) => Number(v || 0);
    const body = (c) => Math.abs(toNumSafe(c.close) - toNumSafe(c.open));
    const range = (c) => Math.abs(toNumSafe(c.high) - toNumSafe(c.low));

    const avgBody = (() => {
        const sample = safe.slice(Math.max(0, safe.length - 10), safe.length - 1);
        if (!sample.length) return 0;
        return sample.reduce((sum, c) => sum + body(c), 0) / sample.length;
    })();

    const avgVol = (() => {
        const sample = safe.slice(Math.max(0, safe.length - 15), safe.length - 1);
        const vols = sample.map((c) => Number(c?.tick_volume || 0)).filter((v) => v > 0);
        if (!vols.length) return 0;
        return vols.reduce((sum, v) => sum + v, 0) / vols.length;
    })();

    const currVol = Number(last?.tick_volume || 0);
    const prevVol = Number(prev?.tick_volume || 0);
    const triggerVol = Math.max(currVol, prevVol);

    const isVolumeClimax = avgVol > 0 && triggerVol >= avgVol * 1.45;
    const isVolumeDrying = avgVol > 0 && triggerVol < avgVol * 0.65;

    let recentMassiveBear = false;
    let recentMassiveBull = false;
    for (let i = Math.max(0, safe.length - 3); i < safe.length; i++) {
        const c = safe[i];
        if (!c) continue;
        const cBody = body(c);
        if (cBody > Math.max(1.8, avgBody * 1.35) && Number(c.tick_volume || 0) > avgVol * 1.35) {
            if (isBear(c)) recentMassiveBear = true;
            if (isBull(c)) recentMassiveBull = true;
        }
    }

    const lastBody = body(last);
    const lastRange = range(last) || 1;
    const lowerWick = Math.min(toNumSafe(last.open), toNumSafe(last.close)) - toNumSafe(last.low);
    const upperWick = toNumSafe(last.high) - Math.max(toNumSafe(last.open), toNumSafe(last.close));
    const closeNearHigh = (toNumSafe(last.high) - toNumSafe(last.close)) <= lastRange * 0.20;
    const closeNearLow = (toNumSafe(last.close) - toNumSafe(last.low)) <= lastRange * 0.20;

    const bullishReversal =
        (
            lowerWick > lastBody * 1.25 &&
            closeNearHigh &&
            (isBull(last) || toNumSafe(last.close) >= toNumSafe(prev.open))
        ) ||
        (
            isBull(last) &&
            isBear(prev) &&
            toNumSafe(last.close) > toNumSafe(prev.high)
        );

    const bearishReversal =
        (
            upperWick > lastBody * 1.25 &&
            closeNearLow &&
            (isBear(last) || toNumSafe(last.close) <= toNumSafe(prev.open))
        ) ||
        (
            isBear(last) &&
            isBull(prev) &&
            toNumSafe(last.close) < toNumSafe(prev.low)
        );

    const structureCtx = last?.structure || {};
    const microTrend = String(structureCtx?.microTrend || "NEUTRAL").toUpperCase();
    const hasRetestSupport = Boolean(structureCtx?.isRetestingSupport);
    const hasRetestResistance = Boolean(structureCtx?.isRetestingResistance);

    const firstLegBreakBuy =
        isBull(last) &&
        lastBody >= Math.max(1.2, avgBody * 1.10) &&
        toNumSafe(last.close) > toNumSafe(prev.high);

    const firstLegBreakSell =
        isBear(last) &&
        lastBody >= Math.max(1.2, avgBody * 1.10) &&
        toNumSafe(last.close) < toNumSafe(prev.low);

    const microBull2 =
        isBull(last) &&
        isBull(prev) &&
        toNumSafe(last.close) > toNumSafe(prev.close);

    const microBear2 =
        isBear(last) &&
        isBear(prev) &&
        toNumSafe(last.close) < toNumSafe(prev.close);

    const htfBuy = String(higherTfContext?.overallDirection || "NEUTRAL").toUpperCase() === "BUY";
    const htfSell = String(higherTfContext?.overallDirection || "NEUTRAL").toUpperCase() === "SELL";

    const breakoutBuyContext =
        microTrend === "BULLISH" ||
        microTrend === "BULLISH_REVERSAL" ||
        hasRetestSupport ||
        recentMassiveBull ||
        htfBuy;

    const breakdownSellContext =
        microTrend === "BEARISH" ||
        microTrend === "BEARISH_REVERSAL" ||
        hasRetestResistance ||
        recentMassiveBear ||
        htfSell;

    let score = 0;
    let pattern = "NONE";
    let type = "None";
    let bias = "NEUTRAL";
    let strength = 0;

    if (bullishReversal) {
        score += 1.15;
        pattern = "CLAW_BUY";
        type = "Soft_Bullish_Reversal";
        bias = "BUY";
        strength += 1;
    }

    if (bearishReversal) {
        score -= 1.15;
        pattern = "CLAW_SELL";
        type = "Soft_Bearish_Reversal";
        bias = "SELL";
        strength += 1;
    }

    if (firstLegBreakBuy) {
        const breakoutScore = breakoutBuyContext ? 0.95 : 0.72;
        score += breakoutScore;

        if (pattern === "NONE") {
            pattern = "CLAW_BUY";
            type = "First_Leg_Breakout";
            bias = "BUY";
        }

        strength += breakoutBuyContext ? 0.85 : 0.55;
    }

    if (firstLegBreakSell) {
        const breakdownScore = breakdownSellContext ? 1.05 : 0.72;
        score -= breakdownScore;

        if (pattern === "NONE") {
            pattern = "CLAW_SELL";
            type = "First_Leg_Breakdown";
            bias = "SELL";
        }

        strength += breakdownSellContext ? 0.90 : 0.55;
    }

    if (microBull2 && score > 0) {
        score += 0.35;
        strength += 0.3;
    }

    if (microBear2 && score < 0) {
        score -= 0.35;
        strength += 0.3;
    }

    if (firstLegBreakBuy && breakoutBuyContext && score > 0) {
        score += 0.18;
        strength += 0.15;
    }

    if (firstLegBreakSell && breakdownSellContext && score < 0) {
        score -= 0.22;
        strength += 0.18;
    }

    if (isVolumeClimax && score > 0) score += 0.20;
    if (isVolumeClimax && score < 0) score -= 0.20;

    if (isVolumeDrying && score > 0) score -= 0.10;
    if (isVolumeDrying && score < 0) score += 0.10;

    if (htfBuy && score > 0) score += 0.20;
    if (htfSell && score < 0) score -= 0.20;

    if (htfSell && score > 0) score -= 0.15;
    if (htfBuy && score < 0) score += 0.15;

    const structure = {
        ...(last?.structure || {}),
        bullishReversal,
        bearishReversal,
        firstLegBreakBuy,
        firstLegBreakSell,
    };

    return {
        pattern,
        type,
        score: Number(score.toFixed(4)),
        strength: Number(strength.toFixed(2)),
        bias,
        structure,
        isVolumeClimax,
        isVolumeDrying,
        recentMassiveBear,
        recentMassiveBull,
        trendFollow4: analyzeM5FourCandleFollow(safe),
    };
}

function mergeSoftPatternIntoResult(baseResult = {}, softContext = {}) {
    if (!softContext || !softContext.score) return baseResult;

    return {
        ...baseResult,
        pattern:
            String(baseResult?.pattern || "NONE").toUpperCase() === "NONE"
                ? softContext.pattern
                : baseResult.pattern,
        type:
            String(baseResult?.type || "None") === "None"
                ? softContext.type
                : baseResult.type,
        score: Number((Number(baseResult?.score || 0) + Number(softContext.score || 0)).toFixed(4)),
        strength: Math.max(
            Number(baseResult?.strength || 0),
            Number(softContext?.strength || 0)
        ),
        structure: {
            ...(baseResult?.structure || {}),
            ...(softContext?.structure || {}),
        },
        isVolumeClimax:
            Boolean(baseResult?.isVolumeClimax) || Boolean(softContext?.isVolumeClimax),
        isVolumeDrying:
            Boolean(baseResult?.isVolumeDrying) || Boolean(softContext?.isVolumeDrying),
        recentMassiveBear:
            Boolean(baseResult?.recentMassiveBear) || Boolean(softContext?.recentMassiveBear),
        recentMassiveBull:
            Boolean(baseResult?.recentMassiveBull) || Boolean(softContext?.recentMassiveBull),
        trendFollow4: baseResult?.trendFollow4 || softContext?.trendFollow4 || null,
    };
}

function analyzeM5FourCandleFollow(candles = []) {
    if (!Array.isArray(candles) || candles.length < 4) {
        return {
            direction: "NEUTRAL",
            volumeConfirmed: false,
            strength: "WEAK",
            bullishCount: 0,
            bearishCount: 0,
            recentVolumeAvg: 0,
            priorVolumeAvg: 0,
        };
    }

    const last4 = candles.slice(-4);

    let bullishCount = 0;
    let bearishCount = 0;

    for (const c of last4) {
        if (Number(c.close) > Number(c.open)) bullishCount++;
        if (Number(c.close) < Number(c.open)) bearishCount++;
    }

    const volumes = last4.map((c) => Number(c?.tick_volume || 0));
    const priorVolumeAvg = (volumes[0] + volumes[1]) / 2;
    const recentVolumeAvg = (volumes[2] + volumes[3]) / 2;

    let direction = "NEUTRAL";
    if (bullishCount >= 3) direction = "BUY";
    else if (bearishCount >= 3) direction = "SELL";

    const volumeConfirmed =
        priorVolumeAvg > 0 && recentVolumeAvg >= priorVolumeAvg * 1.10;

    let strength = "WEAK";
    if (direction !== "NEUTRAL" && volumeConfirmed) strength = "STRONG";
    else if (direction !== "NEUTRAL") strength = "MEDIUM";

    return {
        direction,
        volumeConfirmed,
        strength,
        bullishCount,
        bearishCount,
        recentVolumeAvg: Number(recentVolumeAvg.toFixed(2)),
        priorVolumeAvg: Number(priorVolumeAvg.toFixed(2)),
    };
}

function analyzeHigherTimeframeFollow(candles = [], label = "M15") {
    const safeCandles = normalizeCandles(candles);

    if (safeCandles.length < 3) {
        return {
            label,
            direction: "NEUTRAL",
            strength: "WEAK",
            volumeConfirmed: false,
            bullishCount: 0,
            bearishCount: 0,
            avgBody: 0,
            latestBody: 0,
            latestRange: 0,
            recentVolumeAvg: 0,
            priorVolumeAvg: 0,
            momentumBias: "NONE",
            available: false,
        };
    }

    const recent = safeCandles.slice(-3);

    let bullishCount = 0;
    let bearishCount = 0;
    let totalBody = 0;
    let totalRange = 0;

    for (const c of recent) {
        const body = Math.abs(c.close - c.open);
        const range = Math.abs(c.high - c.low);

        totalBody += body;
        totalRange += range;

        if (c.close > c.open) bullishCount++;
        if (c.close < c.open) bearishCount++;
    }

    const latest = recent[recent.length - 1];
    const latestBody = Math.abs(latest.close - latest.open);
    const latestRange = Math.abs(latest.high - latest.low);
    const avgBody = totalBody / recent.length;

    const volumes = recent.map((c) => toNum(c.tick_volume));
    const priorVolumeAvg = (volumes[0] + volumes[1]) / 2;
    const recentVolumeAvg = volumes[2];

    let direction = "NEUTRAL";
    if (bullishCount >= 2) direction = "BUY";
    else if (bearishCount >= 2) direction = "SELL";

    const volumeConfirmed =
        priorVolumeAvg > 0 && recentVolumeAvg >= priorVolumeAvg * 1.05;

    const bodyExpansion = avgBody > 0 ? latestBody / avgBody : 0;
    const rangeExpansion = avgBody > 0 ? latestRange / Math.max(avgBody, 0.00001) : 0;

    let strength = "WEAK";
    if (
        direction !== "NEUTRAL" &&
        volumeConfirmed &&
        bodyExpansion >= 1.15 &&
        rangeExpansion >= 1.05
    ) {
        strength = "STRONG";
    } else if (direction !== "NEUTRAL") {
        strength = "MEDIUM";
    }

    let momentumBias = "NONE";
    if (direction === "BUY" && latest.close > latest.open && bodyExpansion >= 1.1) {
        momentumBias = "BULLISH_IMPULSE";
    } else if (
        direction === "SELL" &&
        latest.close < latest.open &&
        bodyExpansion >= 1.1
    ) {
        momentumBias = "BEARISH_IMPULSE";
    }

    return {
        label,
        direction,
        strength,
        volumeConfirmed,
        bullishCount,
        bearishCount,
        avgBody: Number(avgBody.toFixed(5)),
        latestBody: Number(latestBody.toFixed(5)),
        latestRange: Number(latestRange.toFixed(5)),
        recentVolumeAvg: Number(recentVolumeAvg.toFixed(2)),
        priorVolumeAvg: Number(priorVolumeAvg.toFixed(2)),
        momentumBias,
        available: true,
    };
}

function resolveHigherTimeframeContext(signal = {}) {
    const candlesM15 = normalizeCandles(signal.candles_m15 || signal.candlesM15 || []);
    const candlesM30 = normalizeCandles(signal.candles_m30 || signal.candlesM30 || []);
    const candlesH1 = normalizeCandles(signal.candles_h1 || signal.candlesH1 || []);
    const candlesH4 = normalizeCandles(signal.candles_h4 || signal.candlesH4 || []);

    const hasM15 = candlesM15.length >= 3;
    const hasM30 = candlesM30.length >= 3;
    const isM5OnlyContext = !hasM15 && !hasM30;

    const primary = hasM15
        ? analyzeHigherTimeframeFollow(candlesM15, "M15")
        : analyzeHigherTimeframeFollow([], "M15");

    const secondary = hasM30
        ? analyzeHigherTimeframeFollow(candlesM30, "M30")
        : analyzeHigherTimeframeFollow([], "M30");

    let overallDirection = "NEUTRAL";
    if (
        primary.direction !== "NEUTRAL" &&
        secondary.direction !== "NEUTRAL" &&
        primary.direction === secondary.direction
    ) {
        overallDirection = primary.direction;
    } else if (primary.direction !== "NEUTRAL") {
        overallDirection = primary.direction;
    } else if (secondary.direction !== "NEUTRAL") {
        overallDirection = secondary.direction;
    }

    const volumeConfirmed =
        Boolean(primary.volumeConfirmed) || Boolean(secondary.volumeConfirmed);

    let strength = "WEAK";
    if (
        overallDirection !== "NEUTRAL" &&
        primary.strength === "STRONG" &&
        secondary.strength === "STRONG"
    ) {
        strength = "STRONG";
    } else if (overallDirection !== "NEUTRAL") {
        strength = "MEDIUM";
    }

    return {
        primary,
        secondary,
        overallDirection,
        volumeConfirmed,
        strength,
        source: isM5OnlyContext ? "M5_ONLY" : "M15_M30",
        fallbackDisabled: true,
        isM5OnlyContext,
        hasPrimary: hasM15,
        hasSecondary: hasM30,
        hasH1: candlesH1.length > 0,
        hasH4: candlesH4.length > 0,
    };
}

function applyHigherTimeframeScoreAdjustment(score, result, higherTfContext) {
    let adjustedScore = Number(score || 0);

    if (higherTfContext?.isM5OnlyContext) {
        return adjustedScore;
    }

    const patternDirection =
        result?.pattern === "CLAW_BUY"
            ? "BUY"
            : result?.pattern === "CLAW_SELL"
                ? "SELL"
                : "NEUTRAL";

    if (patternDirection === "NEUTRAL") {
        return adjustedScore;
    }

    const overallDirection = String(higherTfContext?.overallDirection || "NEUTRAL").toUpperCase();
    const strength = String(higherTfContext?.strength || "WEAK").toUpperCase();
    const volumeConfirmed = Boolean(higherTfContext?.volumeConfirmed);

    if (overallDirection === patternDirection) {
        if (strength === "STRONG" && volumeConfirmed) {
            adjustedScore += patternDirection === "BUY" ? 0.50 : -0.50;
        } else {
            adjustedScore += patternDirection === "BUY" ? 0.25 : -0.25;
        }
    } else if (overallDirection !== "NEUTRAL" && overallDirection !== patternDirection) {
        if (strength === "STRONG") {
            adjustedScore += patternDirection === "BUY" ? -0.65 : 0.65;
        } else {
            adjustedScore += patternDirection === "BUY" ? -0.35 : 0.35;
        }
    }

    return Number(adjustedScore.toFixed(4));
}

function shouldUseSymbolWeights(signal = {}) {
    const hasM15 = Array.isArray(signal.candles_m15) && signal.candles_m15.length > 0;
    const hasM30 = Array.isArray(signal.candles_m30) && signal.candles_m30.length > 0;
    const hasH1 = Array.isArray(signal.candles_h1) && signal.candles_h1.length > 0;
    const hasH4 = Array.isArray(signal.candles_h4) && signal.candles_h4.length > 0;

    return hasM15 || hasM30 || hasH1 || hasH4;
}

function getStrictPinBarScore(result = {}) {
    const type = String(result?.type || "").toUpperCase();

    if (type === "STRICT_HAMMER_SUPPORT_REVERSAL") {
        return 2.85;
    }

    if (type === "STRICT_SHOOTING_STAR_RESISTANCE_REVERSAL") {
        return -2.85;
    }

    if (type === "STRICT_PIN_BAR_HAMMER") {
        return 2.45;
    }

    if (type === "STRICT_PIN_BAR_SHOOTING_STAR") {
        return -2.45;
    }

    return 0;
}

async function analyzePattern(signal = {}) {
    const safeCandles = normalizeCandles(
        signal.candles || [signal.prevCandle, signal.currentCandle].filter(Boolean)
    );

    const useWeights = shouldUseSymbolWeights(signal);
    const weights = useWeights
        ? await loadWeightsFromDB(signal.symbol)
        : initialDefaultWeights;

    const result = detectMotherFishPattern({
        candles: safeCandles,
    });

    const higherTfContext = resolveHigherTimeframeContext(signal);
    const softContext = getSoftPatternContext(safeCandles, higherTfContext);

    // let score = 0;

    // if (result.pattern === "CLAW_BUY" && result.type === "Rocket_Surge_Continuation") {
    //     score = 2.5;
    // } else if (
    //     result.pattern === "CLAW_SELL" &&
    //     result.type === "Waterfall_Drop_Continuation"
    // ) {
    //     score = -2.5;
    // } else if (
    //     result.pattern === "CLAW_BUY" &&
    //     result.type === "Ascending_Triangle_Breakout"
    // ) {
    //     score = 2.8;
    // } else if (
    //     result.pattern === "CLAW_SELL" &&
    //     result.type === "Descending_Triangle_Breakdown"
    // ) {
    //     score = -2.8;
    // } else if (result.pattern === "CLAW_BUY") {
    //     score = 2.0;
    // } else if (result.pattern === "CLAW_SELL") {
    //     score = -2.0;
    // }
    let score = 0;

    const strictPinBarScore = getStrictPinBarScore(result);

    if (strictPinBarScore !== 0) {
        score = strictPinBarScore;
    } else if (
        result.pattern === "CLAW_BUY" &&
        result.type === "Rocket_Surge_Continuation"
    ) {
        score = 2.5;
    } else if (
        result.pattern === "CLAW_SELL" &&
        result.type === "Waterfall_Drop_Continuation"
    ) {
        score = -2.5;
    } else if (
        result.pattern === "CLAW_BUY" &&
        result.type === "Ascending_Triangle_Breakout"
    ) {
        score = 2.8;
    } else if (
        result.pattern === "CLAW_SELL" &&
        result.type === "Descending_Triangle_Breakdown"
    ) {
        score = -2.8;
    } else if (result.pattern === "CLAW_BUY") {
        score = 2.0;
    } else if (result.pattern === "CLAW_SELL") {
        score = -2.0;
    }

    const weightKey = weights[result.type] ? result.type : result.pattern;
    if (score !== 0 && weights[weightKey]) {
        score += score > 0 ? weights[weightKey] : -weights[weightKey];
    }

    if (signal.overlapPips && signal.overlapPips <= 200 && score !== 0) {
        score = score * 1.5;
    }

    if (score !== 0) {
        score = applyHigherTimeframeScoreAdjustment(score, result, higherTfContext);
    }

    let isVolumeClimax = false;
    let isVolumeDrying = false;
    let recentMassiveBear = false;
    let recentMassiveBull = false;

    const trendFollow4 = analyzeM5FourCandleFollow(safeCandles);

    if (safeCandles.length >= 7) {
        let totalVol = 0;
        let count = 0;
        let useCandles = safeCandles.length - 15;
        if (useCandles < 0) useCandles = 0;

        for (let i = useCandles; i < safeCandles.length - 2; i++) {
            if (i >= 0 && safeCandles[i].tick_volume) {
                totalVol += Number(safeCandles[i].tick_volume);
                count++;
            }
        }

        const avgVol = count > 0 ? totalVol / count : 0;
        const currVol = safeCandles[safeCandles.length - 1]
            ? Number(safeCandles[safeCandles.length - 1].tick_volume || 0)
            : 0;
        const prevVol = safeCandles[safeCandles.length - 2]
            ? Number(safeCandles[safeCandles.length - 2].tick_volume || 0)
            : 0;
        const triggerVol = Math.max(currVol, prevVol);

        if (avgVol > 0 && triggerVol >= avgVol * 1.5) {
            isVolumeClimax = true;
        } else if (avgVol > 0 && triggerVol < avgVol * 0.6) {
            isVolumeDrying = true;
        }

        for (let i = safeCandles.length - 3; i < safeCandles.length; i++) {
            if (i >= 0) {
                const c = safeCandles[i];
                const body = Math.abs(c.close - c.open);
                const bear = c.close < c.open;
                const bull = c.close > c.open;

                if (body > 2.0 && c.tick_volume > avgVol * 1.5) {
                    if (bear) recentMassiveBear = true;
                    if (bull) recentMassiveBull = true;
                }
            }
        }
    }

    let finalResult = {
        pattern: result.pattern,
        type: result.type || "Unknown",
        score: Number(score.toFixed(4)),
        trendFollow4,
        higherTfContext,
        isM5OnlyContext: higherTfContext.isM5OnlyContext,
        strength: result.strength || 0,
        structure: result.structure,
        slPrice: result.slPrice,
        tpPrice: result.tpPrice,
        isVolumeClimax,
        isVolumeDrying,
        recentMassiveBear,
        recentMassiveBull,
    };

    finalResult = mergeSoftPatternIntoResult(finalResult, softContext);

    const breakoutRetest = analyzeBreakoutRetestState(safeCandles, result, softContext);

    finalResult = {
        ...finalResult,
        breakoutRetest,
        breakoutLevel: breakoutRetest.breakoutLevel,
        breakoutZoneHigh: breakoutRetest.breakoutZoneHigh,
        breakoutZoneLow: breakoutRetest.breakoutZoneLow,
        breakoutDetected: breakoutRetest.breakoutDetected,
        freshBreakout: breakoutRetest.freshBreakout,
        barsSinceBreakout: breakoutRetest.barsSinceBreakout,
        hasRetest: breakoutRetest.hasRetest,
        retestTouched: breakoutRetest.retestTouched,
        retestAccepted: breakoutRetest.retestAccepted,
        retestRejected: breakoutRetest.retestRejected,
        structure: {
            ...(finalResult.structure || {}),
            breakoutRetest,
        },
    };

    if (
        String(finalResult.pattern || "NONE").toUpperCase() === "NONE" &&
        Number(finalResult.score || 0) === 0
    ) {
        return {
            pattern: "NONE",
            type: "None",
            score: 0,
            strength: 0,
            structure: {
                ...(result.structure || {}),
                breakoutRetest,
            },
            higherTfContext,
            isM5OnlyContext: higherTfContext.isM5OnlyContext,
            trendFollow4,
            isVolumeClimax,
            isVolumeDrying,
            recentMassiveBear,
            recentMassiveBull,
            breakoutRetest,
            breakoutLevel: breakoutRetest.breakoutLevel,
            breakoutZoneHigh: breakoutRetest.breakoutZoneHigh,
            breakoutZoneLow: breakoutRetest.breakoutZoneLow,
            breakoutDetected: breakoutRetest.breakoutDetected,
            freshBreakout: breakoutRetest.freshBreakout,
            barsSinceBreakout: breakoutRetest.barsSinceBreakout,
            hasRetest: breakoutRetest.hasRetest,
            retestTouched: breakoutRetest.retestTouched,
            retestAccepted: breakoutRetest.retestAccepted,
            retestRejected: breakoutRetest.retestRejected,
        };
    }

    return {
        ...finalResult,
        score: Number(Number(finalResult.score || 0).toFixed(4)),
    };
}

async function loadWeightsFromDB(symbol) {
    try {
        const sql = `
      SELECT
        symbol,
        pattern_name,
        CASE
          WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
          ELSE weight_score
        END AS weight_score
      FROM strategy_weights
      WHERE symbol = ?
    `;

        const result = await query(sql, [String(symbol || "DEFAULT").toUpperCase()]);
        const rows = Array.isArray(result?.[0]) ? result[0] : result;

        if (Array.isArray(rows) && rows.length > 0) {
            const symbolWeights = {};

            for (const row of rows) {
                symbolWeights[row.pattern_name] = Number(row.weight_score || 0);
            }

            return {
                ...symbolWeights,
            };
        }

        return initialDefaultWeights;
    } catch (err) {
        console.error("[Loader] Load weights error, using defaults:", err.message);
        return initialDefaultWeights;
    }
}

module.exports = { analyzePattern };