const { detectTrendAndRange } = require("../pattern/pattern-rules");

function evaluateDecision({
    news,
    calendar,
    session,
    risk,
    pattern,
    ictContext, // รับค่า ICT เข้ามา
    market
}) {
    let score = 0;
    let confidenceMultiplier = 1.0;
    let tradeMode = "NORMAL";

    // [NEW] ICT Concepts Bonus & Overrides
    if (ictContext && pattern.pattern !== "NONE") {
        const currentPrice = market.price || 0;

        // 1. Liquidity Sweep Bonus (คะแนนโบนัสสูงสุด)
        // ถ้าเจอสัญญาณ Buy หลังจากที่กราฟเพิ่งกวาด SL ฝั่ง Sell ไปหมาดๆ
        if (pattern.pattern === "CLAW_BUY" && ictContext.isLiquiditySweepDown) {
            confidenceMultiplier += 2.0; // x3 confidence!
            tradeMode = "NORMAL"; // Expect strong reversal
        }
        // ถ้าเจอสัญญาณ Sell หลังจากที่กราฟเพิ่งกวาด SL ฝั่ง Buy
        else if (pattern.pattern === "CLAW_SELL" && ictContext.isLiquiditySweepUp) {
            confidenceMultiplier += 2.0;
            tradeMode = "NORMAL";
        }

        // 2. Order Block Confluence
        // เช็กว่าจุดเข้าปัจจุบันอยู่ในโซน Demand/Supply หรือไม่
        else if (pattern.pattern === "CLAW_BUY" && ictContext.demandZones.length > 0) {
            const nearestDemandZone = ictContext.demandZones[0];
            // ถ้าจุดเข้าอยู่ใกล้โซน Demand (ห่างไม่เกิน 2.0$)
            if (Math.abs(currentPrice - nearestDemandZone.midpoint) <= 2.0) {
                confidenceMultiplier += 1.2; // x2.2 confidence!
            }
        }
        else if (pattern.pattern === "CLAW_SELL" && ictContext.supplyZones.length > 0) {
            const nearestSupplyZone = ictContext.supplyZones[0];
            if (Math.abs(currentPrice - nearestSupplyZone.midpoint) <= 2.0) {
                confidenceMultiplier += 1.2;
            }
        }
    }
	
    // 1. เรียกใช้ฟังก์ชัน detectTrendAndRange
    const candlesH1 = market && market.candlesH1 ? market.candlesH1 : [];
    const candlesH4 = market && market.candlesH4 ? market.candlesH4 : [];
    const trendContext = detectTrendAndRange(candlesH1, candlesH4);

    // 2. เช็กสภาวะตลาดไซด์เวย์ (Range) -> เปลี่ยนเป็นโหมด "SCALP" (เก็บสั้น)
    if (trendContext.isRanging) {
        tradeMode = "SCALP";
    }

    // 2.5 วิเคราะห์ Market Structure (Fail to LL / HL)
    if (pattern && pattern.structure) {
        const struct = pattern.structure;
        
        // ถ้าเป็นฝั่ง Sell แต่โครงสร้างกราฟไม่ทำโลว์ใหม่ (Fail to LL)
        // บังคับเปลี่ยนเป็นโหมด SCALP ทันที และอาจโดนหักคะแนนความน่าเชื่อถือ
        if (pattern.pattern === "CLAW_SELL" && struct.isFailToLL) {
            tradeMode = "SCALP";
            confidenceMultiplier -= 0.3; // หักคะแนนเพราะเทรนด์ลงเริ่มอ่อนแรง
        }
        
        // ถ้าเป็นฝั่ง Buy แต่โครงสร้างกราฟไม่ทำไฮใหม่ (Fail to HH)
        // บังคับเปลี่ยนเป็นโหมด SCALP ทันที
        if (pattern.pattern === "CLAW_BUY" && struct.isFailToHH) {
            tradeMode = "SCALP";
            confidenceMultiplier -= 0.3; // หักคะแนนเพราะเทรนด์ขึ้นเริ่มอ่อนแรง
        }

        // [NEW] Break & Retest Bonus
        if (pattern.pattern === "CLAW_BUY" && struct.isRetestingSupport) {
            // โบนัสคะแนนมหาศาลจากการที่กราฟย่อตัวลงมาทดสอบแนวต้านเดิมที่เพิ่งเบรก (Support)
            confidenceMultiplier += 0.8; 
            tradeMode = "NORMAL"; // มีแรงพุ่งไปต่อ
        }
        if (pattern.pattern === "CLAW_SELL" && struct.isRetestingResistance) {
            confidenceMultiplier += 0.8;
            tradeMode = "NORMAL";
        }
    }

    // 3. News & Calendar Context
    if (news && news.goldImpact === "bullish") score += 2;
    if (news && news.goldImpact === "bearish") score -= 2;
    
    // Extreme caution before high-impact news
    if (calendar && calendar.highImpactNews) {
        return { action: "NO_TRADE", reason: "HIGH_IMPACT_NEWS_PENDING", score: 0 };
    }

    // 4. Session Activity (Re-enabled for Retracement Logic only)
    // No score multiplier, just passing the session state.

    // 5. Risk Constraints
    if (risk && risk.dailyLossLimit) {
        return { action: "NO_TRADE", reason: "DAILY_LOSS_LIMIT_REACHED", score: 0 };
    }

    // 6. Pattern & Trend Integration
    if (pattern && pattern.pattern !== "NONE") {
        let patternScore = pattern.score || 0;
        
        const strongPatterns = ["Bullish_Engulfing", "Bearish_Engulfing", "Morning_Star_Base_Break", "Evening_Star_Base_Break"];
        const momentumPatterns = ["Waterfall_Drop_Continuation", "Rocket_Surge_Continuation", "Weak_Pullback_Continuation"];
        
        // [NEW] Blocking Opposite Trades (ห้ามสวนเทรนด์แท่งยาว)
        if (pattern.recentMassiveBear && pattern.pattern === "CLAW_BUY") {
            // ยกเว้นว่าลงไปกวาด Stop Loss ลึกๆ (Liquidity Sweep) ถึงจะยอมให้ซื้อสวนได้
            if (!ictContext || !ictContext.isLiquiditySweepDown) {
                return { action: "NO_TRADE", reason: "FIGHTING_MASSIVE_BEAR_MOMENTUM", score: 0 };
            }
        }
        if (pattern.recentMassiveBull && pattern.pattern === "CLAW_SELL") {
            if (!ictContext || !ictContext.isLiquiditySweepUp) {
                return { action: "NO_TRADE", reason: "FIGHTING_MASSIVE_BULL_MOMENTUM", score: 0 };
            }
        }

        if (strongPatterns.includes(pattern.type)) {
            patternScore *= 1.2;
        } else if (momentumPatterns.includes(pattern.type)) {
            // หักคะแนนโบนัสของ SCALP ออก เพราะนี่คือโหมดตามน้ำรุนแรง ไม่ใช่ตีปิงปองในกรอบ
            if (tradeMode === "SCALP") {
                tradeMode = "NORMAL"; // บังคับสลับโหมดเป็นรันเทรนด์! (Breakout)
            }
            patternScore *= 1.5; // ให้คะแนนโบนัสแรงส่งมหาศาล (เพราะมี Volume คอนเฟิร์มมาแล้ว)
        }

        if (tradeMode === "NORMAL") {
            // Trend Following Boost (ตามเทรนด์หลัก H1/H4)
            if (trendContext.overallTrend === "BULLISH" && pattern.pattern === "CLAW_BUY") {
                patternScore *= 1.5; 
            } else if (trendContext.overallTrend === "BEARISH" && pattern.pattern === "CLAW_SELL") {
                patternScore *= 1.5;
            } 
            // Counter-Trend Penalty
            else if (trendContext.overallTrend === "BULLISH" && pattern.pattern === "CLAW_SELL" && trendContext.trendStrength === "STRONG") {
                patternScore *= 0.5;
            } else if (trendContext.overallTrend === "BEARISH" && pattern.pattern === "CLAW_BUY" && trendContext.trendStrength === "STRONG") {
                patternScore *= 0.5;
            }
        } else {
            // โหมด SCALP: เพิกเฉยต่อ H1/H4 แต่เปลี่ยนมาวิเคราะห์จาก Micro-Trend (M5) แทน
            const microTrend = (pattern && pattern.structure) ? pattern.structure.microTrend : "NEUTRAL";
            
            // [NEW] VSA Live Override (Volume Climax)
            // ถ้าระบบเจอแท่ง Volume สูงปรี๊ดผิดปกติ (> 1.5x) ให้ยกเว้นบทลงโทษการสวนเทรนด์ทั้งหมด เพราะ "เจ้ามือมาแล้ว!"
            if (pattern.isVolumeClimax) {
                // ให้โบนัส "การกลับตัวรุนแรง (Smart Money Reversal)" แทนการโดนหักคะแนน
                patternScore *= 1.8; 
                tradeMode = "NORMAL"; // มีแรงพุ่งทะลุกรอบไซด์เวย์แน่นอน
            } else {
                // ถ้า Volume ปกติ ก็บังคับใช้กฎการสวนเทรนด์ M5 เหมือนเดิม
                if ((microTrend === "BULLISH" || microTrend === "BULLISH_REVERSAL") && pattern.pattern === "CLAW_BUY") {
                    patternScore *= 1.5; // โบนัสจากการเทรดสั้น "ตามแรงส่งในกรอบ"
                } else if ((microTrend === "BEARISH" || microTrend === "BEARISH_REVERSAL") && pattern.pattern === "CLAW_SELL") {
                    patternScore *= 1.5;
                } 
                // Scalp สวนทางแรงส่งระยะสั้น M5 (เสี่ยงโดนลากในกรอบ)
                else if ((microTrend === "BULLISH" || microTrend === "BULLISH_REVERSAL") && pattern.pattern === "CLAW_SELL") {
                    patternScore *= 0.6; // โดนหักคะแนน 40% เพราะฝืนแรงส่งสั้นๆ
                } else if ((microTrend === "BEARISH" || microTrend === "BEARISH_REVERSAL") && pattern.pattern === "CLAW_BUY") {
                    patternScore *= 0.6;
                } else {
                    patternScore *= 0.9; // Base penalty สำหรับการเทรดในกรอบ
                }
            }
        }

        score += patternScore;
    }

    // Apply Session Multiplier
    score *= confidenceMultiplier;

    // [NEW] Pyramiding & Anti-Hedging System
    // หากมีข้อมูลพอร์ตปัจจุบันถูกส่งเข้ามา จะทำการคัดกรองว่าสามารถเปิดไม้เพิ่มได้หรือไม่
    if (market && market.portfolio) {
        const { currentPosition, count } = market.portfolio;

        // ถ้าปัจจุบันมี Position ถืออยู่
        if (currentPosition !== "NONE") {
            // กฎเหล็ก 1: "ห้ามสวนทางกัน" (No Hedging)
            if (currentPosition === "BUY" && score <= -2) {
                return { action: "NO_TRADE", reason: "ANTI_HEDGE_BLOCK", score: 0 };
            }
            if (currentPosition === "SELL" && score >= 2) {
                return { action: "NO_TRADE", reason: "ANTI_HEDGE_BLOCK", score: 0 };
            }

            // กฎเหล็ก 2: "อนุญาตให้ออกไม้เพิ่ม (Pyramiding) ได้ ถ้ามั่นใจมากๆ"
            // ลดเกณฑ์ลงเหลือ 5.5 และเพิ่มการตอบกลับแบบ PYRAMID
            if (currentPosition === "BUY" && score >= 2) {
                if (count >= 3) return { action: "NO_TRADE", reason: "MAX_PYRAMID_ORDERS_REACHED", score: 0 };
                return { action: "ALLOW_BUY_PYRAMID", score: score, mode: tradeMode, trend: trendContext.overallTrend };
            } else if (currentPosition === "SELL" && score <= -2) {
                if (count >= 3) return { action: "NO_TRADE", reason: "MAX_PYRAMID_ORDERS_REACHED", score: 0 };
                return { action: "ALLOW_SELL_PYRAMID", score: score, mode: tradeMode, trend: trendContext.overallTrend };
            } else {
                // ถ้าคะแนนไม่ถึงเกณฑ์ ให้ปัดตก ไม่ให้ออกไม้พร่ำเพรื่อ
                return { action: "NO_TRADE", reason: "SCORE_TOO_LOW_FOR_PYRAMIDING", score: 0 };
            }
        }
    }

    return { 
        score, 
        patternType: pattern ? pattern.type : "Unknown",
        trend: trendContext.overallTrend,
        mode: tradeMode
    };
}

function decision(evaluation) {
    if (evaluation.action === "NO_TRADE") {
        return evaluation.action;
    }

    const { score, mode } = evaluation;

    // เกณฑ์ใหม่: 2.25
    if (score >= 2.25) {
        return mode === "SCALP" ? "ALLOW_BUY_SCALP" : "ALLOW_BUY";
    }

    if (score <= -2.25) {
        return mode === "SCALP" ? "ALLOW_SELL_SCALP" : "ALLOW_SELL";
    }

    return "NO_TRADE";
}

module.exports = {
    evaluateDecision,
    decision
};
