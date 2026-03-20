const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
});

function isRetryableDbError(error) {
    if (!error) return false;

    const retryableCodes = [
        "ECONNRESET",
        "PROTOCOL_CONNECTION_LOST",
        "ETIMEDOUT",
        "EPIPE",
        "ECONNREFUSED",
        "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    ];

    return retryableCodes.includes(error.code);
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testConnection() {
    const conn = await pool.getConnection();
    try {
        await conn.ping();
        console.log("MySQL connected");
    } finally {
        conn.release();
    }
}

async function query(sql, params = [], options = {}) {
    const retries = options.retries ?? 2;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (error) {
            lastError = error;

            console.error(`[DB] query failed (attempt ${attempt + 1}/${retries + 1})`, {
                code: error.code || null,
                message: error.message,
            });

            if (!isRetryableDbError(error) || attempt === retries) {
                throw error;
            }

            await sleep(300 * (attempt + 1));
        }
    }

    throw lastError;
}

module.exports = {
    pool,
    query,
    testConnection,
};