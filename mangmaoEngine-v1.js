const crypto = require("crypto");
const { analyzeMicroScalp } = require("./microScalpEngine-v4");

const {
    ensureMangmaoCycleState,
    getMangmaoCycleState,
    markMangmaoGroupOpened,
    markMangmaoWin,
    markMangmaoLoss,
    clearMangmaoActiveGroup,
} = require("./mangmaoCycleState.repo");

const {
    insertMangmaoCycleLog,
} = require("./mangmaoCycleLogs.repo");

const {
    insertManyMangmaoOrderMaps,
    bindTicketToMangmaoOrder,
    closeMangmaoOrder,
    getMangmaoOrdersByGroup,
    getMangmaoOrderByTicket,
    sumMangmaoGroupProfit,
} = require("./mangmaoOrderMap.repo");

function toNum(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toUpper(value) {
    return String(value || "").trim().toUpperCase();
}

function clampLevel(level) {
    const n = Math.floor(toNum(level, 1));
    if (n <= 1) return 1;
    if (n >= 3) return 3;
    return n;
}

function makeGroupId(firebaseUserId, accountId, symbol, level) {
    const raw = [
        String(firebaseUserId || "").trim(),
        String(accountId ?? ""),
        String(symbol || "").trim(),
        String(level || 1),
        Date.now(),
        crypto.randomBytes(4).toString("hex"),
    ].join("|");

    return `MMG-${crypto.createHash("md5").update(raw).digest("hex").slice(0, 20)}`;
}

function getDefaultMangmaoConfig() {
    return {
        enabled: true,
        minScore: 42,
        minScoreGap: 5,
        maxSpread: 25,
        lossCutUsdPerOrder: -1,
        profitTakeMode: "GT_ZERO",
        maxLevel: 3,
        allowOnlyOneActiveGroup: true,
        requireNoOpenPositions: true,
    };
}

function normalizeEngineConfig(config = {}) {
    const merged = {
        ...getDefaultMangmaoConfig(),
        ...(config || {}),
    };

    return {
        ...merged,
        maxLevel: clampLevel(merged.maxLevel),
        minScore: toNum(merged.minScore, 42),
        minScoreGap: toNum(merged.minScoreGap, 5),
        maxSpread: toNum(merged.maxSpread, 25),
        lossCutUsdPerOrder: toNum(merged.lossCutUsdPerOrder, -1),
    };
}

function filterOpenPositionsBySymbol(activePositions = [], symbol = "") {
    const safeSymbol = toUpper(symbol);
    if (!Array.isArray(activePositions)) return [];
    return activePositions.filter((p) => {
        const posSymbol = toUpper(p?.symbol);
        const status = toUpper(p?.status || "OPEN");
        return posSymbol === safeSymbol && status !== "CLOSED";
    });
}

function getPositionProfitUsd(position) {
    return toNum(position?.profit, 0)
        + toNum(position?.swap, 0)
        + toNum(position?.commission, 0);
}

function buildOpenOrderMapPayloads({
    cycleStateId,
    firebaseUserId,
    accountId,
    symbol,
    groupId,
    levelNo,
    side,
    orderCount,
}) {
    const items = [];
    for (let i = 1; i <= orderCount; i += 1) {
        items.push({
            cycleStateId,
            firebaseUserId,
            accountId,
            symbol,
            groupId,
            levelNo,
            orderNo: i,
            side,
            status: "OPEN",
            openedAt: new Date(),
        });
    }
    return items;
}

async function analyzeMangmaoEntry({
    firebaseUserId,
    accountId = null,
    symbol,
    candles = [],
    candlesH1 = [],
    candlesH4 = [],
    spreadPoints = 0,
    activePositions = [],
    config = {},
}) {
    const engineConfig = normalizeEngineConfig(config);
    const safeSymbol = String(symbol || "").trim();

    if (!firebaseUserId || !safeSymbol) {
        return {
            ok: false,
            action: "NO_TRADE",
            reason: "MISSING_REQUIRED_FIELDS",
        };
    }

    if (!engineConfig.enabled) {
        return {
            ok: true,
            action: "NO_TRADE",
            reason: "MANGMAO_DISABLED",
        };
    }

    if (toNum(spreadPoints, 0) > engineConfig.maxSpread) {
        return {
            ok: true,
            action: "NO_TRADE",
            reason: "SPREAD_TOO_HIGH",
            spreadPoints: toNum(spreadPoints, 0),
            maxSpread: engineConfig.maxSpread,
        };
    }

    const state = await ensureMangmaoCycleState({
        firebaseUserId,
        accountId,
        symbol: safeSymbol,
        engineEnabled: 1,
        lossCutUsd: engineConfig.lossCutUsdPerOrder,
    });

    if (!state || Number(state.engine_enabled) !== 1) {
        return {
            ok: true,
            action: "NO_TRADE",
            reason: "STATE_DISABLED",
        };
    }

    if (engineConfig.allowOnlyOneActiveGroup && state.active_group_id) {
        return {
            ok: true,
            action: "NO_TRADE",
            reason: "ACTIVE_GROUP_EXISTS",
            activeGroupId: state.active_group_id,
            currentLevel: clampLevel(state.current_level),
        };
    }

    const symbolOpenPositions = filterOpenPositionsBySymbol(activePositions, safeSymbol);
    if (engineConfig.requireNoOpenPositions && symbolOpenPositions.length > 0) {
        return {
            ok: true,
            action: "NO_TRADE",
            reason: "OPEN_POSITION_EXISTS",
            openCount: symbolOpenPositions.length,
        };
    }

    const micro = await analyzeMicroScalp({
        symbol: safeSymbol,
        candles,
        candlesH1,
        candlesH4,
        spreadPoints,
        config: {
            minScore: engineConfig.minScore,
            minScoreGap: engineConfig.minScoreGap,
        },
    });

    if (!micro || micro.signal === "NONE") {
        return {
            ok: true,
            action: "NO_TRADE",
            reason: micro?.reason || "NO_MICRO_SIGNAL",
            micro: micro || null,
            currentLevel: clampLevel(state.current_level),
        };
    }

    const currentLevel = clampLevel(state.current_level || 1);
    const orderCount = currentLevel;
    const groupId = makeGroupId(firebaseUserId, accountId, safeSymbol, currentLevel);

    return {
        ok: true,
        action: "OPEN_GROUP",
        reason: "MANGMAO_SIGNAL_READY",
        firebaseUserId,
        accountId,
        symbol: safeSymbol,
        groupId,
        side: toUpper(micro.signal),
        levelNo: currentLevel,
        orderCount,
        cycleNo: toNum(state.cycle_no, 1),
        lossCutUsdPerOrder: engineConfig.lossCutUsdPerOrder,
        micro,
    };
}

async function createMangmaoGroup({
    firebaseUserId,
    accountId = null,
    symbol,
    groupId,
    side,
    orderCount,
}) {
    const safeSymbol = String(symbol || "").trim();
    const safeSide = toUpper(side);
    const safeOrderCount = clampLevel(orderCount);

    if (!firebaseUserId || !safeSymbol || !groupId || !["BUY", "SELL"].includes(safeSide)) {
        return {
            ok: false,
            action: "CREATE_GROUP_FAILED",
            reason: "INVALID_INPUT",
        };
    }

    const state = await ensureMangmaoCycleState({
        firebaseUserId,
        accountId,
        symbol: safeSymbol,
    });

    if (state.active_group_id) {
        return {
            ok: false,
            action: "CREATE_GROUP_FAILED",
            reason: "ACTIVE_GROUP_EXISTS",
            activeGroupId: state.active_group_id,
        };
    }

    await markMangmaoGroupOpened({
        firebaseUserId,
        accountId,
        symbol: safeSymbol,
        groupId,
        side: safeSide,
        orderCount: safeOrderCount,
    });

    const latestState = await getMangmaoCycleState(firebaseUserId, accountId, safeSymbol);
    const payloads = buildOpenOrderMapPayloads({
        cycleStateId: latestState.id,
        firebaseUserId,
        accountId,
        symbol: safeSymbol,
        groupId,
        levelNo: clampLevel(latestState.current_level),
        side: safeSide,
        orderCount: safeOrderCount,
    });

    await insertManyMangmaoOrderMaps(payloads);

    return {
        ok: true,
        action: "GROUP_CREATED",
        groupId,
        side: safeSide,
        orderCount: safeOrderCount,
        levelNo: clampLevel(latestState.current_level),
        cycleNo: toNum(latestState.cycle_no, 1),
    };
}

async function bindMangmaoTickets({
    groupId,
    tickets = [],
}) {
    if (!groupId || !Array.isArray(tickets) || tickets.length === 0) {
        return {
            ok: false,
            action: "BIND_TICKETS_FAILED",
            reason: "INVALID_INPUT",
        };
    }

    const results = [];
    for (let i = 0; i < tickets.length; i += 1) {
        const item = tickets[i] || {};
        const orderNo = i + 1;

        const res = await bindTicketToMangmaoOrder({
            groupId,
            orderNo,
            ticketId: item.ticketId ?? item.ticket ?? null,
            openPrice: item.openPrice ?? item.entryPrice ?? null,
            openedAt: item.openedAt ?? new Date(),
        });

        results.push({
            orderNo,
            ticketId: item.ticketId ?? item.ticket ?? null,
            result: res,
        });
    }

    return {
        ok: true,
        action: "TICKETS_BOUND",
        groupId,
        items: results,
    };
}

async function evaluateMangmaoExit({
    firebaseUserId,
    accountId = null,
    symbol,
    activePositions = [],
}) {
    const safeSymbol = String(symbol || "").trim();
    const state = await getMangmaoCycleState(firebaseUserId, accountId, safeSymbol);

    if (!state || !state.active_group_id) {
        return {
            ok: true,
            action: "HOLD",
            reason: "NO_ACTIVE_GROUP",
        };
    }

    const groupId = state.active_group_id;
    const mappedOrders = await getMangmaoOrdersByGroup(groupId);

    if (!mappedOrders.length) {
        return {
            ok: true,
            action: "HOLD",
            reason: "NO_ORDER_MAP",
            groupId,
        };
    }

    const safePositions = Array.isArray(activePositions) ? activePositions : [];
    const matchedPositions = mappedOrders
        .map((mapped) => {
            const ticketId = String(mapped.ticket_id || "").trim();
            const pos = safePositions.find((p) => String(p?.ticketId ?? p?.ticket ?? "").trim() === ticketId);
            if (!pos) return null;

            const profitUsd = getPositionProfitUsd(pos);
            return {
                mapped,
                position: pos,
                ticketId,
                profitUsd,
            };
        })
        .filter(Boolean);

    if (!matchedPositions.length) {
        return {
            ok: true,
            action: "HOLD",
            reason: "NO_MATCHED_ACTIVE_TICKETS",
            groupId,
        };
    }

    const lossCutUsd = toNum(state.loss_cut_usd, -1);
    const anyLossHit = matchedPositions.some((item) => item.profitUsd <= lossCutUsd);
    const totalProfitUsd = matchedPositions.reduce((sum, item) => sum + item.profitUsd, 0);

    if (anyLossHit) {
        return {
            ok: true,
            action: "CLOSE_ALL",
            reason: "LOSS_CUT_HIT",
            result: "LOSS",
            groupId,
            side: state.active_side,
            totalProfitUsd: Number(totalProfitUsd.toFixed(2)),
            tickets: matchedPositions.map((item) => ({
                ticketId: item.ticketId,
                profitUsd: Number(item.profitUsd.toFixed(2)),
            })),
        };
    }

    if (totalProfitUsd > 0) {
        return {
            ok: true,
            action: "CLOSE_ALL",
            reason: "GROUP_PROFIT_GT_ZERO",
            result: "WIN",
            groupId,
            side: state.active_side,
            totalProfitUsd: Number(totalProfitUsd.toFixed(2)),
            tickets: matchedPositions.map((item) => ({
                ticketId: item.ticketId,
                profitUsd: Number(item.profitUsd.toFixed(2)),
            })),
        };
    }

    return {
        ok: true,
        action: "HOLD",
        reason: "WAITING_EXIT",
        groupId,
        totalProfitUsd: Number(totalProfitUsd.toFixed(2)),
        openCount: matchedPositions.length,
    };
}

async function finalizeMangmaoGroup({
    firebaseUserId,
    accountId = null,
    symbol,
    groupId,
    result,
    closedOrders = [],
    note = null,
}) {
    const safeSymbol = String(symbol || "").trim();
    const safeResult = toUpper(result);
    const state = await getMangmaoCycleState(firebaseUserId, accountId, safeSymbol);

    if (!state || !groupId) {
        return {
            ok: false,
            action: "FINALIZE_FAILED",
            reason: "STATE_OR_GROUP_MISSING",
        };
    }

    const rows = Array.isArray(closedOrders) ? closedOrders : [];
    for (const row of rows) {
        await closeMangmaoOrder({
            ticketId: row.ticketId ?? row.ticket ?? null,
            status: safeResult === "WIN" ? "WIN_CLOSE" : "LOSS_HIT",
            closePrice: row.closePrice ?? row.currentPrice ?? null,
            profitUsd: row.profitUsd ?? row.profit ?? 0,
            closedAt: row.closedAt ?? new Date(),
        });
    }

    const summary = await sumMangmaoGroupProfit(groupId);
    const totalProfitUsd = Number(toNum(summary?.total_profit_usd, 0).toFixed(2));
    const closedOrderCount = toNum(summary?.total_orders, rows.length);

    let newState = null;
    if (safeResult === "WIN") {
        newState = await markMangmaoWin({
            firebaseUserId,
            accountId,
            symbol: safeSymbol,
            totalProfitUsd,
        });
    } else if (safeResult === "LOSS") {
        newState = await markMangmaoLoss({
            firebaseUserId,
            accountId,
            symbol: safeSymbol,
            totalProfitUsd,
        });
    } else {
        await clearMangmaoActiveGroup({
            firebaseUserId,
            accountId,
            symbol: safeSymbol,
        });
        newState = await getMangmaoCycleState(firebaseUserId, accountId, safeSymbol);
    }

    await insertMangmaoCycleLog({
        cycleStateId: state.id,
        firebaseUserId,
        accountId,
        symbol: safeSymbol,
        groupId,
        cycleNo: toNum(state.cycle_no, 1),
        levelNo: clampLevel(state.current_level),
        orderCount: toNum(state.active_order_count || state.current_level, 1),
        side: state.active_side || "BUY",
        signalSource: "MICRO_SCALP",
        result: safeResult === "WIN" ? "WIN" : safeResult === "LOSS" ? "LOSS" : "FORCE_CLOSE",
        totalProfitUsd,
        closedOrderCount,
        startedAt: state.last_opened_at || null,
        endedAt: new Date(),
        note,
    });

    return {
        ok: true,
        action: "GROUP_FINALIZED",
        result: safeResult,
        groupId,
        totalProfitUsd,
        closedOrderCount,
        nextLevel: clampLevel(newState?.current_level || 1),
        nextCycleNo: toNum(newState?.cycle_no, 1),
        state: newState,
    };
}

async function finalizeMangmaoGroupByTickets({
    firebaseUserId,
    accountId = null,
    symbol,
    result,
    tickets = [],
    note = null,
}) {
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    if (!safeTickets.length) {
        return {
            ok: false,
            action: "FINALIZE_FAILED",
            reason: "NO_TICKETS",
        };
    }

    const firstTicketId = safeTickets[0]?.ticketId ?? safeTickets[0]?.ticket ?? null;
    const mapped = await getMangmaoOrderByTicket(firstTicketId);

    if (!mapped || !mapped.group_id) {
        return {
            ok: false,
            action: "FINALIZE_FAILED",
            reason: "GROUP_NOT_FOUND_FROM_TICKET",
        };
    }

    return finalizeMangmaoGroup({
        firebaseUserId,
        accountId,
        symbol,
        groupId: mapped.group_id,
        result,
        closedOrders: safeTickets,
        note,
    });
}

module.exports = {
    getDefaultMangmaoConfig,
    normalizeEngineConfig,
    analyzeMangmaoEntry,
    createMangmaoGroup,
    bindMangmaoTickets,
    evaluateMangmaoExit,
    finalizeMangmaoGroup,
    finalizeMangmaoGroupByTickets,
};