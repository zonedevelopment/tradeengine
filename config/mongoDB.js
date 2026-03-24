const mongoose = require('mongoose');
require('dotenv').config();

const URL = process.env.MONGODB_URI;

class Database {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            if (!this.connection) {
                await mongoose.connect(URL);
                this.connection = mongoose.connection; // <--- ต้องมีบรรทัดนี้
                console.log("Connected MongoDB successfully!");
            }

            return this.connection;
        } catch (error) {
            console.error("Connection MongoDB failed:", error);
        }
    }

    async disconnection() {
        if (this.connection) {
            await mongoose.disconnect();
            console.log('Disconnected MongoDB.');
            this.connection = null;
        }
    }
}

module.exports = new Database();