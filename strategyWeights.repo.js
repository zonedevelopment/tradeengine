const { query } = require("./db");

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
}

function normalizeSymbol(value) {
  return normalizeString(value, "DEFAULT").toUpperCase();
}

function normalizePatternName(value) {
  return normalizeString(value, "");
}

function resolveWeightValue(row) {
  if (!row) return 0;
  return Number(row.weight_score || 0);
}

async function getPatternWeight(inputOrSymbol = {}, patternNameArg) {
  try {
    let firebaseUserId = null;
    let accountId = "";
    let symbol = "DEFAULT";
    let patternName = "";

    // รองรับทั้ง signature ใหม่แบบ object
    // getPatternWeight({ firebaseUserId, accountId, symbol, patternName })
    // และ signature เดิม
    // getPatternWeight(symbol, patternName)
    if (
      inputOrSymbol &&
      typeof inputOrSymbol === "object" &&
      !Array.isArray(inputOrSymbol)
    ) {
      firebaseUserId = normalizeString(inputOrSymbol.firebaseUserId, null);
      accountId = normalizeString(inputOrSymbol.accountId, "");
      symbol = normalizeSymbol(inputOrSymbol.symbol);
      patternName = normalizePatternName(inputOrSymbol.patternName);
    } else {
      symbol = normalizeSymbol(inputOrSymbol);
      patternName = normalizePatternName(patternNameArg);
    }

    if (!patternName) return 0;

    const sqlParts = [];
    const params = [];

    // 1) user-specific exact symbol
    if (firebaseUserId) {
      sqlParts.push(`
    SELECT
      1 AS priority,
      'USER_SYMBOL' AS source_level,
      CASE
        WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
        ELSE weight_score
      END AS weight_score
    FROM user_strategy_weights
    WHERE firebase_user_id = ?
      AND (account_id = ? OR account_id IS NULL)
      AND pattern_name = ?
      AND symbol = ?
  `);
      params.push(firebaseUserId, accountId, patternName, symbol);

      // 2) user-specific DEFAULT
      sqlParts.push(`
    SELECT
      2 AS priority,
      'USER_DEFAULT' AS source_level,
      CASE
        WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
        ELSE weight_score
      END AS weight_score
    FROM user_strategy_weights
    WHERE firebase_user_id = ?
      AND (account_id = ? OR account_id IS NULL)
      AND pattern_name = ?
      AND symbol = 'DEFAULT'
  `);
      params.push(firebaseUserId, accountId, patternName);
    }

    // 3) global exact symbol
    sqlParts.push(`
  SELECT
    3 AS priority,
    'GLOBAL_SYMBOL' AS source_level,
    CASE
      WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
      ELSE weight_score
    END AS weight_score
  FROM strategy_weights
  WHERE pattern_name = ?
    AND symbol = ?
`);
    params.push(patternName, symbol);

    // 4) global DEFAULT
    sqlParts.push(`
  SELECT
    4 AS priority,
    'GLOBAL_DEFAULT' AS source_level,
    CASE
      WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
      ELSE weight_score
    END AS weight_score
  FROM strategy_weights
  WHERE pattern_name = ?
    AND symbol = 'DEFAULT'
`);
    params.push(patternName);

    const sql = `
  SELECT source_level, weight_score
  FROM (
    ${sqlParts.join(" UNION ALL ")}
  ) AS candidate_weights
  ORDER BY priority ASC
  LIMIT 1
`;

    const result = await query(sql, params);
    const rows = Array.isArray(result?.[0]) ? result[0] : result;
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    return resolveWeightValue(row);
  } catch (err) {
    console.error("[strategyWeights.repo] getPatternWeight error:", {
      message: err.message,
    });
    return 0;
  }
}

module.exports = {
  getPatternWeight,
};
