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

function isBull(c) {
  return toNumber(c.close) > toNumber(c.open);
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

function detectAscendingTriangle(candles = [], opts = {}) {
  const config = {
    lookback: opts.lookback ?? 20,
    minTouchesHigh: opts.minTouchesHigh ?? 2,
    minTouchesLow: opts.minTouchesLow ?? 3,
    highTolerancePercent: opts.highTolerancePercent ?? 0.0025,
    minSlopeLow: opts.minSlopeLow ?? 0.05,
    breakoutCloseFactor: opts.breakoutCloseFactor ?? 0.15,
    minBodyFactor: opts.minBodyFactor ?? 0.8,
    useVolume: opts.useVolume ?? true,
    volumeFactor: opts.volumeFactor ?? 1.05,
    slBuffer: opts.slBuffer ?? 1.5,
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

  const usedHighs = pivotHighs.slice(-Math.max(config.minTouchesHigh, 3));
  const usedLows = pivotLows.slice(-config.minTouchesLow);

  const highPrices = usedHighs.map((p) => p.price);
  const lowPrices = usedLows.map((p) => p.price);

  const lowSlope = linearRegressionSlope(lowPrices);
  const highAvg = avg(highPrices);

  const highDeviation = highPrices.map((v) => Math.abs(v - highAvg));
  const maxHighDeviation = Math.max(...highDeviation, 0);
  const highToleranceValue = highAvg * config.highTolerancePercent;

  const avgBodyRecent = avg(recent.slice(-5).map(bodySize)) || bodySize(last) || 1;
  const avgVolumeRecent =
    avg(recent.slice(-5).map((c) => toNumber(c.tick_volume ?? c.tickVolume, 0))) || 0;

  const highsAreFlat = maxHighDeviation <= highToleranceValue;
  const lowsAreAscending = lowSlope >= config.minSlopeLow;

  if (!highsAreFlat) {
    return {
      detected: false,
      reason: "HIGHS_NOT_FLAT_ENOUGH",
      detail: { maxHighDeviation, highToleranceValue, highAvg },
    };
  }

  if (!lowsAreAscending) {
    return {
      detected: false,
      reason: "LOWS_NOT_ASCENDING",
      detail: { lowSlope },
    };
  }

  const resistance = highAvg;
  const breakoutClose = toNumber(last.close, 0) > resistance;
  const breakoutBodyStrong = bodySize(last) >= avgBodyRecent * config.minBodyFactor;
  const closesNearHigh =
    candleRange(last) > 0 &&
    (toNumber(last.high, 0) - toNumber(last.close, 0)) / candleRange(last) <= config.breakoutCloseFactor;

  let volumeConfirm = true;
  if (config.useVolume && avgVolumeRecent > 0) {
    const lastVolume = toNumber(last.tick_volume ?? last.tickVolume, 0);
    volumeConfirm = lastVolume >= avgVolumeRecent * config.volumeFactor;
  }

  const previousBelowResistance =
    toNumber(prev.close, 0) <= resistance ||
    toNumber(prev.high, 0) <= resistance;

  const breakoutConfirmed =
    isBull(last) &&
    breakoutClose &&
    breakoutBodyStrong &&
    closesNearHigh &&
    previousBelowResistance &&
    volumeConfirm;

  if (!breakoutConfirmed) {
    return {
      detected: false,
      reason: "TRIANGLE_FOUND_BUT_NO_BREAKOUT_CONFIRM",
      detail: {
        resistance,
        lowSlope,
        breakoutClose,
        breakoutBodyStrong,
        closesNearHigh,
        volumeConfirm,
      },
    };
  }

  const lowestLow = Math.min(...usedLows.map((l) => l.price));
  const triangleHeight = resistance - lowestLow;

  return {
    detected: true,
    pattern: "CLAW_BUY",
    type: "Ascending_Triangle_Breakout",
    strength: Number((triangleHeight + bodySize(last)).toFixed(4)),
    resistance,
    supportSlope: lowSlope,
    slPrice: Number((lowestLow - config.slBuffer).toFixed(4)),
    tpPrice: Number((resistance + triangleHeight).toFixed(4)),
    meta: {
      triangleHeight: Number(triangleHeight.toFixed(4)),
      pivotHighs: usedHighs,
      pivotLows: usedLows,
      volumeConfirm,
    },
  };
}

module.exports = {
  detectAscendingTriangle,
};
