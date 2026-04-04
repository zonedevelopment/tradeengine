const { detectTrendAndRange } = require("./pattern/pattern-rules");

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getCandle(c = {}) {
  const open = toNum(c.open);
  const close = toNum(c.close);
  const high = toNum(c.high);
  const low = toNum(c.low);
  const body = Math.abs(close - open);
  const range = Math.max(high - low, 0);

  return {
    open,
    close,
    high,
    low,
    body,
    range,
    isBull: close > open,
    isBear: close < open,
    upperWick: Math.max(0, high - Math.max(open, close)),
    lowerWick: Math.max(0, Math.min(open, close) - low),
  };
}

function avgBody(candles = [], lookback = 5) {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const sample = candles.slice(-lookback);
  if (!sample.length) return 0;
  return sample.reduce((sum, c) => sum + getCandle(c).body, 0) / sample.length;
}

function avgRange(candles = [], lookback = 5) {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const sample = candles.slice(-lookback);
  if (!sample.length) return 0;
  return sample.reduce((sum, c) => sum + getCandle(c).range, 0) / sample.length;
}

function getWindowState(candles = [], lookback = 20) {
  const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
  if (!sample.length) {
    return {
      direction: "NEUTRAL",
      strength: 0,
      impulseCount: 0,
      compression: false,
      sampleSize: 0,
    };
  }

  const first = getCandle(sample[0]);
  const last = getCandle(sample[sample.length - 1]);
  const bodyAvg = avgBody(sample, Math.min(sample.length, 5)) || 1;
  const rangeAvg = avgRange(sample, Math.min(sample.length, 5)) || 1;
  const slope = (last.close - first.close) / bodyAvg;

  let direction = "NEUTRAL";
  if (slope >= 1.2) direction = "UP";
  else if (slope <= -1.2) direction = "DOWN";

  let impulseCount = 0;
  for (const raw of sample) {
    const c = getCandle(raw);
    if (c.range >= rangeAvg * 1.05 && c.body >= bodyAvg * 1.1) {
      if (direction === "UP" && c.isBull) impulseCount += 1;
      if (direction === "DOWN" && c.isBear) impulseCount += 1;
    }
  }

  return {
    direction,
    strength: Math.abs(slope),
    impulseCount,
    compression: rangeAvg > 0 && bodyAvg / rangeAvg < 0.42,
    sampleSize: sample.length,
  };
}

function buildHierarchicalContext(candles = []) {
  const l20 = getWindowState(candles, 20);
  const l10 = getWindowState(candles, 10);
  const l5 = getWindowState(candles, 5);
  const l3 = getWindowState(candles, 3);

  return {
    l20,
    l10,
    l5,
    l3,
  };
}

function scoreHierarchyForSide(side, hc) {
  const expected = side === "BUY" ? "UP" : "DOWN";
  let score = 0;
  const reasons = [];

  if (hc.l20.direction === expected) {
    score += 10;
    reasons.push("H20_ALIGNED");
  } else if (hc.l20.direction !== "NEUTRAL") {
    score -= 14;
    reasons.push("H20_COUNTER");
  }

  if (hc.l10.direction === expected) {
    score += 8;
    reasons.push("H10_ALIGNED");
  } else if (hc.l10.direction !== "NEUTRAL") {
    score -= 10;
    reasons.push("H10_COUNTER");
  }

  if (hc.l5.direction === expected || hc.l5.direction === "NEUTRAL") {
    score += 4;
    reasons.push("H5_SETUP_OK");
  } else {
    score -= 6;
    reasons.push("H5_SETUP_COUNTER");
  }

  if (hc.l3.direction === expected || hc.l3.strength >= 0.8) {
    score += 3;
    reasons.push("H3_TRIGGER_OK");
  } else if (hc.l3.direction !== "NEUTRAL") {
    score -= 4;
    reasons.push("H3_TRIGGER_COUNTER");
  }

  const strongContinuation =
    hc.l20.direction === expected &&
    hc.l10.direction === expected &&
    hc.l20.strength >= 2.2 &&
    hc.l10.impulseCount >= 2;

  if (strongContinuation) {
    score += 4;
    reasons.push("STACKED_CONTINUATION");
  }

  if (hc.l5.compression && hc.l3.direction === "NEUTRAL") {
    score -= 3;
    reasons.push("NOISY_TRIGGER");
  }

  return {
    score,
    reasons,
    strongContinuation,
  };
}

function getSpreadPenalty(spreadPoints = 0) {
  const sp = toNum(spreadPoints, 0);
  if (sp >= 80) return 18;
  if (sp >= 50) return 10;
  if (sp >= 30) return 5;
  return 0;
}

function getWickPenalty(candles = [], side = "BUY") {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const last = getCandle(candles[candles.length - 1]);
  const body = Math.max(last.body, 0.0001);

  if (side === "BUY" && last.upperWick > body * 1.7) return 5;
  if (side === "SELL" && last.lowerWick > body * 1.7) return 5;
  return 0;
}

function calculateEntryTimingScore(candles = [], side = "BUY") {
  if (!Array.isArray(candles) || candles.length < 3) return 0;

  const c1 = getCandle(candles[candles.length - 1]);
  const c2 = getCandle(candles[candles.length - 2]);
  const c3 = getCandle(candles[candles.length - 3]);
  const avgB = avgBody(candles, 5) || 1;

  let score = 0;
  if (side === "BUY") {
    if (c1.isBull) score += 6;
    if (c1.close > c2.high) score += 8;
    if (c2.isBull && c3.isBull) score += 4;
    if (c1.body >= avgB * 1.1) score += 4;
  } else {
    if (c1.isBear) score += 6;
    if (c1.close < c2.low) score += 8;
    if (c2.isBear && c3.isBear) score += 4;
    if (c1.body >= avgB * 1.1) score += 4;
  }

  return score;
}

function calculateSignalScores({ candles = [], spreadPoints = 0, trendContext = null }) {
  const hierarchical = buildHierarchicalContext(candles);
  const buyHierarchy = scoreHierarchyForSide("BUY", hierarchical);
  const sellHierarchy = scoreHierarchyForSide("SELL", hierarchical);

  let buyScore = 0;
  let sellScore = 0;

  buyScore += buyHierarchy.score;
  sellScore += sellHierarchy.score;

  buyScore += calculateEntryTimingScore(candles, "BUY");
  sellScore += calculateEntryTimingScore(candles, "SELL");

  const spreadPenalty = getSpreadPenalty(spreadPoints);
  buyScore -= spreadPenalty;
  sellScore -= spreadPenalty;

  buyScore -= getWickPenalty(candles, "BUY");
  sellScore -= getWickPenalty(candles, "SELL");

  if (trendContext) {
    const trend = String(trendContext.overallTrend || "NEUTRAL").toUpperCase();
    if (trend === "BULLISH") {
      buyScore += 6;
      sellScore -= 4;
    } else if (trend === "BEARISH") {
      sellScore += 6;
      buyScore -= 4;
    }
  }

  return {
    buyScore,
    sellScore,
    hierarchical,
    breakdown: {
      buyHierarchy,
      sellHierarchy,
      spreadPenalty,
      buyWickPenalty: getWickPenalty(candles, "BUY"),
      sellWickPenalty: getWickPenalty(candles, "SELL"),
    },
  };
}

function getDefaultScalpConfig() {
  return {
    minScore: 45,
    minScoreGap: 8,
    maxHoldBars: 2,
    maxLossUsd: 8,
    minProfitToClose: 2,
  };
}

async function analyzeMicroScalp({
  symbol = "",
  candles = [],
  candlesH1 = [],
  candlesH4 = [],
  spreadPoints = 0,
  config = null,
}) {
  const activeConfig = {
    ...getDefaultScalpConfig(),
    ...(config || {}),
  };

  const trendContext = detectTrendAndRange(candlesH1, candlesH4) || {
    overallTrend: "NEUTRAL",
    trendStrength: "WEAK",
  };

  const scores = calculateSignalScores({ candles, spreadPoints, trendContext });
  const buyScore = scores.buyScore;
  const sellScore = scores.sellScore;
  const gap = Math.abs(buyScore - sellScore);

  let signal = "NONE";
  let confidenceScore = 0;
  let reason = "NO_MICRO_SIGNAL";

  if (
    buyScore >= activeConfig.minScore &&
    buyScore > sellScore &&
    gap >= activeConfig.minScoreGap
  ) {
    signal = "BUY";
    confidenceScore = buyScore;
    reason = "MICRO_BUY_SIGNAL";
  } else if (
    sellScore >= activeConfig.minScore &&
    sellScore > buyScore &&
    gap >= activeConfig.minScoreGap
  ) {
    signal = "SELL";
    confidenceScore = sellScore;
    reason = "MICRO_SELL_SIGNAL";
  }

  return {
    signal,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    buyScore: Number(buyScore.toFixed(2)),
    sellScore: Number(sellScore.toFixed(2)),
    gap: Number(gap.toFixed(2)),
    reason,
    hierarchical: scores.hierarchical,
    scoreBreakdown: scores.breakdown,
  };
}

module.exports = {
  analyzeMicroScalp,
  calculateSignalScores,
  buildHierarchicalContext,
};
