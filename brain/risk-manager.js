// const fs = require("fs");

// function getRiskState() {
//     const file = "../trade-filter.json";
//     if (!fs.existsSync(file)) {
//         return {
//             dailyLoss: 0,
//             dailyLossLimit: false
//         };
//     }
//     return JSON.parse(fs.readFileSync(file, "utf8"));
// }

// function calculateDynamicRisk(patternScore, patternType, tradeMode = "NORMAL", baseRiskPercentage = 1.0) {
//     let risk = baseRiskPercentage;
//     const absScore = Math.abs(patternScore || 0); // Kept abs for backwards compatibility but we will pass signalStrength directly

//     // 1. Dynamic risk adjustment based on Pattern Strength
//     if (absScore >= 5) {
//         risk *= 1.5; 
//     } else if (absScore < 3) {
//         risk *= 0.5;
//     }

//     // 2. Specific Pattern Adjustments
//     const highProbPatterns = ["Bullish_Engulfing", "Bearish_Engulfing", "Morning_Star_Base_Break", "Evening_Star_Base_Break"];
//     const moderateProbPatterns = ["Pin_Bar_Hammer", "Pin_Bar_Shooting_Star", "Piercing_Pattern", "Dark_Cloud_Cover"];

//     if (highProbPatterns.includes(patternType)) {
//         risk *= 1.2; 
//     } else if (moderateProbPatterns.includes(patternType)) {
//         risk *= 0.8; 
//     }

//     // 3. Trade Mode Penalty (การลดความเสี่ยงสำหรับการเทรดในกรอบ/เก็บสั้น)
//     if (tradeMode === "SCALP") {
//         // เมื่ออยู่ในโหมด SCALP (ไซด์เวย์) ควรลดความเสี่ยงลงเพื่อป้องกันการทะลุหลอก (Fakeout) ที่ขอบกรอบ
//         risk *= 0.7; 
//     }

//     return parseFloat(risk.toFixed(2));
// }

// module.exports = { getRiskState, calculateDynamicRisk };

const fs = require("fs");

function getRiskState() {
    const file = "../trade-filter.json";
    if (!fs.existsSync(file)) {
        return { dailyLoss: 0, dailyLossLimit: false };
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getDefaultBaseRiskByMode(tradeMode = "NORMAL") {
    const mode = String(tradeMode || "NORMAL").toUpperCase();

    if (mode === "SCALP") return 1.2;
    if (mode === "MICRO_SCALP") return 0.9;
    return 2.0; // NORMAL
}

function calculateDynamicRisk(
    patternScore,
    patternType,
    tradeMode = "NORMAL",
    baseRiskPercentage = null
) {
    const mode = String(tradeMode || "NORMAL").toUpperCase();
    const absScore = Math.abs(Number(patternScore || 0));

    let risk =
        Number.isFinite(Number(baseRiskPercentage)) && Number(baseRiskPercentage) > 0
            ? Number(baseRiskPercentage)
            : getDefaultBaseRiskByMode(mode);

    // -----------------------------
    // 1) ปรับตาม strength แยกตาม mode
    // -----------------------------
    if (mode === "SCALP" || mode === "MICRO_SCALP") {
        // SCALP: เร่งน้อยกว่า NORMAL เพราะโดน fakeout ง่ายกว่า
        if (absScore >= 6) {
            risk *= 1.15;
        } else if (absScore >= 4.5) {
            risk *= 1.05;
        } else if (absScore < 3) {
            risk *= 0.75;
        }
    } else {
        // NORMAL: ให้ reward/punish ชัดกว่า
        if (absScore >= 6) {
            risk *= 1.35;
        } else if (absScore >= 5) {
            risk *= 1.2;
        } else if (absScore < 3) {
            risk *= 0.65;
        }
    }

    // -----------------------------
    // 2) ปรับตาม pattern
    // -----------------------------
    const highProbPatterns = [
        "Bullish_Engulfing",
        "Bearish_Engulfing",
        "Morning_Star_Base_Break",
        "Evening_Star_Base_Break",
        "First_Leg_Breakdown",
        "First_Leg_Breakout"
    ];

    const moderateProbPatterns = [
        "Pin_Bar_Hammer",
        "Pin_Bar_Shooting_Star",
        "Piercing_Pattern",
        "Dark_Cloud_Cover"
    ];

    if (highProbPatterns.includes(patternType)) {
        risk *= mode === "NORMAL" ? 1.15 : 1.08;
    } else if (moderateProbPatterns.includes(patternType)) {
        risk *= mode === "NORMAL" ? 0.9 : 0.85;
    }

    // -----------------------------
    // 3) ปรับตาม mode แบบชัดเจน
    // -----------------------------
    if (mode === "SCALP") {
        risk *= 0.92;
    } else if (mode === "MICRO_SCALP") {
        risk *= 0.82;
    } else {
        risk *= 1.0;
    }

    // -----------------------------
    // 4) clamp ตาม mode
    // -----------------------------
    if (mode === "SCALP") {
        risk = clamp(risk, 0.35, 1.8);
    } else if (mode === "MICRO_SCALP") {
        risk = clamp(risk, 0.20, 1.2);
    } else {
        risk = clamp(risk, 0.50, 3.0);
    }

    return parseFloat(risk.toFixed(2));
}

module.exports = {
    getRiskState,
    calculateDynamicRisk,
};
