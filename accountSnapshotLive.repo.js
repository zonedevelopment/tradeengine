const AccountSnapshotLive = require("./models/accountSnapshotLive.model");

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
}

function pickLatestRecord(records = []) {
    if (!records.length) return null;

    return records
        .slice()
        .sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.eventTime || a.createdAt || 0).getTime();
            const bTime = new Date(b.updatedAt || b.eventTime || b.createdAt || 0).getTime();
            return bTime - aTime;
        })[0];
}

function buildSummaryFromAccounts(accounts = []) {
    return accounts.reduce(
        (acc, item) => {
            acc.accountId = item.accountId;
            acc.balance += toNumber(item.balance);
            acc.equity += toNumber(item.equity);
            acc.margin += toNumber(item.margin);
            acc.freeMargin += toNumber(item.freeMargin);
            acc.floatingProfit += toNumber(item.floatingProfit);

            acc.dailyProfit += toNumber(item.dailyProfit);
            acc.dailyLoss += toNumber(item.dailyLoss);
            acc.dailyNetProfit += toNumber(item.dailyNetProfit);

            acc.todayWinTrades += toNumber(item.todayWinTrades);
            acc.todayLossTrades += toNumber(item.todayLossTrades);
            acc.todayClosedTrades += toNumber(item.todayClosedTrades);

            acc.openPositionsCount += toNumber(item.openPositionsCount);
            return acc;
        },
        {
            accountId: "",
            balance: 0,
            equity: 0,
            margin: 0,
            freeMargin: 0,
            floatingProfit: 0,

            dailyProfit: 0,
            dailyLoss: 0,
            dailyNetProfit: 0,

            todayWinTrades: 0,
            todayLossTrades: 0,
            todayClosedTrades: 0,

            openPositionsCount: 0
        }
    );
}

async function upsertLiveAccountSnapshot(data = {}) {
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
    } = data;

    const safeFirebaseUserId = normalizeString(firebaseUserId);
    const safeAccountId = normalizeString(accountId);
    const safeEventTime = eventTime ? new Date(eventTime) : new Date();

    if (!safeFirebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

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
        firebaseUserId: normalizeString(firebaseUserId),
        accountId: normalizeString(accountId)
    }).lean();
}

async function getAllLiveAccountSnapshotsByUser(firebaseUserId) {
    return await AccountSnapshotLive.find({
        firebaseUserId: normalizeString(firebaseUserId)
    })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
}

async function getAggregatedLiveAccountSnapshotByUser(firebaseUserId) {
    const safeFirebaseUserId = normalizeString(firebaseUserId);

    if (!safeFirebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    const docs = await getAllLiveAccountSnapshotsByUser(safeFirebaseUserId);

    const accounts = docs.map((doc) => ({
        _id: doc._id,
        firebaseUserId: doc.firebaseUserId,
        accountId: doc.accountId || "",
        balance: toNumber(doc.balance),
        equity: toNumber(doc.equity),
        margin: toNumber(doc.margin),
        freeMargin: toNumber(doc.freeMargin),
        floatingProfit: toNumber(doc.floatingProfit),

        dailyProfit: toNumber(doc.dailyProfit),
        dailyLoss: toNumber(doc.dailyLoss),
        dailyNetProfit: toNumber(doc.dailyNetProfit),

        todayWinTrades: toNumber(doc.todayWinTrades),
        todayLossTrades: toNumber(doc.todayLossTrades),
        todayClosedTrades: toNumber(doc.todayClosedTrades),

        openPositionsCount: toNumber(doc.openPositionsCount),

        eventTime: doc.eventTime || null,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
    }));

    const summary = buildSummaryFromAccounts(accounts);
    const latest = pickLatestRecord(accounts);

    return {
        firebaseUserId: safeFirebaseUserId,
        accountCount: accounts.length,
        accounts,
        latest: latest || null,
        summary
    };
}

module.exports = {
    upsertLiveAccountSnapshot,
    getLiveAccountSnapshotByUserAndAccount,
    getAllLiveAccountSnapshotsByUser,
    getAggregatedLiveAccountSnapshotByUser
};
