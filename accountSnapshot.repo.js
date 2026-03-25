const { query } = require("./db");

function normalizeNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeInt(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = parseInt(value, 10);
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

async function upsertAccountSnapshot(data) {
    if (!data.firebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    const sql = `
    INSERT INTO account_snapshots (
      firebase_user_id,
      account_id,
      balance,
      equity,
      margin,
      free_margin,
      floating_profit,
      daily_profit,
      today_win_trades,
      today_loss_trades,
      open_positions_count,
      event_time,
      daily_loss,
      daily_net_profit,
      today_closed_trades
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      account_id = VALUES(account_id),
      balance = VALUES(balance),
      equity = VALUES(equity),
      margin = VALUES(margin),
      free_margin = VALUES(free_margin),
      floating_profit = VALUES(floating_profit),
      daily_profit = VALUES(daily_profit),
      today_win_trades = VALUES(today_win_trades),
      today_loss_trades = VALUES(today_loss_trades),
      open_positions_count = VALUES(open_positions_count),
      event_time = VALUES(event_time),
      daily_loss = VALUES(daily_loss),
      daily_net_profit = VALUES(daily_net_profit),
      today_closed_trades = VALUES(today_closed_trades)
  `;

    const params = [
        data.firebaseUserId,
        data.accountId || null,
        normalizeNumber(data.balance, 0),
        normalizeNumber(data.equity, 0),
        normalizeNumber(data.margin, 0),
        normalizeNumber(data.freeMargin, 0),
        normalizeNumber(data.floatingProfit, 0),
        normalizeNumber(data.dailyProfit, 0),
        normalizeInt(data.todayWinTrades, 0),
        normalizeInt(data.todayLossTrades, 0),
        normalizeInt(data.openPositionsCount, 0),
        normalizeDate(data.eventTime),
        normalizeNumber(data.dailyLoss, 0),
        normalizeNumber(data.dailyNetProfit, 0),
        normalizeInt(data.todayClosedTrades, 0),
    ];

    return await query(sql, params);
}

async function getAccountSnapshotByUser(firebaseUserId) {
    const sql = `
    SELECT
      id,
      firebase_user_id,
      account_id,
      balance,
      equity,
      margin,
      free_margin,
      floating_profit,
      daily_profit,
      daily_net_profit,
      today_win_trades,
      today_loss_trades,
      open_positions_count,
      event_time,
      created_at,
      updated_at
    FROM account_snapshots
    WHERE firebase_user_id = ?
    LIMIT 1
  `;

    const rows = await query(sql, [firebaseUserId]);
    return rows?.[0] || null;
}

module.exports = {
    upsertAccountSnapshot,
    getAccountSnapshotByUser,
};