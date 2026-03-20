const axios = require("axios");

async function analyzeWithGemini(apiKey, newsItems) {
    // const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `
            คุณเป็น AI Trading Analyst สำหรับ XAUUSD

            วิเคราะห์ข่าวต่อไปนี้ แล้วสรุปเป็น JSON เท่านั้น
            ต้องตอบเป็น JSON รูปแบบนี้:

            {
            "marketBias": "bullish|bearish|neutral",
            "usdImpact": "strong|weak|neutral",
            "goldImpact": "bullish|bearish|neutral",
            "riskLevel": "low|medium|high",
            "shouldBlockBuy": true,
            "shouldBlockSell": false,
            "summary": "สรุปภาษาไทยสั้นๆ",
            "reasoning": [
                "ข้อ 1",
                "ข้อ 2"
            ]
            }

            ข่าว:
            ${JSON.stringify(newsItems, null, 2)}
            `;

    const body = {
        contents: [
            {
                parts: [{ text: prompt }]
            }
        ]
    };

    console.log("Analyze News.");

    const resp = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" }
    });

    const text =
        resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return text;
}

async function analyzeMotherFishWithGemini(apiKey, prompt) {
    // const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

//     const prompt = `
// คุณเป็น AI Trading Analyst สำหรับ XAUUSD

// วิเคราะห์ข่าวต่อไปนี้ แล้วสรุปเป็น JSON เท่านั้น
// ต้องตอบเป็น JSON รูปแบบนี้:

// {
//   "marketBias": "bullish|bearish|neutral",
//   "usdImpact": "strong|weak|neutral",
//   "goldImpact": "bullish|bearish|neutral",
//   "riskLevel": "low|medium|high",
//   "shouldBlockBuy": true,
//   "shouldBlockSell": false,
//   "summary": "สรุปภาษาไทยสั้นๆ",
//   "reasoning": [
//     "ข้อ 1",
//     "ข้อ 2"
//   ]
// }

// ข่าว:
// ${JSON.stringify(newsItems, null, 2)}
// `;

    const body = {
        contents: [
            {
                parts: [{ text: prompt }]
            }
        ]
    };

    const resp = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" }
    });

    const text =
        resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return text;
}

module.exports = { analyzeWithGemini, analyzeMotherFishWithGemini };