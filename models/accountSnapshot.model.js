const mongoose = require("mongoose");

const AccountSnapshotSchema = new mongoose.Schema(
    {
        firebaseUserId: { type: String, required: true, index: true },
        accountId: { type: String, default: "" },

        snapshotDate: { type: String, required: true, index: true }, // YYYY-MM-DD

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
    { timestamps: true }
);

// 1 user ต่อ 1 วัน = 1 record
AccountSnapshotSchema.index(
    { firebaseUserId: 1, snapshotDate: 1 },
    { unique: true }
);

module.exports = mongoose.model("AccountSnapshot", AccountSnapshotSchema);