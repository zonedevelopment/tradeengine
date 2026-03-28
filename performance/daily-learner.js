const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { detectMotherFishPattern } = require("../pattern/pattern-rules");
const { query } = require("../db");

const { insertManyMappedTradeAnalysis } = require("../mappedTradeAnalysis.repo");
const { getTradeEventsForLearning, getHistoryLearnWeight } = require("../tradeHistory.repo")
const { upsertAdaptiveScoreStat } = require("../adaptiveScore.repo");

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, Number(num || 0)));
}

function round4(num) {
  return Number(Number(num || 0).toFixed(4));
}

function computeAdaptiveScoreDelta({
  sampleSize,
  winRate,
  expectancy,
  avgProfit,
  avgLoss,
}) {
  const s = Number(sampleSize || 0);
  const w = Number(winRate || 0);
  const e = Number(expectancy || 0);
  const ap = Number(avgProfit || 0);
  const al = Math.abs(Number(avgLoss || 0));

  if (s < 20) {
    return { delta: 0, grade: "NEUTRAL" };
  }

  let delta = 0;

  if (w >= 0.60) delta += 0.12;
  else if (w >= 0.55) delta += 0.06;
  else if (w <= 0.40) delta -= 0.18;
  else if (w <= 0.45) delta -= 0.10;

  if (e > 0) delta += 0.10;
  else if (e < 0) delta -= 0.12;

  if (ap > 0 && al > 0) {
    const payoff = ap / al;
    if (payoff >= 1.20) delta += 0.06;
    else if (payoff <= 0.80) delta -= 0.06;
  }

  if (s >= 40) delta *= 1.10;
  if (s >= 80) delta *= 1.15;

  delta = clamp(delta, -0.60, 0.60);

  let grade = "NEUTRAL";
  if (delta >= 0.25) grade = "STRONG";
  else if (delta >= 0.10) grade = "GOOD";
  else if (delta <= -0.25) grade = "BAD";
  else if (delta <= -0.10) grade = "WEAK";

  return {
    delta: round4(delta),
    grade,
  };
}

function bucketizePoints(points) {
    const p = Number(points || 0);
    if (p <= 0) return "0";
    if (p <= 150) return "0-150";
    if (p <= 300) return "151-300";
    if (p <= 500) return "301-500";
    if (p <= 800) return "501-800";
    return "800+";
}

function getSessionName(timestamp) {
    const date = new Date(timestamp);
    const bangkokHour = (date.getUTCHours() + 7) % 24;
    if (bangkokHour >= 7 && bangkokHour < 14) return "ASIAN";
    if (bangkokHour >= 14 && bangkokHour < 19) return "LONDON";
    if (bangkokHour >= 19 && bangkokHour < 23) return "NEWYORK";
    if (bangkokHour >= 23 || bangkokHour < 1) return "OVERLAP";
    return "UNKNOWN";
}

function getRangeState(candles) {
    if (!Array.isArray(candles) || candles.length < 3) return "UNKNOWN";

    const ranges = candles.map((c) => Math.abs(Number(c.high || 0) - Number(c.low || 0)));
    const lastRange = ranges[ranges.length - 1];
    const prev = ranges.slice(0, -1);
    const avgPrev = prev.reduce((a, b) => a + b, 0) / (prev.length || 1);

    if (avgPrev <= 0) return "UNKNOWN";
    if (lastRange > avgPrev * 1.4) return "EXPANDING";
    if (lastRange < avgPrev * 0.7) return "CONTRACTING";

    const closes = candles.map((c) => Number(c.close || 0));
    const move = Math.abs(closes[closes.length - 1] - closes[0]);

    if (move > avgPrev * 1.5) return "TRENDING";
    return "RANGING";
}

function getVolumeProfile(candles) {
    if (!Array.isArray(candles) || candles.length < 3) return "UNKNOWN";

    const vols = candles.map((c) => Number(c.tick_volume || 0)).filter((v) => v > 0);
    if (vols.length < 3) return "UNKNOWN";

    const last = vols[vols.length - 1];
    const prev = vols.slice(0, -1);
    const avgPrev = prev.reduce((a, b) => a + b, 0) / (prev.length || 1);

    if (avgPrev <= 0) return "UNKNOWN";
    if (last >= avgPrev * 1.5) return "CLIMAX";
    if (last <= avgPrev * 0.6) return "DRYING";

    const a = vols[vols.length - 3];
    const b = vols[vols.length - 2];
    const c = vols[vols.length - 1];

    if (a < b && b < c) return "INCREASING";
    if (a > b && b > c) return "DECREASING";
    return "MIXED";
}

function getCandleShape(candle) {
    if (!candle) return "UNKNOWN";

    const open = Number(candle.open || 0);
    const close = Number(candle.close || 0);
    const high = Number(candle.high || 0);
    const low = Number(candle.low || 0);

    const body = Math.abs(close - open);
    const range = Math.abs(high - low);
    if (range <= 0) return "UNKNOWN";

    const bodyRatio = body / range;
    const isBull = close > open;
    const isBear = close < open;

    if (bodyRatio < 0.15) return "DOJI";
    if (bodyRatio >= 0.65 && isBull) return "BIG_BULL";
    if (bodyRatio >= 0.65 && isBear) return "BIG_BEAR";
    if (bodyRatio >= 0.35 && isBull) return "MEDIUM_BULL";
    if (bodyRatio >= 0.35 && isBear) return "MEDIUM_BEAR";
    if (isBull) return "SMALL_BULL";
    if (isBear) return "SMALL_BEAR";

    return "UNKNOWN";
}

function buildPrePatternShape(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return "";
    const lookback = candles.slice(-5, -2).map(getCandleShape);
    return lookback.join(",");
}

function buildContextHash(features) {
    const raw = JSON.stringify({
        symbol: features.symbol,
        timeframe: features.timeframe,
        side: features.side,
        mode: features.mode,
        triggerPattern: features.triggerPattern,
        patternType: features.patternType,
        microTrend: features.microTrend,
        volumeProfile: features.volumeProfile,
        prePatternShape: features.prePatternShape,
        rangeState: features.rangeState,
        sessionName: features.sessionName,
        slBucket: features.slBucket,
        tpBucket: features.tpBucket,
    });

    return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildDescription(features) {
    return [
        features.patternType,
        `side=${features.side}`,
        `mode=${features.mode}`,
        `microTrend=${features.microTrend}`,
        `volume=${features.volumeProfile}`,
        `shape=${features.prePatternShape || "NONE"}`,
        `sl=${features.slBucket}`,
        `tp=${features.tpBucket}`,
    ].join(" | ");
}

async function upsertFailedPattern(item) {
    const existing = await query(
        `
        SELECT id, sample_count, failure_count, win_count, avg_loss, avg_win
        FROM failed_patterns
        WHERE user_id <=> ?
          AND account_id <=> ?
          AND symbol = ?
          AND timeframe = ?
          AND side = ?
          AND mode = ?
          AND context_hash = ?
        LIMIT 1
        `,
        [
            item.userId || null,
            item.accountId || null,
            item.symbol,
            item.timeframe,
            item.side,
            item.mode,
            item.contextHash,
        ]
    );

    let sampleCount = 1;
    let failureCount = item.result === "LOSS" ? 1 : 0;
    let winCount = item.result === "WIN" ? 1 : 0;
    let avgLoss = item.result === "LOSS" ? Math.abs(Number(item.profit || 0)) : 0;
    let avgWin = item.result === "WIN" ? Math.abs(Number(item.profit || 0)) : 0;

    if (existing.length > 0) {
        const row = existing[0];
        sampleCount = Number(row.sample_count || 0) + 1;
        failureCount = Number(row.failure_count || 0) + (item.result === "LOSS" ? 1 : 0);
        winCount = Number(row.win_count || 0) + (item.result === "WIN" ? 1 : 0);

        if (item.result === "LOSS") {
            const prevLossCount = Number(row.failure_count || 0);
            avgLoss =
                ((Number(row.avg_loss || 0) * prevLossCount) +
                    Math.abs(Number(item.profit || 0))) /
                (prevLossCount + 1);
            avgWin = Number(row.avg_win || 0);
        } else {
            const prevWinCount = Number(row.win_count || 0);
            avgWin =
                ((Number(row.avg_win || 0) * prevWinCount) +
                    Math.abs(Number(item.profit || 0))) /
                (prevWinCount + 1);
            avgLoss = Number(row.avg_loss || 0);
        }
    }

    const failRate = sampleCount > 0 ? failureCount / sampleCount : 0;
    const expectancy = ((winCount * avgWin) - (failureCount * avgLoss)) / (sampleCount || 1);

    let suggestedAction = "REDUCE_SCORE";
    let scorePenalty = 0.50;
    let riskMultiplier = 1.00;

    if (failRate > 0.70) {
        suggestedAction = "BLOCK_TRADE";
        scorePenalty = 1.00;
        riskMultiplier = 0.50;
    } else if (failRate >= 0.50) {
        suggestedAction = "WARNING";
        scorePenalty = 0.50;
        riskMultiplier = 0.50;
    }

    await query(
        `
        INSERT INTO failed_patterns (
            user_id,
            account_id,
            symbol,
            timeframe,
            side,
            mode,
            trigger_pattern,
            pattern_type,
            context_hash,
            micro_trend,
            volume_profile,
            pre_pattern_shape,
            range_state,
            session_name,
            sl_points,
            tp_points,
            rr_ratio,
            sl_bucket,
            tp_bucket,
            sample_count,
            failure_count,
            win_count,
            fail_rate,
            avg_loss,
            avg_win,
            expectancy,
            suggested_action,
            score_penalty,
            risk_multiplier,
            reason_code,
            description,
            example_context,
            notes,
            first_seen_at,
            last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            sample_count = VALUES(sample_count),
            failure_count = VALUES(failure_count),
            win_count = VALUES(win_count),
            fail_rate = VALUES(fail_rate),
            avg_loss = VALUES(avg_loss),
            avg_win = VALUES(avg_win),
            expectancy = VALUES(expectancy),
            suggested_action = VALUES(suggested_action),
            score_penalty = VALUES(score_penalty),
            risk_multiplier = VALUES(risk_multiplier),
            description = VALUES(description),
            example_context = VALUES(example_context),
            notes = VALUES(notes),
            last_seen_at = NOW(),
            updated_at = NOW()
        `,
        [
            item.userId || null,
            item.accountId || null,
            item.symbol,
            item.timeframe,
            item.side,
            item.mode,
            item.triggerPattern,
            item.patternType,
            item.contextHash,
            item.microTrend,
            item.volumeProfile,
            item.prePatternShape,
            item.rangeState,
            item.sessionName,
            item.slPips,
            item.tpPips,
            item.rrRatio,
            item.slBucket,
            item.tpBucket,
            sampleCount,
            failureCount,
            winCount,
            Number(failRate.toFixed(4)),
            Number(avgLoss.toFixed(4)),
            Number(avgWin.toFixed(4)),
            Number(expectancy.toFixed(4)),
            suggestedAction,
            Number(scorePenalty.toFixed(4)),
            Number(riskMultiplier.toFixed(4)),
            "KNOWN_FAILURE_PATTERN",
            item.description,
            JSON.stringify(item.exampleContext || null),
            JSON.stringify(item.notes || null),
        ]
    );
}

async function runDailyLearning() {
    console.log("[Daily Learner] Starting Contextual Learning...");

    const initialDefaultWeights = {
        // "Pin_Bar_Shooting_Star": -0.5,
        // "Morning_Star_Base_Break": 0,
        // "Evening_Star_Base_Break": -0.75,
        // "Pin_Bar_Hammer": 2.0,
        // "Piercing_Pattern": 0.5,
        // "Waterfall_Drop_Continuation": 1.8,
        // "Dark_Cloud_Cover": 1.9,
        // "Bullish_Engulfing": -1.25,
        // "Rocket_Surge_Continuation": 1.0,
        // "Bearish_Engulfing": -1.75
    };

    const dataDir = path.join(__dirname, "../data");
    const learningDir = path.join(__dirname, "../learning");

    if (!fs.existsSync(learningDir)) fs.mkdirSync(learningDir);

    const candleDataPath = path.join(dataDir, "candle_training_data.json");
    const weightPath = path.join(learningDir, "pattern-weight.json");

    if (!fs.existsSync(candleDataPath)) {
        console.log("[Daily Learner] Missing data files. Skipping learning.");
        return;
    }

    let trades = await getTradeEventsForLearning();
    // console.log(`[Daily Learner] History ${JSON.stringify(trades)}.`);
    try {
        candleLogs = JSON.parse(fs.readFileSync(candleDataPath, "utf8"));
        console.log(`[Daily Learner] Candels ${candleLogs.length}.`);
    } catch (e) {
        console.log("[Daily Learner] JSON parse error:", e.message);
        return;
    }

    let weights = {};
    try {
        const sql = `
                SELECT pattern_name, 
                    CASE 
                        WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
                        ELSE weight_score
                    END AS weight_score
                FROM strategy_weights
            `;
        const result = await query(sql);
        const rows = Array.isArray(result?.[0]) ? result[0] : result;
        if (rows) {
            weights = rows.reduce((acc, row) => {
                acc[row.pattern_name] = Number(row.weight_score);
                return acc;
            }, {});
            console.log("[Daily Learner] Weights loaded from Database.");
        } else {
            weights = { ...initialDefaultWeights };
            console.log("[Daily Learner] Database is empty. Using Initial Default Weights.");
        }
    } catch (err) {
        console.log("[Daily Learner] Get initial weights error:", err.message);
    }

    let mappedResults = [];
    let openOrder = null;

    try {
        for (let i = 0; i < trades.length; i++) {
            const t = trades[i];

            console.log("[Daily Learner] Trade: " + JSON.stringify(t));

            if (t.event_type === "OPEN_ORDER") {
                openOrder = t;
                continue;
            }

            if (t.event_type !== "CLOSE_ORDER" || !openOrder || t.side !== openOrder.side) {
                continue;
            }

            let matchedCandleLog = null;
            let minDiff = 999999;

            for (const cLog of candleLogs) {
                const diff = Math.abs(Number(cLog.price || 0) - Number(openOrder.price || 0));
                if (diff < minDiff) {
                    minDiff = diff;
                    matchedCandleLog = cLog;
                }
            }

            console.log("[Daily Learner] Match & Diff: " + matchedCandleLog + ": " + minDiff);

            if (matchedCandleLog && minDiff < 5.0) {
                const analysis = detectMotherFishPattern({ candles: matchedCandleLog.candles || [] });
                const patternType = analysis.type !== "Unknown" ? analysis.type : analysis.pattern;
                const triggerPattern = analysis.pattern || "NONE";

                const triggerCandle =
                    matchedCandleLog.candles && matchedCandleLog.candles.length > 0
                        ? matchedCandleLog.candles[matchedCandleLog.candles.length - 1]
                        : null;

                const tickVolume = triggerCandle ? Number(triggerCandle.tick_volume || 0) : 0;
                const isWin = Number(t.profit || 0) > 0;

                const slPips = openOrder.sl
                    ? Math.round(Math.abs(Number(openOrder.price) - Number(openOrder.sl)) * 100)
                    : 0;

                const tpPips = openOrder.tp
                    ? Math.round(Math.abs(Number(openOrder.tp) - Number(openOrder.price)) * 100)
                    : 0;

                const rrRatio = slPips > 0 ? Number((tpPips / slPips).toFixed(4)) : 0;

                let postMortem = isWin ? "TARGET_REACHED" : "STOPPED_OUT";
                if (!isWin) {
                    if (slPips > 0 && slPips < 150) postMortem = "SL_TOO_TIGHT";
                    else if (tpPips > 500) postMortem = "TP_TOO_FAR";
                } else {
                    if (tpPips > 0 && tpPips < 150) postMortem = "SCALP_WIN";
                }

                const microTrend =
                    analysis.structure ? analysis.structure.microTrend || "UNKNOWN" : "UNKNOWN";
                const volumeProfile = getVolumeProfile(matchedCandleLog.candles || []);
                const prePatternShape = buildPrePatternShape(matchedCandleLog.candles || []);
                const rangeState = getRangeState(matchedCandleLog.candles || []);
                const sessionName = getSessionName(matchedCandleLog.timestamp);

                const learningItem = {
                    userId: openOrder.firebase_user_id || null,
                    accountId: openOrder.account_id || null,
                    symbol: openOrder.symbol || matchedCandleLog.symbol || "XAUUSD",
                    timeframe: "M5",
                    side: openOrder.side,
                    mode: openOrder.mode || "NORMAL",
                    triggerPattern,
                    patternType,
                    microTrend,
                    volumeProfile,
                    prePatternShape,
                    rangeState,
                    sessionName,
                    slPips,
                    tpPips,
                    rrRatio,
                    slBucket: bucketizePoints(slPips),
                    tpBucket: bucketizePoints(tpPips),
                    profit: Number(t.profit || 0),
                    result: isWin ? "WIN" : "LOSS",
                };

                learningItem.contextHash = buildContextHash(learningItem);
                learningItem.description = buildDescription(learningItem);
                learningItem.exampleContext = {
                    timestamp: matchedCandleLog.timestamp,
                    symbol: learningItem.symbol,
                    candles: matchedCandleLog.candles || [],
                    triggerCandle,
                    postMortem,
                };
                learningItem.notes = {
                    postMortem,
                    minPriceDiff: minDiff,
                };

                mappedResults.push({
                    firebaseUserId: learningItem.userId || null,
                    accountId: learningItem.accountId || null,
                    eventTime: matchedCandleLog.timestamp,
                    symbol: learningItem.symbol,
                    patternType,
                    triggerPattern,
                    mode: learningItem.mode,
                    tickVolume,
                    microTrend,
                    volumeProfile,
                    prePatternShape,
                    rangeState,
                    sessionName,
                    openPrice: openOrder.price,
                    closePrice: t.price,
                    slPrice: openOrder.sl,
                    tpPrice: openOrder.tp,
                    slPips,
                    tpPips,
                    rrRatio,
                    profit: t.profit,
                    result: learningItem.result,
                    side: openOrder.side,
                    postMortem,
                    contextHash: learningItem.contextHash,
                });

                await upsertFailedPattern(learningItem);

                if (patternType !== "NONE" && patternType !== "None") {
                    if (!weights[patternType]) weights[patternType] = 0;
                    if (isWin) weights[patternType] += 0.08;
                    else weights[patternType] -= 0.08;

                    if (weights[patternType] > 2.0) weights[patternType] = 2.0;
                    if (weights[patternType] < -2.0) weights[patternType] = -2.0;
                }

                // console.log("[Daily Learner] leaing item: " + learningItem);
            }
            
            // console.log("[Daily Learner] Mapped result: " + mappedResults);

            openOrder = null;
        }

        // fs.writeFileSync(mappedDataPath, JSON.stringify(mappedResults, null, 2));
        // fs.writeFileSync(weightPath, JSON.stringify(weights, null, 2));

        try {
            const weightEntries = Object.entries(weights);
            if (weightEntries.length > 0) {
                const upsertSql = `UPDATE strategy_weights SET weight_score = ?, last_updated = NOW() WHERE pattern_name = ?`;
                for (const [name, score] of weightEntries) {
                    await query(upsertSql, [score, name]);
                }
                console.log(`[Daily Learner] Successfully saved ${weightEntries} weights to DB.`);
            }
        } catch (err) {
            console.error("[Daily Learner] Save weights to DB error:", err.message);
        }

        await insertManyMappedTradeAnalysis(mappedResults);

         let adaptiveRows = [];
        adaptiveRows.push(
            {
                firebaseUserId: mappedResults.firebaseUserId,
                accountId: mappedResults.accountId,
                symbol: mappedResults.symbol,
                timeframe: "M5",
                patternType: mappedResults.patternType,
                side: mappedResults.side,
                mode: mappedResults.mode,
                sessionName: mappedResults.sessionName,
                microTrend: mappedResults.microTrend,
                volumeProfile: mappedResults.volumeProfile,
                rangeState: mappedResults.rangeState,
                result: mappedResults.result,
                profit: mappedResults.profit,
                closedAt: mappedResults.eventTime,
          }
        )
        
        await updateAdaptiveScoreStats(adaptiveRows);
    } catch (err) {
        console.error("[Daily Learner] Insert mapped_trade_analysis error:", err.message);
    }

    console.log(`[Daily Learner] Mapped ${mappedResults.length} completed trades.`);
    console.log(`[Daily Learner] Wegiht ${JSON.stringify(weights, null, 2)} completed trades.`);
    console.log("[Daily Learner] Contextual learning updated failed_patterns in MySQL.");
}

function buildAdaptiveKey(row) {
  return [
    row.firebaseUserId || "",
    row.accountId || "",
    row.symbol || "",
    row.timeframe || "M5",
    row.patternType || "",
    row.side || "",
    row.mode || "NORMAL",
    row.sessionName || "",
    row.microTrend || "",
    row.volumeProfile || "",
    row.rangeState || "",
  ].join("||");
}

async function updateAdaptiveScoreStats(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    const key = buildAdaptiveKey(row);
    if (!grouped.has(key)) {
      grouped.set(key, {
        firebaseUserId: row.firebaseUserId || null,
        accountId: row.accountId || null,
        symbol: row.symbol || "",
        timeframe: row.timeframe || "M5",
        patternType: row.patternType || "",
        side: row.side || "",
        mode: row.mode || "NORMAL",
        sessionName: row.sessionName || null,
        microTrend: row.microTrend || null,
        volumeProfile: row.volumeProfile || null,
        rangeState: row.rangeState || null,
        sampleSize: 0,
        winCount: 0,
        lossCount: 0,
        beCount: 0,
        profitSum: 0,
        lossSum: 0,
        expectancySum: 0,
        lastTradeAt: null,
      });
    }

    const g = grouped.get(key);
    const result = String(row.result || "").toUpperCase();
    const profit = Number(row.profit || 0);

    g.sampleSize += 1;
    g.expectancySum += profit;

    if (result === "WIN" || profit > 0) {
      g.winCount += 1;
      g.profitSum += profit;
    } else if (result === "LOSS" || profit < 0) {
      g.lossCount += 1;
      g.lossSum += profit;
    } else {
      g.beCount += 1;
    }

    if (!g.lastTradeAt || new Date(row.closedAt) > new Date(g.lastTradeAt)) {
      g.lastTradeAt = row.closedAt;
    }
  }

  for (const g of grouped.values()) {
    const avgProfit = g.winCount > 0 ? g.profitSum / g.winCount : 0;
    const avgLoss = g.lossCount > 0 ? g.lossSum / g.lossCount : 0;
    const winRate = g.sampleSize > 0 ? g.winCount / g.sampleSize : 0;
    const expectancy = g.sampleSize > 0 ? g.expectancySum / g.sampleSize : 0;

    const { delta, grade } = computeAdaptiveScoreDelta({
      sampleSize: g.sampleSize,
      winRate,
      expectancy,
      avgProfit,
      avgLoss,
    });

    await upsertAdaptiveScoreStat({
      firebaseUserId: g.firebaseUserId,
      accountId: g.accountId,
      symbol: g.symbol,
      timeframe: g.timeframe,
      patternType: g.patternType,
      side: g.side,
      mode: g.mode,
      sessionName: g.sessionName,
      microTrend: g.microTrend,
      volumeProfile: g.volumeProfile,
      rangeState: g.rangeState,
      sampleSize: g.sampleSize,
      winCount: g.winCount,
      lossCount: g.lossCount,
      beCount: g.beCount,
      winRate,
      avgProfit,
      avgLoss,
      expectancy,
      adaptiveScoreDelta: delta,
      qualityGrade: grade,
      lastTradeAt: g.lastTradeAt,
    });
  }
}

if (require.main === module) {
    runDailyLearning().catch((err) => {
        console.error("[Daily Learner] Fatal error:", err.message);
    });
}

module.exports = { runDailyLearning };
