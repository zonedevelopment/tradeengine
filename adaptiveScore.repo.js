const { query } = require("./db");

function normalizeNullable(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, Number(num || 0)));
}

async function upsertAdaptiveScoreStat(row) {
  const sql = `
    INSERT INTO adaptive_score_stats (
      firebase_user_id,
      account_id,
      symbol,
      timeframe,
      pattern_type,
      side,
      mode,
      session_name,
      micro_trend,
      volume_profile,
      range_state,
      sample_size,
      win_count,
      loss_count,
      be_count,
      win_rate,
      avg_profit,
      avg_loss,
      expectancy,
      adaptive_score_delta,
      quality_grade,
      last_trade_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      sample_size = VALUES(sample_size),
      win_count = VALUES(win_count),
      loss_count = VALUES(loss_count),
      be_count = VALUES(be_count),
      win_rate = VALUES(win_rate),
      avg_profit = VALUES(avg_profit),
      avg_loss = VALUES(avg_loss),
      expectancy = VALUES(expectancy),
      adaptive_score_delta = VALUES(adaptive_score_delta),
      quality_grade = VALUES(quality_grade),
      last_trade_at = VALUES(last_trade_at),
      updated_at = CURRENT_TIMESTAMP
  `;

  const params = [
    normalizeNullable(row.firebaseUserId),
    normalizeNullable(row.accountId),
    String(row.symbol || "").trim(),
    String(row.timeframe || "M5").trim(),
    String(row.patternType || "").trim(),
    String(row.side || "").trim(),
    String(row.mode || "NORMAL").trim(),
    normalizeNullable(row.sessionName),
    normalizeNullable(row.microTrend),
    normalizeNullable(row.volumeProfile),
    normalizeNullable(row.rangeState),
    Number(row.sampleSize || 0),
    Number(row.winCount || 0),
    Number(row.lossCount || 0),
    Number(row.beCount || 0),
    Number(row.winRate || 0),
    Number(row.avgProfit || 0),
    Number(row.avgLoss || 0),
    Number(row.expectancy || 0),
    clamp(row.adaptiveScoreDelta, -0.60, 0.60),
    String(row.qualityGrade || "NEUTRAL").trim(),
    row.lastTradeAt || null,
  ];

  return await query(sql, params, { retries: 2 });
}

async function findAdaptiveScoreRule({
  firebaseUserId = null,
  accountId = null,
  symbol,
  timeframe = "M5",
  patternType,
  side,
  mode,
  sessionName = null,
  microTrend = null,
  volumeProfile = null,
  rangeState = null,
}) {
  const sql = `
    SELECT *
    FROM adaptive_score_stats
    WHERE symbol = ?
      AND timeframe = ?
      AND pattern_type = ?
      AND side = ?
      AND mode = ?
      AND (
        (firebase_user_id = ? AND account_id <=> ?)
        OR
        (firebase_user_id IS NULL AND account_id IS NULL)
      )
      AND (session_name <=> ? OR session_name IS NULL)
      AND (micro_trend <=> ? OR micro_trend IS NULL)
      AND (volume_profile <=> ? OR volume_profile IS NULL)
      AND (range_state <=> ? OR range_state IS NULL)
      AND sample_size >= 20
    ORDER BY
      CASE
        WHEN firebase_user_id = ? AND account_id <=> ? THEN 0
        WHEN firebase_user_id IS NULL AND account_id IS NULL THEN 1
        ELSE 2
      END,
      (CASE WHEN session_name IS NULL THEN 1 ELSE 0 END),
      (CASE WHEN micro_trend IS NULL THEN 1 ELSE 0 END),
      (CASE WHEN volume_profile IS NULL THEN 1 ELSE 0 END),
      (CASE WHEN range_state IS NULL THEN 1 ELSE 0 END),
      sample_size DESC,
      updated_at DESC
    LIMIT 1
  `;

  const params = [
    String(symbol || "").trim(),
    String(timeframe || "M5").trim(),
    String(patternType || "").trim(),
    String(side || "").trim(),
    String(mode || "NORMAL").trim(),
    normalizeNullable(firebaseUserId),
    normalizeNullable(accountId),
    normalizeNullable(sessionName),
    normalizeNullable(microTrend),
    normalizeNullable(volumeProfile),
    normalizeNullable(rangeState),
    normalizeNullable(firebaseUserId),
    normalizeNullable(accountId),
  ];

  const rows = await query(sql, params, { retries: 2 });
  return rows?.[0] || null;
}

module.exports = {
  upsertAdaptiveScoreStat,
  findAdaptiveScoreRule,
};
