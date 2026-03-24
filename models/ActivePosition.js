const mongoose = require("mongoose");

const ActivePositionSchema = new mongoose.Schema(
    {
        ticketId: { type: String, required: true, trim: true },
        firebaseUserId: { type: String, required: true, trim: true, index: true },
        accountId: { type: String, default: "", trim: true, index: true },
        symbol: { type: String, required: true, trim: true, uppercase: true, index: true },
        side: { type: String, default: "", trim: true, uppercase: true },
        lot: { type: Number, default: 0 },
        entryPrice: { type: Number, default: 0 },
        currentPrice: { type: Number, default: 0 },
        sl: { type: Number, default: 0 },
        tp: { type: Number, default: 0 },
        profit: { type: Number, default: 0 },
        swap: { type: Number, default: 0 },
        commission: { type: Number, default: 0 },
        openTime: { type: Date, default: null },
        eventTime: { type: Date, default: null },
        updatedAt: { type: Date, default: Date.now, index: true },
    },
    {
        versionKey: false,
        collection: "activePositions",
    }
);

ActivePositionSchema.index(
    { firebaseUserId: 1, symbol: 1, ticketId: 1 },
    { unique: true, name: "uniq_user_symbol_ticket" }
);

module.exports = mongoose.model("ActivePosition", ActivePositionSchema);