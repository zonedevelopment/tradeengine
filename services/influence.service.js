"use strict";

const { query } = require("../db");

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
    const num = toNumber(value, min);
    return Math.max(min, Math.min(max, num));
}

function normalizeText(value, fallback = "UNKNOWN") {
    const text = String(value || "").trim();
    return text || fallback;
}

function buildBaseContext({
    symbol = "XAUUSDm",
    timeframe = "M5",
    patternType = "Unknown",
    side = "NEUTRAL",
    mode = "NORMAL",
    sessionName = "UNKNOWN",
    microTrend = "UNKNOWN",
    volumeProfile = "UNKNOWN",
    rangeState = "UNKNOWN",
}) {
    return {
        symbol: normalizeText(symbol, "XAUUSDm"),
        timeframe: normalizeText(timeframe, "M5"),
        patternType: normalizeText(patternType, "Unknown"),
        side: normalizeText(side, "NEUTRAL"),
        mode: normalizeText(mode, "NORMAL"),
        sessionName: normalizeText(sessionName, "UNKNOWN"),
        microTrend: normalizeText(microTrend, "UNKNOWN"),
        volumeProfile: normalizeText(volumeProfile, "UNKNOWN"),
        rangeState: normalizeText(rangeState, "UNKNOWN"),
    };
}

async function getAdaptiveScoreStats(context) {
    const sql = `
    SELECT
      sample_size,
      win_rate,
      avg_profit,
      avg_loss,
      expectancy,
      adaptive_score_delta,
      quality_grade
    FROM adaptive_score_stats
    WHERE symbol = ?
      AND timeframe = ?
      AND pattern_type = ?
      AND side = ?
      AND mode = ?
      AND session_name = ?
      AND micro_trend = ?
      AND volume_profile = ?
      AND range_state = ?
    ORDER BY id DESC
    LIMIT 1
  `;

    const rows = await query(sql, [
        context.symbol,
        context.timeframe,
        context.patternType,
        context.side,
        context.mode,
        context.sessionName,
        context.microTrend,
        context.volumeProfile,
        context.rangeState,
    ]);

    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getFailedPatternStats(context) {
    const sql = `
    SELECT
      sample_count,
      fail_rate,
      avg_loss,
      avg_win,
      expectancy,
      score_penalty,
      risk_multiplier,
      suggested_action,
      reason_code
    FROM failed_patterns
    WHERE symbol = ?
      AND timeframe = ?
      AND pattern_type = ?
      AND side = ?
      AND mode = ?
      AND session_name = ?
      AND micro_trend = ?
      AND volume_profile = ?
      AND range_state = ?
    ORDER BY id DESC
    LIMIT 1
  `;

    const rows = await query(sql, [
        context.symbol,
        context.timeframe,
        context.patternType,
        context.side,
        context.mode,
        context.sessionName,
        context.microTrend,
        context.volumeProfile,
        context.rangeState,
    ]);

    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getMappedTradeStats(context) {
    const sql = `
    SELECT
      COUNT(*) AS sample_count,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) AS win_count,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) AS loss_count,
      AVG(CASE WHEN result = 'WIN' THEN profit ELSE NULL END) AS avg_win_profit,
      AVG(CASE WHEN result = 'LOSS' THEN profit ELSE NULL END) AS avg_loss_profit,
      AVG(tp_pips) AS avg_tp_pips,
      AVG(sl_pips) AS avg_sl_pips,
      AVG(rr_ratio) AS avg_rr_ratio,
      SUM(CASE WHEN post_mortem = 'TP_TOO_FAR' THEN 1 ELSE 0 END) AS tp_too_far_count,
      SUM(CASE WHEN post_mortem = 'SL_TOO_TIGHT' THEN 1 ELSE 0 END) AS sl_too_tight_count
    FROM mapped_trade_analysis
    WHERE symbol = ?
      AND pattern_type = ?
      AND side = ?
      AND mode = ?
      AND session_name = ?
      AND micro_trend = ?
      AND volume_profile = ?
      AND range_state = ?
  `;

    const rows = await query(sql, [
        context.symbol,
        context.patternType,
        context.side,
        context.mode,
        context.sessionName,
        context.microTrend,
        context.volumeProfile,
        context.rangeState,
    ]);

    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function computeAdaptiveSoftDelta(row) {
    if (!row) {
        return {
            scoreDelta: 0,
            meta: { source: "adaptive_score_stats", matched: false },
        };
    }

    const sampleSize = toNumber(row.sample_size, 0);
    const winRate = toNumber(row.win_rate, 0);
    const expectancy = toNumber(row.expectancy, 0);

    if (sampleSize < 5) {
        return {
            scoreDelta: 0,
            meta: {
                source: "adaptive_score_stats",
                matched: true,
                sampleSize,
                applied: false,
                reason: "INSUFFICIENT_SAMPLE",
            },
        };
    }

    const winRateEdge = winRate - 0.5;
    const expectancyNormalized = clamp(expectancy / 100, -1, 1);

    const scoreDelta = clamp(
        expectancyNormalized * 0.12 + winRateEdge * 0.10,
        -0.15,
        0.15
    );

    return {
        scoreDelta: Number(scoreDelta.toFixed(4)),
        meta: {
            source: "adaptive_score_stats",
            matched: true,
            sampleSize,
            winRate,
            expectancy,
            applied: true,
        },
    };
}

function computeFailedPatternSoftPenalty(row) {
    if (!row) {
        return {
            scorePenalty: 0,
            meta: { source: "failed_patterns", matched: false },
        };
    }

    const sampleCount = toNumber(row.sample_count, 0);
    const failRate = toNumber(row.fail_rate, 0);
    const basePenalty = toNumber(row.score_penalty, 0);

    if (sampleCount < 4 || failRate < 0.65) {
        return {
            scorePenalty: 0,
            meta: {
                source: "failed_patterns",
                matched: true,
                sampleCount,
                failRate,
                applied: false,
                reason: "SOFT_WARNING_ONLY",
            },
        };
    }

    const scorePenalty = clamp(basePenalty * 0.35, 0.05, 0.18);

    return {
        scorePenalty: Number(scorePenalty.toFixed(4)),
        meta: {
            source: "failed_patterns",
            matched: true,
            sampleCount,
            failRate,
            suggestedAction: row.suggested_action || null,
            reasonCode: row.reason_code || null,
            applied: true,
        },
    };
}

function computeMappedTradeSoftAdjustments(row) {
    if (!row) {
        return {
            scoreDelta: 0,
            tpMultiplier: 1,
            slMultiplier: 1,
            retraceMultiplier: 1,
            meta: { source: "mapped_trade_analysis", matched: false },
        };
    }

    const sampleCount = toNumber(row.sample_count, 0);
    const tpTooFarCount = toNumber(row.tp_too_far_count, 0);
    const slTooTightCount = toNumber(row.sl_too_tight_count, 0);
    const lossCount = toNumber(row.loss_count, 0);
    const winCount = toNumber(row.win_count, 0);

    let tpMultiplier = 1;
    let slMultiplier = 1;
    let retraceMultiplier = 1;
    let scoreDelta = 0;

    if (sampleCount >= 5) {
        const tpTooFarRate = tpTooFarCount / sampleCount;
        const slTooTightRate = slTooTightCount / sampleCount;

        if (tpTooFarRate >= 0.40) {
            tpMultiplier = 0.94;
            scoreDelta -= 0.04;
        }

        if (slTooTightRate >= 0.40) {
            slMultiplier = 1.06;
            scoreDelta -= 0.04;
        }

        if (lossCount > winCount && lossCount / Math.max(sampleCount, 1) >= 0.60) {
            retraceMultiplier = 0.94;
            scoreDelta -= 0.05;
        }
    }

    return {
        scoreDelta: Number(scoreDelta.toFixed(4)),
        tpMultiplier: Number(tpMultiplier.toFixed(4)),
        slMultiplier: Number(slMultiplier.toFixed(4)),
        retraceMultiplier: Number(retraceMultiplier.toFixed(4)),
        meta: {
            source: "mapped_trade_analysis",
            matched: true,
            sampleCount,
            winCount,
            lossCount,
            tpTooFarCount,
            slTooTightCount,
            applied: sampleCount >= 5,
        },
    };
}

async function buildPhase1ContextInfluence(input = {}) {
    const context = buildBaseContext(input);

    const [adaptiveRow, failedRow, mappedRow] = await Promise.all([
        getAdaptiveScoreStats(context),
        getFailedPatternStats(context),
        getMappedTradeStats(context),
    ]);

    const adaptive = computeAdaptiveSoftDelta(adaptiveRow);
    const failed = computeFailedPatternSoftPenalty(failedRow);
    const mapped = computeMappedTradeSoftAdjustments(mappedRow);

    const totalScoreDelta = Number(
        (adaptive.scoreDelta + mapped.scoreDelta - failed.scorePenalty).toFixed(4)
    );

    return {
        scoreDelta: totalScoreDelta,
        tpMultiplier: mapped.tpMultiplier,
        slMultiplier: mapped.slMultiplier,
        retraceMultiplier: mapped.retraceMultiplier,
        warningMatched: failed.scorePenalty > 0,
        scorePenalty: failed.scorePenalty,
        details: {
            context,
            adaptive,
            failed,
            mapped,
        },
    };
}

module.exports = {
    buildPhase1ContextInfluence,
};