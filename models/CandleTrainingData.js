const mongoose = require("mongoose");

const CandleSchema = new mongoose.Schema(
  {
    time: { type: Date, default: null },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    tickVolume: { type: Number, default: 0 },
  },
  { _id: false }
);

const CandleTrainingDataSchema = new mongoose.Schema(
  {
    firebaseUserId: { type: String, default: "", index: true },
    accountId: { type: String, default: "", index: true },
    symbol: { type: String, required: true, index: true },
    timeframe: { type: String, default: "M5", index: true },

    eventTime: { type: Date, required: true, index: true },
    price: { type: Number, default: 0 },

    candles: {
      type: [CandleSchema],
      default: [],
    },

    source: { type: String, default: "signal" },
    mode: { type: String, default: "NORMAL" },
  },
  {
    timestamps: true,
    collection: "candle_training_data",
  }
);

CandleTrainingDataSchema.index({
  firebaseUserId: 1,
  symbol: 1,
  timeframe: 1,
  eventTime: -1,
});

module.exports = mongoose.model("CandleTrainingData", CandleTrainingDataSchema);
