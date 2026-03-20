const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: "utf8mb4",
});

async function testConnection() {
    const conn = await pool.getConnection();
    try {
        await conn.ping();
        console.log("MySQL connected");
    } finally {
        conn.release();
    }
}

async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

async function getConnection() {
    return pool.getConnection();
}

module.exports = {
    pool,
    query,
    getConnection,
    testConnection,
};