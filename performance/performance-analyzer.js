const fs = require("fs");
const path = require("path");

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

function analyzePerformance() {
    const historyFile = path.join(__dirname, "../data/trade-history.json");
    const stateFile = path.join(__dirname, "./performance-state.json");
    const weightFile = path.join(__dirname, "../learning/pattern-weight.json");

    const history = safeReadJson(historyFile, []);

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

    fs.writeFileSync(stateFile, JSON.stringify(result, null, 2), "utf8");
    fs.writeFileSync(weightFile, JSON.stringify(patternWeights, null, 2), "utf8");

    return result;
}

module.exports = { analyzePerformance };
