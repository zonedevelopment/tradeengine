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

    // const weights = loadWeights();
    const weights = await loadWeightsFromDB();

    // 1. Detect Candle Pattern & Market Structure
    const result = detectMotherFishPattern({
        candles: signal.candles || [signal.prevCandle, signal.currentCandle].filter(Boolean)
    });

    let score = 0;

    // if (result.pattern === "CLAW_BUY") {
    //     score = 2;
    // } else if (result.pattern === "CLAW_SELL") {
    //     score = -2;
    // }

    if (result.pattern === "CLAW_BUY" && result.type === "Rocket_Surge_Continuation") {
        score = 2.5;
    } else if (result.pattern === "CLAW_SELL" && result.type === "Waterfall_Drop_Continuation") {
        score = -2.5;
    } else if (result.pattern === "CLAW_BUY") {
        score = 2;
    } else if (result.pattern === "CLAW_SELL") {
        score = -2;
    }

    // Stop early if no pattern
    if (score === 0) {
        return {
            pattern: "NONE",
            type: "None",
            score: 0,
            strength: 0,
            structure: result.structure
        };
    }

    // const research = loadMotherFishState();

    // Fallback to pattern name if specific type weight is missing
    const weightKey = weights[result.type] ? result.type : result.pattern;
    if (weights[weightKey]) {
        // Adjust for SELL (negative score) so weight makes it more negative
        score += (score > 0 ? weights[weightKey] : -weights[weightKey]);
    }

    // Overlap bonus (e.g., tight stops, high RR)
    if (signal.overlapPips && signal.overlapPips <= 200 && score !== 0) {
        score = score * 1.5;
    }

    // [NEW] Live VSA (Volume Spread Analysis) on current payload (20 candles)
    let isVolumeClimax = false;
    let isVolumeDrying = false;
    let recentMassiveBear = false;
    let recentMassiveBull = false;
    const candles = signal.candles || [];

    const trendFollow4 = analyzeM5FourCandleFollow(candles);

    if (candles.length >= 7) {
        let totalVol = 0;
        let count = 0;
        // หาค่าเฉลี่ย Volume ของ 5 แท่งในอดีต (ไม่นับ 2 แท่งล่าสุดที่เป็นสัญญาณ)
        let useCandles = (candles.length - 15);
        // for (let i = candles.length - 7; i < candles.length - 2; i++) {
        for (let i = useCandles; i < useCandles - 2; i++) {
            if (i >= 0 && candles[i].tick_volume) {
                totalVol += Number(candles[i].tick_volume);
                count++;
            }
        }

        const avgVol = count > 0 ? (totalVol / count) : 0;

        // ดึง Volume ของ 2 แท่งล่าสุดที่เกิด Pattern
        const currVol = candles[candles.length - 1] ? Number(candles[candles.length - 1].tick_volume || 0) : 0;
        const prevVol = candles[candles.length - 2] ? Number(candles[candles.length - 2].tick_volume || 0) : 0;

        // ใช้ Volume ที่สูงสุดระหว่าง 2 แท่งนั้นเป็นตัวแทน (เพราะ Climax อาจเกิดที่แท่งก่อนหน้า)
        const triggerVol = Math.max(currVol, prevVol);

        if (avgVol > 0 && triggerVol >= avgVol * 1.5) {
            isVolumeClimax = true; // วอลุ่มพุ่งผิดปกติ > 1.5 เท่าของค่าเฉลี่ย (รายใหญ่เข้า)
        } else if (avgVol > 0 && triggerVol < avgVol * 0.6) {
            isVolumeDrying = true; // วอลุ่มแห้งเหือด < 60% ของค่าเฉลี่ย (หมดแรง)
        }

        // [NEW] Momentum Bias Check (หาแท่งยาววอลุ่มสูงใน 3 แท่งล่าสุด เพื่อความสดใหม่ของเทรนด์)
        for (let i = candles.length - 3; i < candles.length; i++) {
            if (i >= 0) {
                const c = candles[i];
                const body = Math.abs(c.close - c.open);
                const isBear = c.close < c.open;
                const isBull = c.close > c.open;

                // เนื้อเทียนยาวกว่า 200 จุด (2.0$) และมี Volume ทะลุ 1.5 เท่า
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
        structure: result.structure, // Structure analysis for Decision Engine
        slPrice: result.slPrice, // Dynamic SL Price
        tpPrice: result.tpPrice, // Dynamic TP Price
        isVolumeClimax, // แนบสถานะ VSA กลับไปให้ Decision Engine
        isVolumeDrying,
        recentMassiveBear, // แนบ Bias ห้ามสวนกลับไปให้ Decision Engine
        recentMassiveBull
    };

}

function loadWeights() {
    const learningDir = path.join(__dirname, "../learning");
    const file = path.join(learningDir, "pattern-weight.json");
    // const file = "../learning/pattern-weight.json";
    if (!fs.existsSync(file)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(file));
}

async function loadWeightsFromDB() {
    const initialDefaultWeights = {
        "Pin_Bar_Shooting_Star": -0.5,
        "Morning_Star_Base_Break": 0,
        "Evening_Star_Base_Break": -0.75,
        "Pin_Bar_Hammer": 2.0,
        "Piercing_Pattern": 0.5,
        "Waterfall_Drop_Continuation": 1.8,
        "Dark_Cloud_Cover": 1.9,
        "Bullish_Engulfing": -1.25,
        "Rocket_Surge_Continuation": 1.0,
        "Bearish_Engulfing": -1.75
    };

    try {
        const sql = `
                SELECT pattern_name, 
                    CASE 
                        WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
                        ELSE weight_score
                    END AS weight_score
                FROM strategy_weights
            `;
        const [rows] = await query(sql);
        if (rows.length > 0) {
            // ถ้ามีข้อมูลใน DB ให้ใช้ข้อมูลจาก DB
            return rows.reduce((acc, row) => {
                acc[row.pattern_name] = Number(row.weight_score);
                return acc;
            }, {});
        }
        // const [rows] = await query("SELECT pattern_name, weight_score, user_score, is_use_user_score FROM strategy_weights");

        // if (rows.length > 0) {
        //     return rows.reduce((acc, row) => {
        //         const hasUserScore = row.is_use_user_score === 1 && row.user_score !== null;
        //         acc[row.pattern_name] = hasUserScore ? Number(row.user_score) : Number(row.weight_score);
        //         acc[row.pattern_name] = Number(row.weight_score);
        //         return acc;
        //     }, {});
        // } 
        return rows;
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
