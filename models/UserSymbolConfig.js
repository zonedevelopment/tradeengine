const mongoose = require("mongoose");

const ModeConfigSchema = new mongoose.Schema(
  {
    maxSpread: { type: Number, default: 0 },
    pipMultiplier: { type: Number, default: 100 },
    minSL: { type: Number, default: 0 },
    maxSL: { type: Number, default: 0 },
    minTP: { type: Number, default: 0 },
    maxTP: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSymbolConfigSchema = new mongoose.Schema(
  {
    firebaseUserId: { type: String, required: true, index: true },
    accountId: { type: String, default: "", index: true },
    symbol: { type: String, required: true, index: true },
    normal: { type: ModeConfigSchema, default: () => ({}) },
    scalp: { type: ModeConfigSchema, default: () => ({}) },
    microScalp: { type: ModeConfigSchema, default: () => ({}) },
    changedBy: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "user_symbol_configs",
  }
);

UserSymbolConfigSchema.index(
  { firebaseUserId: 1, accountId: 1, symbol: 1 },
  { unique: true }
);

module.exports = mongoose.model("UserSymbolConfig", UserSymbolConfigSchema);
