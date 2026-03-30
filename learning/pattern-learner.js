const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { getHistoryLearnWeight } = require("../tradeHistory.repo")

function buildPatternKey(trade) {
    return [
        trade.pattern_type || "UNKNOWN_PATTERN",
        trade.trigger_pattern || "UNKNOWN_TRIGGER",
        trade.micro_trend || "UNKNOWN_TREND",
        trade.volume_profile || "UNKNOWN_VOLUME",
        trade.range_state || "UNKNOWN_RANGE",
        trade.session_name || "UNKNOWN_SESSION",
        trade.side || "UNKNOWN_SIDE",
        trade.mode || "NORMAL"
    ].join("|");
}

async function learnPatternWeights() {
    const history = await getHistoryLearnWeight();
    const stats = {};
    history.forEach(trade => {

        if (!stats[trade.pattern]) {
            stats[trade.pattern] = {
                win: 0,
                loss: 0
            };
        }

        if (trade.result === "WIN") {
            stats[trade.pattern].win++;
        } else {
            stats[trade.pattern].loss++;
        }

    });

    const weights = {};
    const upsertSql = `
        INSERT INTO strategy_weights (pattern_name, weight_score)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE 
            weight_score = VALUES(weight_score),
            total_trades = VALUES(total_trades),
            last_updated = NOW()
    `;

    for (const pattern in stats) {
        const { win, loss, total } = stats[pattern];
        const winRate = win / (win + loss);
        const score = (winRate - 0.5) * 10;
        const finalScore = Number(score.toFixed(2));
        weights[pattern] = finalScore;

        try {
            // บันทึกลง MySQL
            await query(upsertSql, [pattern, finalScore]);
        } catch (err) {
            console.error(`[Learning] Failed to save weight for ${patternName}:`, err.message);
        }
    }
    return weights;

}

module.exports = { learnPatternWeights };