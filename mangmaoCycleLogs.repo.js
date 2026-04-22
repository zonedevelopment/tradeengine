const { query } = require("./db");

function normalizeNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSide(value) {
    const side = String(value || "").trim().toUpperCase();
    return side === "SELL" ? "SELL" : "BUY";
}

function normalizeResult(value) {
    const allowed = ["WIN", "LOSS", "FORCE_CLOSE", "CANCEL"];
    return allowed.includes(value) ? value : "CANCEL";
}

async function insertMangmaoCycleLog({
    cycleStateId,
    firebaseUserId,
    accountId = null,
    symbol,
    groupId,
    cycleNo,
    levelNo,
    orderCount,
    side,
    signalSource = "MICRO_SCALP",
    result = "CANCEL",
    totalProfitUsd = 0,
    closedOrderCount = 0,
    startedAt = null,
    endedAt = null,
    note = null,
}) {
    const sql = `
    INSERT INTO mangmao_cycle_logs (
      cycle_state_id,
      firebase_user_id,
      account_id,
      symbol,
      group_id,
      cycle_no,
      level_no,
      order_count,
      side,
      signal_source,
      result,
      total_profit_usd,
      closed_order_count,
      started_at,
      ended_at,
      note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    return await query(sql, [
        normalizeNumber(cycleStateId, 0),
        String(firebaseUserId || "").trim(),
        accountId ?? null,
        String(symbol || "").trim(),
        String(groupId || "").trim(),
        normalizeNumber(cycleNo, 1),
        normalizeNumber(levelNo, 1),
        normalizeNumber(orderCount, 1),
        normalizeSide(side),
        String(signalSource || "MICRO_SCALP").trim(),
        normalizeResult(result),
        normalizeNumber(totalProfitUsd, 0),
        normalizeNumber(closedOrderCount, 0),
        normalizeDate(startedAt),
        normalizeDate(endedAt),
        note ? String(note).trim() : null,
    ]);
}

async function getMangmaoCycleLogsByUser(firebaseUserId, accountId = null, limit = 50) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

    const sql = `
    SELECT *
    FROM mangmao_cycle_logs
    WHERE firebase_user_id = ?
      AND (account_id <=> ?)
    ORDER BY id DESC
    LIMIT ?
  `;

    return await query(sql, [
        String(firebaseUserId || "").trim(),
        accountId ?? null,
        safeLimit,
    ]);
}

async function getMangmaoCycleLogByGroup(groupId) {
    const sql = `
    SELECT *
    FROM mangmao_cycle_logs
    WHERE group_id = ?
    ORDER BY id DESC
    LIMIT 1
  `;

    const rows = await query(sql, [String(groupId || "").trim()]);
    return rows?.[0] || null;
}

module.exports = {
    insertMangmaoCycleLog,
    getMangmaoCycleLogsByUser,
    getMangmaoCycleLogByGroup,
};