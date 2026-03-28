const { detectDescendingTriangle } = require("./descending-triangle-patterns");
const { detectAscendingTriangle } = require("./ascending-triangle-patterns");

function detectMarketStructure(candles) {
    if (!candles || candles.length < 5) return { isFailToLL: false, isFailToHH: false, swings: [] };

    let swings = [];
    
    // หา Swing High (จุดสูงสุดชั่วคราว) และ Swing Low (จุดต่ำสุดชั่วคราว)
    // ใช้หน้า 2 หลัง 2 เป็นเกณฑ์
    for (let i = 2; i < candles.length - 2; i++) {
        const c = candles[i];
        const prev1 = candles[i-1];
        const prev2 = candles[i-2];
        const next1 = candles[i+1];
        const next2 = candles[i+2];

        // Is Swing High?
        if (c.high > prev1.high && c.high > prev2.high && c.high > next1.high && c.high > next2.high) {
            swings.push({ type: 'SH', price: c.high, index: i });
        }
        
        // Is Swing Low?
        if (c.low < prev1.low && c.low < prev2.low && c.low < next1.low && c.low < next2.low) {
            swings.push({ type: 'SL', price: c.low, index: i });
        }
    }

    // กรองและเรียงตามลำดับเวลา
    swings.sort((a, b) => a.index - b.index);

    let isFailToLL = false; // เกิด Higher Low ในเทรนด์ขาลง (ไม่ทำนิวโลว์)
    let isFailToHH = false; // เกิด Lower High ในเทรนด์ขาขึ้น (ไม่ทำนิวไฮ)

    // หา Swing Low 2 จุดล่าสุดเทียบกัน
    const sls = swings.filter(s => s.type === 'SL');
    if (sls.length >= 2) {
        const lastSL = sls[sls.length - 1];
        const prevSL = sls[sls.length - 2];
        
        // ถ้าราคาโลว์ล่าสุด สูงกว่า โลว์ก่อนหน้า = ไม่ทำ Lower Low
        if (lastSL.price > prevSL.price) {
            isFailToLL = true;
        }
    }

    // หา Swing High 2 จุดล่าสุดเทียบกัน
    const shs = swings.filter(s => s.type === 'SH');
    if (shs.length >= 2) {
        const lastSH = shs[shs.length - 1];
        const prevSH = shs[shs.length - 2];
        
        // ถ้าราคาไฮล่าสุด ต่ำกว่า ไฮก่อนหน้า = ไม่ทำ Higher High
        if (lastSH.price < prevSH.price) {
            isFailToHH = true;
        }
    }

    // [NEW] Breakout & Retest Detection
    let isRetestingSupport = false;
    let isRetestingResistance = false;
    
    if (candles.length > 0) {
        const currentClose = candles[candles.length - 1].close;
        const currentLow = candles[candles.length - 1].low;
        const currentHigh = candles[candles.length - 1].high;
        
        // Retesting Broken Resistance (now Support)
        if (shs.length > 0) {
            const lastSH = shs[shs.length - 1].price;
            // ถ้ากราฟเคยทะลุ High ไปแล้ว และกำลังย่อลงมาแตะ High เดิม (ระยะ 2.0 ดอลลาร์)
            if (currentClose > lastSH && Math.abs(currentLow - lastSH) <= 2.0) {
                isRetestingSupport = true;
            }
        }
        
        // Retesting Broken Support (now Resistance)
        if (sls.length > 0) {
            const lastSL = sls[sls.length - 1].price;
            // ถ้ากราฟเคยหลุด Low ไปแล้ว และกำลังเด้งขึ้นมาแตะ Low เดิม
            if (currentClose < lastSL && Math.abs(currentHigh - lastSL) <= 2.0) {
                isRetestingResistance = true;
            }
        }
    }

    // [NEW] Micro-Trend Analysis (M5 Momentum)
    let microTrend = "NEUTRAL";
    if (sls.length >= 2 && shs.length >= 2) {
        const lastSL = sls[sls.length - 1];
        const prevSL = sls[sls.length - 2];
        const lastSH = shs[shs.length - 1];
        const prevSH = shs[shs.length - 2];

        // โครงสร้างขาขึ้น (Higher Highs & Higher Lows)
        if (lastSH.price > prevSH.price && lastSL.price > prevSL.price) {
            microTrend = "BULLISH";
        } 
        // โครงสร้างขาลง (Lower Highs & Lower Lows)
        else if (lastSH.price < prevSH.price && lastSL.price < prevSL.price) {
            microTrend = "BEARISH";
        } 
        // กำลังกลับตัวขึ้น
        else if (isFailToLL && !isFailToHH) {
            microTrend = "BULLISH_REVERSAL";
        } 
        // กำลังกลับตัวลง
        else if (isFailToHH && !isFailToLL) {
            microTrend = "BEARISH_REVERSAL";
        }
    } else if (candles.length >= 10) {
        // Fallback หาแรงส่ง (Momentum) 10 แท่งล่าสุดถ้า Swing ยังไม่พอ
        const currentClose = candles[candles.length - 1].close;
        const pastClose = candles[candles.length - 10].close;
        if (currentClose > pastClose) microTrend = "BULLISH";
        else if (currentClose < pastClose) microTrend = "BEARISH";
    }

    return { isFailToLL, isFailToHH, isRetestingSupport, isRetestingResistance, swings, microTrend };
}

function detectMotherFishPattern(data) {
    const { candles } = data;

    if (!candles || candles.length < 1) {
        return { pattern: "NONE" };
    }

    const len = candles.length;
    const currentCandle = candles[len - 1];
    const prevCandle = len >= 2 ? candles[len - 2] : null;
    const prePrevCandle = len >= 3 ? candles[len - 3] : null;

    // Helper to get candle properties
    const getProps = (c) => {
        if (!c) return null;
        const body = Math.abs(c.close - c.open);
        const upperWick = c.high - Math.max(c.open, c.close);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const totalSize = c.high - c.low;
        const isBull = c.close > c.open;
        const isBear = c.close < c.open;
        return { body, upperWick, lowerWick, totalSize, isBull, isBear };
    };

    const cProps = getProps(currentCandle);
    const pProps = getProps(prevCandle);
    const ppProps = getProps(prePrevCandle);

    let patternResult = { pattern: "NONE", strength: 0, type: "Unknown", slPrice: null, tpPrice: null };

    // 1. PIN BAR / HAMMER / SHOOTING STAR (1 Candle Pattern)
    if (cProps && cProps.totalSize > 0) {
        if (cProps.lowerWick > cProps.body * 2 && cProps.upperWick < cProps.body) {
            patternResult = {
                pattern: "CLAW_BUY",
                strength: cProps.body + cProps.lowerWick,
                type: "Pin_Bar_Hammer",
                slPrice: currentCandle.low - 1.5 // SL ใต้หางเผื่อระยะ Spread
            };
        }
        else if (cProps.upperWick > cProps.body * 2 && cProps.lowerWick < cProps.body) {
            patternResult = {
                pattern: "CLAW_SELL",
                strength: cProps.body + cProps.upperWick,
                type: "Pin_Bar_Shooting_Star",
                slPrice: currentCandle.high + 1.5 // SL เหนือหางเผื่อระยะ Spread
            };
        }
    }

    // 2. ENGULFING / PIERCING / DARK CLOUD (2 Candle Patterns)
    if (patternResult.pattern === "NONE" && pProps) {
        if (pProps.isBear && cProps.isBull && currentCandle.close >= (prevCandle.close + pProps.body * 0.5)) {
            const isEngulfing = currentCandle.close > prevCandle.open && currentCandle.open < prevCandle.close;
            patternResult = {
                pattern: "CLAW_BUY",
                strength: cProps.body,
                type: isEngulfing ? "Bullish_Engulfing" : "Piercing_Pattern",
                slPrice: Math.min(currentCandle.low, prevCandle.low) - 1.5
            };
        }
        else if (pProps.isBull && cProps.isBear && currentCandle.close <= (prevCandle.close - pProps.body * 0.5)) {
            const isEngulfing = currentCandle.close < prevCandle.open && currentCandle.open > prevCandle.close;
            patternResult = {
                pattern: "CLAW_SELL",
                strength: cProps.body,
                type: isEngulfing ? "Bearish_Engulfing" : "Dark_Cloud_Cover",
                slPrice: Math.max(currentCandle.high, prevCandle.high) + 1.5
            };
        }
    }

    // 3. MORNING STAR / EVENING STAR / BASE BREAK (3 Candle Patterns)
    if (patternResult.pattern === "NONE" && ppProps) {
        if (ppProps.isBear && pProps.body < ppProps.body * 0.5 && cProps.isBull && currentCandle.close > prevCandle.high) {
            patternResult = {
                pattern: "CLAW_BUY",
                strength: cProps.body,
                type: "Morning_Star_Base_Break",
                slPrice: prevCandle.low - 1.5 // ใต้ Base
            };
        }
        else if (ppProps.isBull && pProps.body < ppProps.body * 0.5 && cProps.isBear && currentCandle.close < prevCandle.low) {
            patternResult = {
                pattern: "CLAW_SELL",
                strength: cProps.body,
                type: "Evening_Star_Base_Break",
                slPrice: prevCandle.high + 1.5 // เหนือ Base
            };
        }
    }

    // 4. TREND CONTINUATION / WATERFALL DROP (3 Candle Momentum Patterns)
    // [NEW] เพื่อให้ระบบกระโดดเกาะรถไฟที่กำลังวิ่งแรงๆ ได้ โดยไม่ต้องรอการพักตัว (Pullback)
    if (patternResult.pattern === "NONE" && ppProps) {
        
        // กฎ 3 ทหารเสือฝั่งลง (Three Black Crows / Waterfall)
        // แท่งแดง 3 แท่งติด, ปิดต่ำลงเรื่อยๆ, และมีขนาดแท่งที่ใหญ่พอสมควร (เนื้อเทียน > 50 จุด)
        if (ppProps.isBear && pProps.isBear && cProps.isBear &&
            prevCandle.close < prePrevCandle.close && currentCandle.close < prevCandle.close &&
            cProps.body > 0.5 && pProps.body > 0.5 && ppProps.body > 0.5) 
        {
            // เช็ก Volume: ถ้ายิ่งทุบยิ่ง Volume พุ่ง (Confirm Momentum)
            if (currentCandle.tick_volume > prePrevCandle.tick_volume || prevCandle.tick_volume > prePrevCandle.tick_volume) {
                patternResult = {
                    pattern: "CLAW_SELL",
                    strength: cProps.body + pProps.body + ppProps.body,
                    type: "Waterfall_Drop_Continuation",
                    slPrice: prePrevCandle.high + 1.5 // SL วางไว้บนยอดของแท่งแรกในชุด 3 แท่ง
                };
            }
        }

        // กฎ 3 ทหารเสือฝั่งขึ้น (Three White Soldiers / Rocket)
        // แท่งเขียว 3 แท่งติด, ปิดสูงขึ้นเรื่อยๆ, และมีขนาดแท่งที่ใหญ่พอสมควร
        if (ppProps.isBull && pProps.isBull && cProps.isBull &&
            prevCandle.close > prePrevCandle.close && currentCandle.close > prevCandle.close &&
            cProps.body > 0.5 && pProps.body > 0.5 && ppProps.body > 0.5) 
        {
            if (currentCandle.tick_volume > prePrevCandle.tick_volume || prevCandle.tick_volume > prePrevCandle.tick_volume) {
                patternResult = {
                    pattern: "CLAW_BUY",
                    strength: cProps.body + pProps.body + ppProps.body,
                    type: "Rocket_Surge_Continuation",
                    slPrice: prePrevCandle.low - 1.5 // SL วางไว้ใต้ฐานของแท่งแรกในชุด 3 แท่ง
                };
            }
        }
    }

    // 5. WEAK PULLBACK CONTINUATION (เทรดตามน้ำตอนที่กราฟย่อตัวอ่อนแรง)
    // [NEW] ดักจับกรณีที่กราฟทุบลงมาแรงมาก แล้วมีการเด้งสีเขียวอ่อนๆ (ห้าม Buy สวน แต่ให้เตรียม Sell ตามน้ำ)
    if (patternResult.pattern === "NONE" && ppProps) {
        // Sell Pullback: แท่งก่อนหน้านู้น (ppProps) เป็นแท่งแดงใหญ่ทะลวงทุบลงมา (Body > 2.0 ดอลลาร์) 
        // ตามด้วยแท่งพักตัวสีเขียวเล็กๆ หรือ Doji (Body < 40% ของแท่งแดงใหญ่) 
        if (ppProps.isBear && ppProps.body > 2.0 && pProps.isBull && pProps.body < ppProps.body * 0.3 && cProps.body < ppProps.body * 0.3) {
            if (prePrevCandle.tick_volume > prevCandle.tick_volume * 1.5) { // แท่งทุบวอลุ่มต้องสูงกว่าแท่งเด้งเยอะๆ (เด้งหลอก)
                patternResult = {
                    pattern: "CLAW_SELL",
                    strength: ppProps.body,
                    type: "Weak_Pullback_Continuation",
                    slPrice: prePrevCandle.high + 1.0, // SL อยู่บนยอดของแท่งที่ทุบลงมา
                    tpPrice: prePrevCandle.low - 0.5   // TP เอาแค่ Low เดิมที่เพิ่งทำไว้ (TP สั้นมากๆ ชัวร์ๆ)
                };
            }
        }
        
        // Buy Pullback: แท่งก่อนหน้านู้น (ppProps) เป็นแท่งเขียวใหญ่พุ่งทะยาน (Body > 2.0 ดอลลาร์)
        // ตามด้วยแท่งพักตัวสีแดงเล็กๆ (Body < 40% ของแท่งเขียวใหญ่)
        if (ppProps.isBull && ppProps.body > 2.0 && pProps.isBear && pProps.body < ppProps.body * 0.3 && cProps.body < ppProps.body * 0.3) {
            if (prePrevCandle.tick_volume > prevCandle.tick_volume * 1.5) { // แท่งพุ่งวอลุ่มต้องสูงกว่าแท่งพักตัว
                patternResult = {
                    pattern: "CLAW_BUY",
                    strength: ppProps.body,
                    type: "Weak_Pullback_Continuation",
                    slPrice: prePrevCandle.low - 1.0, // SL อยู่ใต้ฐานของแท่งที่พุ่งขึ้นไป
                    tpPrice: prePrevCandle.high + 0.5 // TP เอาแค่ High เดิมที่เพิ่งทำไว้
                };
            }
        }
    }

      // 6. DESCENDING TRIANGLE BREAKDOWN
      if (patternResult.pattern === "NONE" && candles.length >= 20) {
        const triangle = detectDescendingTriangle(candles, {
          lookback: 20,
          minTouchesHigh: 3,
          minTouchesLow: 2,
          lowTolerancePercent: 0.0025,
          minSlopeHigh: -0.05,
          breakoutCloseFactor: 0.15,
          minBodyFactor: 0.8,
          useVolume: true,
          volumeFactor: 1.05,
        });
    
        if (triangle.detected) {
          patternResult = {
            pattern: triangle.pattern,
            strength: triangle.strength,
            type: triangle.type,
            slPrice: triangle.slPrice,
            tpPrice: triangle.tpPrice,
            meta: triangle.meta,
          };
        }
      }

    // 7. ASCENDING TRIANGLE BREAKOUT
    if (patternResult.pattern === "NONE" && candles.length >= 20) {
      const triangle = detectAscendingTriangle(candles, {
        lookback: 20,
        minTouchesHigh: 2,
        minTouchesLow: 3,
        highTolerancePercent: 0.0025,
        minSlopeLow: 0.05,
        breakoutCloseFactor: 0.15,
        minBodyFactor: 0.8,
        useVolume: true,
        volumeFactor: 1.05,
        slBuffer: 1.5,
      });
    
      if (triangle.detected) {
        patternResult = {
          pattern: triangle.pattern,
          strength: triangle.strength,
          type: triangle.type,
          slPrice: triangle.slPrice,
          tpPrice: triangle.tpPrice,
          meta: triangle.meta,
        };
      }
    }

    // เพิ่ม Market Structure Analysis
    const structure = detectMarketStructure(candles);
    
    // คำนวณ TP จาก Swing 
    if (patternResult.pattern === "CLAW_BUY") {
        const shs = structure.swings.filter(s => s.type === 'SH');
        if (shs.length > 0) {
            patternResult.tpPrice = shs[shs.length - 1].price; // TP ที่ต้าน (Swing High ล่าสุด)
        }
    } else if (patternResult.pattern === "CLAW_SELL") {
        const sls = structure.swings.filter(s => s.type === 'SL');
        if (sls.length > 0) {
            patternResult.tpPrice = sls[sls.length - 1].price; // TP ที่รับ (Swing Low ล่าสุด)
        }
    }

    // แนบโครงสร้างย่อยส่งกลับไปให้ decision engine ตัดสินใจเรื่อง SCALP Mode
    patternResult.structure = structure;
    

    return patternResult;
}

function avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((sum, n) => sum + Number(n || 0), 0) / arr.length;
}

function candleBody(c) {
  return Math.abs(Number(c?.close || 0) - Number(c?.open || 0));
}

function analyzeFourCandleTrend(candles = [], label = "TF") {
  if (!Array.isArray(candles) || candles.length < 4) {
    return {
      label,
      trend: "NEUTRAL",
      trendStrength: "WEAK",
      volumeConfirmed: false,
      bullishCount: 0,
      bearishCount: 0,
      higherHighCount: 0,
      lowerLowCount: 0,
      higherLowCount: 0,
      lowerHighCount: 0,
      avgBody: 0,
      avgVolume: 0,
      recentVolumeAvg: 0,
      priorVolumeAvg: 0,
      score: 0,
    };
  }

  const last4 = candles.slice(-4);

  let bullishCount = 0;
  let bearishCount = 0;
  let higherHighCount = 0;
  let lowerLowCount = 0;
  let higherLowCount = 0;
  let lowerHighCount = 0;

  for (let i = 0; i < last4.length; i++) {
    const c = last4[i];
    if (Number(c.close) > Number(c.open)) bullishCount++;
    if (Number(c.close) < Number(c.open)) bearishCount++;

    if (i > 0) {
      const prev = last4[i - 1];
      if (Number(c.high) > Number(prev.high)) higherHighCount++;
      if (Number(c.low) > Number(prev.low)) higherLowCount++;
      if (Number(c.low) < Number(prev.low)) lowerLowCount++;
      if (Number(c.high) < Number(prev.high)) lowerHighCount++;
    }
  }

  const volumes = last4.map(c => Number(c?.tick_volume || 0));
  const priorVolumeAvg = avg(volumes.slice(0, 2));
  const recentVolumeAvg = avg(volumes.slice(2, 4));
  const avgVolume = avg(volumes);
  const avgBody = avg(last4.map(candleBody));

  let trend = "NEUTRAL";
  let trendStrength = "WEAK";
  let score = 0;

  const bullishStructure =
    bullishCount >= 3 &&
    higherHighCount >= 2 &&
    higherLowCount >= 2;

  const bearishStructure =
    bearishCount >= 3 &&
    lowerLowCount >= 2 &&
    lowerHighCount >= 2;

  if (bullishStructure) {
    trend = "BULLISH";
    score += 3;
    if (bullishCount === 4) score += 1;
    if (higherHighCount === 3) score += 1;
    if (higherLowCount === 3) score += 1;
  } else if (bearishStructure) {
    trend = "BEARISH";
    score += 3;
    if (bearishCount === 4) score += 1;
    if (lowerLowCount === 3) score += 1;
    if (lowerHighCount === 3) score += 1;
  }

  // volume confirm = ชุด 2 แท่งหลังแรงกว่าชุด 2 แท่งแรกอย่างมีนัย
  const volumeConfirmed =
    priorVolumeAvg > 0 &&
    recentVolumeAvg >= priorVolumeAvg * 1.10;

  if (trend !== "NEUTRAL" && volumeConfirmed) {
    score += 2;
  }

  if (trend !== "NEUTRAL" && avgBody >= 0.8) {
    score += 1;
  }

  if (score >= 6) trendStrength = "STRONG";
  else if (score >= 4) trendStrength = "MEDIUM";

  return {
    label,
    trend,
    trendStrength,
    volumeConfirmed,
    bullishCount,
    bearishCount,
    higherHighCount,
    lowerLowCount,
    higherLowCount,
    lowerHighCount,
    avgBody: Number(avgBody.toFixed(2)),
    avgVolume: Number(avgVolume.toFixed(2)),
    recentVolumeAvg: Number(recentVolumeAvg.toFixed(2)),
    priorVolumeAvg: Number(priorVolumeAvg.toFixed(2)),
    score,
  };
}

function detectTrendAndRange(candlesH1, candlesH4) {
  const h1 = analyzeFourCandleTrend(candlesH1 || [], "H1");
  const h4 = analyzeFourCandleTrend(candlesH4 || [], "H4");

  let overallTrend = "NEUTRAL";
  let trendStrength = "WEAK";

  if (h1.trend === "BULLISH" && h4.trend === "BULLISH") {
    overallTrend = "BULLISH";
    trendStrength =
      h1.volumeConfirmed && h4.volumeConfirmed ? "STRONG" : "MEDIUM";
  } else if (h1.trend === "BEARISH" && h4.trend === "BEARISH") {
    overallTrend = "BEARISH";
    trendStrength =
      h1.volumeConfirmed && h4.volumeConfirmed ? "STRONG" : "MEDIUM";
  } else if (
    (h1.trend === "BULLISH" && h4.trend === "NEUTRAL") ||
    (h1.trend === "NEUTRAL" && h4.trend === "BULLISH")
  ) {
    overallTrend = "BULLISH";
    trendStrength = "MEDIUM";
  } else if (
    (h1.trend === "BEARISH" && h4.trend === "NEUTRAL") ||
    (h1.trend === "NEUTRAL" && h4.trend === "BEARISH")
  ) {
    overallTrend = "BEARISH";
    trendStrength = "MEDIUM";
  } else if (h1.trend !== "NEUTRAL" || h4.trend !== "NEUTRAL") {
    overallTrend = "MIXED";
    trendStrength = "WEAK";
  }

  const rangeWidthH1 = Array.isArray(candlesH1) && candlesH1.length > 0
    ? (Math.max(...candlesH1.map(c => Number(c.high || 0))) -
       Math.min(...candlesH1.map(c => Number(c.low || 0)))) * 10
    : 0;

  const rangeWidthH4 = Array.isArray(candlesH4) && candlesH4.length > 0
    ? (Math.max(...candlesH4.map(c => Number(c.high || 0))) -
       Math.min(...candlesH4.map(c => Number(c.low || 0)))) * 10
    : 0;

  const volumeConfirmed = Boolean(h1.volumeConfirmed || h4.volumeConfirmed);

  let isRanging = false;
  if (
    (overallTrend === "NEUTRAL" || overallTrend === "MIXED") &&
    rangeWidthH1 > 500 &&
    rangeWidthH1 < 2000
  ) {
    isRanging = true;
  }

  return {
    overallTrend,
    trendStrength,
    isRanging,
    volumeConfirmed,
    rangeWidthH1,
    rangeWidthH4,
    h1,
    h4,
  };
}

module.exports = { detectMotherFishPattern, detectTrendAndRange, detectMarketStructure };
