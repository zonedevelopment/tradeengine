// C:\openclaw-trade-engine\brain\early-exit-engine.js

const { detectMotherFishPattern } = require('../pattern/pattern-rules');
const { analyzeICT } = require('../pattern/ict-rules');

/**
 * วิเคราะห์ว่าควรปิดออเดอร์ที่กำไรอยู่เพื่อหนีตายหรือไม่
 * @param {object} data 
 * @returns {object} - { action: "HOLD" | "EARLY_EXIT", reason: string }
 */
function analyzeEarlyExit(data) {
    const { openPosition, currentProfit, candles } = data;

    // 1. เช็กเงื่อนไขพื้นฐาน: ต้องมีกำไรอยู่เท่านั้น
    if (currentProfit <= 0) {
        return { action: "HOLD", reason: "Position is not in profit." };
    }

    // 2. วิเคราะห์หา Pattern กลับตัวฝั่งตรงข้าม
    const pattern = detectMotherFishPattern({ candles });
    const ict = analyzeICT(candles);

    let reversalScore = 0;
    let reversalReason = "No significant reversal pattern found.";

    // กรณีถือ Buy อยู่: เราจะกลัวเฉพาะสัญญาณ Sell เท่านั้น
    if (openPosition.side === "BUY") {
        if (pattern.pattern === "CLAW_SELL") {
            // ดึงคะแนนฝั่ง Sell มาพิจารณา (ปกติคะแนน Sell จะติดลบ)
            reversalScore += pattern.score; 
            reversalReason = `Opposite Pattern Detected: ${pattern.type} (Score: ${pattern.score}).`;
        }
        if (ict.isLiquiditySweepUp) {
            reversalScore -= 5; // Strong sell signal
            reversalReason = "Liquidity Sweep Up (Judas Swing) detected.";
        }
        if (ict.supplyZones.length > 0) {
            const nearestSupply = ict.supplyZones[0];
            const currentPrice = candles[candles.length - 1].close;
            if (Math.abs(currentPrice - nearestSupply.midpoint) < 2.0) {
                reversalScore -= 3; // Nearing strong resistance
                reversalReason = "Approaching strong Supply Zone (Order Block).";
            }
        }
    }
    
    // กรณีถือ Sell อยู่: เราจะกลัวเฉพาะสัญญาณ Buy เท่านั้น
    else if (openPosition.side === "SELL") {
        if (pattern.pattern === "CLAW_BUY") {
            // ดึงคะแนนฝั่ง Buy มาพิจารณา (ปกติคะแนน Buy จะเป็นบวก)
            reversalScore += pattern.score; 
            reversalReason = `Opposite Pattern Detected: ${pattern.type} (Score: ${pattern.score}).`;
        }
        if (ict.isLiquiditySweepDown) {
            reversalScore += 5; // Strong buy signal
            reversalReason = "Liquidity Sweep Down (Stop Hunt) detected.";
        }
        if (ict.demandZones.length > 0) {
            const nearestDemand = ict.demandZones[0];
            const currentPrice = candles[candles.length - 1].close;
            if (Math.abs(currentPrice - nearestDemand.midpoint) < 2.0) {
                reversalScore += 3; // Nearing strong support
                reversalReason = "Approaching strong Demand Zone (Order Block).";
            }
        }
    }
    
    // 3. ตัดสินใจ (ต้องเป็นการสวนทางที่รุนแรงพอถึงจะออก)
    // ถือ Buy อยู่ (รอให้คะแนน Sell ติดลบเยอะๆ ถึงจะหนี)
    // [NEW] เจอ Pattern กลับตัวชัดเจน คัดทิ้งทันที! ไม่ต้องรอคะแนนจากโบนัสอื่น
    if (openPosition.side === "BUY") {
        // ถ้าเจอสัญญาณ Sell แบบจะๆ หรือคะแนนโดยรวมติดลบ (เริ่มแย่) ให้ตัดหนีเลย (จาก -2 เหลือ -1)
        if (pattern.pattern === "CLAW_SELL" || reversalScore <= -1) {
            return { action: "EARLY_EXIT", reason: reversalReason };
        }
    }
    
    // ถือ Sell อยู่ (รอให้คะแนน Buy บวกเยอะๆ ถึงจะหนี)
    // [NEW] เจอ Pattern กลับตัวชัดเจน คัดทิ้งทันที!
    if (openPosition.side === "SELL") {
        // ถ้าเจอสัญญาณ Buy งัดขึ้นมา หรือคะแนนโดยรวมเริ่มเป็นบวก (จาก +2 เหลือ +1)
        if (pattern.pattern === "CLAW_BUY" || reversalScore >= 1) {
            return { action: "EARLY_EXIT", reason: reversalReason };
        }
    }

    return { action: "HOLD", reason: `Holding position. Reversal score (${reversalScore}) is not strong enough.` };
}

module.exports = { analyzeEarlyExit };
