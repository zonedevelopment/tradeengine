const { query } = require("./db");

const ALLOWED_EVENT_TYPES = [
  "WAIT_ORDER",
  "OPEN_ORDER",
  "CLOSE_ORDER",
  "CANCEL_ORDER",
  "CLOSE_EMERGENCY",
];

const ALLOWED_SIDES = ["BUY", "SELL"];
const ALLOWED_MODES = ["NORMAL", "SCALP"];

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeTicketId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const str = String(value).trim();

  if (!/^\d+$/.test(str)) {
    return null;
  }

  const num = Number(str);
  return Number.isSafeInteger(num) ? num : null;
}

function normalizeDate(value) {
  if (!value) return new Date();

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function insertTradeHistory(data) {
  const safeEventType = ALLOWED_EVENT_TYPES.includes(data.eventType)
    ? data.eventType
    : "WAIT_ORDER";

  const safeSide = ALLOWED_SIDES.includes(data.side) ? data.side : "BUY";
  const safeMode = ALLOWED_MODES.includes(data.mode) ? data.mode : "NORMAL";
  const safeTicketId = normalizeTicketId(data.ticketId ?? data.ticket_id);

  const sql = `
    INSERT INTO trade_history (
      firebase_user_id,
      ticket_id,
      event_type,
      symbol,
      side,
      lot,
      price,
      sl,
      tp,
      profit,
      mode,
      event_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.firebaseUserId || null,
    safeTicketId,
    safeEventType,
    data.symbol ? String(data.symbol).trim() : "",
    safeSide,
    normalizeNumber(data.lot, 0),
    normalizeNumber(data.price, 0),
    normalizeNumber(data.sl, 0),
    normalizeNumber(data.tp, 0),
    normalizeNumber(data.profit, 0),
    safeMode,
    normalizeDate(data.eventTime),
  ];

  console.log("trade_history params:", params);

  try {
    return await query(sql, params);
  } catch (error) {
    console.error("trade_history insert failed:", {
      message: error.message,
      code: error.code || null,
      sqlMessage: error.sqlMessage || null,
      params,
    });
    throw error;
  }
}

async function getTradeHistoryByUser(firebaseUserId, limit = 100, page = 1) {
  const safeLimit = Math.max(1, Math.min(1000, normalizeNumber(limit, 50)));
  const safePage = Math.max(1, normalizeNumber(page, 1));
  const offset = (safePage - 1) * safeLimit;

  const sql = `
    SELECT
      id,
      firebase_user_id,
      ticket_id,
      event_type,
      symbol,
      side,
      lot,
      price,
      sl,
      tp,
      profit,
      mode,
      created_at,
      event_time
    FROM trade_history
    WHERE firebase_user_id = ?
    ORDER BY id DESC
    LIMIT ?
    OFFSET ?
  `;

  return await query(sql, [firebaseUserId, safeLimit, offset]);
}

async function countTradeHistoryByUser(firebaseUserId) {
  const sql = `
    SELECT COUNT(*) AS total
    FROM trade_history
    WHERE firebase_user_id = ?
  `;

  const rows = await query(sql, [firebaseUserId]);
  return rows?.[0]?.total ? Number(rows[0].total) : 0;
}

module.exports = {
  insertTradeHistory,
  getTradeHistoryByUser,
  countTradeHistoryByUser
};
