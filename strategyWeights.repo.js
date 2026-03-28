const { query } = require("./db");

async function getPatternWeight(patternName) {
  if (!patternName) return 0;

  const sql = `
    SELECT
      CASE
        WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
        ELSE weight_score
      END AS weight_score
    FROM strategy_weights
    WHERE pattern_name = ?
    LIMIT 1
  `;

  try {
    const rows = await query(sql, [patternName], { retries: 2 });
    const row = rows?.[0] || null;
    return Number(row?.weight_score || 0);
  } catch (error) {
    console.error("[strategyWeights.repo] getPatternWeight failed:", {
      patternName,
      code: error.code || null,
      message: error.message,
    });
    return 0;
  }
}

module.exports = { getPatternWeight };
