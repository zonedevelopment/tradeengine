const AccountSnapshotLive = require("./models/accountSnapshotLive.model");

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

async function upsertLiveAccountSnapshot(data) {
    const {
        firebaseUserId,
        accountId = "",
        eventTime = null,

        balance = 0,
        equity = 0,
        margin = 0,
        freeMargin = 0,
        floatingProfit = 0,

        dailyProfit = 0,
        dailyLoss = 0,
        dailyNetProfit = 0,

        todayWinTrades = 0,
        todayLossTrades = 0,
        todayClosedTrades = 0,

        openPositionsCount = 0
    } = data || {};

    if (!firebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    const safeFirebaseUserId = String(firebaseUserId).trim();
    const safeAccountId = accountId != null ? String(accountId).trim() : "";
    const safeEventTime = eventTime ? new Date(eventTime) : new Date();

    await AccountSnapshotLive.updateOne(
        {
            firebaseUserId: safeFirebaseUserId,
            accountId: safeAccountId
        },
        {
            $set: {
                firebaseUserId: safeFirebaseUserId,
                accountId: safeAccountId,

                balance: toNumber(balance),
                equity: toNumber(equity),
                margin: toNumber(margin),
                freeMargin: toNumber(freeMargin),
                floatingProfit: toNumber(floatingProfit),

                dailyProfit: toNumber(dailyProfit),
                dailyLoss: toNumber(dailyLoss),
                dailyNetProfit: toNumber(dailyNetProfit),

                todayWinTrades: toNumber(todayWinTrades),
                todayLossTrades: toNumber(todayLossTrades),
                todayClosedTrades: toNumber(todayClosedTrades),

                openPositionsCount: toNumber(openPositionsCount),

                eventTime: safeEventTime
            },
            $setOnInsert: {
                createdAt: new Date()
            }
        },
        {
            upsert: true
        }
    );

    return await getLiveAccountSnapshotByUserAndAccount(
        safeFirebaseUserId,
        safeAccountId
    );
}

async function getLiveAccountSnapshotByUserAndAccount(firebaseUserId, accountId = "") {
    return await AccountSnapshotLive.findOne({
        firebaseUserId: String(firebaseUserId).trim()
    }).lean();
}

async function getAllLiveAccountSnapshotsByUser(firebaseUserId) {
    return await AccountSnapshotLive.find({
        firebaseUserId: String(firebaseUserId).trim()
    })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
}

module.exports = {
    upsertLiveAccountSnapshot,
    getLiveAccountSnapshotByUserAndAccount,
    getAllLiveAccountSnapshotsByUser
};