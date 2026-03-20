const crypto = require("crypto");

function bucketizePoints(points) {
    const p = Number(points || 0);
    if (p <= 0) return "0";
    if (p <= 150) return "0-150";
    if (p <= 300) return "151-300";
    if (p <= 500) return "301-500";
    if (p <= 800) return "501-800";
    return "800+";
}

function getSessionName(date = new Date()) {
    const bangkokHour = (date.getUTCHours() + 7) % 24;
    if (bangkokHour >= 7 && bangkokHour < 14) return "ASIAN";
    if (bangkokHour >= 14 && bangkokHour < 19) return "LONDON";
    if (bangkokHour >= 19 || bangkokHour < 1) return "NEWYORK";
    if (bangkokHour >= 19 && bangkokHour < 23) return "OVERLAP";
    return "UNKNOWN";
}

function getVolumeProfile(candles) {
    if (!Array.isArray(candles) || candles.length < 3) return "UNKNOWN";

    const vols = candles.map((c) => Number(c.tick_volume || 0)).filter((v) => v > 0);
    if (vols.length < 3) return "UNKNOWN";

    const last = vols[vols.length - 1];
    const prev = vols.slice(0, -1);
    const avgPrev = prev.reduce((a, b) => a + b, 0) / (prev.length || 1);

    if (avgPrev <= 0) return "UNKNOWN";
    if (last >= avgPrev * 1.5) return "CLIMAX";
    if (last <= avgPrev * 0.6) return "DRYING";

    const a = vols[vols.length - 3];
    const b = vols[vols.length - 2];
    const c = vols[vols.length - 1];

    if (a < b && b < c) return "INCREASING";
    if (a > b && b > c) return "DECREASING";
    return "MIXED";
}

function getCandleShape(candle) {
    if (!candle) return "UNKNOWN";

    const open = Number(candle.open || 0);
    const close = Number(candle.close || 0);
    const high = Number(candle.high || 0);
    const low = Number(candle.low || 0);

    const body = Math.abs(close - open);
    const range = Math.abs(high - low);
    if (range <= 0) return "UNKNOWN";

    const bodyRatio = body / range;
    const isBull = close > open;
    const isBear = close < open;

    if (bodyRatio < 0.15) return "DOJI";
    if (bodyRatio >= 0.65 && isBull) return "BIG_BULL";
    if (bodyRatio >= 0.65 && isBear) return "BIG_BEAR";
    if (bodyRatio >= 0.35 && isBull) return "MEDIUM_BULL";
    if (bodyRatio >= 0.35 && isBear) return "MEDIUM_BEAR";
    if (isBull) return "SMALL_BULL";
    if (isBear) return "SMALL_BEAR";

    return "UNKNOWN";
}

function buildPrePatternShape(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return "";
    return candles.slice(-5, -2).map(getCandleShape).join(",");
}

function getRangeState(candles) {
    if (!Array.isArray(candles) || candles.length < 3) return "UNKNOWN";

    const ranges = candles.map((c) => Math.abs(Number(c.high || 0) - Number(c.low || 0)));
    const lastRange = ranges[ranges.length - 1];
    const prev = ranges.slice(0, -1);
    const avgPrev = prev.reduce((a, b) => a + b, 0) / (prev.length || 1);

    if (avgPrev <= 0) return "UNKNOWN";
    if (lastRange > avgPrev * 1.4) return "EXPANDING";
    if (lastRange < avgPrev * 0.7) return "CONTRACTING";

    const closes = candles.map((c) => Number(c.close || 0));
    const move = Math.abs(closes[closes.length - 1] - closes[0]);

    if (move > avgPrev * 1.5) return "TRENDING";
    return "RANGING";
}

function buildContextHashNew(features) {
    const raw = JSON.stringify({
        symbol: features.symbol,
        timeframe: features.timeframe,
        side: features.side,
        mode: features.mode,
        triggerPattern: features.triggerPattern,
        patternType: features.patternType,
        microTrend: features.microTrend,
        volumeProfile: features.volumeProfile,
        prePatternShape: features.prePatternShape,
        rangeState: features.rangeState,
        sessionName: features.sessionName,
        slBucket: features.slBucket,
        tpBucket: features.tpBucket,
    });

    return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildContextFeatures({
    symbol,
    timeframe = "M5",
    side,
    mode = "NORMAL",
    pattern,
    marketPrice = 0,
    candles = [],
    now = new Date(),
}) {
    const slPoints =
        pattern && pattern.slPrice && marketPrice
            ? Math.round(Math.abs(Number(marketPrice) - Number(pattern.slPrice)) * 100)
            : 0;

    const tpPoints =
        pattern && pattern.tpPrice && marketPrice
            ? Math.round(Math.abs(Number(pattern.tpPrice) - Number(marketPrice)) * 100)
            : 0;

    return {
        symbol,
        timeframe,
        side,
        mode,
        triggerPattern: pattern?.pattern || "NONE",
        patternType: pattern?.type || "Unknown",
        microTrend: pattern?.structure?.microTrend || "UNKNOWN",
        volumeProfile: getVolumeProfile(candles),
        prePatternShape: buildPrePatternShape(candles),
        rangeState: getRangeState(candles),
        sessionName: getSessionName(now),
        slBucket: bucketizePoints(slPoints),
        tpBucket: bucketizePoints(tpPoints),
    };
}

module.exports = {
    bucketizePoints,
    getSessionName,
    getVolumeProfile,
    buildPrePatternShape,
    getRangeState,
    buildContextHashNew,
    buildContextFeatures,
};