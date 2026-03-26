const ActivePosition = require("./models/ActivePosition");

// const sseClients = new Map(); // key = clientId, value = { res, firebaseUserId, symbol }

// function buildClientKey(firebaseUserId, symbol) {
//     return `${firebaseUserId}::${symbol || "*"}`;
// }

// function sendSse(res, event, data) {
//     res.write(`event: ${event}\n`);
//     res.write(`data: ${JSON.stringify(data)}\n\n`);
// }

// function registerSseClient({ clientId, firebaseUserId, symbol, res }) {
//     sseClients.set(clientId, { res, firebaseUserId, symbol: symbol || "" });
// }

// function unregisterSseClient(clientId) {
//     sseClients.delete(clientId);
// }

// function broadcastActivePositionChange(payload) {
//     for (const [clientId, client] of sseClients.entries()) {
//         const sameUser = client.firebaseUserId === payload.firebaseUserId;
//         const sameSymbol = !client.symbol || client.symbol === payload.symbol;

//         if (!sameUser || !sameSymbol) continue;

//         try {
//             sendSse(client.res, "active-position-update", payload);
//         } catch (err) {
//             try {
//                 client.res.end();
//             } catch (_) { }
//             sseClients.delete(clientId);
//         }
//     }
// }

// let changeStreamStarted = false;

// function startActivePositionChangeStream() {
//     if (changeStreamStarted) return;
//     changeStreamStarted = true;

//     const changeStream = ActivePosition.watch([], { fullDocument: "updateLookup" });

//     changeStream.on("change", (change) => {
//         try {
//             let payload = null;

//             if (change.operationType === "delete") {
//                 const key = change.documentKey?._id;
//                 payload = {
//                     action: "delete",
//                     documentId: key
//                 };
//             } else {
//                 const doc = change.fullDocument;
//                 if (!doc) return;

//                 payload = {
//                     action:
//                         change.operationType === "insert"
//                             ? "insert"
//                             : change.operationType === "replace"
//                                 ? "replace"
//                                 : "update",
//                     documentId: doc._id,
//                     ticketId: doc.ticketId,
//                     firebaseUserId: doc.firebaseUserId,
//                     accountId: doc.accountId,
//                     symbol: doc.symbol,
//                     side: doc.side,
//                     lot: doc.lot,
//                     entryPrice: doc.entryPrice,
//                     currentPrice: doc.currentPrice,
//                     sl: doc.sl,
//                     tp: doc.tp,
//                     profit: doc.profit,
//                     swap: doc.swap,
//                     commission: doc.commission,
//                     openTime: doc.openTime,
//                     eventTime: doc.eventTime,
//                     updatedAt: doc.updatedAt
//                 };
//             }

//             if (payload?.firebaseUserId && payload?.symbol) {
//                 broadcastActivePositionChange(payload);
//             }
//         } catch (err) {
//             console.error("[ActivePositionChangeStream] handle error:", err);
//         }
//     });

//     changeStream.on("error", (err) => {
//         console.error("[ActivePositionChangeStream] stream error:", err);
//         changeStreamStarted = false;
//         setTimeout(() => {
//             startActivePositionChangeStream();
//         }, 3000);
//     });

//     console.log("[ActivePositionChangeStream] started");
// }

// module.exports = {
//     registerSseClient,
//     unregisterSseClient,
//     startActivePositionChangeStream,
//     buildClientKey,
//     sendSse
// };
const sseClients = new Map();

function sendSse(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function registerSseClient({ clientId, firebaseUserId, symbol, res }) {
    sseClients.set(clientId, {
        res,
        firebaseUserId,
        symbol: symbol ? String(symbol).toUpperCase() : ""
    });
}

function unregisterSseClient(clientId) {
    sseClients.delete(clientId);
}

function broadcastActivePositionChange(payload) {
    for (const [clientId, client] of sseClients.entries()) {
        const sameUser = client.firebaseUserId === payload.firebaseUserId;
        const sameSymbol =
            !client.symbol || client.symbol === String(payload.symbol || "").toUpperCase();

        if (!sameUser || !sameSymbol) continue;

        try {
            sendSse(client.res, "active-position-update", payload);
        } catch (err) {
            try { client.res.end(); } catch (_) { }
            sseClients.delete(clientId);
        }
    }
}

module.exports = {
    sendSse,
    registerSseClient,
    unregisterSseClient,
    broadcastActivePositionChange
};