const { query, getConnection } = require("./db");

function normalizeNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function normalizeSide(value) {
    const side = String(value || "").toUpperCase();
    return side === "SELL" ? "SELL" : "BUY";
}

async function upsertActivePositionsSnapshot({
    firebaseUserId,
    accountId = null,
    positions = [],
    eventTime = null
}) {
    const conn = await getConnection();

    try {
        await conn.beginTransaction();

        const safeFirebaseUserId = firebaseUserId ? String(firebaseUserId).trim() : "";
        const safeAccountId = accountId ? String(accountId).trim() : "";

        if (!safeFirebaseUserId) {
            throw new Error("firebaseUserId is required");
        }

        const safePositions = Array.isArray(positions) ? positions : [];
        const eventTimeValue = normalizeDate(eventTime);
        const validTickets = [];

        for (const item of safePositions) {
            const ticketId = normalizeTicketId(item.ticketId ?? item.ticket_id ?? item.ticket);
            if (!ticketId) continue;

            validTickets.push(ticketId);

            const sql = `
        INSERT INTO active_positions (
          firebase_user_id,
          account_id,
          ticket_id,
          symbol,
          side,
          lot,
          entry_price,
          current_price,
          sl,
          tp,
          profit,
          swap,
          commission,
          open_time,
          event_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          symbol = VALUES(symbol),
          side = VALUES(side),
          lot = VALUES(lot),
          entry_price = VALUES(entry_price),
          current_price = VALUES(current_price),
          sl = VALUES(sl),
          tp = VALUES(tp),
          profit = VALUES(profit),
          swap = VALUES(swap),
          commission = VALUES(commission),
          open_time = VALUES(open_time),
          event_time = VALUES(event_time)
      `;

            const params = [
                safeFirebaseUserId,
                safeAccountId || null,
                ticketId,
                item.symbol ? String(item.symbol).trim() : "",
                normalizeSide(item.side),
                normalizeNumber(item.lot, 0),
                normalizeNumber(item.entryPrice ?? item.entry_price, 0),
                normalizeNumber(item.currentPrice ?? item.current_price, 0),
                normalizeNumber(item.sl, 0),
                normalizeNumber(item.tp, 0),
                normalizeNumber(item.profit, 0),
                normalizeNumber(item.swap, 0),
                normalizeNumber(item.commission, 0),
                normalizeDate(item.openTime ?? item.open_time),
                eventTimeValue
            ];

            await conn.query(sql, params);
        }

        if (validTickets.length > 0) {
            const placeholders = validTickets.map(() => "?").join(",");

            const deleteSql = `
        DELETE FROM active_positions
        WHERE firebase_user_id = ?
          AND (
            (account_id = ?) OR (? IS NULL AND account_id IS NULL) OR (? = '' AND account_id IS NULL)
          )
          AND ticket_id NOT IN (${placeholders})
      `;

            await conn.query(deleteSql, [
                safeFirebaseUserId,
                safeAccountId || null,
                safeAccountId || null,
                safeAccountId || "",
                ...validTickets
            ]);
        } else {
            const deleteAllSql = `
        DELETE FROM active_positions
        WHERE firebase_user_id = ?
          AND (
            (account_id = ?) OR (? IS NULL AND account_id IS NULL) OR (? = '' AND account_id IS NULL)
          )
      `;

            await conn.query(deleteAllSql, [
                safeFirebaseUserId,
                safeAccountId || null,
                safeAccountId || null,
                safeAccountId || ""
            ]);
        }

        await conn.commit();

        return {
            success: true,
            synced: validTickets.length
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

async function getActivePositionsByUser(firebaseUserId, accountId = null) {
    const safeFirebaseUserId = firebaseUserId ? String(firebaseUserId).trim() : "";
    const safeAccountId = accountId ? String(accountId).trim() : "";

    let sql = `
    SELECT
      id,
      firebase_user_id,
      account_id,
      ticket_id,
      symbol,
      side,
      lot,
      entry_price,
      current_price,
      sl,
      tp,
      profit,
      swap,
      commission,
      open_time,
      event_time,
      created_at,
      updated_at
    FROM active_positions
    WHERE firebase_user_id = ?
  `;

    const params = [safeFirebaseUserId];

    if (safeAccountId) {
        sql += ` AND account_id = ?`;
        params.push(safeAccountId);
    }

    sql += ` ORDER BY updated_at DESC, id DESC`;

    return await query(sql, params);
}

module.exports = {
    upsertActivePositionsSnapshot,
    getActivePositionsByUser
};