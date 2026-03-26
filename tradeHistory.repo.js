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
  const safeLimit = Math.max(1, Math.min(10, normalizeNumber(limit, 10)));
  const safePage = Math.max(1, normalizeNumber(page, 1));
  const offset = (safePage - 1) * safeLimit;

  const sql = `
    SELECT
      c.id,
      c.firebase_user_id,
      c.ticket_id,
      c.symbol,
      c.side,
      c.lot,
      o.price AS entry_price,
      c.price AS close_price,
      c.sl,
      c.tp,
      c.profit,
      c.mode,
      o.event_time AS open_time,
      c.event_time AS close_time
    FROM trade_history c
    LEFT JOIN trade_history o
      ON c.price = o.price
      AND o.event_type = 'OPEN_ORDER'
    WHERE
      c.firebase_user_id = ?
      AND c.event_type = 'CLOSE_ORDER'
    ORDER BY c.id DESC
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
    AND event_type IN ('CLOSE_ORDER', 'CLOSE_EMERGENCY')
`;

  const rows = await query(sql, [firebaseUserId]);
  return rows?.[0]?.total ? Number(rows[0].total) : 0;
}

async function getTradeHistoryDetailFromCommands(commandId) {
  const sql = `SELECT
            th.firebase_user_id,
            ec.ticket_id,
            th.symbol
            th.side,
            th.lot,
            th.price,
            th.sl,
            th.tp,
            th.profit,
            th.mode,
          FROM emergency_commands ec
          LEFT JOIN trade_history th
            ON th.firebase_user_id = ec.firebase_user_id
          AND th.ticket_id = ec.ticket_id
          AND th.symbol = ec.symbol
          AND th.event_type = 'OPEN_ORDER'
          WHERE ec.command_id = ? AND ec.type = 'CLOSE_POSITION' AND ec.status = 'DONE'
          ORDER BY ec.id DESC, th.created_at DESC`;

  return await query(sql, [commandId]);
}

async function getTradeEventsForAnalysis({
  firebaseUserId = null,
  symbol = null,
  mode = null,
  limit = 5000,
} = {}) {
  const safeLimit = Math.max(1, Math.min(50000, normalizeNumber(limit, 5000)));

  const conditions = [
    `event_type IN ('CLOSE_ORDER', 'CLOSE_EMERGENCY')`
  ];
  const params = [];

  if (firebaseUserId) {
    conditions.push(`firebase_user_id = ?`);
    params.push(String(firebaseUserId).trim());
  }

  if (symbol) {
    conditions.push(`symbol = ?`);
    params.push(String(symbol).trim());
  }

  if (mode && ALLOWED_MODES.includes(mode)) {
    conditions.push(`mode = ?`);
    params.push(mode);
  }

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
    WHERE ${conditions.join(" AND ")}
    ORDER BY COALESCE(event_time, created_at) ASC, id ASC
    LIMIT ?
  `;

  params.push(safeLimit);

  return await query(sql, params);
}

async function getTradeEventsForLearning() {
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
    WHERE event_type = 'OPEN_ORDER'
    ORDER BY COALESCE(event_time, created_at) DESC, id DESC`;

  return await query(sql);
}

async function getHistoryLearnWeight() {
  const safeLimit = 2500;

  const conditions = [
    `event_time >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    `event_time <= NOW()`,
    `result IN ('WIN', 'LOSS')`
  ];

  const params = [];

  const sql = `
    SELECT
      firebase_user_id,
      account_id,
      event_time,
      symbol,
      pattern_type,
      trigger_pattern,
      mode,
      tick_volume,
      micro_trend,
      volume_profile,
      pre_pattern_shape,
      range_state,
      session_name,
      open_price,
      close_price,
      sl_price,
      tp_price,
      sl_pips,
      tp_pips,
      rr_ratio,
      profit,
      result,
      side
    FROM mapped_trade_analysis
    WHERE ${conditions.join(" AND ")}
    ORDER BY event_time DESC
    LIMIT ?
  `;

  params.push(safeLimit);

  return await query(sql, params);
}

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
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

function getDayRangeFromEventTime(eventTime) {
  const base = normalizeDate(eventTime);

  const start = new Date(base);
  start.setHours(0, 0, 0, 0);

  const end = new Date(base);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

async function getTodayTradeStatsByUserAndAccount(firebaseUserId, accountId, eventTime) {
  const safeFirebaseUserId = normalizeString(firebaseUserId);
  const safeAccountId = normalizeString(accountId);

  if (!safeFirebaseUserId) {
    throw new Error("firebaseUserId is required");
  }

  const { start, end } = getDayRangeFromEventTime(eventTime);

  const sql = `
    SELECT
      COUNT(*) AS todayClosedTrades,
      SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) AS todayWinTrades,
      SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) AS todayLossTrades,
      COALESCE(SUM(profit), 0) AS dailyNetProfit,
      COALESCE(SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END), 0) AS dailyProfit,
      COALESCE(SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END), 0) AS dailyLoss
    FROM trade_history
    WHERE firebase_user_id = ?
      AND event_type IN ('OPEN_ORDER', 'CLOSE_ORDER', 'CLOSE_EMERGENCY')
      AND DATE(event_time) >= ?
      AND DATE(event_time) <= ?
  `;

  const today = new Date();
  const year = today.getFullYear();
  // getMonth() is zero-based, so add 1
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  const formattedDateLocal = `${year}-${month}-${day}`;

  const rows = await query(sql, [
    safeFirebaseUserId,
    safeAccountId,
    formattedDateLocal,
    formattedDateLocal
  ]);

  const row = rows?.[0] || {};

  return {
    datequery: formattedDateLocal,
    todayClosedTrades: Number(row.todayClosedTrades || 0),
    todayWinTrades: Number(row.todayWinTrades || 0),
    todayLossTrades: Number(row.todayLossTrades || 0),
    dailyNetProfit: Number(row.dailyNetProfit || 0),
    dailyProfit: Number(row.dailyProfit || 0),
    dailyLoss: Number(row.dailyLoss || 0)
  };
}

async function getTodayTradeStatsByUser(firebaseUserId, eventTime) {
  const safeFirebaseUserId = normalizeString(firebaseUserId);

  if (!safeFirebaseUserId) {
    throw new Error("firebaseUserId is required");
  }

  const { start, end } = getDayRangeFromEventTime(eventTime);

  const sql = `
    SELECT
      COUNT(*) AS todayClosedTrades,
      SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) AS todayWinTrades,
      SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) AS todayLossTrades,
      COALESCE(SUM(profit), 0) AS dailyNetProfit,
      COALESCE(SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END), 0) AS dailyProfit,
      COALESCE(SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END), 0) AS dailyLoss
    FROM trade_history
    WHERE firebase_user_id = ?
      AND event_type IN ('CLOSE_ORDER', 'CLOSE_EMERGENCY')
      AND event_time >= ?
      AND event_time <= ?
  `;

  const rows = await query(sql, [
    safeFirebaseUserId,
    start,
    end
  ]);

  const row = rows?.[0] || {};

  return {
    todayClosedTrades: Number(row.todayClosedTrades || 0),
    todayWinTrades: Number(row.todayWinTrades || 0),
    todayLossTrades: Number(row.todayLossTrades || 0),
    dailyNetProfit: Number(row.dailyNetProfit || 0),
    dailyProfit: Number(row.dailyProfit || 0),
    dailyLoss: Number(row.dailyLoss || 0)
  };
}

module.exports = {
  insertTradeHistory,
  getTradeHistoryByUser,
  countTradeHistoryByUser,
  getTradeHistoryDetailFromCommands,
  getTradeEventsForAnalysis,
  getTradeEventsForLearning,
  getTodayTradeStatsByUserAndAccount,
  getTodayTradeStatsByUser,
  getHistoryLearnWeight
};