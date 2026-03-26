const snapshotClients = new Map();

function getAccountSnapshotStreamKey(firebaseUserId, accountId = "") {
    return `${String(firebaseUserId).trim()}::${String(accountId || "").trim()}`;
}

function addAccountSnapshotClient(key, res) {
    if (!snapshotClients.has(key)) {
        snapshotClients.set(key, new Set());
    }

    snapshotClients.get(key).add(res);
}

function removeAccountSnapshotClient(key, res) {
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

function broadcastAccountSnapshot(key, snapshot) {
    const clients = snapshotClients.get(key);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
        sendSse(res, "account-snapshot", {
            success: true,
            snapshot: snapshot || null
        });
    }
}

function initSseHeaders(res) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
    });
}

module.exports = {
    getAccountSnapshotStreamKey,
    addAccountSnapshotClient,
    removeAccountSnapshotClient,
    sendSse,
    broadcastAccountSnapshot,
    initSseHeaders
};