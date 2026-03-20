const axios = require("axios");

async function sendTelegram(token, chatId, message) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
        chat_id: chatId,
        text: message
    });
}

module.exports = { sendTelegram };