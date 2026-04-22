const { query } = require("./db");

function normalizeNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeLevel(level) {
    const num = normalizeNumber(level, 1);
    if (num <= 1) return 1;
    if (num >= 3) return 3;
    return num;
}

function normalizeOrderCount(levelOrCount) {
    const num = normalizeNumber(levelOrCount, 1);
    if (num <= 1) return 1;
    if (num >= 3) return 3;
    return num;
}

function normalizeDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSide(value) {
    const side = String(value || "").trim().toUpperCase();
    return side === "SELL" ? "SELL" : side === "BUY" ? "BUY" : null;
}

function nextLevelFromWin(currentLevel) {
    const level = normalizeLevel(currentLevel);
    if (level >= 3) return 1;
    return level + 1;
}

async function getMangmaoCycleState(firebaseUserId, accountId = null, symbol) {
    const sql = `
    SELECT *
    FROM mangmao_cycle_state
    WHERE firebase_user_id = ?
      AND (account_id <=> ?)
      AND symbol = ?
    LIMIT 1
  `;

    const rows = await query(sql, [
        String(firebaseUserId || "").trim(),
        accountId ?? null,
        String(symbol || "").trim(),
    ]);

    return rows?.[0] || null;
}

async function createMangmaoCycleState({
    firebaseUserId,
    accountId = null,
    symbol,
    engineEnabled = 1,
    currentLevel = 1,
    currentStepLots = 1,
    cycleNo = 1,
    activeGroupId = null,
    activeSide = null,
    activeOrderCount = 0,
    lastResult = "NONE",
    lastProfitUsd = 0,
    lossCutUsd = -1,
    profitTakeMode = "GT_ZERO",
    cooldownSeconds = 0,
    lastOpenedAt = null,
    lastClosedAt = null,
}) {
    const sql = `
    INSERT INTO mangmao_cycle_state (
      firebase_user_id,
      account_id,
      symbol,
      engine_enabled,
      current_level,
      current_step_lots,
      cycle_no,
      active_group_id,
      active_side,
      active_order_count,
      last_result,
      last_profit_usd,
      loss_cut_usd,
      profit_take_mode,
      cooldown_seconds,
      last_opened_at,
      last_closed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    return await query(sql, [
        String(firebaseUserId || "").trim(),
        accountId ?? null,
        String(symbol || "").trim(),
        Number(engineEnabled) ? 1 : 0,
        normalizeLevel(currentLevel),
        normalizeOrderCount(currentStepLots),
        normalizeNumber(cycleNo, 1),
        activeGroupId ? String(activeGroupId).trim() : null,
        normalizeSide(activeSide),
        normalizeOrderCount(activeOrderCount || currentStepLots),
        ["WIN", "LOSS", "NONE"].includes(lastResult) ? lastResult : "NONE",
        normalizeNumber(lastProfitUsd, 0),
        normalizeNumber(lossCutUsd, -1),
        profitTakeMode === "GT_ZERO" ? "GT_ZERO" : "GT_ZERO",
        normalizeNumber(cooldownSeconds, 0),
        normalizeDate(lastOpenedAt),
        normalizeDate(lastClosedAt),
    ]);
}

async function ensureMangmaoCycleState({
    firebaseUserId,
    accountId = null,
    symbol,
    engineEnabled = 1,
    lossCutUsd = -1,
}) {
    const existing = await getMangmaoCycleState(firebaseUserId, accountId, symbol);
    if (existing) return existing;

    await createMangmaoCycleState({
        firebaseUserId,
        accountId,
        symbol,
        engineEnabled,
        lossCutUsd,
        currentLevel: 1,
        currentStepLots: 1,
        cycleNo: 1,
        lastResult: "NONE",
    });

    return await getMangmaoCycleState(firebaseUserId, accountId, symbol);
}

async function updateMangmaoCycleState(id, patch = {}) {
    const fields = [];
    const params = [];

    if (patch.engineEnabled !== undefined) {
        fields.push(`engine_enabled = ?`);
        params.push(Number(patch.engineEnabled) ? 1 : 0);
    }

    if (patch.currentLevel !== undefined) {
        fields.push(`current_level = ?`);
        params.push(normalizeLevel(patch.currentLevel));
    }

    if (patch.currentStepLots !== undefined) {
        fields.push(`current_step_lots = ?`);
        params.push(normalizeOrderCount(patch.currentStepLots));
    }

    if (patch.cycleNo !== undefined) {
        fields.push(`cycle_no = ?`);
        params.push(normalizeNumber(patch.cycleNo, 1));
    }

    if (patch.activeGroupId !== undefined) {
        fields.push(`active_group_id = ?`);
        params.push(patch.activeGroupId ? String(patch.activeGroupId).trim() : null);
    }

    if (patch.activeSide !== undefined) {
        fields.push(`active_side = ?`);
        params.push(normalizeSide(patch.activeSide));
    }

    if (patch.activeOrderCount !== undefined) {
        fields.push(`active_order_count = ?`);
        params.push(normalizeNumber(patch.activeOrderCount, 0));
    }

    if (patch.lastResult !== undefined) {
        fields.push(`last_result = ?`);
        params.push(["WIN", "LOSS", "NONE"].includes(patch.lastResult) ? patch.lastResult : "NONE");
    }

    if (patch.lastProfitUsd !== undefined) {
        fields.push(`last_profit_usd = ?`);
        params.push(normalizeNumber(patch.lastProfitUsd, 0));
    }

    if (patch.lossCutUsd !== undefined) {
        fields.push(`loss_cut_usd = ?`);
        params.push(normalizeNumber(patch.lossCutUsd, -1));
    }

    if (patch.profitTakeMode !== undefined) {
        fields.push(`profit_take_mode = ?`);
        params.push(patch.profitTakeMode === "GT_ZERO" ? "GT_ZERO" : "GT_ZERO");
    }

    if (patch.cooldownSeconds !== undefined) {
        fields.push(`cooldown_seconds = ?`);
        params.push(normalizeNumber(patch.cooldownSeconds, 0));
    }

    if (patch.lastOpenedAt !== undefined) {
        fields.push(`last_opened_at = ?`);
        params.push(normalizeDate(patch.lastOpenedAt));
    }

    if (patch.lastClosedAt !== undefined) {
        fields.push(`last_closed_at = ?`);
        params.push(normalizeDate(patch.lastClosedAt));
    }

    if (!fields.length) return { affectedRows: 0 };

    const sql = `
    UPDATE mangmao_cycle_state
    SET ${fields.join(", ")},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

    params.push(id);
    return await query(sql, params);
}

async function markMangmaoGroupOpened({
    firebaseUserId,
    accountId = null,
    symbol,
    groupId,
    side,
    orderCount,
}) {
    const state = await ensureMangmaoCycleState({
        firebaseUserId,
        accountId,
        symbol,
    });

    const sql = `
    UPDATE mangmao_cycle_state
    SET
      active_group_id = ?,
      active_side = ?,
      active_order_count = ?,
      last_opened_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

    await query(sql, [
        String(groupId || "").trim(),
        normalizeSide(side),
        normalizeOrderCount(orderCount || state.current_level),
        state.id,
    ]);

    return await getMangmaoCycleState(firebaseUserId, accountId, symbol);
}

async function markMangmaoWin({
    firebaseUserId,
    accountId = null,
    symbol,
    totalProfitUsd = 0,
}) {
    const state = await ensureMangmaoCycleState({
        firebaseUserId,
        accountId,
        symbol,
    });

    const nextLevel = nextLevelFromWin(state.current_level);
    const nextCycleNo = nextLevel === 1
        ? normalizeNumber(state.cycle_no, 1) + 1
        : normalizeNumber(state.cycle_no, 1);

    const sql = `
    UPDATE mangmao_cycle_state
    SET
      current_level = ?,
      current_step_lots = ?,
      cycle_no = ?,
      active_group_id = NULL,
      active_side = NULL,
      active_order_count = 0,
      last_result = 'WIN',
      last_profit_usd = ?,
      last_closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

    await query(sql, [
        nextLevel,
        nextLevel,
        nextCycleNo,
        normalizeNumber(totalProfitUsd, 0),
        state.id,
    ]);

    return await getMangmaoCycleState(firebaseUserId, accountId, symbol);
}

async function markMangmaoLoss({
    firebaseUserId,
    accountId = null,
    symbol,
    totalProfitUsd = -1,
}) {
    const state = await ensureMangmaoCycleState({
        firebaseUserId,
        accountId,
        symbol,
    });

    const sql = `
    UPDATE mangmao_cycle_state
    SET
      current_level = 1,
      current_step_lots = 1,
      cycle_no = cycle_no + 1,
      active_group_id = NULL,
      active_side = NULL,
      active_order_count = 0,
      last_result = 'LOSS',
      last_profit_usd = ?,
      last_closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

    await query(sql, [
        normalizeNumber(totalProfitUsd, -1),
        state.id,
    ]);

    return await getMangmaoCycleState(firebaseUserId, accountId, symbol);
}

async function clearMangmaoActiveGroup({
    firebaseUserId,
    accountId = null,
    symbol,
}) {
    const sql = `
    UPDATE mangmao_cycle_state
    SET
      active_group_id = NULL,
      active_side = NULL,
      active_order_count = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE firebase_user_id = ?
      AND (account_id <=> ?)
      AND symbol = ?
  `;

    return await query(sql, [
        String(firebaseUserId || "").trim(),
        accountId ?? null,
        String(symbol || "").trim(),
    ]);
}

module.exports = {
    getMangmaoCycleState,
    createMangmaoCycleState,
    ensureMangmaoCycleState,
    updateMangmaoCycleState,
    markMangmaoGroupOpened,
    markMangmaoWin,
    markMangmaoLoss,
    clearMangmaoActiveGroup,
};