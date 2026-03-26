const mongoose = require("mongoose");

const AccountSnapshotSchema = new mongoose.Schema(
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

        snapshotDate: {
            type: String,
            required: true,
            index: true
        }, // YYYY-MM-DD

        balance: { type: Number, default: 0 },
        equity: { type: Number, default: 0 },
        margin: { type: Number, default: 0 },
        freeMargin: { type: Number, default: 0 },

        floatingProfit: { type: Number, default: 0 },

        dailyProfit: { type: Number, default: 0 },
        dailyLoss: { type: Number, default: 0 },
        dailyNetProfit: { type: Number, default: 0 },

        todayWinTrades: { type: Number, default: 0 },
        todayLossTrades: { type: Number, default: 0 },
        todayClosedTrades: { type: Number, default: 0 },

        openPositionsCount: { type: Number, default: 0 },

        eventTime: { type: Date, default: Date.now }
    },
    {
        timestamps: true,
        collection: "account_snapshot"
    }
);

// 1 user + 1 account + 1 day = 1 record
AccountSnapshotSchema.index(
    { firebaseUserId: 1, accountId: 1, snapshotDate: 1 },
    { unique: true, name: "uniq_daily_snapshot_user_account_date" }
);

module.exports =
    mongoose.models.AccountSnapshot ||
    mongoose.model("AccountSnapshot", AccountSnapshotSchema);