const fs = require("fs");
const path = require("path");
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
            open: toNum(c.open),
            high: toNum(c.high),
            low: toNum(c.low),
            close: toNum(c.close),
            tick_volume: toNum(c.tick_volume),
        }));
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
    };
}

function resolveHigherTimeframeContext(signal = {}) {
    const candlesM15 = normalizeCandles(signal.candles_m15 || signal.candlesM15 || []);
    const candlesM30 = normalizeCandles(signal.candles_m30 || signal.candlesM30 || []);
    const candlesH1 = normalizeCandles(signal.candles_h1 || signal.candlesH1 || []);
    const candlesH4 = normalizeCandles(signal.candles_h4 || signal.candlesH4 || []);

    // ใช้ M15/M30 เป็น HTF หลักก่อน
    const primary = candlesM15.length > 0
        ? analyzeHigherTimeframeFollow(candlesM15, "M15")
        : analyzeHigherTimeframeFollow([], "M15");

    const secondary = candlesM30.length > 0
        ? analyzeHigherTimeframeFollow(candlesM30, "M30")
        : analyzeHigherTimeframeFollow([], "M30");

    // เผื่อเปิดใช้ทีหลัง
    // const fallbackPrimary = candlesH1.length > 0
    //   ? analyzeHigherTimeframeFollow(candlesH1, "H1")
    //   : analyzeHigherTimeframeFollow([], "H1");
    //
    // const fallbackSecondary = candlesH4.length > 0
    //   ? analyzeHigherTimeframeFollow(candlesH4, "H4")
    //   : analyzeHigherTimeframeFollow([], "H4");

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
        source: "M15_M30",
        fallbackDisabled: true,
        // h1: fallbackPrimary,
        // h4: fallbackSecondary,
    };
}

function applyHigherTimeframeScoreAdjustment(score, result, higherTfContext) {
    let adjustedScore = Number(score || 0);

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
            adjustedScore += patternDirection === "BUY" ? 0.45 : -0.45;
        } else {
            adjustedScore += patternDirection === "BUY" ? 0.20 : -0.20;
        }
    } else if (overallDirection !== "NEUTRAL" && overallDirection !== patternDirection) {
        if (strength === "STRONG") {
            adjustedScore += patternDirection === "BUY" ? -0.55 : 0.55;
        } else {
            adjustedScore += patternDirection === "BUY" ? -0.25 : 0.25;
        }
    }

    return Number(adjustedScore.toFixed(4));
}

async function analyzePattern(signal) {
    const weights = await loadWeightsFromDB(signal.symbol);

    const result = detectMotherFishPattern({
        candles: signal.candles || [signal.prevCandle, signal.currentCandle].filter(Boolean),
    });

    const higherTfContext = resolveHigherTimeframeContext(signal);

    let score = 0;

    if (result.pattern === "CLAW_BUY" && result.type === "Rocket_Surge_Continuation") {
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
        score = 2;
    } else if (result.pattern === "CLAW_SELL") {
        score = -2;
    }

    if (score === 0) {
        return {
            pattern: "NONE",
            type: "None",
            score: 0,
            strength: 0,
            structure: result.structure,
            higherTfContext,
        };
    }

    const weightKey = weights[result.type] ? result.type : result.pattern;
    if (weights[weightKey]) {
        score += score > 0 ? weights[weightKey] : -weights[weightKey];
    }

    if (signal.overlapPips && signal.overlapPips <= 200 && score !== 0) {
        score = score * 1.5;
    }

    // เพิ่ม/ลดคะแนนตาม M15/M30 ก่อน
    score = applyHigherTimeframeScoreAdjustment(score, result, higherTfContext);

    let isVolumeClimax = false;
    let isVolumeDrying = false;
    let recentMassiveBear = false;
    let recentMassiveBull = false;

    const candles = signal.candles || [];
    const trendFollow4 = analyzeM5FourCandleFollow(candles);

    if (candles.length >= 7) {
        let totalVol = 0;
        let count = 0;

        let useCandles = candles.length - 15;
        if (useCandles < 0) useCandles = 0;

        for (let i = useCandles; i < candles.length - 2; i++) {
            if (i >= 0 && candles[i].tick_volume) {
                totalVol += Number(candles[i].tick_volume);
                count++;
            }
        }

        const avgVol = count > 0 ? totalVol / count : 0;
        const currVol = candles[candles.length - 1]
            ? Number(candles[candles.length - 1].tick_volume || 0)
            : 0;
        const prevVol = candles[candles.length - 2]
            ? Number(candles[candles.length - 2].tick_volume || 0)
            : 0;

        const triggerVol = Math.max(currVol, prevVol);

        if (avgVol > 0 && triggerVol >= avgVol * 1.5) {
            isVolumeClimax = true;
        } else if (avgVol > 0 && triggerVol < avgVol * 0.6) {
            isVolumeDrying = true;
        }

        for (let i = candles.length - 3; i < candles.length; i++) {
            if (i >= 0) {
                const c = candles[i];
                const body = Math.abs(c.close - c.open);
                const isBear = c.close < c.open;
                const isBull = c.close > c.open;

                if (body > 2.0 && c.tick_volume > avgVol * 1.5) {
                    if (isBear) recentMassiveBear = true;
                    if (isBull) recentMassiveBull = true;
                }
            }
        }
    }

    return {
        pattern: result.pattern,
        type: result.type || "Unknown",
        score: Number(score.toFixed(4)),
        trendFollow4,
        higherTfContext,
        strength: result.strength || 0,
        structure: result.structure,
        slPrice: result.slPrice,
        tpPrice: result.tpPrice,
        isVolumeClimax,
        isVolumeDrying,
        recentMassiveBear,
        recentMassiveBull,
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