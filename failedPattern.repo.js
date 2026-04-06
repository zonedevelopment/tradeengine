// const { query } = require("./db");

// async function findFailedPattern({
//   userId = null,
//   accountId = null,
//   symbol,
//   timeframe,
//   side,
//   mode,
//   contextHash,
// }) {
//   const sql = `
//     SELECT *
//     FROM failed_patterns
//     WHERE symbol = ?
//       AND timeframe = ?
//       AND side = ?
//       AND mode = ?
//       AND context_hash = ?
//       AND (
//         (user_id = ? AND account_id <=> ?)
//         OR
//         (user_id IS NULL AND account_id IS NULL)
//       )
//       AND failure_count >= 3
//       AND fail_rate >= 0.5000
//     ORDER BY
//       CASE
//         WHEN user_id = ? AND account_id <=> ? THEN 0
//         WHEN user_id IS NULL AND account_id IS NULL THEN 1
//         ELSE 2
//       END,
//       failure_count DESC,
//       updated_at DESC
//     LIMIT 1
//   `;

//   const params = [
//     symbol,
//     timeframe,
//     side,
//     mode,
//     contextHash,
//     userId,
//     accountId,
//     userId,
//     accountId
//   ];

//   try {
//     const rows = await query(sql, params, { retries: 2 });
//     return rows?.[0] || null;
//   } catch (error) {
//     console.error("[failedPattern.repo] findFailedPattern failed:", {
//       code: error.code || null,
//       message: error.message,
//       symbol,
//       timeframe,
//       side,
//       mode,
//       contextHash,
//       userId,
//       accountId,
//       userId,
//       accountId
//     });

//     return null;
//   }
// }

// async function findFailedPatternForEarly({
//   userId = null,
//   accountId = null,
//   symbol,
//   timeframe,
//   side,
//   mode,
//   contextHash,
// }) {
//   const sql = `
//     SELECT *
//     FROM failed_patterns
//     WHERE symbol = ?
//       AND timeframe = ?
//       AND side = ?
//       AND mode = ?
//       AND failure_count >= 3
//       AND fail_rate >= 0.5000
//     ORDER BY
//       failure_count DESC,
//       updated_at DESC
//     LIMIT 1
//   `;

//   const params = [
//     symbol,
//     timeframe,
//     side,
//     mode
//   ];

//   try {
//     const rows = await query(sql, params, { retries: 2 });
//     return rows?.[0] || null;
//   } catch (error) {
//     console.error("[failedPattern.repo] findFailedPattern failed:", {
//       code: error.code || null,
//       message: error.message,
//       symbol,
//       timeframe,
//       side,
//       mode,
//       contextHash,
//       userId,
//       accountId,
//       userId,
//       accountId
//     });

//     return null;
//   }
// }

// module.exports = {
//   findFailedPattern,
//   findFailedPatternForEarly
// };
const { query } = require("./db");

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildEffectiveAction(row = null) {
  if (!row) return null;

  const failRate = normalizeNumber(row.fail_rate, 0);
  const failureCount = normalizeNumber(row.failure_count, 0);
  const sampleCount = normalizeNumber(row.sample_count, 0);
  const expectancy = normalizeNumber(row.expectancy, 0);
  const scorePenalty = normalizeNumber(row.score_penalty, 0);
  const riskMultiplier = normalizeNumber(row.risk_multiplier, 1);
  const suggestedAction = String(row.suggested_action || "").toUpperCase();

  let effectiveAction = suggestedAction || "REDUCE_SCORE";
  let effectiveScorePenalty = scorePenalty > 0 ? scorePenalty : 0.35;
  let effectiveRiskMultiplier =
    riskMultiplier > 0 ? riskMultiplier : 1.0;

  // ชั้นแรงสุด: แพ้ชัด + sample พอ
  if (
    sampleCount >= 2 &&
    failureCount >= 2 &&
    failRate >= 0.8 &&
    expectancy <= -0.2
  ) {
    effectiveAction = "BLOCK_TRADE";
    effectiveScorePenalty = Math.max(effectiveScorePenalty, 1.0);
    effectiveRiskMultiplier = Math.min(effectiveRiskMultiplier, 0.5);
  }
  // ชั้นกลาง: แพ้บ่อย เริ่มควรลดความมั่นใจ
  else if (
    sampleCount >= 2 &&
    failureCount >= 2 &&
    failRate >= 0.5
  ) {
    effectiveAction =
      suggestedAction === "BLOCK_TRADE" ? "BLOCK_TRADE" : "WARNING";
    effectiveScorePenalty = Math.max(effectiveScorePenalty, 0.5);
    effectiveRiskMultiplier = Math.min(effectiveRiskMultiplier, 0.7);
  }
  // ชั้นเบา: sample ยังน้อย แต่ context เริ่มไม่สวย
  else if (
    sampleCount >= 1 &&
    failRate >= 0.5
  ) {
    effectiveAction = "REDUCE_SCORE";
    effectiveScorePenalty = Math.max(effectiveScorePenalty, 0.3);
    effectiveRiskMultiplier = Math.min(effectiveRiskMultiplier, 0.85);
  }
  // ถ้า context นี้ expectancy ดี อย่า block
  else if (expectancy > 0) {
    effectiveAction = "REDUCE_SCORE";
    effectiveScorePenalty = Math.min(effectiveScorePenalty, 0.25);
    effectiveRiskMultiplier = Math.max(effectiveRiskMultiplier, 0.9);
  }

  return {
    ...row,
    effective_action: effectiveAction,
    effective_score_penalty: Number(effectiveScorePenalty.toFixed(4)),
    effective_risk_multiplier: Number(effectiveRiskMultiplier.toFixed(4)),
  };
}

async function runLookup(sql, params) {
  const rows = await query(sql, params, { retries: 2 });
  return rows?.[0] || null;
}

async function findFailedPattern({
  userId = null,
  accountId = null,
  symbol,
  timeframe,
  side,
  mode,
  contextHash,
}) {
  const exactSql = `
    SELECT *
    FROM failed_patterns
    WHERE symbol = ?
      AND timeframe = ?
      AND side = ?
      AND mode = ?
      AND context_hash = ?
      AND (
        (user_id = ? AND account_id <=> ?)
        OR
        (user_id IS NULL AND account_id IS NULL)
      )
      AND sample_count >= 2
      AND fail_rate >= 0.5000
    ORDER BY
      CASE
        WHEN user_id = ? AND account_id <=> ? THEN 0
        WHEN user_id IS NULL AND account_id IS NULL THEN 1
        ELSE 2
      END,
      failure_count DESC,
      sample_count DESC,
      updated_at DESC
    LIMIT 1
  `;

  const exactParams = [
    symbol,
    timeframe,
    side,
    mode,
    contextHash,
    userId,
    accountId,
    userId,
    accountId,
  ];

  const looseSql = `
    SELECT *
    FROM failed_patterns
    WHERE symbol = ?
      AND timeframe = ?
      AND side = ?
      AND mode = ?
      AND (
        (user_id = ? AND account_id <=> ?)
        OR
        (user_id IS NULL AND account_id IS NULL)
      )
      AND sample_count >= 2
      AND fail_rate >= 0.5000
    ORDER BY
      CASE
        WHEN user_id = ? AND account_id <=> ? THEN 0
        WHEN user_id IS NULL AND account_id IS NULL THEN 1
        ELSE 2
      END,
      failure_count DESC,
      sample_count DESC,
      updated_at DESC
    LIMIT 1
  `;

  const looseParams = [
    symbol,
    timeframe,
    side,
    mode,
    userId,
    accountId,
    userId,
    accountId,
  ];

  const veryLooseSql = `
    SELECT *
    FROM failed_patterns
    WHERE symbol = ?
      AND timeframe = ?
      AND side = ?
      AND sample_count >= 2
      AND fail_rate >= 0.6500
    ORDER BY
      failure_count DESC,
      sample_count DESC,
      updated_at DESC
    LIMIT 1
  `;

  const veryLooseParams = [
    symbol,
    timeframe,
    side,
  ];

  try {
    const exactRow = await runLookup(exactSql, exactParams);
    if (exactRow) {
      return buildEffectiveAction({
        ...exactRow,
        match_level: "EXACT_CONTEXT",
      });
    }

    const looseRow = await runLookup(looseSql, looseParams);
    if (looseRow) {
      return buildEffectiveAction({
        ...looseRow,
        match_level: "SIDE_MODE_FALLBACK",
      });
    }

    const veryLooseRow = await runLookup(veryLooseSql, veryLooseParams);
    if (veryLooseRow) {
      return buildEffectiveAction({
        ...veryLooseRow,
        match_level: "SIDE_ONLY_FALLBACK",
      });
    }

    return null;
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
      accountId,
    });
    return null;
  }
}

async function findFailedPatternForEarly({
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
      AND sample_count >= 2
      AND fail_rate >= 0.5000
    ORDER BY
      failure_count DESC,
      sample_count DESC,
      updated_at DESC
    LIMIT 1
  `;

  const params = [
    symbol,
    timeframe,
    side,
    mode,
  ];

  try {
    const row = await runLookup(sql, params);
    if (!row) return null;

    return buildEffectiveAction({
      ...row,
      match_level: "EARLY_COARSE",
    });
  } catch (error) {
    console.error("[failedPattern.repo] findFailedPatternForEarly failed:", {
      code: error.code || null,
      message: error.message,
      symbol,
      timeframe,
      side,
      mode,
      contextHash,
      userId,
      accountId,
    });
    return null;
  }
}

module.exports = {
  findFailedPattern,
  findFailedPatternForEarly,
};