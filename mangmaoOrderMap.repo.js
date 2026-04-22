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

function normalizeStatus(value) {
    const allowed = ["OPEN", "CLOSED", "LOSS_HIT", "WIN_CLOSE", "CANCEL"];
    return allowed.includes(value) ? value : "OPEN";
}

function normalizeTicketId(value) {
    if (value === undefined || value === null || value === "") return null;
    const str = String(value).trim();
    return /^\d+$/.test(str) ? str : null;
}

async function insertMangmaoOrderMap({
    cycleStateId,
    firebaseUserId,
    accountId = null,
    symbol,
    groupId,
    levelNo,
    orderNo,
    ticketId = null,
    side,
    status = "OPEN",
    openPrice = null,
    closePrice = null,
    profitUsd = 0,
    openedAt = null,
    closedAt = null,
}) {
    const sql = `
    INSERT INTO mangmao_order_map (
      cycle_state_id,
      firebase_user_id,
      account_id,
      symbol,
      group_id,
      level_no,
      order_no,
      ticket_id,
      side,
      status,
      open_price,
      close_price,
      profit_usd,
      opened_at,
      closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    return await query(sql, [
        normalizeNumber(cycleStateId, 0),
        String(firebaseUserId || "").trim(),
        accountId ?? null,
        String(symbol || "").trim(),
        String(groupId || "").trim(),
        normalizeNumber(levelNo, 1),
        normalizeNumber(orderNo, 1),
        normalizeTicketId(ticketId),
        normalizeSide(side),
        normalizeStatus(status),
        openPrice === null ? null : normalizeNumber(openPrice, 0),
        closePrice === null ? null : normalizeNumber(closePrice, 0),
        normalizeNumber(profitUsd, 0),
        normalizeDate(openedAt),
        normalizeDate(closedAt),
    ]);
}

async function insertManyMangmaoOrderMaps(items = []) {
    if (!Array.isArray(items) || !items.length) {
        return { affectedRows: 0 };
    }

    const results = [];
    for (const item of items) {
        const res = await insertMangmaoOrderMap(item);
        results.push(res);
    }
    return results;
}

async function bindTicketToMangmaoOrder({
    groupId,
    orderNo,
    ticketId,
    openPrice = null,
    openedAt = null,
}) {
    const sql = `
    UPDATE mangmao_order_map
    SET
      ticket_id = ?,
      open_price = ?,
      opened_at = COALESCE(?, opened_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE group_id = ?
      AND order_no = ?
    LIMIT 1
  `;

    return await query(sql, [
        normalizeTicketId(ticketId),
        openPrice === null ? null : normalizeNumber(openPrice, 0),
        normalizeDate(openedAt),
        String(groupId || "").trim(),
        normalizeNumber(orderNo, 1),
    ]);
}

async function closeMangmaoOrder({
    ticketId,
    status,
    closePrice = null,
    profitUsd = 0,
    closedAt = null,
}) {
    const sql = `
    UPDATE mangmao_order_map
    SET
      status = ?,
      close_price = ?,
      profit_usd = ?,
      closed_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE ticket_id = ?
    LIMIT 1
  `;

    return await query(sql, [
        normalizeStatus(status || "CLOSED"),
        closePrice === null ? null : normalizeNumber(closePrice, 0),
        normalizeNumber(profitUsd, 0),
        normalizeDate(closedAt),
        normalizeTicketId(ticketId),
    ]);
}

async function getMangmaoOpenOrdersByGroup(groupId) {
    const sql = `
    SELECT *
    FROM mangmao_order_map
    WHERE group_id = ?
      AND status = 'OPEN'
    ORDER BY order_no ASC, id ASC
  `;

    return await query(sql, [String(groupId || "").trim()]);
}

async function getMangmaoOrdersByGroup(groupId) {
    const sql = `
    SELECT *
    FROM mangmao_order_map
    WHERE group_id = ?
    ORDER BY order_no ASC, id ASC
  `;

    return await query(sql, [String(groupId || "").trim()]);
}

async function getMangmaoOrderByTicket(ticketId) {
    const sql = `
    SELECT *
    FROM mangmao_order_map
    WHERE ticket_id = ?
    LIMIT 1
  `;

    const rows = await query(sql, [normalizeTicketId(ticketId)]);
    return rows?.[0] || null;
}

async function sumMangmaoGroupProfit(groupId) {
    const sql = `
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_orders,
      SUM(COALESCE(profit_usd, 0)) AS total_profit_usd
    FROM mangmao_order_map
    WHERE group_id = ?
  `;

    const rows = await query(sql, [String(groupId || "").trim()]);
    return rows?.[0] || {
        total_orders: 0,
        open_orders: 0,
        total_profit_usd: 0,
    };
}

module.exports = {
    insertMangmaoOrderMap,
    insertManyMangmaoOrderMaps,
    bindTicketToMangmaoOrder,
    closeMangmaoOrder,
    getMangmaoOpenOrdersByGroup,
    getMangmaoOrdersByGroup,
    getMangmaoOrderByTicket,
    sumMangmaoGroupProfit,
};