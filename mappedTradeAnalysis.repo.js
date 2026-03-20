const { query } = require("./db");

async function insertMappedTradeAnalysis(data) {
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

    return await query(sql, params);
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