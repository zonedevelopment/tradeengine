const { query } = require("./db");

function dbNull(value, fallback = null) {
    return value === undefined ? fallback : value;
}

function normalizeMappedItem(data) {
    if (!data) return null;

    if (Array.isArray(data)) {
        return data.length > 0 ? data[0] : null;
    }

    if (typeof data === "object" && data[0] && typeof data[0] === "object") {
        return data[0];
    }

    return data;
}

async function insertMappedTradeAnalysis(data) {
    data = normalizeMappedItem(data);

    if (!data || typeof data !== "object") {
        console.warn("[mappedTradeAnalysis] Skip invalid item:", data);
        return;
    }
    const sql = `
    INSERT INTO mapped_trade_analysis (
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
      side,
      post_mortem,
      context_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const params = [
        data.firebaseUserId || null,
        data.accountId || null,
        data.eventTime,
        data.symbol,
        data.patternType,
        data.triggerPattern,
        data.mode,
        data.tickVolume || null,
        data.microTrend || "UNKNOWN",
        data.volumeProfile || "UNKNOWN",
        data.prePatternShape || "",
        data.rangeState || "UNKNOWN",
        data.sessionName || "UNKNOWN",
        Number(data.openPrice || 0),
        Number(data.closePrice || 0),
        Number(data.slPrice || 0),
        Number(data.tpPrice || 0),
        Number(data.slPips || 0),
        Number(data.tpPips || 0),
        Number(data.rrRatio || 0),
        Number(data.profit || 0),
        data.result,
        data.side,
        data.postMortem || "",
        data.contextHash,
    ];

    const values = params.map((row) => [
        dbNull(row.firebaseUserId || null),
        dbNull(row.accountId || null),
        dbNull(row.eventTime),
        dbNull(row.symbol),
        dbNull(row.patternType),
        dbNull(row.triggerPattern),
        dbNull(row.mode),
        dbNull(row.tickVolume || null),
        dbNull(row.microTrend || "UNKNOWN"),
        dbNull(row.volumeProfile || "UNKNOWN"),
        dbNull(row.prePatternShape || ""),
        dbNull(row.rangeState || "UNKNOWN"),
        dbNull(row.sessionName || "UNKNOWN"),
        Number(dbNull(row.openPrice || 0)),
        Number(dbNull(row.closePrice || 0)),
        Number(dbNull(row.slPrice || 0)),
        Number(dbNull(row.tpPrice || 0)),
        Number(dbNull(row.slPips || 0)),
        Number(dbNull(row.tpPips || 0)),
        Number(dbNull(row.rrRatio || 0)),
        Number(dbNull(row.profit || 0)),
        dbNull(row.result),
        dbNull(row.side),
        dbNull(row.postMortem || ""),
        dbNull(row.contextHash),
    ]);

    if (values.firebaseUserId) {
        return await query(sql, values);
    }
}

async function insertManyMappedTradeAnalysis(items = []) {
    if (!Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
        await insertMappedTradeAnalysis(item);
    }
}

module.exports = {
    insertMappedTradeAnalysis,
    insertManyMappedTradeAnalysis,
};