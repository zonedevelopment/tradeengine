const fs = require("fs");

function getRiskState() {
    const file = "../trade-filter.json";
    if (!fs.existsSync(file)) {
        return {
            dailyLoss: 0,
            dailyLossLimit: false
        };
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function calculateDynamicRisk(patternScore, patternType, tradeMode = "NORMAL", baseRiskPercentage = 1.0) {
    let risk = baseRiskPercentage;
    const absScore = Math.abs(patternScore || 0);

    // 1. Dynamic risk adjustment based on Pattern Strength
    if (absScore >= 5) {
        risk *= 1.5; 
    } else if (absScore < 3) {
        risk *= 0.5;
    }

    // 2. Specific Pattern Adjustments
    const highProbPatterns = ["Bullish_Engulfing", "Bearish_Engulfing", "Morning_Star_Base_Break", "Evening_Star_Base_Break"];
    const moderateProbPatterns = ["Pin_Bar_Hammer", "Pin_Bar_Shooting_Star", "Piercing_Pattern", "Dark_Cloud_Cover"];

    if (highProbPatterns.includes(patternType)) {
        risk *= 1.2; 
    } else if (moderateProbPatterns.includes(patternType)) {
        risk *= 0.8; 
    }

    // 3. Trade Mode Penalty (การลดความเสี่ยงสำหรับการเทรดในกรอบ/เก็บสั้น)
    if (tradeMode === "SCALP") {
        // เมื่ออยู่ในโหมด SCALP (ไซด์เวย์) ควรลดความเสี่ยงลงเพื่อป้องกันการทะลุหลอก (Fakeout) ที่ขอบกรอบ
        risk *= 0.7; 
    }

    return parseFloat(risk.toFixed(2));
}

module.exports = { getRiskState, calculateDynamicRisk };
