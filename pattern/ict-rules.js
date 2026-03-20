// C:\openclaw-trade-engine\pattern\ict-rules.js

/**
 * วิเคราะห์หา ICT Concepts (Smart Money Concepts) จากชุดข้อมูลแท่งเทียน
 * @param {Array<object>} candles - อาร์เรย์ของแท่งเทียน (จากเก่าสุดไปใหม่สุด)
 * @returns {object} - ผลลัพธ์การวิเคราะห์โซน ICT
 */
function analyzeICT(candles) {
    if (!candles || candles.length < 5) {
        return {
            demandZones: [],
            supplyZones: [],
            isLiquiditySweepUp: false,
            isLiquiditySweepDown: false,
            fairValueGaps: []
        };
    }

    const demandZones = findOrderBlocks(candles, 'bullish');
    const supplyZones = findOrderBlocks(candles, 'bearish');
    const sweeps = findLiquiditySweeps(candles);
    const fvgs = findFairValueGaps(candles);

    return {
        demandZones: demandZones,
        supplyZones: supplyZones,
        isLiquiditySweepUp: sweeps.isLiquiditySweepUp,
        isLiquiditySweepDown: sweeps.isLiquiditySweepDown,
        fairValueGaps: fvgs
    };
}

/**
 * ค้นหาโซน Order Block (Demand/Supply Zone)
 * Order Block คือแท่งเทียนสีตรงข้ามแท่งสุดท้าย ก่อนที่ราคาจะพุ่งขึ้น/ลงอย่างรุนแรง และทำให้เกิด Imbalance
 * @param {Array<object>} candles
 * @param {'bullish'|'bearish'} type - 'bullish' for Demand, 'bearish' for Supply
 * @returns {Array<object>} - โซนราคาของ Order Block ที่พบ
 */
function findOrderBlocks(candles, type) {
    const blocks = [];
    const lookback = Math.min(candles.length, 30); // Look back up to 30 candles

    for (let i = 1; i < lookback; i++) {
        const prevCandle = candles[candles.length - i - 1];
        const currentCandle = candles[candles.length - i];
        
        const isBullishImbalance = currentCandle.close > prevCandle.high;
        const isBearishImbalance = currentCandle.close < prevCandle.low;
        
        // Demand Zone (Bullish Order Block)
        // คือแท่งแดงสุดท้าย ก่อนที่จะเกิดแท่งเขียวพุ่งทะลุ High ของแท่งแดงนั้นไป
        if (type === 'bullish' && prevCandle.close < prevCandle.open && isBullishImbalance) {
            blocks.push({
                start: prevCandle.low,
                end: prevCandle.high,
                midpoint: (prevCandle.high + prevCandle.low) / 2
            });
        }

        // Supply Zone (Bearish Order Block)
        // คือแท่งเขียวสุดท้าย ก่อนที่จะเกิดแท่งแดงทุบทะลุ Low ของแท่งเขียวนั้นไป
        if (type === 'bearish' && prevCandle.close > prevCandle.open && isBearishImbalance) {
            blocks.push({
                start: prevCandle.high,
                end: prevCandle.low,
                midpoint: (prevCandle.high + prevCandle.low) / 2
            });
        }
        
        // Keep only the most recent 3 zones to avoid clutter
        if (blocks.length >= 3) break;
    }
    
    return blocks;
}

/**
 * ตรวจจับการกวาดสภาพคล่อง (Liquidity Sweep / Stop Hunt)
 * คือการที่ราคาทะลุ High/Low เก่าไปนิดเดียว แล้วกลับตัวทันทีด้วยแท่ง Pin Bar หรือ Engulfing
 * @param {Array<object>} candles
 * @returns {object}
 */
function findLiquiditySweeps(candles) {
    let isLiquiditySweepUp = false; // กวาด SL คน Buy
    let isLiquiditySweepDown = false; // กวาด SL คน Sell
    
    if (candles.length < 5) return { isLiquiditySweepUp, isLiquiditySweepDown };
    
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    // Find previous swing high/low to be swept
    let recentHigh = 0;
    let recentLow = 99999;
    for(let i = candles.length - 3; i >= 0; i--) {
        if(candles[i].high > recentHigh) recentHigh = candles[i].high;
        if(candles[i].low < recentLow) recentLow = candles[i].low;
    }

    // Bearish Sweep (Judas Swing)
    // ราคาพุ่งทะลุ High เก่า แล้วโดนตบกลับมาเป็นแท่งแดง Pin Bar (Shooting Star) หรือ Engulfing
    const isUpSweepCandle = lastCandle.high > recentHigh && lastCandle.close < recentHigh;
    const isStrongBearishReversal = (lastCandle.close < lastCandle.open && Math.abs(lastCandle.close - lastCandle.open) > Math.abs(prevCandle.close - prevCandle.open));
    if(isUpSweepCandle && isStrongBearishReversal) {
        isLiquiditySweepUp = true;
    }

    // Bullish Sweep (Stop Hunt Low)
    // ราคาทุบทะลุ Low เก่า แล้วโดนช้อนกลับมาเป็นแท่งเขียว Pin Bar (Hammer) หรือ Engulfing
    const isDownSweepCandle = lastCandle.low < recentLow && lastCandle.close > recentLow;
    const isStrongBullishReversal = (lastCandle.close > lastCandle.open && Math.abs(lastCandle.close - lastCandle.open) > Math.abs(prevCandle.close - prevCandle.open));
    if(isDownSweepCandle && isStrongBullishReversal) {
        isLiquiditySweepDown = true;
    }

    return { isLiquiditySweepUp, isLiquiditySweepDown };
}


/**
 * ค้นหาโซน Fair Value Gap (FVG) หรือ Imbalance
 * FVG คือช่องว่างที่เกิดขึ้นระหว่าง High ของแท่งที่ 1 และ Low ของแท่งที่ 3
 * @param {Array<object>} candles 
 * @returns {Array<object>}
 */
function findFairValueGaps(candles) {
    const fvgs = [];
    if (candles.length < 3) return fvgs;

    for (let i = 2; i < candles.length; i++) {
        const c1 = candles[i - 2]; // แท่งที่ 1
        const c2 = candles[i - 1]; // แท่งที่ 2 (แท่งกลาง)
        const c3 = candles[i];     // แท่งที่ 3

        // Bullish FVG: ช่องว่างให้ลงมาเติม
        if (c1.high < c3.low) {
            fvgs.push({
                type: 'bullish',
                start: c1.high,
                end: c3.low
            });
        }
        
        // Bearish FVG: ช่องว่างให้ขึ้นไปเติม
        if (c1.low > c3.high) {
            fvgs.push({
                type: 'bearish',
                start: c1.low,
                end: c3.high
            });
        }
    }
    
    // Return only the most recent one for simplicity
    return fvgs.slice(-1);
}


module.exports = { analyzeICT };
