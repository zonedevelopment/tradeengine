const fs = require('fs');
const path = require('path');
const { detectMotherFishPattern } = require('../pattern/pattern-rules');

function runDailyLearning() {
    console.log("[Daily Learner] 04:30 AM - Starting Internal AI Data Mapping & Learning...");

    const dataDir = path.join(__dirname, '../data');
    const learningDir = path.join(__dirname, '../learning');

    if (!fs.existsSync(learningDir)) fs.mkdirSync(learningDir);

    const tradeHistPath = path.join(dataDir, 'trade-history.json');
    const candleDataPath = path.join(dataDir, 'candle_training_data.json');
    const mappedDataPath = path.join(dataDir, 'mapped_daily_analysis.json');
    const weightPath = path.join(learningDir, 'pattern-weight.json');

    if (!fs.existsSync(tradeHistPath) || !fs.existsSync(candleDataPath)) {
        console.log("[Daily Learner] Missing data files. Skipping learning.");
        return;
    }

    let trades = [];
    let candleLogs = [];
    try {
        trades = JSON.parse(fs.readFileSync(tradeHistPath, 'utf8'));
        candleLogs = JSON.parse(fs.readFileSync(candleDataPath, 'utf8'));
    } catch (e) {
        console.log("[Daily Learner] JSON parse error:", e.message);
        return;
    }

    let weights = {};
    if (fs.existsSync(weightPath)) {
        try {
            weights = JSON.parse(fs.readFileSync(weightPath, 'utf8'));
        } catch (e) {}
    }

    let mappedResults = [];
    let openOrder = null;

    // 1. Process trades sequentially to find Open -> Close pairs
    for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        if (t.type === 'OPEN_ORDER') {
            openOrder = t;
        } else if (t.type === 'CLOSE_ORDER' && openOrder && t.side === openOrder.side) {
            
            // 2. Mapping: Find matching candle data by checking closest price at entry
            let matchedCandleLog = null;
            let minDiff = 999999;
            for (let cLog of candleLogs) {
                let diff = Math.abs(cLog.price - openOrder.price);
                if (diff < minDiff) {
                    minDiff = diff;
                    matchedCandleLog = cLog;
                }
            }

            // If we found the candle data that triggered this trade (price within 5.0 difference to account for slippage/spread)
            if (matchedCandleLog && minDiff < 5.0) {
                
                // Re-analyze candles to extract pattern and structure
                const analysis = detectMotherFishPattern({ candles: matchedCandleLog.candles });
                const patternType = analysis.type !== "Unknown" ? analysis.type : analysis.pattern;

                // Extract Tick Volume from the trigger candle
                const triggerCandle = matchedCandleLog.candles[matchedCandleLog.candles.length - 1];
                const tickVolume = triggerCandle ? triggerCandle.tick_volume : 0;

                const isWin = t.profit > 0;
                
                // [NEW] Calculate SL and TP distances to analyze optimal risk/reward
                const slPips = openOrder.sl ? Math.round(Math.abs(openOrder.price - openOrder.sl) * 100) : 0;
                const tpPips = openOrder.tp ? Math.round(Math.abs(openOrder.tp - openOrder.price) * 100) : 0;

                // [NEW] Post-Mortem Analysis (วิเคราะห์สาเหตุการแพ้/ชนะเบื้องต้น)
                let postMortem = isWin ? "TARGET_REACHED" : "STOPPED_OUT";
                if (!isWin) {
                    if (slPips < 150) postMortem = "SL_TOO_TIGHT"; // SL สั้นไป โดนสะบัดกินง่าย
                    else if (tpPips > 500) postMortem = "TP_TOO_FAR"; // TP ไกลไป กราฟอาจจะกลับตัวก่อน
                } else {
                    if (tpPips < 150) postMortem = "SCALP_WIN"; // เก็บสั้นรอดตัว
                }

                mappedResults.push({
                    timestamp: matchedCandleLog.timestamp,
                    patternType: patternType,
                    mode: openOrder.mode || "NORMAL", // [NEW] บันทึกโหมดที่เปิดออเดอร์
                    tickVolume: tickVolume,
                    microTrend: analysis.structure ? analysis.structure.microTrend : "UNKNOWN",
                    openPrice: openOrder.price,
                    closePrice: t.price,
                    slPrice: openOrder.sl,
                    tpPrice: openOrder.tp,
                    slPips: slPips, // [NEW] ระยะ SL ที่ใช้
                    tpPips: tpPips, // [NEW] ระยะ TP ที่ใช้
                    profit: t.profit,
                    result: isWin ? 'WIN' : 'LOSS',
                    side: openOrder.side,
                    postMortem: postMortem // [NEW] ข้อสรุปการตาย/รอด
                });

                // 3. Update Brain (Weights) Internally
                if (patternType !== "NONE" && patternType !== "None") {
                    if (!weights[patternType]) weights[patternType] = 0;
                    
                    if (isWin) {
                        weights[patternType] += 0.15; // Reward success
                    } else {
                        weights[patternType] -= 0.10; // Penalty failure
                    }
                    
                    // Cap weights between -2.0 and 2.0 to avoid extreme bias
                    if (weights[patternType] > 2.0) weights[patternType] = 2.0;
                    if (weights[patternType] < -2.0) weights[patternType] = -2.0;
                }
            }
            openOrder = null; // Reset for next pair
        }
    }

    // 4. Save Mapped Data for future review/reporting
    fs.writeFileSync(mappedDataPath, JSON.stringify(mappedResults, null, 2));

    // 5. Save updated Brain (Weights) so Decision Engine uses it tomorrow
    fs.writeFileSync(weightPath, JSON.stringify(weights, null, 2));

    console.log(`[Daily Learner] Successfully mapped ${mappedResults.length} completed trades.`);
    console.log(`[Daily Learner] Brain weights updated:`, weights);
}

// Allow direct execution from command line for manual triggering
if (require.main === module) {
    runDailyLearning();
}

module.exports = { runDailyLearning };