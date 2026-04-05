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

function findPivotHighs(candles = []) {
  const result = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = getCandle(candles[i - 1]);
    const curr = getCandle(candles[i]);
    const next = getCandle(candles[i + 1]);
    if (curr.high > prev.high && curr.high >= next.high) {
      result.push({ index: i, value: curr.high });
    }
  }
  return result;
}

function findPivotLows(candles = []) {
  const result = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = getCandle(candles[i - 1]);
    const curr = getCandle(candles[i]);
    const next = getCandle(candles[i + 1]);
    if (curr.low < prev.low && curr.low <= next.low) {
      result.push({ index: i, value: curr.low });
    }
  }
  return result;
}

function buildStructureState(candles = [], lookback = 10) {
  const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
  const highs = findPivotHighs(sample);
  const lows = findPivotLows(sample);

  let hh = false;
  let hl = false;
  let lh = false;
  let ll = false;

  if (highs.length >= 2) {
    const a = highs[highs.length - 2].value;
    const b = highs[highs.length - 1].value;
    if (b > a) hh = true;
    if (b < a) lh = true;
  }

  if (lows.length >= 2) {
    const a = lows[lows.length - 2].value;
    const b = lows[lows.length - 1].value;
    if (b > a) hl = true;
    if (b < a) ll = true;
  }

  let structure = "NEUTRAL";
  if (hh && hl) structure = "HH_HL";
  else if (lh && ll) structure = "LH_LL";
  else if (hh && !hl) structure = "HH_ONLY";
  else if (hl && !hh) structure = "HL_ONLY";
  else if (lh && !ll) structure = "LH_ONLY";
  else if (ll && !lh) structure = "LL_ONLY";

  return {
    structure,
    hh,
    hl,
    lh,
    ll,
  };
}

function getSwingZoneState(candles = [], lookback = 10) {
  const sample = Array.isArray(candles) ? candles.slice(-lookback) : [];
  if (!sample.length) {
    return {
      nearTop: false,
      nearBottom: false,
      normalizedPos: 0.5,
      recentHigh: 0,
      recentLow: 0,
      range: 0,
    };
  }

  const highs = sample.map(c => getCandle(c).high);
  const lows = sample.map(c => getCandle(c).low);
  const current = getCandle(sample[sample.length - 1]).close;

  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);
  const range = Math.max(recentHigh - recentLow, 0.000001);
  const normalizedPos = Math.max(0, Math.min(1, (current - recentLow) / range));

  return {
    nearTop: normalizedPos >= 0.78,
    nearBottom: normalizedPos <= 0.22,
    normalizedPos,
    recentHigh,
    recentLow,
    range,
  };
}

function buildHierarchicalContext(candles = []) {
  const l20 = getWindowState(candles, 20);
  const l10 = getWindowState(candles, 10);
  const l5 = getWindowState(candles, 5);
  const l3 = getWindowState(candles, 3);
  const structure10 = buildStructureState(candles, 10);
  const swingZone10 = getSwingZoneState(candles, 10);

  return {
    l20,
    l10,
    l5,
    l3,
    structure10,
    swingZone10,
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
    score += 6;
    reasons.push("H10_DIR_ALIGNED");
  } else if (hc.l10.direction !== "NEUTRAL") {
    score -= 8;
    reasons.push("H10_DIR_COUNTER");
  }

  let structureAligned = false;
  let structureCounter = false;

  if (side === "BUY") {
    structureAligned =
      hc.structure10.structure === "HH_HL" ||
      hc.structure10.structure === "HL_ONLY";
    structureCounter =
      hc.structure10.structure === "LH_LL" ||
      hc.structure10.structure === "LL_ONLY";
  } else {
    structureAligned =
      hc.structure10.structure === "LH_LL" ||
      hc.structure10.structure === "LH_ONLY";
    structureCounter =
      hc.structure10.structure === "HH_HL" ||
      hc.structure10.structure === "HH_ONLY";
  }

  if (structureAligned) {
    score += 10;
    reasons.push("H10_STRUCTURE_ALIGNED");
  } else if (structureCounter) {
    score -= 14;
    reasons.push("H10_STRUCTURE_COUNTER");
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
    structureAligned &&
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

  if (side === "BUY" && hc.swingZone10.nearTop) {
    score -= 16;
    reasons.push("NEAR_SWING_HIGH_BLOCK");
  }

  if (side === "SELL" && hc.swingZone10.nearBottom) {
    score -= 16;
    reasons.push("NEAR_SWING_LOW_BLOCK");
  }

  return {
    score,
    reasons,
    strongContinuation,
    structureAligned,
    structureCounter,
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

function getChasePenalty(candles = [], side = "BUY", hc = null) {
  if (!Array.isArray(candles) || candles.length < 2) return 0;
  const last = getCandle(candles[candles.length - 1]);
  const prev = getCandle(candles[candles.length - 2]);
  const avgB = avgBody(candles, 5) || 1;

  let penalty = 0;

  if (side === "BUY") {
    if (last.isBull && last.body >= avgB * 1.2 && last.close > prev.high) {
      penalty += 4;
    }
    if (hc?.swingZone10?.nearTop) {
      penalty += 6;
    }
  } else {
    if (last.isBear && last.body >= avgB * 1.2 && last.close < prev.low) {
      penalty += 4;
    }
    if (hc?.swingZone10?.nearBottom) {
      penalty += 6;
    }
  }

  return penalty;
}

function calculateEntryTimingScore(candles = [], side = "BUY", hc = null) {
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

    if (hc?.swingZone10?.nearTop) {
      score -= 8;
    }
  } else {
    if (c1.isBear) score += 6;
    if (c1.close < c2.low) score += 8;
    if (c2.isBear && c3.isBear) score += 4;
    if (c1.body >= avgB * 1.1) score += 4;

    if (hc?.swingZone10?.nearBottom) {
      score -= 8;
    }
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

  buyScore += calculateEntryTimingScore(candles, "BUY", hierarchical);
  sellScore += calculateEntryTimingScore(candles, "SELL", hierarchical);

  const spreadPenalty = getSpreadPenalty(spreadPoints);
  buyScore -= spreadPenalty;
  sellScore -= spreadPenalty;

  const buyWickPenalty = getWickPenalty(candles, "BUY");
  const sellWickPenalty = getWickPenalty(candles, "SELL");
  buyScore -= buyWickPenalty;
  sellScore -= sellWickPenalty;

  const buyChasePenalty = getChasePenalty(candles, "BUY", hierarchical);
  const sellChasePenalty = getChasePenalty(candles, "SELL", hierarchical);
  buyScore -= buyChasePenalty;
  sellScore -= sellChasePenalty;

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
      buyWickPenalty,
      sellWickPenalty,
      buyChasePenalty,
      sellChasePenalty,
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
  evaluateMicroScalp: analyzeMicroScalp,
  calculateSignalScores,
  buildHierarchicalContext,
};
