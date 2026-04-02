const { query } = require("./db");

function normalizeScopeValue(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    const s = String(value).trim();
    return s === "" ? fallback : s;
}

function buildScopeKey(firebaseUserId, accountId = "") {
    return `${normalizeScopeValue(firebaseUserId)}||${normalizeScopeValue(accountId)}`;
}

async function getUserStrategyWeightsByScopes(scopes = []) {
    const normalizedScopes = Array.from(
        new Map(
            (Array.isArray(scopes) ? scopes : [])
                .map((scope) => ({
                    firebaseUserId: normalizeScopeValue(scope?.firebaseUserId),
                    accountId: normalizeScopeValue(scope?.accountId),
                }))
                .filter((scope) => scope.firebaseUserId)
                .map((scope) => [buildScopeKey(scope.firebaseUserId, scope.accountId), scope])
        ).values()
    );

    if (!normalizedScopes.length) return [];

    const where = normalizedScopes
        .map(() => `(firebase_user_id = ? AND account_id = ?)`)
        .join(" OR ");

    const params = normalizedScopes.flatMap((scope) => [
        scope.firebaseUserId,
        scope.accountId,
    ]);

    const sql = `
    SELECT
      firebase_user_id,
      account_id,
      symbol,
      pattern_name,
      CASE
        WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
        ELSE weight_score
      END AS weight_score
    FROM user_strategy_weights
    WHERE ${where}
  `;

    const result = await query(sql, params);
    const rows = Array.isArray(result?.[0]) ? result[0] : result;
    return rows || [];
}

async function upsertUserStrategyWeight({
    firebaseUserId,
    accountId = "",
    symbol,
    patternName,
    weightScore,
}) {
    const sql = `
    INSERT INTO user_strategy_weights
    (
      firebase_user_id,
      account_id,
      symbol,
      pattern_name,
      weight_score,
      last_updated,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      weight_score = VALUES(weight_score),
      last_updated = NOW()
  `;

    await query(sql, [
        normalizeScopeValue(firebaseUserId),
        normalizeScopeValue(accountId),
        String(symbol || "DEFAULT").trim().toUpperCase(),
        String(patternName || "").trim(),
        Number(weightScore || 0),
    ]);
}

module.exports = {
    getUserStrategyWeightsByScopes,
    upsertUserStrategyWeight,
};