const crypto = require("crypto");

function buildContextHash(data) {
    const base = [
        data.symbol,
        data.timeframe,
        data.side,
        data.mode,
        data.pattern,
        data.patternType,
        data.microTrend,
        data.rangeState,
        data.session
    ].join("|");

    return crypto.createHash("sha256").update(base).digest("hex");
}

module.exports = { buildContextHash };