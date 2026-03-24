const { db } = require("./config/firebase");
const {
    collection,
    doc,
    getDocs,
    writeBatch,
    serverTimestamp,
} = require("firebase/firestore");

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

function normalizeDateToIso(value) {
    if (!value) return new Date().toISOString();

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }

    return date.toISOString();
}

function normalizeTicketId(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const str = String(value).trim();
    return str || null;
}

async function syncActivePositionsToFirebase({
    firebaseUserId,
    accountId = null,
    positions = [],
    eventTime = null,
}) {
    const safeFirebaseUserId = normalizeString(firebaseUserId);

    if (!safeFirebaseUserId) {
        throw new Error("firebaseUserId is required");
    }

    const userRef = doc(
        db,
        "artifacts",
        "trader-bot-pro",
        "users",
        safeFirebaseUserId
    );

    const activePositionsRef = collection(
        db,
        "artifacts",
        "trader-bot-pro",
        "users",
        safeFirebaseUserId,
        "active_positions"
    );

    const existingSnapshot = await getDocs(activePositionsRef);
    const existingTicketIds = new Set(existingSnapshot.docs.map((item) => item.id));
    const incomingTicketIds = new Set();

    const batch = writeBatch(db);

    for (const position of positions) {
        const ticketId = normalizeTicketId(position.ticketId ?? position.ticket_id);
        if (!ticketId) continue;

        incomingTicketIds.add(ticketId);

        const positionRef = doc(
            db,
            "artifacts",
            "trader-bot-pro",
            "users",
            safeFirebaseUserId,
            "active_positions",
            ticketId
        );

        batch.set(
            positionRef,
            {
                ticketId,
                firebaseUserId: safeFirebaseUserId,
                accountId: normalizeString(accountId, ""),
                symbol: normalizeString(position.symbol),
                side: normalizeString(position.side).toUpperCase(),
                lot: normalizeNumber(position.lot, 0),
                entryPrice: normalizeNumber(position.entryPrice, 0),
                currentPrice: normalizeNumber(position.currentPrice, 0),
                sl: normalizeNumber(position.sl, 0),
                tp: normalizeNumber(position.tp, 0),
                profit: normalizeNumber(position.profit, 0),
                swap: normalizeNumber(position.swap, 0),
                commission: normalizeNumber(position.commission, 0),
                openTime: normalizeDateToIso(position.openTime),
                eventTime: normalizeDateToIso(eventTime || position.eventTime),
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    }

    for (const existingTicketId of existingTicketIds) {
        if (!incomingTicketIds.has(existingTicketId)) {
            const positionRef = doc(
                db,
                "artifacts",
                "trader-bot-pro",
                "users",
                safeFirebaseUserId,
                "active_positions",
                existingTicketId
            );

            batch.delete(positionRef);
        }
    }

    batch.set(
        userRef,
        {
            firebase_user_id: safeFirebaseUserId,
            account_id: normalizeString(accountId, ""),
            active_positions_count: incomingTicketIds.size,
            active_positions_updated_at: serverTimestamp(),
        },
        { merge: true }
    );

    await batch.commit();

    return {
        success: true,
        firebaseUserId: safeFirebaseUserId,
        count: incomingTicketIds.size,
    };
}

module.exports = {
    syncActivePositionsToFirebase,
};