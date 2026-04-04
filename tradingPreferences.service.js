const DEFAULT_TRADING_PREFERENCES = {
    engnine_enabled: 1,
    direction_bias: "AUTO",
    max_open_positions: 0,
    base_lot_size: 0,
};

const OPEN_DECISIONS = new Set([
    "ALLOW_BUY",
    "ALLOW_SELL",
    "ALLOW_BUY_SCALP",
    "ALLOW_SELL_SCALP",
    "ALLOW_BUY_PYRAMID",
    "ALLOW_SELL_PYRAMID",
]);

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeDirectionBias(value) {
    const raw = String(value || "AUTO").trim().toUpperCase();

    if (raw === "BUY_ONLY") return "BUY";
    if (raw === "SELL_ONLY") return "SELL";
    if (raw === "BUY") return "BUY";
    if (raw === "SELL") return "SELL";

    return "AUTO";
}

function normalizeTradingPreferences(row) {
    if (!row || typeof row !== "object") {
        return { ...DEFAULT_TRADING_PREFERENCES };
    }

    const rawLotCap =
        row.base_log_size ??
        row.base_lot_size ??
        row.baseLotSize ??
        0;

    return {
        engnine_enabled: Number(row.engnine_enabled ?? 1) === 1 ? 1 : 0,
        direction_bias: normalizeDirectionBias(row.direction_bias),
        max_open_positions: Math.max(
            0,
            parseInt(row.max_open_positions ?? 0, 10) || 0
        ),
        base_log_size: Math.max(0, toNumber(rawLotCap, 0)),
    };
}

function getDecisionSide(decision) {
    const raw = String(decision || "").trim().toUpperCase();

    if (raw.includes("ALLOW_BUY")) return "BUY";
    if (raw.includes("ALLOW_SELL")) return "SELL";

    return "";
}

function enforceDirectionBiasOnDecision(decision, tradingPreferences) {
    const normalized = normalizeTradingPreferences(tradingPreferences);
    const decisionSide = getDecisionSide(decision);

    if (!decisionSide) {
        return {
            decision,
            blocked: false,
            reason: null,
        };
    }

    if (normalized.direction_bias === "AUTO") {
        return {
            decision,
            blocked: false,
            reason: null,
        };
    }

    if (decisionSide !== normalized.direction_bias) {
        return {
            decision: "NO_TRADE",
            blocked: true,
            reason: `BLOCKED_BY_DIRECTION_BIAS_${normalized.direction_bias}`,
        };
    }

    return {
        decision,
        blocked: false,
        reason: null,
    };
}

function isMaxOpenPositionsReached(currentOpenPositionsCount, maxOpenPositions) {
    const current = Math.max(
        0,
        parseInt(currentOpenPositionsCount ?? 0, 10) || 0
    );
    const max = Math.max(0, parseInt(maxOpenPositions ?? 0, 10) || 0);

    if (max <= 0) return false;

    return current >= max;
}

function isOpenDecision(decision) {
    return OPEN_DECISIONS.has(String(decision || "").trim().toUpperCase());
}

function isTradingEngineEnabled(tradingPreferences) {
  return Number(tradingPreferences?.engnine_enabled ?? 1) === 1;
}

module.exports = {
    DEFAULT_TRADING_PREFERENCES,
    normalizeTradingPreferences,
    enforceDirectionBiasOnDecision,
    isMaxOpenPositionsReached,
    isOpenDecision,
    isTradingEngineEnabled
};
