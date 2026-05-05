const snapshotClients = new Map();

function getAccountSnapshotStreamKey(firebaseUserId) {
    return String(firebaseUserId || "").trim();
}

function addAccountSnapshotClient(firebaseUserId, res) {
    const key = getAccountSnapshotStreamKey(firebaseUserId);
    if (!key) return;

    if (!snapshotClients.has(key)) {
        snapshotClients.set(key, new Set());
    }

    snapshotClients.get(key).add(res);
}

function removeAccountSnapshotClient(firebaseUserId, res) {
    const key = getAccountSnapshotStreamKey(firebaseUserId);
    const clients = snapshotClients.get(key);
    if (!clients) return;

    clients.delete(res);

    if (clients.size === 0) {
        snapshotClients.delete(key);
    }
}

function sendSse(res, eventName, data) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastAccountSnapshot(firebaseUserId, payload) {
    const key = getAccountSnapshotStreamKey(firebaseUserId);
    const clients = snapshotClients.get(key);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
        sendSse(res, "account-snapshot", {
            success: true,
            data: payload || null
        });
    }
}

function initSseHeaders(res, origin = null) {
    const headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    };

    if (origin) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Vary"] = "Origin";
    }

    res.writeHead(200, headers);
}

module.exports = {
    getAccountSnapshotStreamKey,
    addAccountSnapshotClient,
    removeAccountSnapshotClient,
    sendSse,
    broadcastAccountSnapshot,
    initSseHeaders
};
