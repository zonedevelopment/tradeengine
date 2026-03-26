const AccountSnapshot = require("./models/accountSnapshot.model");

function normalizeString(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
}

function toSnapshotDate(input) {
    const d = input ? new Date(input) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function upsertDailyAccountSnapshot(data = {}) {
    const {
        firebaseUserId,
        accountId = "",
        eventTime,
        ...rest
    } = data;

    const safeFirebaseUserId = normalizeString(firebaseUserId);
    const safeAccountId = normalizeString(accountId);

    if (!safeFirebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    const eventDate = eventTime ? new Date(eventTime) : new Date();
    const snapshotDate = toSnapshotDate(eventDate);

    return await AccountSnapshot.updateOne(
        {
            firebaseUserId: safeFirebaseUserId,
            accountId: safeAccountId,
            snapshotDate
        },
        {
            $set: {
                firebaseUserId: safeFirebaseUserId,
                accountId: safeAccountId,
                snapshotDate,
                ...rest,
                eventTime: eventDate
            }
        },
        { upsert: true }
    );
}

async function getTodayAccountSnapshotsByUser(firebaseUserId) {
    const safeFirebaseUserId = normalizeString(firebaseUserId);
    const snapshotDate = toSnapshotDate(new Date());

    return await AccountSnapshot.find({
        firebaseUserId: safeFirebaseUserId,
        snapshotDate
    })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
}

async function getAccountSnapshotsByUser(firebaseUserId, limit = 30, page = 1) {
    const safeFirebaseUserId = normalizeString(firebaseUserId);
    const safeLimit = Math.max(1, Number(limit) || 30);
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * safeLimit;

    return await AccountSnapshot.find({ firebaseUserId: safeFirebaseUserId })
        .sort({ snapshotDate: -1, updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean();
}

module.exports = {
    upsertDailyAccountSnapshot,
    getTodayAccountSnapshotsByUser,
    getAccountSnapshotsByUser
};