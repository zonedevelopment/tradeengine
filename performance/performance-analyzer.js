const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { getTradeEventsForAnalysis } = require("../tradeHistory.repo");

function safeReadJson(file, fallback) {
    try {
        if (!fs.existsSync(file))
            return fallback;
        const raw = fs.readFileSync(file, "utf8").trim();
        if (!raw)
            return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.log("JSON read error:", file);
        return fallback;
    }
}

async function saveSuggestedWeightsToDB(patternWeights, symbol = "DEFAULT") {
    if (!patternWeights) return;

    const entries = Object.entries(patternWeights);
    if (entries.length === 0) return;
    try {
        const upsertSql = `
            INSERT INTO strategy_weights
                (symbol, pattern_name, weight_score, user_score, is_use_user_score, total_trades, last_updated)
            VALUES
                (?, ?, ?, NULL, 0, 0, NOW())
            ON DUPLICATE KEY UPDATE
                weight_score = VALUES(weight_score),
                last_updated = NOW()
        `;

        for (const [name, score] of entries) {
            await query(upsertSql, [String(symbol || "DEFAULT").toUpperCase(), name, score]);
        }

        console.log(`[Performance] Successfully updated ${entries.length} weights in Database for ${symbol}.`);
    } catch (err) {
        console.error("[Performance] Error saving weights to DB:", err.message);
        throw err;
    }
}

async function analyzePerformance(firebaseUserId, symbol, mode) {
    const history = await getTradeEventsForAnalysis({
        firebaseUserId,
        symbol,
        mode,
        limit: 5000
    });

    const summary = {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        winRate: 0,
        patterns: {},
        sessions: {}
    };

    for (const t of history) {
        if (t.type !== "CLOSE_ORDER" && t.type !== "CLOSE_EMERGENCY") continue;

        summary.totalTrades++;
        summary.totalProfit += Number(t.profit || 0);

        if (true) {
            if (t.profit > 0) {
                summary.wins++;
            } else {
                summary.losses++;
            }
        }

        const pattern = t.side || "UNKNOWN";

        if (!summary.patterns[pattern]) {
            summary.patterns[pattern] = {
                trades: 0,
                wins: 0,
                losses: 0,
                profit: 0,
                winRate: 0
            };
        }

        summary.patterns[pattern].trades++;
        summary.patterns[pattern].profit += Number(t.profit || 0);

        if (t.type === "CLOSE_ORDER") {
            if (t.profit > 0) {
                summary.patterns[pattern].wins++;
            } else {
                summary.patterns[pattern].losses++;
            }
        }
    }

    summary.winRate =
        summary.totalTrades > 0
            ? Number(((summary.wins / summary.totalTrades) * 100).toFixed(2))
            : 0;

    for (const key of Object.keys(summary.patterns)) {
        const item = summary.patterns[key];
        item.winRate =
            item.trades > 0
                ? Number(((item.wins / item.trades) * 100).toFixed(2))
                : 0;
    }

    const patternWeights = {};

    for (const key of Object.keys(summary.patterns)) {
        const item = summary.patterns[key];

        if (item.trades < 3) {
            patternWeights[key] = 0;
            continue;
        }

        const rawScore = (item.winRate - 50) / 10; // 60% = +1, 70% = +2
        patternWeights[key] = Number(rawScore.toFixed(2));
    }

    const result = {
        updatedAt: new Date().toISOString(),
        summary,
        suggestedWeights: patternWeights
    };


    try {
        await saveSuggestedWeightsToDB(patternWeights, symbol);

        const stateFile = path.resolve(__dirname, "performance-state.json");
        fs.writeFileSync(stateFile, JSON.stringify(result, null, 2), "utf8");

    } catch (err) {
        console.error("[Performance] Final save failed:", err.message);
    }

    return result;
}

module.exports = { analyzePerformance };
