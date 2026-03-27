/**
 * early-exit-engine.js
 * ----------------------------------------
 * วิเคราะห์ว่าควรปิดออเดอร์ก่อน TP หรือไม่
 * รองรับ:
 * - failed_pattern (context learning)
 * - suggested_action
 * - reversal detection
 * - profit protection
 * - high risk cut loss now
 * - medium/low risk wait for bounce and take small profit
 */
const { analyzePattern } = require("../pattern/pattern-analyzer");

function shouldMoveToBreakeven(openPosition, currentProfit = 0, side = "") {
    if (!openPosition) return false;

    const entryPrice = Number(
        openPosition.entryPrice ??
        openPosition.entry_price ??
        openPosition.entry ??
        openPosition.price ??
        0
    );

    const currentPrice = Number(
        openPosition.currentPrice ??
        openPosition.current_price ??
        openPosition.marketPrice ??
        openPosition.market_price ??
        0
    );

    const stopLossPrice = Number(
        openPosition.sl ??
        openPosition.stopLoss ??
        openPosition.stop_loss ??
        0
    );

    if (!entryPrice || !currentPrice || !stopLossPrice) {
        return false;
    }

    const normalizedSide = String(side || "").toUpperCase();

    let initialRiskDistance = 0;
    let currentProfitDistance = 0;

    if (normalizedSide === "BUY") {
        initialRiskDistance = Math.abs(entryPrice - stopLossPrice);
        currentProfitDistance = currentPrice - entryPrice;
    } else if (normalizedSide === "SELL") {
        initialRiskDistance = Math.abs(stopLossPrice - entryPrice);
        currentProfitDistance = entryPrice - currentPrice;
    } else {
        return false;
    }

    if (initialRiskDistance <= 0) return false;
    if (currentProfitDistance <= 0) return false;

    const progressRatio = currentProfitDistance / initialRiskDistance;

    // ไปทางบวกมากพอสมควร = อย่างน้อยประมาณ 0.8R
    // และ currentProfit ต้องบวกจริง
    if (currentProfit > 0 && progressRatio >= 0.8) {
        return true;
    }

    return false;
}

// function analyzeEarlyExit({
//     firebaseUserId = null,
//     openPosition,
//     currentProfit = 0,
//     candles = [],
//     failedPattern = null
// }) {
function analyzeEarlyExit({
    firebaseUserId,
    openPosition,
    currentProfit,
    candles,
    failedPattern,
    mode = "NORMAL",
    tpPoints = 0,
    slPoints = 0,
}) {
    // =========================
    // 1. VALIDATION
    // =========================
    if (!openPosition || !openPosition.side) {
        return {
            action: "HOLD",
            reason: "Invalid position data",
            riskLevel: "UNKNOWN",
            score: 0
        };
    }

    if (!candles || candles.length < 5) {
        return {
            action: "HOLD",
            reason: "Not enough candles",
            riskLevel: "UNKNOWN",
            score: 0
        };
    }


    const side = String(openPosition.side || "").toUpperCase(); // BUY / SELL

    // =========================
    // 2. REVERSAL DETECTION
    // =========================
    const reversalScore = detectReversalScore(candles, side);

    // =========================
    // 3. FAILED PATTERN RISK
    // =========================
    let adjustedScore = reversalScore;
    let riskLevel = "LOW";
    let failRate = 0;
    let suggestedAction = null;

    if (failedPattern) {
        failRate = parseFloat(failedPattern.fail_rate || 0);
        suggestedAction = failedPattern.suggested_action || null;

        // BLOCK_TRADE = ความเสี่ยงสูงสุด
        if (suggestedAction === "BLOCK_TRADE") {
            riskLevel = "CRITICAL";
            adjustedScore += 3.0;
        }
        // WARNING = ความเสี่ยงสูง
        else if (suggestedAction === "WARNING") {
            riskLevel = "HIGH";
            adjustedScore += 1.5;
        }
        // REDUCE_SCORE = ความเสี่ยงกลาง
        else if (suggestedAction === "REDUCE_SCORE") {
            riskLevel = "MEDIUM";
            adjustedScore += parseFloat(failedPattern.score_penalty || 1);
        }
        else if (suggestedAction === "REDUCE_RISK") {
            riskLevel = "MEDIUM";
            adjustedScore += 1.0;
        }

        // ถ้า fail rate สูงมาก ให้ยกความเสี่ยงขึ้น
        if (failRate >= 0.85) {
            riskLevel = "CRITICAL";
            adjustedScore += 2.0;
        } else if (failRate >= 0.70 && riskLevel !== "CRITICAL") {
            riskLevel = "HIGH";
            adjustedScore += 1.0;
        } else if (failRate >= 0.50 && riskLevel === "LOW") {
            riskLevel = "MEDIUM";
            adjustedScore += 0.5;
        }
    }

    // =========================
    // 4. HIGH RISK / CUT LOSS NOW
    // =========================
    // กรณีเสี่ยงสูงมาก ถ้าติดลบอยู่ให้หนีทันที
    if (currentProfit < 0) {
        if (riskLevel === "CRITICAL" && adjustedScore >= 2) {
            return {
                action: "CUT_LOSS_NOW",
                reason: `Critical risk from failed pattern (failRate=${failRate})`,
                riskLevel,
                score: adjustedScore
            };
        }

        if (riskLevel === "HIGH" && adjustedScore >= 3) {
            return {
                action: "CUT_LOSS_NOW",
                reason: `High risk + strong reversal detected`,
                riskLevel,
                score: adjustedScore
            };
        }

        if (adjustedScore >= 3.5) {
            return {
                action: "CUT_LOSS_NOW",
                reason: "Strong reversal against position",
                riskLevel,
                score: adjustedScore
            };
        }
    }

    if (currentProfit > 0) {
        const moveToBreakeven = shouldMoveToBreakeven(openPosition, currentProfit, side);

        if (moveToBreakeven) {
            return {
                action: "MOVE_TO_BE",
                reason: "Price moved enough in favor, move SL to breakeven",
                riskLevel,
                score: adjustedScore
            };
        }
    }

    // =========================
    // 5. PROFIT PROTECTION / TAKE SMALL PROFIT
    // =========================
    // ถ้าเสี่ยงแต่ยังไม่ถึงขั้นหนีทันที
    // ให้รอจังหวะที่กำไรกลับมาเล็กน้อยแล้วเก็บออก
    if (currentProfit > 0) {
        // เสี่ยงสูงมาก + มีกำไรอยู่แล้ว → ออกทันที
        if (riskLevel === "CRITICAL") {
            return {
                action: "TAKE_SMALL_PROFIT",
                reason: `Critical risk but position is profitable`,
                riskLevel,
                score: adjustedScore
            };
        }

        // เสี่ยงสูง + มีกำไรเล็กน้อย → เก็บก่อน
        if (riskLevel === "HIGH" && currentProfit > 0.5) {
            return {
                action: "TAKE_SMALL_PROFIT",
                reason: `High risk, secure small profit`,
                riskLevel,
                score: adjustedScore
            };
        }

        // มี reversal ชัดเจน + มีกำไร
        if (adjustedScore >= 2.0) {
            return {
                action: "TAKE_SMALL_PROFIT",
                reason: `Reversal detected with profit`,
                riskLevel,
                score: adjustedScore
            };
        }

        // กำไรน้อยแต่เริ่มมีสัญญาณกลับตัว
        if (currentProfit > 3 && adjustedScore >= 1.5) {
            return {
                action: "TAKE_SMALL_PROFIT",
                reason: "Protect small profit before reversal expands",
                riskLevel,
                score: adjustedScore
            };
        }
    }

    // =========================
    // 6. WAIT FOR SMALL BOUNCE
    // =========================
    // กรณีเสี่ยงอยู่ แต่ยังติดลบไม่มาก และยังไม่ถึงขั้นต้องหนีทันที
    // ให้ถือรอ ถ้าราคาย้อนขึ้นมาเขียวเล็กน้อยค่อยออก
    if (currentProfit <= 0) {
        if (riskLevel === "HIGH" || riskLevel === "MEDIUM") {
            return {
                action: "WAIT_FOR_SMALL_BOUNCE",
                reason: `Risk detected, wait for small recovery before exit`,
                riskLevel,
                score: adjustedScore
            };
        }
    }

    // =========================
    // 7. DEFAULT HOLD
    // =========================
    return {
        action: "HOLD",
        reason: `No strong exit signal (score=${adjustedScore})`,
        riskLevel,
        score: adjustedScore
    };
}

/**
 * =========================
 * REVERSAL SCORING
 * =========================
 */
function detectReversalScore(candles, side) {
    let score = 0;

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    // =========================
    // 1. Candle direction
    // =========================
    if (side === "BUY") {
        if (last.close < last.open) score += 1;
        if (prev.close < prev.open) score += 0.5;
    }

    if (side === "SELL") {
        if (last.close > last.open) score += 1;
        if (prev.close > prev.open) score += 0.5;
    }

    // =========================
    // 2. Momentum loss
    // =========================
    const body1 = Math.abs(last.close - last.open);
    const body2 = Math.abs(prev.close - prev.open);
    const body3 = Math.abs(prev2.close - prev2.open);

    if (body1 < body2 && body2 < body3) {
        score += 1.5;
    }

    // =========================
    // 3. Wick rejection
    // =========================
    const upperWick = last.high - Math.max(last.close, last.open);
    const lowerWick = Math.min(last.close, last.open) - last.low;

    if (side === "BUY" && upperWick > Math.max(body1, 0.0001) * 1.5) {
        score += 2;
    }

    if (side === "SELL" && lowerWick > Math.max(body1, 0.0001) * 1.5) {
        score += 2;
    }

    // =========================
    // 4. Simple structure break
    // =========================
    const recentCandles = candles.slice(-5);
    const recentHigh = Math.max(...recentCandles.map(c => Number(c.high || 0)));
    const recentLow = Math.min(...recentCandles.map(c => Number(c.low || 0)));

    if (side === "BUY" && last.close < recentLow) {
        score += 2;
    }

    if (side === "SELL" && last.close > recentHigh) {
        score += 2;
    }

    return score;
}

module.exports = {
    analyzeEarlyExit
};
