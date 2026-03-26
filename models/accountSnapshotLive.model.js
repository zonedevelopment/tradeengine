const mongoose = require("mongoose");

const AccountSnapshotLiveSchema = new mongoose.Schema(
  {
    firebaseUserId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    accountId: {
      type: String,
      default: "",
      index: true,
      trim: true
    },

    balance: {
      type: Number,
      default: 0
    },
    equity: {
      type: Number,
      default: 0
    },
    margin: {
      type: Number,
      default: 0
    },
    freeMargin: {
      type: Number,
      default: 0
    },
    floatingProfit: {
      type: Number,
      default: 0
    },

    dailyProfit: {
      type: Number,
      default: 0
    },
    dailyLoss: {
      type: Number,
      default: 0
    },
    dailyNetProfit: {
      type: Number,
      default: 0
    },

    todayWinTrades: {
      type: Number,
      default: 0
    },
    todayLossTrades: {
      type: Number,
      default: 0
    },
    todayClosedTrades: {
      type: Number,
      default: 0
    },

    openPositionsCount: {
      type: Number,
      default: 0
    },

    eventTime: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: "account_snapshot_live"
  }
);

AccountSnapshotLiveSchema.index(
  { firebaseUserId: 1, accountId: 1 },
  { unique: true, name: "uniq_live_snapshot_user_account" }
);

module.exports =
  mongoose.models.AccountSnapshotLive ||
  mongoose.model("AccountSnapshotLive", AccountSnapshotLiveSchema);