const axios = require("axios");

async function analyzeWithGemini(apiKey) {
    // const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // const prompt = `
    //         คุณเป็น AI Trading Analyst สำหรับ XAUUSD

    //         วิเคราะห์ข่าวต่อไปนี้ แล้วสรุปเป็น JSON เท่านั้น
    //         ต้องตอบเป็น JSON รูปแบบนี้:

    //         {
    //         "marketBias": "bullish|bearish|neutral",
    //         "usdImpact": "strong|weak|neutral",
    //         "goldImpact": "bullish|bearish|neutral",
    //         "riskLevel": "low|medium|high",
    //         "shouldBlockBuy": true,
    //         "shouldBlockSell": false,
    //         "summary": "สรุปภาษาไทยสั้นๆ",
    //         "reasoning": [
    //             "ข้อ 1",
    //             "ข้อ 2"
    //         ]
    //         }

    //         ข่าว:
    //         ${JSON.stringify(newsItems, null, 2)}
    //         `;

    const prompt = `
    # Role
    คุณเป็น Senior Global Macro Analyst ผู้เชี่ยวชาญด้านการวิเคราะห์ปัจจัยพื้นฐาน (Fundamental) และความสัมพันธ์ระหว่างสินทรัพย์ (Intermarket Analysis) ในตลาด Forex, Commodities และ Indices

    # Task
    1. ค้นหาและวิเคราะห์ข่าวเศรษฐกิจล่าสุดในรอบ 24 ชั่วโมง ที่มีผลกระทบโดยตรงต่อคู่เทรดที่ระบุใน [Target Symbols]
    2. วิเคราะห์แรงขับเคลื่อนของค่าเงิน (Currency Strength) และทิศทางของสินทรัพย์อ้างอิง
    3. ประเมินความเสี่ยงและผลกระทบ (High/Medium/Low Impact) ตามตารางข่าวเศรษฐกิจ (เช่น Forex Factory)
    4. สรุปผลลัพธ์เป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น

    # Target Symbols
    ${JSON.stringify(["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD"])} 

    # Constraints & Logic
    - วิเคราะห์ผลกระทบแบบ "Cross-Currency": เช่น หากข่าว USD แข็งค่า ให้ประเมินผลลัพธ์ต่อคู่ที่มี USD เป็นส่วนประกอบทั้งหมด
    - หากข่าวเป็น "High Impact" (ตัวเลขแดง) ให้ตั้งค่า riskLevel เป็น "high" และพิจารณา block ฝั่งที่สวนทางกับตัวเลขจริง
    - การตัดสินใจ 'shouldBlock' ให้พิจารณาจาก Momentum ของข่าวในระยะสั้น (Intraday Bias)

    # Output Format (JSON Only)
    {
    "symbol": "ชื่อคู่เทรด เช่น XAUUSD",
    "marketBias": "bullish|bearish|neutral",
    "baseCurrencyImpact": "strong|weak|neutral",
    "quoteCurrencyImpact": "strong|weak|neutral",
    "riskLevel": "low|medium|high",
    "shouldBlockBuy": boolean,
    "shouldBlockSell": boolean,
    "summary": "สรุปสถานการณ์ของคู่นี้เป็นภาษาไทยสั้นๆ",
    "reasoning": [
        "เหตุผลที่ 1 จากตัวเลขเศรษฐกิจ...",
        "เหตุผลที่ 2 จากความเชื่อมั่นตลาด..."
    ]
    }

    # Source Context
    ค้นหาข่าวล่าสุดและวิเคราะห์แยกตามรายชื่อใน [Target Symbols] โดยตอบกลับเป็น "Array of JSON objects"
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