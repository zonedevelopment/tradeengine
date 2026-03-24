// const ActivePosition = require("./models/ActivePosition");

// function normalizeNumber(value, fallback = 0) {
//     if (value === undefined || value === null || value === "") {
//         return fallback;
//     }

//     const num = Number(value);
//     return Number.isFinite(num) ? num : fallback;
// }

// function normalizeString(value, fallback = "") {
//     if (value === undefined || value === null) {
//         return fallback;
//     }

//     return String(value).trim();
// }

// function normalizeDate(value) {
//     if (!value) return null;

//     const date = new Date(value);
//     return Number.isNaN(date.getTime()) ? null : date;
// }

// function normalizeTicketId(value) {
//     if (value === undefined || value === null || value === "") {
//         return "";
//     }

//     return String(value).trim();
// }

// async function syncActivePositionsToMongo({
//     firebaseUserId,
//     accountId = "",
//     symbol = "",
//     positions = [],
//     eventTime = null,
// }) {
//     const safeFirebaseUserId = normalizeString(firebaseUserId);
//     const safeAccountId = normalizeString(accountId, "");
//     const safeSymbol = normalizeString(symbol, "").toUpperCase();

//     if (!safeFirebaseUserId) {
//         throw new Error("firebaseUserId is required");
//     }

//     if (!safeSymbol) {
//         throw new Error("symbol is required");
//     }

//     const incomingTicketIds = [];
//     const bulkOps = [];

//     for (const position of positions) {
//         const ticketId = normalizeTicketId(position.ticketId ?? position.ticket_id);
//         if (!ticketId) continue;

//         incomingTicketIds.push(ticketId);

//         bulkOps.push({
//             updateOne: {
//                 filter: {
//                     firebaseUserId: safeFirebaseUserId,
//                     symbol: safeSymbol,
//                     ticketId,
//                 },
//                 update: {
//                     $set: {
//                         ticketId,
//                         firebaseUserId: safeFirebaseUserId,
//                         accountId: normalizeString(accountId, ""),
//                         symbol: normalizeString(position.symbol || safeSymbol).toUpperCase(),
//                         side: normalizeString(position.side, "").toUpperCase(),
//                         lot: normalizeNumber(position.lot, 0),
//                         entryPrice: normalizeNumber(position.entryPrice, 0),
//                         currentPrice: normalizeNumber(position.currentPrice, 0),
//                         sl: normalizeNumber(position.sl, 0),
//                         tp: normalizeNumber(position.tp, 0),
//                         profit: normalizeNumber(position.profit, 0),
//                         swap: normalizeNumber(position.swap, 0),
//                         commission: normalizeNumber(position.commission, 0),
//                         openTime: normalizeDate(position.openTime),
//                         eventTime: normalizeDate(eventTime || position.eventTime),
//                         updatedAt: new Date(),
//                     },
//                 },
//                 upsert: true,
//             },
//         });
//     }

//     if (bulkOps.length > 0) {
//         await ActivePosition.bulkWrite(bulkOps, { ordered: false });
//     }

//     if (incomingTicketIds.length > 0) {
//         await ActivePosition.deleteMany({
//             firebaseUserId: safeFirebaseUserId,
//             symbol: safeSymbol,
//             ticketId: { $nin: incomingTicketIds },
//         });
//     } else {
//         await ActivePosition.deleteMany({
//             firebaseUserId: safeFirebaseUserId,
//             symbol: safeSymbol,
//         });
//     }

//     return {
//         success: true,
//         firebaseUserId: safeFirebaseUserId,
//         symbol: safeSymbol,
//         count: incomingTicketIds.length,
//     };
// }

// async function getActivePositionsByUserAndSymbol({ firebaseUserId }) {
//     const safeFirebaseUserId = normalizeString(firebaseUserId);
//     // const safeSymbol = normalizeString(symbol, "").toUpperCase();

//     if (!safeFirebaseUserId) {
//         throw new Error("firebaseUserId is required");
//     }

//     // if (!safeSymbol) {
//     //     throw new Error("symbol is required");
//     // }

//     return await ActivePosition.find({
//         firebaseUserId: safeFirebaseUserId,
//     })
//         .sort({ openTime: -1, updatedAt: -1, _id: -1 })
//         .lean();
// }

// module.exports = {
//     syncActivePositionsToMongo,
//     getActivePositionsByUserAndSymbol,
// };
const ActivePosition = require("./models/ActivePosition");

function normalizeNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeString(value, fallback = "") {
    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value).trim();
}

function normalizeDate(value) {
    if (!value) return null;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTicketId(value) {
    if (value === undefined || value === null || value === "") {
        return "";
    }

    return String(value).trim();
}

async function syncActivePositionsToMongo({
    firebaseUserId,
    accountId = "",
    symbol = "",
    positions = [],
    eventTime = null,
}) {
    const safeFirebaseUserId = normalizeString(firebaseUserId);
    const safeAccountId = normalizeString(accountId, "");
    const safeSymbol = normalizeString(symbol, "").toUpperCase();

    if (!safeFirebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    // if (!safeSymbol) {
    //     throw new Error("symbol is required");
    // }

    const incomingTicketIds = [];
    const bulkOps = [];

    if (positions) {
        for (const position of positions) {
            const ticketId = normalizeTicketId(position.ticketId ?? position.ticket_id);
            if (!ticketId) continue;

            incomingTicketIds.push(ticketId);

            // bulkOps.push({
            //     updateOne: {
            //         filter: {
            //             firebaseUserId: safeFirebaseUserId,
            //             symbol: safeSymbol,
            //             ticketId,
            //         },
            //         update: {
            //             $set: {
            //                 ticketId,
            //                 firebaseUserId: safeFirebaseUserId,
            //                 accountId: safeAccountId,
            //                 symbol: normalizeString(position.symbol || safeSymbol).toUpperCase(),
            //                 side: normalizeString(position.side, "").toUpperCase(),
            //                 lot: normalizeNumber(position.lot, 0),
            //                 entryPrice: normalizeNumber(position.entryPrice, 0),
            //                 currentPrice: normalizeNumber(position.currentPrice, 0),
            //                 sl: normalizeNumber(position.sl, 0),
            //                 tp: normalizeNumber(position.tp, 0),
            //                 profit: normalizeNumber(position.profit, 0),
            //                 swap: normalizeNumber(position.swap, 0),
            //                 commission: normalizeNumber(position.commission, 0),
            //                 openTime: normalizeDate(position.openTime),
            //                 eventTime: normalizeDate(eventTime || position.eventTime),
            //                 updatedAt: new Date(),
            //             },
            //         },
            //         upsert: true,
            //     },
            // });
            const filter = {
                firebaseUserId: safeFirebaseUserId,
                symbol: safeSymbol,
                ticketId,
            };

            const update = {
                $set: {
                    accountId: safeAccountId,
                    symbol: safeSymbol,
                    side: normalizeString(position.side, "").toUpperCase(),
                    lot: normalizeNumber(position.lot, 0),
                    entryPrice: normalizeNumber(position.entryPrice, 0),
                    currentPrice: normalizeNumber(position.currentPrice, 0),
                    sl: normalizeNumber(position.sl, 0),
                    tp: normalizeNumber(position.tp, 0),
                    profit: normalizeNumber(position.profit, 0),
                    swap: normalizeNumber(position.swap, 0),
                    commission: normalizeNumber(position.commission, 0),
                    openTime: normalizeDate(position.openTime),
                    eventTime: normalizeDate(eventTime || position.eventTime),
                    updatedAt: new Date(),
                },
                $setOnInsert: {
                    ticketId,
                    firebaseUserId: safeFirebaseUserId,
                },
            };

            try {
                await ActivePosition.updateOne(filter, update, { upsert: true });
            } catch (error) {
                if (error.code === 11000) {
                    // 🔥 ถ้าซ้ำ → update ซ้ำอีกที (safe)
                    await ActivePosition.updateOne(filter, { $set: update.$set });
                } else {
                    throw error;
                }
            }
        }
    }

    // if (bulkOps.length > 0) {
    //     await ActivePosition.bulkWrite(bulkOps, { ordered: false });
    // }

    if (incomingTicketIds.length === 0) {
        // ไม่มีออเดอร์แล้ว -> ลบทั้งหมดของ user + symbol นี้
        const deleted = await ActivePosition.deleteMany({
            firebaseUserId: safeFirebaseUserId
        });

        return {
            success: true,
            firebaseUserId: safeFirebaseUserId,
            symbol: safeSymbol,
            count: 0,
            deletedCount: deleted.deletedCount || 0,
        };
    }

    // ลบ ticket ที่ไม่อยู่ใน snapshot ล่าสุด
    const deleted = await ActivePosition.deleteMany({
        firebaseUserId: safeFirebaseUserId,
        symbol: safeSymbol,
        ticketId: { $nin: incomingTicketIds },
    });

    return {
        success: true,
        firebaseUserId: safeFirebaseUserId,
        symbol: safeSymbol,
        count: incomingTicketIds.length,
        deletedCount: deleted.deletedCount || 0,
    };
}

async function getActivePositionsByUserAndSymbol({ firebaseUserId }) {
    const safeFirebaseUserId = normalizeString(firebaseUserId);
    // const safeSymbol = normalizeString(symbol, "").toUpperCase();

    if (!safeFirebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    // if (!safeSymbol) {
    //     throw new Error("symbol is required");
    // }

    return await ActivePosition.find({
        firebaseUserId: safeFirebaseUserId,
        // symbol: safeSymbol,
    })
        .sort({ openTime: -1, updatedAt: -1, _id: -1 })
        .lean();
}

module.exports = {
    syncActivePositionsToMongo,
    getActivePositionsByUserAndSymbol,
};