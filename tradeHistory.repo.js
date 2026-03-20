const { query } = require("./db");

async function insertTradeHistory(data) {
  const safeEventType = [
    "WAIT_ORDER",
    "OPEN_ORDER",
    "CLOSE_ORDER",
    "CANCEL_ORDER",
    "CLOSE_EMERGENCY"
  ].includes(data.eventType)
    ? data.eventType
    : "WAIT_ORDER";

  const safeSide = ["BUY", "SELL"].includes(data.side) ? data.side : "BUY";

  const safeMode =
    data.mode === "NORMAL" || data.mode === "SCALP"
      ? data.mode
      : "NORMAL";

  const safeTicketId =
    data.ticketId !== undefined &&
      data.ticketId !== null &&
      String(data.ticketId).trim() !== ""
      ? Number(data.ticketId)
      : null;

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.firebaseUserId || null,
    safeTicketId,
    safeEventType,
    data.symbol || "",
    safeSide,
    Number(data.lot || 0),
    Number(data.price || 0),
    Number(data.sl || 0),
    Number(data.tp || 0),
    Number(data.profit || 0),
    safeMode,
    data.eventTime || null,
  ];

  console.log("trade_history params:", params);

  return await query(sql, params);
}

async function getTradeHistoryByUser(firebaseUserId, limit = 100) {
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
    `;

  return await query(sql, [firebaseUserId, Number(limit)]);
}

module.exports = {
  insertTradeHistory,
  getTradeHistoryByUser,
};