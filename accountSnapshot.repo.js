const AccountSnapshot = require("./models/accountSnapshot.model");
const { formatThailandDate, toThailandDate } = require("./thailand-time");

function normalizeString(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
}

function toSnapshotDate(input) {
    return formatThailandDate(input);
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

    const eventDate = toThailandDate(eventTime);
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
    const snapshotDate = toSnapshotDate();

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
