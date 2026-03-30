const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { detectMotherFishPattern } = require("./pattern-rules");

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

    const volumes = last4.map(c => Number(c?.tick_volume || 0));
    const priorVolumeAvg = (volumes[0] + volumes[1]) / 2;
    const recentVolumeAvg = (volumes[2] + volumes[3]) / 2;

    let direction = "NEUTRAL";
    if (bullishCount >= 3) direction = "BUY";
    else if (bearishCount >= 3) direction = "SELL";

    const volumeConfirmed =
        priorVolumeAvg > 0 &&
        recentVolumeAvg >= priorVolumeAvg * 1.10;

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

async function analyzePattern(signal) {

    const weights = await loadWeightsFromDB(signal.symbol);

    const result = detectMotherFishPattern({
        candles: signal.candles || [signal.prevCandle, signal.currentCandle].filter(Boolean)
    });

    let score = 0;

    if (result.pattern === "CLAW_BUY" && result.type === "Rocket_Surge_Continuation") {
        score = 2.5;
    } else if (result.pattern === "CLAW_SELL" && result.type === "Waterfall_Drop_Continuation") {
        score = -2.5;
    } else if (result.pattern === "CLAW_BUY" && result.type === "Ascending_Triangle_Breakout") {
        score = 2.8;
    } else if (result.pattern === "CLAW_SELL" && result.type === "Descending_Triangle_Breakdown") {
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
            structure: result.structure
        };
    }

    const weightKey = weights[result.type] ? result.type : result.pattern;
    if (weights[weightKey]) {
        score += (score > 0 ? weights[weightKey] : -weights[weightKey]);
    }

    if (signal.overlapPips && signal.overlapPips <= 200 && score !== 0) {
        score = score * 1.5;
    }

    let isVolumeClimax = false;
    let isVolumeDrying = false;
    let recentMassiveBear = false;
    let recentMassiveBull = false;
    const candles = signal.candles || [];

    const trendFollow4 = analyzeM5FourCandleFollow(candles);

    if (candles.length >= 7) {
        let totalVol = 0;
        let count = 0;
        let useCandles = (candles.length - 15);
        for (let i = useCandles; i < useCandles - 2; i++) {
            if (i >= 0 && candles[i].tick_volume) {
                totalVol += Number(candles[i].tick_volume);
                count++;
            }
        }

        const avgVol = count > 0 ? (totalVol / count) : 0;

        const currVol = candles[candles.length - 1] ? Number(candles[candles.length - 1].tick_volume || 0) : 0;
        const prevVol = candles[candles.length - 2] ? Number(candles[candles.length - 2].tick_volume || 0) : 0;

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
        score,
        trendFollow4,
        strength: result.strength || 0,
        structure: result.structure, 
        slPrice: result.slPrice,
        tpPrice: result.tpPrice,
        isVolumeClimax,
        isVolumeDrying,
        recentMassiveBear,
        recentMassiveBull
    };

}

async function loadWeightsFromDB(symbol) {
    try {
        const sql = `
          SELECT pattern_name,
            CASE
              WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
              ELSE weight_score
            END AS weight_score
          FROM strategy_weights
          WHERE symbol = ?
        `;

        const result = await query(sql, [String(symbol || "DEFAULT").toUpperCase()]);
        const rows = Array.isArray(result?.[0]) ? result[0] : result;

        if (rows.length > 0) {
            const defaultWeights = {};
            const symbolWeights = {};

            for (const row of rows) {
                const rowSymbol = String(row.symbol || "DEFAULT").toUpperCase();

                if (rowSymbol === "DEFAULT") {
                    defaultWeights[row.pattern_name] = Number(row.weight_score || 0);
                } else {
                    symbolWeights[row.pattern_name] = Number(row.weight_score || 0);
                }
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

// function loadMotherFishState() {
//     const file = "../research/mother-fish-state.json";
//     if (!fs.existsSync(file)) return null;
//     return JSON.parse(fs.readFileSync(file, "utf8"));
// }

module.exports = { analyzePattern };
