const { query } = require("./db");

async function getPatternWeight(symbol = "DEFAULT", patternName) {
  // if (!patternName) return 0;

  // const sql = `
  //   SELECT
  //     CASE
  //       WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
  //       ELSE weight_score
  //     END AS weight_score
  //   FROM strategy_weights
  //   WHERE pattern_name = ?
  //   LIMIT 1
  // `;

  // try {
  //   const rows = await query(sql, [patternName], { retries: 2 });
  //   const row = rows?.[0] || null;
  //   return Number(row?.weight_score || 0);
  // } catch (error) {
  //   console.error("[strategyWeights.repo] getPatternWeight failed:", {
  //     patternName,
  //     code: error.code || null,
  //     message: error.message,
  //   });
  //   return 0;
  // }
  try {
    const targetSymbol = String(symbol || "DEFAULT").toUpperCase();
    const targetPattern = String(patternName || "").trim();

    if (!targetPattern) return 0;

    const sql = `
      SELECT
        symbol,
        CASE
          WHEN is_use_user_score = 1 AND user_score IS NOT NULL THEN user_score
          ELSE weight_score
        END AS weight_score
      FROM strategy_weights
      WHERE pattern_name = ? AND symbol = ?
      ORDER BY CASE WHEN symbol = ? THEN 0 ELSE 1 END
      LIMIT 1
    `;

    const result = await query(sql, [targetPattern, targetSymbol, targetSymbol]);
    const rows = Array.isArray(result?.[0]) ? result[0] : result;

    if (rows && rows.length > 0) {
      return Number(rows[0].weight_score || 0);
    }

    return 0;
  } catch (err) {
    console.error("[strategyWeights.repo] getPatternWeight error:", err.message);
    return 0;
  }
}

module.exports = { getPatternWeight };
