const { query } = require("./db");

async function getTradingPreference(firebaseUserId, accountId = null) {
  const sql = `
    SELECT *
    FROM user_trading_preferences
    WHERE firebase_user_id = ?
      AND (account_id <=> ? OR account_id IS NULL)
    ORDER BY
      CASE
        WHEN account_id <=> ? THEN 0
        WHEN account_id IS NULL THEN 1
        ELSE 2
      END,
      updated_at DESC
    LIMIT 1
  `;

  const rows = await query(sql, [firebaseUserId, accountId, accountId], { retries: 2 });
  return rows?.[0] || null;
}

module.exports = { getTradingPreference };
