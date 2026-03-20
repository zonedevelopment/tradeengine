const { query } = require("./db");

async function findFailedPattern({
  userId = null,
  accountId = null,
  symbol,
  timeframe,
  side,
  mode,
  contextHash,
}) {
  const sql = `
    SELECT *
    FROM failed_patterns
    WHERE symbol = ?
      AND timeframe = ?
      AND side = ?
      AND mode = ?
      AND context_hash = ?
      AND (
        (user_id = ?)
        OR (user_id IS NULL)
      )
      AND failure_count >= 3
      AND fail_rate >= 0.5000
    ORDER BY
      CASE WHEN user_id = ? THEN 0 ELSE 1 END,
      failure_count DESC,
      updated_at DESC
    LIMIT 1
  `;

  const params = [
    symbol,
    timeframe,
    side,
    mode,
    contextHash,
    userId,
    userId,
  ];

  try {
    const rows = await query(sql, params, { retries: 2 });
    return rows?.[0] || null;
  } catch (error) {
    console.error("[failedPattern.repo] findFailedPattern failed:", {
      code: error.code || null,
      message: error.message,
      symbol,
      timeframe,
      side,
      mode,
      contextHash,
      userId,
    });

    return null;
  }
}

module.exports = {
  findFailedPattern,
};