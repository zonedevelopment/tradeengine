const { detectTrendAndRange } = require("../pattern/pattern-rules");
const { findFailedPattern } = require("../failedPattern.repo");
const { getPatternWeight } = require("../strategyWeights.repo");
const {
  buildContextFeatures,
  buildContextHashNew,
} = require("../utils/context-features");

const { findAdaptiveScoreRule } = require("../adaptiveScore.repo");

const {
  enforceDirectionBiasOnDecision,
} = require("../tradingPreferences.service");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getCandleDirection(candle = {}) {
  const open = toNumber(candle.open);
  const close = toNumber(candle.close);
  const high = toNumber(candle.high);
  const low = toNumber(candle.low);

  return {
    open,
    close,
    high,
    low,
    body: Math.abs(close - open),
    range: Math.max(high - low, 0),
    isBull: close > open,
    isBear: close < open,
  };
}

function averageBody(candles = [], lookback = 5) {
  if (!Array.isArray(candles) || candles.length === 0) return 0;

  const sample = candles.slice(-lookback);
  if (!sample.length) return 0;

  const total = sample.reduce((sum, candle) => {
    const c = getCandleDirection(candle);
    return sum + c.body;
  }, 0);

  return total / sample.length;
}

function detectEarlyBuyMomentum(candles = []) {
  if (!Array.isArray(candles) || candles.length < 4) return 0;

  const c1 = getCandleDirection(candles[candles.length - 1]);
  const c2 = getCandleDirection(candles[candles.length - 2]);
  const c3 = getCandleDirection(candles[candles.length - 3]);
  const avgRecentBody = averageBody(candles.slice(0, -1), 5);

  let scoreBoost = 0;

  const hasTwoBullishCandles = c1.isBull && c2.isBull;
  const higherHigh = c1.high > c2.high || c2.high > c3.high;
  const higherLow = c1.low > c2.low || c2.low > c3.low;
  const higherClose = c1.close > c2.close && c2.close >= c3.close;

  const bodyStrength =
    avgRecentBody > 0 &&
    (c1.body >= avgRecentBody * 0.8 || c2.body >= avgRecentBody * 0.8);

  if (hasTwoBullishCandles) scoreBoost += 0.12;
  if (higherHigh) scoreBoost += 0.08;
  if (higherLow) scoreBoost += 0.08;
  if (higherClose) scoreBoost += 0.10;
  if (bodyStrength) scoreBoost += 0.07;

  if (c1.close > c2.high) scoreBoost += 0.10;
  if (c2.close > c3.high) scoreBoost += 0.08;

  return Number(scoreBoost.toFixed(4));
}

function detectEarlySellMomentum(candles = []) {
  if (!Array.isArray(candles) || candles.length < 4) return 0;

  const c1 = getCandleDirection(candles[candles.length - 1]);
  const c2 = getCandleDirection(candles[candles.length - 2]);
  const c3 = getCandleDirection(candles[candles.length - 3]);
  const avgRecentBody = averageBody(candles.slice(0, -1), 5);

  let scoreBoost = 0;

  const hasTwoBearishCandles = c1.isBear && c2.isBear;
  const lowerLow = c1.low < c2.low || c2.low < c3.low;
  const lowerHigh = c1.high < c2.high || c2.high < c3.high;
  const lowerClose = c1.close < c2.close && c2.close <= c3.close;

  const bodyStrength =
    avgRecentBody > 0 &&
    (c1.body >= avgRecentBody * 0.8 || c2.body >= avgRecentBody * 0.8);

  if (hasTwoBearishCandles) scoreBoost -= 0.12;
  if (lowerLow) scoreBoost -= 0.08;
  if (lowerHigh) scoreBoost -= 0.08;
  if (lowerClose) scoreBoost -= 0.10;
  if (bodyStrength) scoreBoost -= 0.07;

  if (c1.close < c2.low) scoreBoost -= 0.10;
  if (c2.close < c3.low) scoreBoost -= 0.08;

  return Number(scoreBoost.toFixed(4));
}

function isGoldSymbol(symbol = "") {
  const s = String(symbol || "").toUpperCase();
  return s === "XAUUSD" || s === "XAUUSDM" || s === "XAUUSDm";
}

function clampThreshold(value, min, max) {
  const num = Number(value || 0);
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function getDynamicThresholdContext({
  mode = "NORMAL",
  trend = "NEUTRAL",
  adaptiveScoreDelta = 0,
  historicalVolumeSignal = null,
  defensiveFlags = {},
  symbol
}) {
  // let buyThreshold = mode === "SCALP" ? 2.45 : 2.15;
  // let sellThreshold = mode === "SCALP" ? -2.45 : -2.15;

  let buyThreshold = mode === "SCALP" ? 2.25 : 2.10;
  let sellThreshold = mode === "SCALP" ? -2.25 : -2.10;

  // 1) trend ผสม = เข้ายากขึ้น
  if (trend === "MIXED") {
    buyThreshold += 0.15;
    sellThreshold -= 0.15;
  }

  // 2) adaptive_score_delta
  // บริบทดี (delta บวก) = threshold ผ่อนลงเล็กน้อย
  // บริบทแย่ (delta ลบ) = threshold เข้มขึ้น
  const adaptiveDelta = Number(adaptiveScoreDelta || 0);

  if (adaptiveDelta >= 0.30) {
    buyThreshold -= 0.12;
    sellThreshold += 0.12;
  } else if (adaptiveDelta >= 0.15) {
    buyThreshold -= 0.07;
    sellThreshold += 0.07;
  } else if (adaptiveDelta <= -0.30) {
    buyThreshold += 0.18;
    sellThreshold -= 0.18;
  } else if (adaptiveDelta <= -0.15) {
    buyThreshold += 0.10;
    sellThreshold -= 0.10;
  }

  // 3) volume context
  if (historicalVolumeSignal === "HISTORICAL_CLIMAX") {
    buyThreshold -= 0.08;
    sellThreshold += 0.08;
  } else if (historicalVolumeSignal === "ABOVE_AVERAGE") {
    buyThreshold -= 0.04;
    sellThreshold += 0.04;
  } else if (historicalVolumeSignal === "LOW_VOLUME") {
    // buyThreshold += 0.12;
    // sellThreshold -= 0.12;
    if (isGoldSymbol(symbol)) {
      buyThreshold += 0.05;
      sellThreshold -= 0.05;
    } else {
      buyThreshold += 0.10;
      sellThreshold -= 0.10;
    }
  }

  // 4) defensive flag = เข้ายากขึ้นชัดเจน
  if (defensiveFlags?.warningMatched) {
    buyThreshold += 0.20;
    sellThreshold -= 0.20;
  }

  // clamp กัน threshold เพี้ยนเกิน
  const minAbs = mode === "SCALP" ? 2.10 : 1.90;
  const maxAbs = mode === "SCALP" ? 2.90 : 2.60;

  buyThreshold = clampThreshold(buyThreshold, minAbs, maxAbs);
  sellThreshold = -clampThreshold(Math.abs(sellThreshold), minAbs, maxAbs);

  return {
    buyThreshold,
    sellThreshold,
  };
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, Number(num || 0)));
}

function applyAdaptiveScore(patternScore, adaptiveDelta) {
  const delta = clamp(adaptiveDelta, -0.60, 0.60);

  // adaptiveDelta เป็นการ "บวกคะแนน" โดยตรง
  // ไม่ใช่ multiplier จะควบคุมง่ายกว่า
  return Number(patternScore || 0) + delta;
}

function applyLearnedPatternWeight(patternScore, learnedWeight) {
  const w = Number(learnedWeight || 0);

  // จำกัดผลกระทบไม่ให้แรงเกินไปในรอบแรก
  // learnedWeight ในระบบตอนนี้วิ่งประมาณ -2 ถึง 2
  // map เป็น multiplier 0.80 ถึง 1.20
  const multiplier = Math.max(0.80, Math.min(1.20, 1 + (w * 0.10)));

  return patternScore * multiplier;
}

async function findFailedPatternRule({
  userId,
  accountId = null,
  symbol,
  timeframe,
  side,
  mode,
  pattern,
  market,
}) {
  const candles = market && Array.isArray(market.candles) ? market.candles : [];

  const contextFeatures = buildContextFeatures({
    symbol,
    timeframe,
    side,
    mode,
    pattern,
    marketPrice: market?.price || 0,
    candles,
    now: new Date(),
  });

  const contextHash = buildContextHashNew(contextFeatures);

  return await findFailedPattern({
    userId: userId || null,
    accountId,
    symbol,
    timeframe,
    side,
    mode,
    contextHash,
  });
}

async function evaluateDecision({
  news,
  calendar,
  session,
  risk,
  pattern,
  ictContext,
  historicalVolume,
  market,
}) {
  let score = 0;
  let confidenceMultiplier = 1.0;
  let tradeMode = "NORMAL";
  let defensiveFlags = {
    warningMatched: false,
    lotMultiplier: 1,
    tpMultiplier: 1,
    reason: null,
  };

  if (ictContext && pattern.pattern !== "NONE") {
    const currentPrice = market.price || 0;

    if (pattern.pattern === "MOTHER_FISH_BUY" && ictContext.isLiquiditySweepDown) {
      confidenceMultiplier += 2.0;
      tradeMode = "NORMAL";
    } else if (pattern.pattern === "MOTHER_FISH_SELL" && ictContext.isLiquiditySweepUp) {
      confidenceMultiplier += 2.0;
      tradeMode = "NORMAL";
    } else if (pattern.pattern === "MOTHER_FISH_BUY" && ictContext.demandZones.length > 0) {
      const nearestDemandZone = ictContext.demandZones[0];
      if (Math.abs(currentPrice - nearestDemandZone.midpoint) <= 2.0) {
        confidenceMultiplier += 1.2;
      }
    } else if (pattern.pattern === "MOTHER_FISH_SELL" && ictContext.supplyZones.length > 0) {
      const nearestSupplyZone = ictContext.supplyZones[0];
      if (Math.abs(currentPrice - nearestSupplyZone.midpoint) <= 2.0) {
        confidenceMultiplier += 1.2;
      }
    }
  }

  const candlesH1 = market && market.candlesH1 ? market.candlesH1 : [];
  const candlesH4 = market && market.candlesH4 ? market.candlesH4 : [];

  const trendContext = detectTrendAndRange(candlesH1, candlesH4);
  const trendFollow4 = pattern?.trendFollow4 || {
    direction: "NEUTRAL",
    volumeConfirmed: false,
    strength: "WEAK",
  };

  if (trendContext.isRanging && !trendContext.volumeConfirmed) {
    tradeMode = "SCALP";
  }

  if (pattern && pattern.structure) {
    const struct = pattern.structure;

    if (pattern.pattern === "MOTHER_FISH_SELL" && struct.isFailToLL) {
      tradeMode = "SCALP";
      confidenceMultiplier -= 0.3;
    }

    if (pattern.pattern === "MOTHER_FISH_BUY" && struct.isFailToHH) {
      tradeMode = "SCALP";
      confidenceMultiplier -= 0.3;
    }

    if (pattern.pattern === "MOTHER_FISH_BUY" && struct.isRetestingSupport) {
      confidenceMultiplier += 0.8;
      tradeMode = "NORMAL";
    }

    if (pattern.pattern === "MOTHER_FISH_SELL" && struct.isRetestingResistance) {
      confidenceMultiplier += 0.8;
      tradeMode = "NORMAL";
    }
  }

  if (news && news.goldImpact === "bullish") score += 2;
  if (news && news.goldImpact === "bearish") score -= 2;

  if (calendar && (calendar.highImpactNews || calendar.blockTrading)) {
    return {
      action: "NO_TRADE",
      reason: "HIGH_IMPACT_NEWS_PENDING",
      score: 0,
    };
  }

  if (risk && risk.dailyLossLimit) {
    return {
      action: "NO_TRADE",
      reason: "DAILY_LOSS_LIMIT_REACHED",
      score: 0,
    };
  }

  let adaptiveScoreDelta = 0;
  const historicalVolumeSignal = historicalVolume?.signal || null;
  if (pattern && pattern.pattern !== "NONE") {
    const side = pattern.pattern === "MOTHER_FISH_BUY" ? "BUY" : "SELL";
    const timeframe = market && market.timeframe ? market.timeframe : "M5";

    const failedRule = await findFailedPatternRule({
      userId: market.userId || null,
      accountId: market.accountId || null,
      symbol: market.symbol || "XAUUSD",
      timeframe,
      side,
      mode: tradeMode,
      pattern,
      market,
    });

    if (failedRule) {
      if (failedRule.suggested_action === "BLOCK_TRADE") {
        return {
          action: "NO_TRADE",
          reason: "AVOIDING_KNOWN_FAILURE_PATTERN",
          score: 0,
        };
      }

      if (failedRule.suggested_action === "WARNING") {
        defensiveFlags = {
          warningMatched: true,
          lotMultiplier: 0.5,
          tpMultiplier: 0.5,
          reason: "KNOWN_FAILURE_PATTERN_WARNING",
        };
      }
    }

    const microTrend = pattern?.structure?.microTrend || "NEUTRAL";

    const isBuyPattern =
      pattern?.pattern === "MOTHER_FISH_BUY" ||
      pattern?.pattern === "CLAW_BUY";

    const isSellPattern =
      pattern?.pattern === "MOTHER_FISH_SELL" ||
      pattern?.pattern === "CLAW_SELL";

    const isBullishMicroTrend =
      microTrend === "BULLISH" || microTrend === "BULLISH_REVERSAL";

    const isBearishMicroTrend =
      microTrend === "BEARISH" || microTrend === "BEARISH_REVERSAL";

    let patternScore = pattern.score || 0;

    // const learnedWeight = await getPatternWeight(market?.symbol || "DEFAULT", pattern.type);
    const learnedWeight = await getPatternWeight({
      firebaseUserId: market?.userId || null,
      accountId: market?.accountId || "",
      symbol: market?.symbol || "DEFAULT",
      patternName: pattern?.type || "",
    });
    patternScore = applyLearnedPatternWeight(patternScore, learnedWeight);

    const strongPatterns = [
      "Bullish_Engulfing",
      "Bearish_Engulfing",
      "Morning_Star_Base_Break",
      "Evening_Star_Base_Break",
    ];

    const momentumPatterns = [
      "Waterfall_Drop_Continuation",
      "Rocket_Surge_Continuation",
      "Descending_Triangle_Breakdown",
      "Ascending_Triangle_Breakout"
    ];

    if (strongPatterns.includes(pattern.type)) {
      patternScore *= 1.2;
    } else if (momentumPatterns.includes(pattern.type)) {
      if (tradeMode === "SCALP") {
        tradeMode = "NORMAL";
      }
      patternScore *= 1.5;
    } else if (pattern.type === "Descending_Triangle_Breakdown") {
      if (tradeMode === "SCALP") {
        tradeMode = "NORMAL";
      }
      patternScore *= 1.45;
    } else if (pattern.type === "Ascending_Triangle_Breakout") {
      if (tradeMode === "SCALP") {
        tradeMode = "NORMAL";
      }
      patternScore *= 1.45;
    }

    if (tradeMode === "NORMAL") {
      if (trendContext.overallTrend === "BULLISH" && pattern.pattern === "MOTHER_FISH_BUY") {
        patternScore *= 1.5;
      } else if (
        trendContext.overallTrend === "BEARISH" &&
        pattern.pattern === "MOTHER_FISH_SELL"
      ) {
        patternScore *= 1.5;
      } else if (
        trendContext.overallTrend === "BULLISH" &&
        pattern.pattern === "MOTHER_FISH_SELL" &&
        trendContext.trendStrength === "STRONG"
      ) {
        patternScore *= 0.5;
      } else if (
        trendContext.overallTrend === "BEARISH" &&
        pattern.pattern === "MOTHER_FISH_BUY" &&
        trendContext.trendStrength === "STRONG"
      ) {
        patternScore *= 0.5;
      }
    } else if (tradeMode === "SCALP") {
      if (isBuyPattern && isBullishMicroTrend) {
        patternScore *= 1.25;
      }

      if (isSellPattern && isBearishMicroTrend) {
        patternScore *= 1.25;
      }

      if (isBuyPattern && isBearishMicroTrend) {
        patternScore *= 0.75;
      }

      if (isSellPattern && isBullishMicroTrend) {
        patternScore *= 0.75;
      }

      // reversal microtrend ให้ boost เพิ่มเล็กน้อย
      if (isBuyPattern && microTrend === "BULLISH_REVERSAL") {
        patternScore *= 1.10;
      }

      if (isSellPattern && microTrend === "BEARISH_REVERSAL") {
        patternScore *= 1.10;
      }
    } else {
      const microTrend =
        pattern && pattern.structure ? pattern.structure.microTrend : "NEUTRAL";

      if (pattern.isVolumeClimax) {
        patternScore *= 1.8;
        tradeMode = "NORMAL";
      } else {
        if (
          (microTrend === "BULLISH" || microTrend === "BULLISH_REVERSAL") &&
          pattern.pattern === "MOTHER_FISH_BUY"
        ) {
          patternScore *= 1.5;
        } else if (
          (microTrend === "BEARISH" || microTrend === "BEARISH_REVERSAL") &&
          pattern.pattern === "MOTHER_FISH_SELL"
        ) {
          patternScore *= 1.5;
        } else if (
          (microTrend === "BULLISH" || microTrend === "BULLISH_REVERSAL") &&
          pattern.pattern === "MOTHER_FISH_SELL"
        ) {
          patternScore *= 0.6;
        } else if (
          (microTrend === "BEARISH" || microTrend === "BEARISH_REVERSAL") &&
          pattern.pattern === "MOTHER_FISH_BUY"
        ) {
          patternScore *= 0.6;
        } else {
          patternScore *= 0.9;
        }
      }

      // ===== 4-candle trend follow confirmation (M5) =====
      if (trendFollow4.direction === "BUY" && isBuyPattern) {
        patternScore *= trendFollow4.volumeConfirmed ? 1.35 : 1.10;
      }

      if (trendFollow4.direction === "SELL" && isSellPattern) {
        patternScore *= trendFollow4.volumeConfirmed ? 1.35 : 1.10;
      }

      if (trendFollow4.direction === "BUY" && isSellPattern) {
        patternScore *= 0.75;
      }

      if (trendFollow4.direction === "SELL" && isBuyPattern) {
        patternScore *= 0.75;
      }

      if (!trendFollow4.volumeConfirmed && trendFollow4.direction !== "NEUTRAL") {
        patternScore *= 0.90;
        if (tradeMode === "NORMAL") {
          tradeMode = "SCALP";
        }
      }

      // ===== H1/H4 trend alignment + volume confirm =====
      if (trendContext.overallTrend === "BULLISH" && isBuyPattern) {
        patternScore *= trendContext.volumeConfirmed ? 1.30 : 1.10;
      }

      if (trendContext.overallTrend === "BEARISH" && isSellPattern) {
        patternScore *= trendContext.volumeConfirmed ? 1.30 : 1.10;
      }

      if (trendContext.overallTrend === "BULLISH" && isSellPattern) {
        patternScore *= 0.70;
      }

      if (trendContext.overallTrend === "BEARISH" && isBuyPattern) {
        patternScore *= 0.70;
      }

      const goldModeSoftening = isGoldSymbol(market?.symbol);

      if (
        trendContext.overallTrend === "MIXED" &&
        tradeMode === "NORMAL"
      ) {
        patternScore *= goldModeSoftening ? 0.95 : 0.90;

        if (!goldModeSoftening) {
          tradeMode = "SCALP";
        }
      }

      // ===== Use recentMassive flags จริง =====
      if (pattern.recentMassiveBull && isSellPattern) {
        patternScore *= 0.65;
      }

      if (pattern.recentMassiveBear && isBuyPattern) {
        patternScore *= 0.65;
      }

      if (pattern.recentMassiveBull && isBuyPattern) {
        patternScore *= 1.15;
      }

      if (pattern.recentMassiveBear && isSellPattern) {
        patternScore *= 1.15;
      }

      if (pattern.isVolumeDrying) {
        patternScore *= goldModeSoftening ? 0.92 : 0.85;

        if (tradeMode === "NORMAL" && !goldModeSoftening) {
          tradeMode = "SCALP";
        }
      }
    }

    if (
      tradeMode === "SCALP" &&
      trendContext.overallTrend === "MIXED" &&
      !trendFollow4.volumeConfirmed &&
      pattern.isVolumeDrying
    ) {
      // if (!isGoldSymbol(market?.symbol)) {
      //   return {
      //     action: "NO_TRADE",
      //     reason: "LOW_QUALITY_SCALP_SETUP",
      //     score: 0,
      //   };
      // }

      patternScore *= 0.88;
    }


    const earlyBuyMomentum = detectEarlyBuyMomentum(market?.candles);
    const earlySellMomentum = detectEarlySellMomentum(market?.candles);

    if (isBuyPattern) {
      score += earlyBuyMomentum;
    } else {
      score += earlySellMomentum;
    }

    const sessionName = market?.sessionName || session?.name || null;
    const adaptiveRule = await findAdaptiveScoreRule({
      firebaseUserId: market?.userId || null,
      accountId: market?.accountId || null,
      symbol: market?.symbol || "XAUUSDm",
      timeframe: market?.timeframe || "M5",
      patternType: pattern?.type || "Unknown",
      side: isBuyPattern ? "BUY" : "SELL",
      mode: tradeMode,
      sessionName,
      microTrend: pattern?.structure?.microTrend || null,
      volumeProfile: pattern?.volumeProfile || null,
      rangeState: pattern?.rangeState || null,
    });

    if (adaptiveRule) {
      adaptiveScoreDelta = Number(adaptiveRule.adaptive_score_delta || 0);

      patternScore = applyAdaptiveScore(patternScore, adaptiveScoreDelta);

      if (adaptiveScoreDelta <= -0.25 && tradeMode === "NORMAL") {
        if (!isGoldSymbol(market?.symbol)) {
          tradeMode = "SCALP";
          patternScore *= 0.93;
        } else {
          patternScore *= 0.97;
        }
      }
    }

    score += patternScore;
  }

  if (historicalVolume) {
    if (historicalVolume.signal === "HISTORICAL_CLIMAX") {
      // ถ้า volume พุ่งแรงมาก ให้ boost เฉพาะ pattern continuation / strong reversal
      if (
        pattern.type === "Bullish_Engulfing" ||
        pattern.type === "Bearish_Engulfing" ||
        pattern.type === "Morning_Star_Base_Break" ||
        pattern.type === "Evening_Star_Base_Break" ||
        pattern.type === "Waterfall_Drop_Continuation" ||
        pattern.type === "Rocket_Surge_Continuation"
      ) {
        score *= 1.25;
      } else {
        score *= 1.10;
      }
    }

    if (historicalVolume.signal === "ABOVE_AVERAGE") {
      score *= 1.10;
    }

    if (historicalVolume.signal === "LOW_VOLUME") {
      if (!isGoldSymbol(market?.symbol)) {
        score *= 0.75;
      } else {
        score *= 0.90;
      }

      if (tradeMode === "NORMAL") {
        tradeMode = "SCALP";
      }
    }
  }

  score *= confidenceMultiplier;

  if (defensiveFlags.warningMatched) {
    if (!isGoldSymbol(market?.symbol)) {
      score *= 0.5;
      tradeMode = "SCALP";
    } else {
      score *= 0.75;
    }
  }

  if (market && market.portfolio) {
    const { currentPosition, count } = market.portfolio;
    const pyramidThreshold = tradeMode === "SCALP" ? 2.65 : 2.25;

    if (currentPosition !== "NONE") {
      if (currentPosition === "BUY" && score <= -2.15) {
        return {
          action: "NO_TRADE",
          reason: "ANTI_HEDGE_BLOCK",
          score: 0,
        };
      }

      if (currentPosition === "SELL" && score >= 2.15) {
        return {
          action: "NO_TRADE",
          reason: "ANTI_HEDGE_BLOCK",
          score: 0,
        };
      }

      if (currentPosition === "BUY" && score >= pyramidThreshold) {
        if (count >= 3) {
          return {
            action: "NO_TRADE",
            reason: "MAX_PYRAMID_ORDERS_REACHED",
            score: 0,
          };
        }

        return {
          action: "ALLOW_BUY_PYRAMID",
          score,
          mode: tradeMode,
          trend: trendContext.overallTrend,
          defensiveFlags,
        };
      } else if (currentPosition === "SELL" && score <= -pyramidThreshold) {
        if (count >= 3) {
          return {
            action: "NO_TRADE",
            reason: "MAX_PYRAMID_ORDERS_REACHED",
            score: 0,
          };
        }

        return {
          action: "ALLOW_SELL_PYRAMID",
          score,
          mode: tradeMode,
          trend: trendContext.overallTrend,
          defensiveFlags,
        };
      } else {
        return {
          action: "NO_TRADE",
          reason: "SCORE_TOO_LOW_FOR_PYRAMIDING",
          score: 0,
        };
      }
    }
  }

  const thresholdContext = getDynamicThresholdContext({
    mode: tradeMode,
    trend: trendContext.overallTrend,
    adaptiveScoreDelta,
    historicalVolumeSignal,
    defensiveFlags,
    symbol: market?.symbol
  });

  console.log("[EVALUATE_BREAKDOWN]", {
    symbol: market?.symbol,
    mode: tradeMode,
    trend: trendContext?.overallTrend,
    patternType: pattern?.type || "Unknown",
    adaptiveScoreDelta,
    historicalVolumeSignal,
    warningMatched: defensiveFlags?.warningMatched,
    finalScore: score,
    thresholdContext
  });

  return {
    score,
    patternType: pattern ? pattern.type : "Unknown",
    trend: trendContext.overallTrend,
    mode: tradeMode,
    defensiveFlags,
    adaptiveScoreDelta,
    historicalVolumeSignal,
    thresholdContext,
  };
}

function decision(evaluation, symbol) {
  if (evaluation.action === "NO_TRADE") {
    return evaluation.action;
  }

  if (
    evaluation.action === "ALLOW_BUY_PYRAMID" ||
    evaluation.action === "ALLOW_SELL_PYRAMID"
  ) {
    return evaluation.action;
  }

  // const { score, mode, trend } = evaluation;
  // let buyThreshold = 2.15;
  // let sellThreshold = -2.15;

  // if (mode === "SCALP") {
  //   buyThreshold = 2.45;
  //   sellThreshold = -2.45;
  // }

  // // trend ผสม ให้เข้ายากขึ้นอีก
  // if (trend === "MIXED") {
  //   buyThreshold += 0.15;
  //   sellThreshold -= 0.15;
  // }
  const {
    score,
    mode,
    trend,
    adaptiveScoreDelta = 0,
    historicalVolumeSignal = null,
    defensiveFlags = {},
    thresholdContext,
  } = evaluation;

  const dynamicThreshold =
    thresholdContext ||
    getDynamicThresholdContext({
      mode,
      trend,
      adaptiveScoreDelta,
      historicalVolumeSignal,
      defensiveFlags,
      symbol
    });

  const buyThreshold = Number(dynamicThreshold.buyThreshold || 2.15);
  const sellThreshold = Number(dynamicThreshold.sellThreshold || -2.15);

  if (score >= buyThreshold) {
    return mode === "SCALP" ? "ALLOW_BUY_SCALP" : "ALLOW_BUY";
  }

  if (score <= sellThreshold) {
    return mode === "SCALP" ? "ALLOW_SELL_SCALP" : "ALLOW_SELL";
  }

  return "NO_TRADE";
}

function resolveDecisionWithTradingPreferences(
  evaluation,
  symbol,
  options = {}
) {
  const rawDecision = decision(evaluation, symbol);

  const directionResult = enforceDirectionBiasOnDecision(
    rawDecision,
    options.tradingPreferences
  );

  return {
    decision: directionResult.decision,
    reason: directionResult.reason,
    blocked: directionResult.blocked,
  };
}

module.exports = {
  evaluateDecision,
  decision,
  resolveDecisionWithTradingPreferences
};
