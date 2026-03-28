"use strict";

function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function bodySize(c) {
  return Math.abs(toNumber(c.close) - toNumber(c.open));
}

function candleRange(c) {
  return Math.abs(toNumber(c.high) - toNumber(c.low));
}

function isBear(c) {
  return toNumber(c.close) < toNumber(c.open);
}

function avg(arr = []) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return arr.reduce((s, v) => s + toNumber(v, 0), 0) / arr.length;
}

function linearRegressionSlope(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = toNumber(points[i], 0);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

function detectPivotHighs(candles = [], left = 2, right = 2) {
  const result = [];
  for (let i = left; i < candles.length - right; i++) {
    const currentHigh = toNumber(candles[i].high, 0);
    let isPivot = true;

    for (let j = 1; j <= left; j++) {
      if (currentHigh <= toNumber(candles[i - j].high, 0)) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    for (let j = 1; j <= right; j++) {
      if (currentHigh <= toNumber(candles[i + j].high, 0)) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      result.push({
        index: i,
        price: currentHigh,
      });
    }
  }
  return result;
}

function detectPivotLows(candles = [], left = 2, right = 2) {
  const result = [];
  for (let i = left; i < candles.length - right; i++) {
    const currentLow = toNumber(candles[i].low, 0);
    let isPivot = true;

    for (let j = 1; j <= left; j++) {
      if (currentLow >= toNumber(candles[i - j].low, 0)) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    for (let j = 1; j <= right; j++) {
      if (currentLow >= toNumber(candles[i + j].low, 0)) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      result.push({
        index: i,
        price: currentLow,
      });
    }
  }
  return result;
}

function detectDescendingTriangle(candles = [], opts = {}) {
  const config = {
    lookback: opts.lookback ?? 20,
    minTouchesHigh: opts.minTouchesHigh ?? 3,
    minTouchesLow: opts.minTouchesLow ?? 2,
    lowTolerancePercent: opts.lowTolerancePercent ?? 0.0025,
    minSlopeHigh: opts.minSlopeHigh ?? -0.05,
    breakoutCloseFactor: opts.breakoutCloseFactor ?? 0.15,
    minBodyFactor: opts.minBodyFactor ?? 0.8,
    useVolume: opts.useVolume ?? true,
    volumeFactor: opts.volumeFactor ?? 1.05,
  };

  if (!Array.isArray(candles) || candles.length < config.lookback) {
    return {
      detected: false,
      reason: "NOT_ENOUGH_CANDLES",
    };
  }

  const recent = candles.slice(-config.lookback);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];

  const pivotHighs = detectPivotHighs(recent, 2, 2);
  const pivotLows = detectPivotLows(recent, 2, 2);

  if (pivotHighs.length < config.minTouchesHigh) {
    return {
      detected: false,
      reason: "NOT_ENOUGH_PIVOT_HIGHS",
    };
  }

  if (pivotLows.length < config.minTouchesLow) {
    return {
      detected: false,
      reason: "NOT_ENOUGH_PIVOT_LOWS",
    };
  }

  const usedHighs = pivotHighs.slice(-config.minTouchesHigh);
  const usedLows = pivotLows.slice(-Math.max(config.minTouchesLow, 3));

  const highPrices = usedHighs.map(p => p.price);
  const lowPrices = usedLows.map(p => p.price);

  const highSlope = linearRegressionSlope(highPrices);
  const lowAvg = avg(lowPrices);

  const lowDeviation = lowPrices.map(v => Math.abs(v - lowAvg));
  const maxLowDeviation = Math.max(...lowDeviation, 0);
  const lowToleranceValue = lowAvg * config.lowTolerancePercent;

  const avgBodyRecent = avg(recent.slice(-5).map(bodySize)) || bodySize(last) || 1;
  const avgVolumeRecent = avg(recent.slice(-5).map(c => toNumber(c.tick_volume ?? c.tickVolume, 0))) || 0;

  const lowsAreFlat = maxLowDeviation <= lowToleranceValue;
  const highsAreDescending = highSlope <= config.minSlopeHigh;

  if (!highsAreDescending) {
    return {
      detected: false,
      reason: "HIGHS_NOT_DESCENDING",
      detail: { highSlope },
    };
  }

  if (!lowsAreFlat) {
    return {
      detected: false,
      reason: "LOWS_NOT_FLAT_ENOUGH",
      detail: { maxLowDeviation, lowToleranceValue, lowAvg },
    };
  }

  const support = lowAvg;
  const breakdownClose = toNumber(last.close, 0) < support;
  const breakdownBodyStrong = bodySize(last) >= avgBodyRecent * config.minBodyFactor;
  const closesNearLow =
    candleRange(last) > 0 &&
    (toNumber(last.close, 0) - toNumber(last.low, 0)) / candleRange(last) <= config.breakoutCloseFactor;

  let volumeConfirm = true;
  if (config.useVolume && avgVolumeRecent > 0) {
    const lastVolume = toNumber(last.tick_volume ?? last.tickVolume, 0);
    volumeConfirm = lastVolume >= avgVolumeRecent * config.volumeFactor;
  }

  const previousAboveSupport =
    toNumber(prev.close, 0) >= support ||
    toNumber(prev.low, 0) >= support;

  const breakoutConfirmed =
    isBear(last) &&
    breakdownClose &&
    breakdownBodyStrong &&
    closesNearLow &&
    previousAboveSupport &&
    volumeConfirm;

  if (!breakoutConfirmed) {
    return {
      detected: false,
      reason: "TRIANGLE_FOUND_BUT_NO_BREAKDOWN_CONFIRM",
      detail: {
        support,
        highSlope,
        breakdownClose,
        breakdownBodyStrong,
        closesNearLow,
        volumeConfirm,
      },
    };
  }

  const highestHigh = Math.max(...usedHighs.map(h => h.price));
  const triangleHeight = highestHigh - support;

  return {
    detected: true,
    pattern: "CLAW_SELL",
    type: "Descending_Triangle_Breakdown",
    strength: Number((triangleHeight + bodySize(last)).toFixed(4)),
    support,
    resistanceSlope: highSlope,
    slPrice: Number((highestHigh + 1.5).toFixed(4)),
    tpPrice: Number((support - triangleHeight).toFixed(4)),
    meta: {
      triangleHeight: Number(triangleHeight.toFixed(4)),
      pivotHighs: usedHighs,
      pivotLows: usedLows,
      volumeConfirm,
    },
  };
}

module.exports = {
  detectDescendingTriangle,
};
