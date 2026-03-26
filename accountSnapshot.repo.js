const mongoose = require("mongoose");
const AccountSnapshot = require("./models/accountSnapshot.model");

function toSnapshotDate(input) {
    const d = input ? new Date(input) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function upsertDailyAccountSnapshot(data) {
    const {
        firebaseUserId,
        accountId = "",
        eventTime,
        ...rest
    } = data;

    const eventDate = eventTime ? new Date(eventTime) : new Date();
    const snapshotDate = toSnapshotDate(eventDate);

    return await AccountSnapshot.updateOne(
        { firebaseUserId, snapshotDate },
        {
            $set: {
                firebaseUserId,
                accountId,
                snapshotDate,
                ...rest,
                eventTime: eventDate
            }
        },
        { upsert: true }
    );
}

async function getTodayAccountSnapshotByUser(firebaseUserId) {
    const snapshotDate = toSnapshotDate(new Date());

    return await AccountSnapshot.findOne({
        firebaseUserId,
        snapshotDate
    }).lean();
}

async function getAccountSnapshotsByUser(firebaseUserId, limit = 30, page = 1) {
    const safeLimit = Math.max(1, Number(limit) || 30);
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * safeLimit;

    return await AccountSnapshot.find({ firebaseUserId })
        .sort({ snapshotDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean();
}

module.exports = {
    upsertDailyAccountSnapshot,
    getTodayAccountSnapshotByUser,
    getAccountSnapshotsByUser
};