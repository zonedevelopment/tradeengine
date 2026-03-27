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

async function saveSuggestedWeightsToDB(patternWeights) {
    if (!patternWeights) return;

    const entries = Object.entries(patternWeights);
    if (entries.length === 0) return;

    // คำสั่ง SQL สำหรับ Insert หรือ Update ถ้ามีชื่อ Pattern อยู่แล้ว
    // const sql = `
    //     INSERT INTO strategy_weights (pattern_name, weight_score) 
    //     VALUES (?, ?) 
    //     ON DUPLICATE KEY UPDATE 
    //         weight_score = VALUES(weight_score), 
    //         last_updated = NOW()
    // `;

    try {
        const upsertSql = `UPDATE strategy_weights SET weight_score = ?, last_updated = NOW() WHERE pattern_name = ?`;
        for (const [name, score] of entries) {
            // ทำการ Clamp ค่าให้อยู่ใน -2.0 ถึง 2.0 เพื่อความปลอดภัยของระบบเทรด
            // const clampedScore = Math.max(-2.0, Math.min(2.0, score));
            // await query(sql, [name, clampedScore]);
            await query(upsertSql, [score, name]);
        }
        console.log(`[Performance] Successfully updated ${entries.length} weights in Database.`);
    } catch (err) {
        console.error("[Performance] Error saving weights to DB:", err.message);
        throw err; // โยน Error เพื่อให้ฟังก์ชันหลักรับทราบ
    }
}

async function analyzePerformance(firebaseUserId, symbol, mode) {
    const dataDir = path.join(__dirname, "../data");
    const learningDir = path.join(__dirname, "../learning");

    // const weightFile = path.join(learningDir, "pattern-weight.json");
    // const historyFile = path.join(dataDir, "../data/trade-history.json");
    // const stateFile = path.join(__dirname, "performance-state.json");
    //const weightFile = path.join(__dirname, "../learning/pattern-weight.json");

    // const history = safeReadJson(historyFile, []);
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

    // fs.writeFileSync(stateFile, JSON.stringify(result, null, 2), "utf8");
    // fs.writeFileSync(weightFile, JSON.stringify(patternWeights, null, 2), "utf8");

    try {
        // 1. บันทึก Weights ลงตาราง strategy_weights
        await saveSuggestedWeightsToDB(patternWeights);

        // 2. สำหรับ stateFile (performance-state) ถ้ายังจำเป็นต้องใช้ไฟล์อยู่ 
        // แนะนำให้ใช้ path.resolve เพื่อป้องกันปัญหา Path บน Shared Hosting
        const stateFile = path.resolve(__dirname, "performance-state.json");
        fs.writeFileSync(stateFile, JSON.stringify(result, null, 2), "utf8");

    } catch (err) {
        console.error("[Performance] Final save failed:", err.message);
    }

    return result;
}

module.exports = { analyzePerformance };
