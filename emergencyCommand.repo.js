const crypto = require("crypto");
const { query } = require("./db");

const ALLOWED_TYPES = ["EMERGENCY_CLOSE", "CLOSE_POSITION"];
const ALLOWED_SCOPES = ["ALL", "ONE"];
const ALLOWED_STATUSES = ["PENDING", "PROCESSING", "DONE", "FAILED", "EXPIRED", "CANCELLED"];

function normalizeString(value, fallback = "") {
    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value).trim();
}

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

function generateCommandId() {
    return "cmd_" + Date.now() + "_" + crypto.randomBytes(6).toString("hex");
}

async function insertEmergencyCommand(data) {
    const commandId = generateCommandId();

    const safeType = ALLOWED_TYPES.includes(normalizeString(data.type).toUpperCase())
        ? normalizeString(data.type).toUpperCase()
        : "EMERGENCY_CLOSE";

    const safeScope = ALLOWED_SCOPES.includes(normalizeString(data.scope).toUpperCase())
        ? normalizeString(data.scope).toUpperCase()
        : "ALL";

    const safeTicketId = normalizeTicketId(data.ticketId ?? data.ticket_id);

    const sql = `
    INSERT INTO emergency_commands (
      command_id,
      firebase_user_id,
      account_id,
      symbol,
      type,
      scope,
      ticket_id,
      status,
      requested_at,
      event_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const params = [
        commandId,
        normalizeString(data.firebaseUserId) || null,
        normalizeString(data.accountId),
        normalizeString(data.symbol).toUpperCase(),
        safeType,
        safeScope,
        safeTicketId,
        "PENDING",
        new Date(),
        normalizeDate(data.eventTime),
    ];

    await query(sql, params);

    return {
        commandId,
        firebaseUserId: params[1],
        accountId: params[2],
        symbol: params[3],
        type: params[4],
        scope: params[5],
        ticketId: safeTicketId,
        status: "PENDING",
    };
}

async function getPendingEmergencyCommand(accountId, symbol) {
    const sql = `
    SELECT
      id,
      command_id,
      firebase_user_id,
      account_id,
      symbol,
      type,
      scope,
      ticket_id,
      status,
      requested_at,
      processed_at,
      event_time,
      result_message,
      created_at,
      updated_at
    FROM emergency_commands
    WHERE account_id = ?
      AND symbol = ?
      AND status = 'PENDING'
    ORDER BY requested_at ASC, id ASC
    LIMIT 1
  `;

    const rows = await query(sql, [
        normalizeString(accountId),
        normalizeString(symbol).toUpperCase(),
    ]);

    return rows[0] || null;
}

async function markEmergencyCommandProcessing(commandId) {
    const sql = `
    UPDATE emergency_commands
    SET status = 'PROCESSING'
    WHERE command_id = ?
      AND status = 'PENDING'
  `;

    const result = await query(sql, [normalizeString(commandId)]);
    return result;
}

async function updateEmergencyCommandResult(data) {
    const safeStatus = ALLOWED_STATUSES.includes(normalizeString(data.status).toUpperCase())
        ? normalizeString(data.status).toUpperCase()
        : "FAILED";

    const sql = `
    UPDATE emergency_commands
    SET
      status = ?,
      result_message = ?,
      processed_at = ?,
      event_time = ?
    WHERE command_id = ?
  `;

    const params = [
        safeStatus,
        normalizeString(data.message) || null,
        new Date(),
        normalizeDate(data.eventTime),
        normalizeString(data.commandId),
    ];

    return await query(sql, params);
}

async function getEmergencyCommandById(commandId) {
    const sql = `
    SELECT
      id,
      command_id,
      firebase_user_id,
      account_id,
      symbol,
      type,
      scope,
      ticket_id,
      status,
      requested_at,
      processed_at,
      event_time,
      result_message,
      created_at,
      updated_at
    FROM emergency_commands
    WHERE command_id = ?
    LIMIT 1
  `;

    const rows = await query(sql, [normalizeString(commandId)]);
    return rows[0] || null;
}

async function expireOldPendingCommands(minutes = 5) {
    const safeMinutes = Math.max(1, normalizeNumber(minutes, 5));

    const sql = `
    UPDATE emergency_commands
    SET
      status = 'EXPIRED',
      processed_at = NOW(),
      result_message = 'Command expired before EA processed it'
    WHERE status IN ('PENDING', 'PROCESSING')
      AND requested_at < (NOW() - INTERVAL ? MINUTE)
  `;

    return await query(sql, [safeMinutes]);
}

module.exports = {
    insertEmergencyCommand,
    getPendingEmergencyCommand,
    markEmergencyCommandProcessing,
    updateEmergencyCommandResult,
    getEmergencyCommandById,
    expireOldPendingCommands,
};