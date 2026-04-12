const { query } = require("./db");

function toNullableString(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s === "" ? null : s;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function safeJsonStringify(value, fallback = "{}") {
    try {
        if (value === undefined) return fallback;
        return JSON.stringify(value ?? {});
    } catch (error) {
        return fallback;
    }
}

function safeJsonParse(value, fallback = null) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "object") return value;

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function normalizePendingRow(row = null) {
    if (!row) return null;

    return {
        ...row,
        id: toNumber(row.id, 0),
        decision_score: row.decision_score == null ? null : toNumber(row.decision_score, 0),
        confirmation_score: row.confirmation_score == null ? null : toNumber(row.confirmation_score, 0),
        trigger_price: row.trigger_price == null ? null : toNumber(row.trigger_price, 0),
        trigger_candle_json: safeJsonParse(row.trigger_candle_json, null),
        meta_json: safeJsonParse(row.meta_json, {}),
        result_json: safeJsonParse(row.result_json, null),
    };
}

async function getPendingTradeConfirmationByKey({
    firebaseUserId,
    accountId,
    symbol,
    timeframe,
    mode,
}) {
    const sql = `
    SELECT *
    FROM pending_trade_confirmations
    WHERE firebase_user_id = ?
      AND account_id = ?
      AND symbol = ?
      AND timeframe = ?
      AND mode = ?
      AND status = 'PENDING'
    ORDER BY id DESC
    LIMIT 1
  `;

    const params = [
        toNullableString(firebaseUserId),
        toNullableString(accountId),
        toNullableString(symbol),
        toNullableString(timeframe),
        toNullableString(mode),
    ];

    try {
        const rows = await query(sql, params, { retries: 2 });
        return normalizePendingRow(rows?.[0] || null);
    } catch (error) {
        console.error("[pendingTradeConfirmation.repo] getPendingTradeConfirmationByKey failed:", {
            code: error.code || null,
            message: error.message,
            firebaseUserId,
            accountId,
            symbol,
            timeframe,
            mode,
        });
        return null;
    }
}

async function getPendingTradeConfirmationById(id) {
    const sql = `
    SELECT *
    FROM pending_trade_confirmations
    WHERE id = ?
    LIMIT 1
  `;

    try {
        const rows = await query(sql, [toNumber(id, 0)], { retries: 2 });
        return normalizePendingRow(rows?.[0] || null);
    } catch (error) {
        console.error("[pendingTradeConfirmation.repo] getPendingTradeConfirmationById failed:", {
            code: error.code || null,
            message: error.message,
            id,
        });
        return null;
    }
}

async function cancelExistingPendingByKey({
    firebaseUserId,
    accountId,
    symbol,
    timeframe,
    mode,
    excludeId = null,
    reason = "REPLACED_BY_NEW_PENDING",
}) {
    const hasExclude = excludeId !== null && excludeId !== undefined && Number(excludeId) > 0;

    const sql = `
    UPDATE pending_trade_confirmations
    SET
      status = 'CANCELLED',
      result_json = ?,
      updated_at = NOW()
    WHERE firebase_user_id = ?
      AND account_id = ?
      AND symbol = ?
      AND timeframe = ?
      AND mode = ?
      AND status = 'PENDING'
      ${hasExclude ? "AND id <> ?" : ""}
  `;

    const params = [
        safeJsonStringify({ reason }),
        toNullableString(firebaseUserId),
        toNullableString(accountId),
        toNullableString(symbol),
        toNullableString(timeframe),
        toNullableString(mode),
    ];

    if (hasExclude) {
        params.push(toNumber(excludeId, 0));
    }

    try {
        const result = await query(sql, params, { retries: 2 });
        return result?.affectedRows || 0;
    } catch (error) {
        console.error("[pendingTradeConfirmation.repo] cancelExistingPendingByKey failed:", {
            code: error.code || null,
            message: error.message,
            firebaseUserId,
            accountId,
            symbol,
            timeframe,
            mode,
            excludeId,
            reason,
        });
        return 0;
    }
}

async function createPendingTradeConfirmation({
    firebaseUserId,
    accountId,
    symbol,
    timeframe,
    mode,
    side,
    status = "PENDING",
    decisionScore = null,
    confidenceLevel = null,
    patternName = null,
    patternType = null,
    contextHash = null,
    triggerCandleTime = null,
    confirmedCandleTime = null,
    triggerPrice = null,
    confirmationScore = null,
    triggerCandleJson = null,
    metaJson = null,
    resultJson = null,
}) {
    await cancelExistingPendingByKey({
        firebaseUserId,
        accountId,
        symbol,
        timeframe,
        mode,
        reason: "AUTO_CANCEL_BEFORE_CREATE",
    });

    const sql = `
    INSERT INTO pending_trade_confirmations (
      firebase_user_id,
      account_id,
      symbol,
      timeframe,
      mode,
      side,
      status,
      decision_score,
      confidence_level,
      pattern_name,
      pattern_type,
      context_hash,
      trigger_candle_time,
      confirmed_candle_time,
      trigger_price,
      confirmation_score,
      trigger_candle_json,
      meta_json,
      result_json,
      created_at,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
    )
  `;

    const params = [
        toNullableString(firebaseUserId),
        toNullableString(accountId),
        toNullableString(symbol),
        toNullableString(timeframe),
        toNullableString(mode),
        toNullableString(side),
        toNullableString(status || "PENDING"),
        decisionScore == null ? null : toNumber(decisionScore, 0),
        toNullableString(confidenceLevel),
        toNullableString(patternName),
        toNullableString(patternType),
        toNullableString(contextHash),
        toNullableString(triggerCandleTime),
        toNullableString(confirmedCandleTime),
        triggerPrice == null ? null : toNumber(triggerPrice, 0),
        confirmationScore == null ? null : toNumber(confirmationScore, 0),
        safeJsonStringify(triggerCandleJson, "null"),
        safeJsonStringify(metaJson, "{}"),
        safeJsonStringify(resultJson, "null"),
    ];

    try {
        const result = await query(sql, params, { retries: 2 });
        return await getPendingTradeConfirmationById(result?.insertId);
    } catch (error) {
        console.error("[pendingTradeConfirmation.repo] createPendingTradeConfirmation failed:", {
            code: error.code || null,
            message: error.message,
            firebaseUserId,
            accountId,
            symbol,
            timeframe,
            mode,
            side,
            status,
        });
        return null;
    }
}

async function updatePendingTradeConfirmationStatus({
    id,
    status,
    confirmedCandleTime = null,
    confirmationScore = null,
    resultJson = null,
}) {
    const updates = [];
    const params = [];

    if (status !== undefined) {
        updates.push("status = ?");
        params.push(toNullableString(status));
    }

    if (confirmedCandleTime !== undefined) {
        updates.push("confirmed_candle_time = ?");
        params.push(toNullableString(confirmedCandleTime));
    }

    if (confirmationScore !== undefined) {
        updates.push("confirmation_score = ?");
        params.push(
            confirmationScore == null ? null : toNumber(confirmationScore, 0)
        );
    }

    if (resultJson !== undefined) {
        updates.push("result_json = ?");
        params.push(safeJsonStringify(resultJson, "null"));
    }

    updates.push("updated_at = NOW()");

    if (updates.length === 1) {
        return await getPendingTradeConfirmationById(id);
    }

    const sql = `
    UPDATE pending_trade_confirmations
    SET ${updates.join(", ")}
    WHERE id = ?
    LIMIT 1
  `;

    params.push(toNumber(id, 0));

    try {
        await query(sql, params, { retries: 2 });
        return await getPendingTradeConfirmationById(id);
    } catch (error) {
        console.error("[pendingTradeConfirmation.repo] updatePendingTradeConfirmationStatus failed:", {
            code: error.code || null,
            message: error.message,
            id,
            status,
            confirmedCandleTime,
            confirmationScore,
        });
        return null;
    }
}

async function appendPendingTradeConfirmationLog({
    pendingId,
    logType,
    payload,
}) {
    if (!pendingId) return null;

    const sql = `
    INSERT INTO pending_trade_confirmation_logs (
      pending_id,
      log_type,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, NOW())
  `;

    const params = [
        toNumber(pendingId, 0),
        toNullableString(logType || "INFO"),
        safeJsonStringify(payload, "{}"),
    ];

    try {
        const result = await query(sql, params, { retries: 2 });
        return {
            id: result?.insertId || null,
            pending_id: toNumber(pendingId, 0),
            log_type: toNullableString(logType || "INFO"),
            payload_json: payload || {},
        };
    } catch (error) {
        console.error("[pendingTradeConfirmation.repo] appendPendingTradeConfirmationLog failed:", {
            code: error.code || null,
            message: error.message,
            pendingId,
            logType,
        });
        return null;
    }
}

module.exports = {
    getPendingTradeConfirmationByKey,
    getPendingTradeConfirmationById,
    cancelExistingPendingByKey,
    createPendingTradeConfirmation,
    updatePendingTradeConfirmationStatus,
    appendPendingTradeConfirmationLog,
};