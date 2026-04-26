const mongoose = require("mongoose");

const { Schema } = mongoose;

const EntryThesisSnapshotSchema = new Schema(
  {
    firebaseUserId: { type: String, required: true, trim: true, index: true },
    accountId: { type: String, default: "", trim: true, index: true },
    symbol: { type: String, required: true, trim: true, uppercase: true, index: true },
    side: { type: String, default: "", trim: true, uppercase: true, index: true },
    mode: { type: String, default: "NORMAL", trim: true, uppercase: true, index: true },
    decision: { type: String, default: "NO_TRADE", trim: true, uppercase: true },
    sourceEndpoint: { type: String, default: "signal", trim: true, index: true },
    thesisStage: { type: String, default: "SIGNAL_ENTRY_CANDIDATE", trim: true, index: true },
    executionStatus: { type: String, default: "PENDING_EXECUTION", trim: true, index: true },
    score: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    trend: { type: String, default: "NEUTRAL", trim: true, uppercase: true },
    reason: { type: String, default: "", trim: true },
    phase: { type: String, default: null, trim: true },
    state: { type: String, default: null, trim: true },
    activeHypothesis: { type: String, default: null, trim: true },
    candidateSide: { type: String, default: null, trim: true, uppercase: true },
    pattern: { type: Schema.Types.Mixed, default: null },
    historicalVolume: { type: Schema.Types.Mixed, default: null },
    defensiveFlags: { type: Schema.Types.Mixed, default: null },
    tradeSetup: { type: Schema.Types.Mixed, default: null },
    hypotheses: { type: Schema.Types.Mixed, default: null },
    evidence: { type: [String], default: [] },
    market: { type: Schema.Types.Mixed, default: null },
    trigger: { type: Schema.Types.Mixed, default: null },
    linkedTicketId: { type: String, default: null, trim: true, index: true },
    linkedAt: { type: Date, default: null },
    linkedOpenOrder: { type: Schema.Types.Mixed, default: null },
    eventTime: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
    collection: "entry_thesis_snapshots",
  }
);

EntryThesisSnapshotSchema.index(
  { firebaseUserId: 1, accountId: 1, symbol: 1, side: 1, mode: 1, eventTime: -1 },
  { name: "entry_thesis_lookup_idx" }
);

EntryThesisSnapshotSchema.index(
  { sourceEndpoint: 1, thesisStage: 1, executionStatus: 1, eventTime: -1 },
  { name: "entry_thesis_stage_idx" }
);

EntryThesisSnapshotSchema.index(
  { eventTime: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, name: "entry_thesis_ttl_30d" }
);

module.exports = mongoose.model("EntryThesisSnapshot", EntryThesisSnapshotSchema);
