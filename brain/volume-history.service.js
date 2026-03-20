const fs = require("fs");
const path = require("path");

function getHistoricalVolumeContext({
    firebaseUserId = null,
    symbol,
    lookbackRecords = 200
}) {
    try {
        const filePath = path.join(__dirname, "data", "candle_training_data.json");

        if (!fs.existsSync(filePath)) {
            return {
                avgVolume: 0,
                maxVolume: 0,
                minVolume: 0,
                sampleSize: 0,
                status: "NO_DATA",
                ratio: 0
            };
        }

        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw) {
            return {
                avgVolume: 0,
                maxVolume: 0,
                minVolume: 0,
                sampleSize: 0,
                status: "NO_DATA",
                ratio: 0
            };
        }

        const logs = JSON.parse(raw);

        const filtered = logs
            .filter((item) => {
                const sameUser = firebaseUserId
                    ? String(item.firebaseUserId || item.userId || "") === String(firebaseUserId)
                    : true;

                const sameSymbol = String(item.symbol || "") === String(symbol || "");
                return sameUser && sameSymbol;
            })
            .slice(-lookbackRecords);

        const volumes = [];

        for (const item of filtered) {
            if (!Array.isArray(item.candles)) continue;

            for (const candle of item.candles) {
                const v = Number(candle.tick_volume || 0);
                if (v > 0) volumes.push(v);
            }
        }

        if (volumes.length === 0) {
            return {
                avgVolume: 0,
                maxVolume: 0,
                minVolume: 0,
                sampleSize: 0,
                status: "NO_DATA",
                ratio: 0
            };
        }

        const sum = volumes.reduce((a, b) => a + b, 0);
        const avgVolume = sum / volumes.length;
        const maxVolume = Math.max(...volumes);
        const minVolume = Math.min(...volumes);

        return {
            avgVolume: Number(avgVolume.toFixed(2)),
            maxVolume,
            minVolume,
            sampleSize: volumes.length,
            status: "READY",
            ratio: 1
        };
    } catch (error) {
        console.error("getHistoricalVolumeContext error:", error.message);
        return {
            avgVolume: 0,
            maxVolume: 0,
            minVolume: 0,
            sampleSize: 0,
            status: "ERROR",
            ratio: 0
        };
    }
}

function evaluateCurrentVolumeAgainstHistory({
    firebaseUserId = null,
    symbol,
    candles = []
}) {
    const history = getHistoricalVolumeContext({
        firebaseUserId,
        symbol
    });

    if (!Array.isArray(candles) || candles.length === 0) {
        return {
            ...history,
            currentVolume: 0,
            ratio: 0,
            signal: "NO_CURRENT_DATA"
        };
    }

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : null;

    const currentVolume = Math.max(
        Number(lastCandle?.tick_volume || 0),
        Number(prevCandle?.tick_volume || 0)
    );

    if (!history.avgVolume || history.avgVolume <= 0) {
        return {
            ...history,
            currentVolume,
            ratio: 0,
            signal: "NO_HISTORY"
        };
    }

    const ratio = currentVolume / history.avgVolume;

    let signal = "NORMAL";

    if (ratio >= 2.0) signal = "HISTORICAL_CLIMAX";
    else if (ratio >= 1.3) signal = "ABOVE_AVERAGE";
    else if (ratio <= 0.7) signal = "LOW_VOLUME";

    return {
        ...history,
        currentVolume,
        ratio: Number(ratio.toFixed(2)),
        signal
    };
}

module.exports = {
    getHistoricalVolumeContext,
    evaluateCurrentVolumeAgainstHistory
};