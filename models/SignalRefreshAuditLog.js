const mongoose = require("mongoose");

const SignalRefreshAuditLogSchema = new mongoose.Schema(
  {
    eventType: { type: String, default: "SIGNAL_REFRESH", index: true },

    firebaseUserId: { type: String, default: "", index: true, trim: true },
    accountId: { type: String, default: "", index: true, trim: true },
    symbol: { type: String, default: "", index: true, trim: true, uppercase: true },
    timeframe: { type: String, default: "M5", index: true, trim: true, uppercase: true },

    eventTime: {
      type: Date,
      default: Date.now,
      index: true,
      expires: 60 * 60 * 24 * 14,
    },

    baseSide: { type: String, default: "", trim: true, uppercase: true },
    baseDecision: { type: String, default: "", trim: true, uppercase: true },
    baseScore: { type: Number, default: 0 },
    pendingSide: { type: String, default: "", trim: true, uppercase: true },
    pendingMode: { type: String, default: "", trim: true, uppercase: true },

    action: { type: String, default: "", index: true, trim: true, uppercase: true },
    decision: { type: String, default: "", index: true, trim: true, uppercase: true },
    reason: { type: String, default: "", index: true, trim: true, uppercase: true },
    phase: { type: String, default: "", index: true, trim: true, uppercase: true },
    state: { type: String, default: "", index: true, trim: true, uppercase: true },
    activeHypothesis: { type: String, default: "", trim: true, uppercase: true },
    candidateSide: { type: String, default: "", trim: true, uppercase: true },

    score: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    mode: { type: String, default: "", trim: true, uppercase: true },

    refreshAttempt: { type: Number, default: 0 },
    pendingAgeSec: { type: Number, default: 0 },
    spreadPoints: { type: Number, default: 0 },
    liveMomentumScore: { type: Number, default: 0 },
    currentDistancePoints: { type: Number, default: 0 },
    immediateEntryThreshold: { type: Number, default: 0 },

    refreshValidated: { type: Boolean, default: false },
    refreshWaiting: { type: Boolean, default: false },
    refreshInvalidated: { type: Boolean, default: false },

    reanalysisTriggered: { type: Boolean, default: false },
    reanalysisReason: { type: String, default: "", trim: true, uppercase: true },
    reversalConfirmed: { type: Boolean, default: false },

    breakoutDetected: { type: Boolean, default: false },
    breakoutRetestAccepted: { type: Boolean, default: false },
    breakoutRetestRejected: { type: Boolean, default: false },

    evidence: { type: [String], default: [] },

    tradeSetup: { type: mongoose.Schema.Types.Mixed, default: null },
    hypotheses: { type: mongoose.Schema.Types.Mixed, default: null },
    requestSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    snapshots: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    collection: "signal_refresh_audit_logs",
  }
);

SignalRefreshAuditLogSchema.index({ symbol: 1, eventTime: -1 });
SignalRefreshAuditLogSchema.index({ firebaseUserId: 1, symbol: 1, eventTime: -1 });
SignalRefreshAuditLogSchema.index({ phase: 1, state: 1, eventTime: -1 });

module.exports =
  mongoose.models.SignalRefreshAuditLog ||
  mongoose.model("SignalRefreshAuditLog", SignalRefreshAuditLogSchema);
