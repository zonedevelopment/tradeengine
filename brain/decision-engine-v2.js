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

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, Number(num || 0)));
}

function clampThreshold(value, min, max) {
    const num = Number(value || 0);
    if (num < min) return min;
    if (num > max) return max;
    return num;
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
    return s === "XAUUSD" || s === "XAUUSDM";
}

function getSafeTrendContext(candlesH1 = [], candlesH4 = []) {
    try {
        const trend = detectTrendAndRange(candlesH1, candlesH4) || {};
        return {
            overallTrend: trend.overallTrend || "NEUTRAL",
            trendStrength: trend.trendStrength || "WEAK",
            isRanging: Boolean(trend.isRanging),
            volumeConfirmed: Boolean(trend.volumeConfirmed),
        };
    } catch (_error) {
        return {
            overallTrend: "NEUTRAL",
            trendStrength: "WEAK",
            isRanging: false,
            volumeConfirmed: false,
        };
    }
}

function resolvePatternSide(pattern = {}) {
    const rawPattern = String(pattern?.pattern || "").toUpperCase();
    const rawType = String(pattern?.type || "").toUpperCase();

    if (
        rawPattern.includes("BUY") ||
        rawType.includes("BULLISH") ||
        rawType.includes("BREAKOUT")
    ) {
        return "BUY";
    }

    if (
        rawPattern.includes("SELL") ||
        rawType.includes("BEARISH") ||
        rawType.includes("BREAKDOWN")
    ) {
        return "SELL";
    }

    return "NEUTRAL";
}

function getDirectionSign(side = "NEUTRAL") {
    if (side === "BUY") return 1;
    if (side === "SELL") return -1;
    return 0;
}

function normalizeMicroTrend(microTrend = "NEUTRAL") {
    return String(microTrend || "NEUTRAL").toUpperCase();
}

function isTrendAligned(side, trend) {
    if (side === "BUY") return trend === "BULLISH";
    if (side === "SELL") return trend === "BEARISH";
    return false;
}

function isTrendCounter(side, trend) {
    if (side === "BUY") return trend === "BEARISH";
    if (side === "SELL") return trend === "BULLISH";
    return false;
}

function isMicroTrendAligned(side, microTrend) {
    const t = normalizeMicroTrend(microTrend);
    if (side === "BUY") return t === "BULLISH" || t === "BULLISH_REVERSAL";
    if (side === "SELL") return t === "BEARISH" || t === "BEARISH_REVERSAL";
    return false;
}

function isMicroTrendReversal(side, microTrend) {
    const t = normalizeMicroTrend(microTrend);
    if (side === "BUY") return t === "BULLISH_REVERSAL";
    if (side === "SELL") return t === "BEARISH_REVERSAL";
    return false;
}

function isMicroTrendCounter(side, microTrend) {
    const t = normalizeMicroTrend(microTrend);
    if (side === "BUY") return t === "BEARISH" || t === "BEARISH_REVERSAL";
    if (side === "SELL") return t === "BULLISH" || t === "BULLISH_REVERSAL";
    return false;
}

function resolveTradeMode({ pattern = {}, trendContext = {}, trendFollow4 = {}, market = {} }) {
    const side = resolvePatternSide(pattern);
    const symbol = market?.symbol || "";
    const gold = isGoldSymbol(symbol);
    const overallTrend = String(trendContext?.overallTrend || "NEUTRAL").toUpperCase();
    const trendStrength = String(trendContext?.trendStrength || "WEAK").toUpperCase();
    const followDirection = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();
    const followVolumeConfirmed = Boolean(trendFollow4?.volumeConfirmed);

    const isMomentumPattern = new Set([
        "WATERFALL_DROP_CONTINUATION",
        "ROCKET_SURGE_CONTINUATION",
        "DESCENDING_TRIANGLE_BREAKDOWN",
        "ASCENDING_TRIANGLE_BREAKOUT",
        "FIRST_LEG_BREAKDOWN",
        "FIRST_LEG_BREAKOUT",
    ]).has(String(pattern?.type || "").toUpperCase());

    const hasRetestSupport = Boolean(pattern?.structure?.isRetestingSupport);
    const hasRetestResistance = Boolean(pattern?.structure?.isRetestingResistance);
    const isFailToHH = Boolean(pattern?.structure?.isFailToHH);
    const isFailToLL = Boolean(pattern?.structure?.isFailToLL);
    const trendAligned = isTrendAligned(side, overallTrend);
    const trendCounter = isTrendCounter(side, overallTrend);

    let mode = "NORMAL";
    let regime = "BALANCED";
    let quality = 0;
    const reasons = [];

    if (trendContext?.isRanging && !trendContext?.volumeConfirmed) {
        mode = "SCALP";
        regime = "RANGING";
        quality -= 1;
        reasons.push("RANGING_WITHOUT_HTF_VOLUME");
    }

    if (overallTrend === "MIXED") {
        mode = "SCALP";
        regime = "MIXED";
        quality -= 1;
        reasons.push("MIXED_HTF_TREND");
    }

    if (pattern?.isVolumeDrying) {
        mode = "SCALP";
        quality -= gold ? 0.5 : 1;
        reasons.push("VOLUME_DRYING");
    }

    if (isFailToHH || isFailToLL) {
        mode = "SCALP";
        quality -= 1;
        reasons.push("STRUCTURE_FAILURE");
    }

    if (trendCounter && trendStrength === "STRONG") {
        mode = "SCALP";
        quality -= 1;
        reasons.push("COUNTER_STRONG_TREND");
    }

    if (isMomentumPattern && trendAligned && (trendContext?.volumeConfirmed || followVolumeConfirmed)) {
        mode = "NORMAL";
        regime = "MOMENTUM_CONTINUATION";
        quality += 2;
        reasons.push("MOMENTUM_PATTERN_WITH_ALIGNMENT");
    }

    if ((hasRetestSupport || hasRetestResistance) && trendAligned) {
        mode = "NORMAL";
        regime = "STRUCTURE_RETEST";
        quality += 2;
        reasons.push("STRUCTURE_RETEST_ALIGNED");
    }

    if (followDirection === side && followVolumeConfirmed) {
        quality += 1;
        reasons.push("M5_DIRECTIONAL_CONFIRMATION");
    } else if (followDirection !== "NEUTRAL" && followDirection !== side) {
        quality -= 1;
        reasons.push("M5_DIRECTIONAL_CONFLICT");
    }

    if (pattern?.isVolumeClimax && trendAligned) {
        quality += 1;
        reasons.push("VOLUME_CLIMAX_ALIGNED");
    }

    if (mode === "NORMAL" && quality <= -2) {
        mode = "SCALP";
        reasons.push("DOWNGRADE_TO_SCALP_BY_QUALITY");
    }

    return {
        mode,
        regime,
        quality,
        reasons,
    };
}

function applyLearnedPatternWeight(patternScore, learnedWeight) {
    const base = toNumber(patternScore, 0);
    const weight = clamp(learnedWeight, -2.5, 2.5);
    const mildMultiplier = 1 + (weight * 0.06);
    return Number((base * clamp(mildMultiplier, 0.85, 1.15)).toFixed(4));
}

function getPatternClassBonus(patternType = "", tradeMode = "NORMAL") {
    const type = String(patternType || "").toUpperCase();
    const isScalp = tradeMode === "SCALP";

    const strongPatterns = new Set([
        "BULLISH_ENGULFING",
        "BEARISH_ENGULFING",
        "MORNING_STAR_BASE_BREAK",
        "EVENING_STAR_BASE_BREAK",
    ]);

    const momentumPatterns = new Set([
        "WATERFALL_DROP_CONTINUATION",
        "ROCKET_SURGE_CONTINUATION",
        "DESCENDING_TRIANGLE_BREAKDOWN",
        "ASCENDING_TRIANGLE_BREAKOUT",
        "FIRST_LEG_BREAKDOWN",
        "FIRST_LEG_BREAKOUT",
    ]);

    if (momentumPatterns.has(type)) {
        return isScalp ? 0.22 : 0.32;
    }

    if (strongPatterns.has(type)) {
        return isScalp ? 0.14 : 0.22;
    }

    return 0;
}

function getNewsScore(news = null, market = {}) {
    const symbol = market?.symbol || "";
    if (!isGoldSymbol(symbol) || !news) return 0;

    if (news.goldImpact === "bullish") return 0.18;
    if (news.goldImpact === "bearish") return -0.18;
    return 0;
}

function buildContextComponents({
    side,
    tradeMode,
    pattern,
    trendContext,
    trendFollow4,
    historicalVolumeSignal,
    defensiveFlags,
    market,
    news,
    learnedWeight,
    adaptiveScoreDelta,
    ictContext,
}) {
    const sign = getDirectionSign(side);
    const microTrend = pattern?.structure?.microTrend || "NEUTRAL";
    const symbol = market?.symbol || "";
    const gold = isGoldSymbol(symbol);
    const overallTrend = String(trendContext?.overallTrend || "NEUTRAL").toUpperCase();
    const followDirection = String(trendFollow4?.direction || "NEUTRAL").toUpperCase();
    const followVolumeConfirmed = Boolean(trendFollow4?.volumeConfirmed);

    const basePatternScore = applyLearnedPatternWeight(pattern?.score || 0, learnedWeight);

    const components = {
        news: getNewsScore(news, market),
        patternBase: basePatternScore,
        patternClass: sign * getPatternClassBonus(pattern?.type, tradeMode),
        trend: 0,
        trendFollow4: 0,
        microTrend: 0,
        structure: 0,
        volumeState: 0,
        historicalVolume: 0,
        earlyMomentum:
            side === "BUY"
                ? detectEarlyBuyMomentum(market?.candles || [])
                : detectEarlySellMomentum(market?.candles || []),
        ict: 0,
        massiveMove: 0,
        adaptive: clamp(adaptiveScoreDelta, -0.45, 0.45),
        defensive: 0,
    };

    if (isTrendAligned(side, overallTrend)) {
        components.trend += tradeMode === "NORMAL" ? 0.42 : 0.26;
        if (trendContext?.volumeConfirmed) {
            components.trend += 0.08;
        }
    } else if (isTrendCounter(side, overallTrend)) {
        components.trend -=
            tradeMode === "NORMAL"
                ? trendContext?.trendStrength === "STRONG"
                    ? 0.7
                    : 0.48
                : trendContext?.trendStrength === "STRONG"
                    ? 0.4
                    : 0.28;
    } else if (overallTrend === "MIXED") {
        components.trend -= tradeMode === "NORMAL" ? 0.18 : 0.08;
    }

    if (followDirection === side) {
        components.trendFollow4 += followVolumeConfirmed ? 0.22 : 0.1;
    } else if (followDirection !== "NEUTRAL") {
        components.trendFollow4 -= 0.18;
        if (!followVolumeConfirmed) {
            components.trendFollow4 -= 0.05;
        }
    }

    if (isMicroTrendAligned(side, microTrend)) {
        components.microTrend += isMicroTrendReversal(side, microTrend) ? 0.18 : 0.14;
    } else if (isMicroTrendCounter(side, microTrend)) {
        components.microTrend -= tradeMode === "NORMAL" ? 0.22 : 0.16;
    }

    if (side === "BUY" && pattern?.structure?.isRetestingSupport) {
        components.structure += 0.3;
    }
    if (side === "SELL" && pattern?.structure?.isRetestingResistance) {
        components.structure += 0.3;
    }
    if (side === "BUY" && pattern?.structure?.isFailToHH) {
        components.structure -= 0.26;
    }
    if (side === "SELL" && pattern?.structure?.isFailToLL) {
        components.structure -= 0.26;
    }

    if (pattern?.isVolumeClimax) {
        components.volumeState += isTrendAligned(side, overallTrend) ? 0.18 : 0.08;
    }
    if (pattern?.isVolumeDrying) {
        components.volumeState -= gold ? 0.1 : 0.16;
    }

    if (historicalVolumeSignal === "HISTORICAL_CLIMAX") {
        components.historicalVolume += 0.18;
    } else if (historicalVolumeSignal === "ABOVE_AVERAGE") {
        components.historicalVolume += 0.08;
    } else if (historicalVolumeSignal === "LOW_VOLUME") {
        components.historicalVolume -= gold ? 0.12 : 0.22;
    }

    if (side === "BUY") {
        if (pattern?.recentMassiveBull) components.massiveMove += 0.14;
        if (pattern?.recentMassiveBear) components.massiveMove -= 0.28;
    } else if (side === "SELL") {
        if (pattern?.recentMassiveBear) components.massiveMove += 0.14;
        if (pattern?.recentMassiveBull) components.massiveMove -= 0.28;
    }

    if (ictContext && side !== "NEUTRAL") {
        const currentPrice = toNumber(market?.price, 0);
        const patternName = String(pattern?.pattern || "").toUpperCase();

        if (side === "BUY" && patternName === "MOTHER_FISH_BUY" && ictContext.isLiquiditySweepDown) {
            components.ict += 0.34;
        } else if (
            side === "SELL" &&
            patternName === "MOTHER_FISH_SELL" &&
            ictContext.isLiquiditySweepUp
        ) {
            components.ict += 0.34;
        } else if (
            side === "BUY" &&
            Array.isArray(ictContext.demandZones) &&
            ictContext.demandZones.length > 0
        ) {
            const zone = ictContext.demandZones[0];
            if (Math.abs(currentPrice - toNumber(zone?.midpoint, 0)) <= 2.0) {
                components.ict += 0.16;
            }
        } else if (
            side === "SELL" &&
            Array.isArray(ictContext.supplyZones) &&
            ictContext.supplyZones.length > 0
        ) {
            const zone = ictContext.supplyZones[0];
            if (Math.abs(currentPrice - toNumber(zone?.midpoint, 0)) <= 2.0) {
                components.ict += 0.16;
            }
        }
    }

    if (defensiveFlags?.warningMatched) {
        components.defensive -= gold ? 0.26 : 0.4;
    }

    const score = Number(
        Object.values(components)
            .reduce((sum, value) => sum + toNumber(value, 0), 0)
            .toFixed(4)
    );

    return {
        score,
        components,
        basePatternScore,
    };
}

function getDynamicThresholdContext({
    mode = "NORMAL",
    trend = "NEUTRAL",
    adaptiveScoreDelta = 0,
    historicalVolumeSignal = null,
    defensiveFlags = {},
    symbol,
    regimeQuality = 0,
}) {
    let buyThreshold = mode === "SCALP" ? 2.2 : 2.05;
    let sellThreshold = mode === "SCALP" ? -2.2 : -2.05;

    if (trend === "MIXED") {
        buyThreshold += 0.12;
        sellThreshold -= 0.12;
    }

    const adaptiveDelta = Number(adaptiveScoreDelta || 0);
    if (adaptiveDelta >= 0.3) {
        buyThreshold -= 0.1;
        sellThreshold += 0.1;
    } else if (adaptiveDelta >= 0.15) {
        buyThreshold -= 0.05;
        sellThreshold += 0.05;
    } else if (adaptiveDelta <= -0.3) {
        buyThreshold += 0.14;
        sellThreshold -= 0.14;
    } else if (adaptiveDelta <= -0.15) {
        buyThreshold += 0.08;
        sellThreshold -= 0.08;
    }

    if (historicalVolumeSignal === "HISTORICAL_CLIMAX") {
        buyThreshold -= 0.05;
        sellThreshold += 0.05;
    } else if (historicalVolumeSignal === "LOW_VOLUME") {
        if (isGoldSymbol(symbol)) {
            buyThreshold += 0.04;
            sellThreshold -= 0.04;
        } else {
            buyThreshold += 0.1;
            sellThreshold -= 0.1;
        }
    }

    if (Number(regimeQuality || 0) >= 2) {
        buyThreshold -= 0.05;
        sellThreshold += 0.05;
    } else if (Number(regimeQuality || 0) <= -2) {
        buyThreshold += 0.1;
        sellThreshold -= 0.1;
    }

    if (defensiveFlags?.warningMatched) {
        buyThreshold += 0.14;
        sellThreshold -= 0.14;
    }

    const minAbs = mode === "SCALP" ? 2.05 : 1.9;
    const maxAbs = mode === "SCALP" ? 2.8 : 2.55;

    buyThreshold = clampThreshold(buyThreshold, minAbs, maxAbs);
    sellThreshold = -clampThreshold(Math.abs(sellThreshold), minAbs, maxAbs);

    return {
        buyThreshold,
        sellThreshold,
    };
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

    const candlesH1 = market && market.candlesH1 ? market.candlesH1 : [];
    const candlesH4 = market && market.candlesH4 ? market.candlesH4 : [];
    const trendContext = getSafeTrendContext(candlesH1, candlesH4);
    const trendFollow4 = pattern?.trendFollow4 || {
        direction: "NEUTRAL",
        volumeConfirmed: false,
        strength: "WEAK",
    };

    const side = resolvePatternSide(pattern);

    if (!pattern || pattern.pattern === "NONE" || side === "NEUTRAL") {
        return {
            score: 0,
            patternType: pattern ? pattern.type : "Unknown",
            trend: trendContext.overallTrend,
            mode: "SCALP",
            defensiveFlags: {
                warningMatched: false,
                lotMultiplier: 1,
                tpMultiplier: 1,
                reason: null,
            },
            adaptiveScoreDelta: 0,
            historicalVolumeSignal: historicalVolume?.signal || null,
            thresholdContext: getDynamicThresholdContext({
                mode: "SCALP",
                trend: trendContext.overallTrend,
                adaptiveScoreDelta: 0,
                historicalVolumeSignal: historicalVolume?.signal || null,
                defensiveFlags: {},
                symbol: market?.symbol,
                regimeQuality: -1,
            }),
            scoreBreakdown: null,
            regimeContext: {
                mode: "SCALP",
                regime: "NO_PATTERN",
                quality: -1,
                reasons: ["NO_PATTERN"],
            },
        };
    }

    const regimeContext = resolveTradeMode({
        pattern,
        trendContext,
        trendFollow4,
        market,
    });

    let tradeMode = regimeContext.mode;

    let defensiveFlags = {
        warningMatched: false,
        lotMultiplier: 1,
        tpMultiplier: 1,
        reason: null,
    };

    const historicalVolumeSignal = historicalVolume?.signal || null;
    const timeframe = market && market.timeframe ? market.timeframe : "M5";

    const failedRule = await findFailedPatternRule({
        userId: market?.userId || null,
        accountId: market?.accountId || null,
        symbol: market?.symbol || "XAUUSD",
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

    let adaptiveScoreDelta = 0;
    const sessionName = market?.sessionName || session?.name || null;

    const adaptiveRule = await findAdaptiveScoreRule({
        firebaseUserId: market?.userId || null,
        accountId: market?.accountId || null,
        symbol: market?.symbol || "XAUUSDm",
        timeframe: market?.timeframe || "M5",
        patternType: pattern?.type || "Unknown",
        side,
        mode: tradeMode,
        sessionName,
        microTrend: pattern?.structure?.microTrend || null,
        volumeProfile: pattern?.volumeProfile || null,
        rangeState: pattern?.rangeState || null,
    });

    if (adaptiveRule) {
        adaptiveScoreDelta = Number(adaptiveRule.adaptive_score_delta || 0);
    }

    const learnedWeight = await getPatternWeight({
        firebaseUserId: market?.userId || null,
        accountId: market?.accountId || "",
        symbol: market?.symbol || "DEFAULT",
        patternName: pattern?.type || "",
    });

    const scoreContext = buildContextComponents({
        side,
        tradeMode,
        pattern,
        trendContext,
        trendFollow4,
        historicalVolumeSignal,
        defensiveFlags,
        market,
        news,
        learnedWeight,
        adaptiveScoreDelta,
        ictContext,
    });

    const score = Number(scoreContext.score.toFixed(4));

    if (defensiveFlags.warningMatched && tradeMode === "NORMAL" && score < 0) {
        tradeMode = "SCALP";
    }

    if (
        tradeMode === "NORMAL" &&
        regimeContext.quality <= -2 &&
        !isGoldSymbol(market?.symbol)
    ) {
        tradeMode = "SCALP";
    }

    if (market && market.portfolio) {
        const { currentPosition, count } = market.portfolio;
        const pyramidThreshold = tradeMode === "SCALP" ? 2.6 : 2.25;

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
            }

            if (currentPosition === "SELL" && score <= -pyramidThreshold) {
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
            }

            return {
                action: "NO_TRADE",
                reason: "SCORE_TOO_LOW_FOR_PYRAMIDING",
                score: 0,
            };
        }
    }

    const thresholdContext = getDynamicThresholdContext({
        mode: tradeMode,
        trend: trendContext.overallTrend,
        adaptiveScoreDelta,
        historicalVolumeSignal,
        defensiveFlags,
        symbol: market?.symbol,
        regimeQuality: regimeContext.quality,
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
        thresholdContext,
        regimeContext,
        scoreBreakdown: scoreContext.components,
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
        scoreBreakdown: scoreContext.components,
        regimeContext,
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

    const {
        score,
        mode,
        trend,
        adaptiveScoreDelta = 0,
        historicalVolumeSignal = null,
        defensiveFlags = {},
        thresholdContext,
        regimeContext = {},
    } = evaluation;

    const dynamicThreshold =
        thresholdContext ||
        getDynamicThresholdContext({
            mode,
            trend,
            adaptiveScoreDelta,
            historicalVolumeSignal,
            defensiveFlags,
            symbol,
            regimeQuality: regimeContext?.quality || 0,
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
    resolveDecisionWithTradingPreferences,
};