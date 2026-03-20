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
  const sqlUser = `
    SELECT *
    FROM failed_patterns
    WHERE user_id <=> ?
      AND account_id <=> ?
      AND symbol = ?
      AND timeframe = ?
      AND side = ?
      AND mode = ?
      AND context_hash = ?
      AND failure_count >= 3
      AND fail_rate >= 0.5000
    ORDER BY fail_rate DESC, failure_count DESC
    LIMIT 1
  `;

  const sqlGlobal = `
    SELECT *
    FROM failed_patterns
    WHERE user_id IS NULL
      AND account_id IS NULL
      AND symbol = ?
      AND timeframe = ?
      AND side = ?
      AND mode = ?
      AND context_hash = ?
      AND failure_count >= 3
      AND fail_rate >= 0.5000
    ORDER BY fail_rate DESC, failure_count DESC
    LIMIT 1
  `;

  let userRows = [];
  let globalRows = [];

  if (userId !== null || accountId !== null) {
    const result = await query(sqlUser, [
      userId,
      accountId,
      symbol,
      timeframe,
      side,
      mode,
      contextHash,
    ]);

    // mysql2/promise execute() returns [rows, fields]
    const rows = Array.isArray(result) && result.length > 0 ? result[0] : [];
    userRows = Array.isArray(rows) ? rows : [];
    if (userRows.length > 0) {
      return userRows[0];
    }
  }

  const globalResult = await query(sqlGlobal, [
    symbol,
    timeframe,
    side,
    mode,
    contextHash,
  ]);

  const globalResultRows = Array.isArray(globalResult) && globalResult.length > 0 ? globalResult[0] : [];
  globalRows = Array.isArray(globalResultRows) ? globalResultRows : [];
  if (globalRows.length > 0) {
    return globalRows[0];
  }

  return null;
}

module.exports = {
  findFailedPattern,
};