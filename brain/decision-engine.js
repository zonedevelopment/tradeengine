const { detectTrendAndRange } = require("../pattern/pattern-rules");
const { findFailedPattern } = require("../failedPattern.repo");
const {
  buildContextFeatures,
  buildContextHashNew,
} = require("../utils/context-features");

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

    const strongPatterns = [
      "Bullish_Engulfing",
      "Bearish_Engulfing",
      "Morning_Star_Base_Break",
      "Evening_Star_Base_Break",
    ];

    const momentumPatterns = [
      "Waterfall_Drop_Continuation",
      "Rocket_Surge_Continuation",
    ];

    if (strongPatterns.includes(pattern.type)) {
      patternScore *= 1.2;
    } else if (momentumPatterns.includes(pattern.type)) {
      if (tradeMode === "SCALP") {
        tradeMode = "NORMAL";
      }
      patternScore *= 1.5;
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

if (
  trendContext.overallTrend === "MIXED" &&
  tradeMode === "NORMAL"
) {
  tradeMode = "SCALP";
  patternScore *= 0.90;
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
    patternScore *= 0.85;
    if (tradeMode === "NORMAL") {
      tradeMode = "SCALP";
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
      // volume เบา = สัญญาณไม่น่าเชื่อถือ โดยเฉพาะ breakout
      score *= 0.75;

      if (tradeMode === "NORMAL") {
        tradeMode = "SCALP";
      }
    }
  }

  score *= confidenceMultiplier;

  if (defensiveFlags.warningMatched) {
    score *= 0.5;
    tradeMode = "SCALP";
  }

  if (market && market.portfolio) {
    const { currentPosition, count } = market.portfolio;

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

      if (currentPosition === "BUY" && score >= 2.25) {
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
      } else if (currentPosition === "SELL" && score <= -2.25) {
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

  return {
    score,
    patternType: pattern ? pattern.type : "Unknown",
    trend: trendContext.overallTrend,
    mode: tradeMode,
    defensiveFlags,
  };
}

function decision(evaluation) {
  if (evaluation.action === "NO_TRADE") {
    return evaluation.action;
  }

  if (
    evaluation.action === "ALLOW_BUY_PYRAMID" ||
    evaluation.action === "ALLOW_SELL_PYRAMID"
  ) {
    return evaluation.action;
  }

  const { score, mode } = evaluation;

  if (score >= 2.15) {
    return mode === "SCALP" ? "ALLOW_BUY_SCALP" : "ALLOW_BUY";
  }

  if (score <= -2.15) {
    return mode === "SCALP" ? "ALLOW_SELL_SCALP" : "ALLOW_SELL";
  }

  return "NO_TRADE";
}

module.exports = {
  evaluateDecision,
  decision,
};
