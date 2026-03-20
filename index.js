require("dotenv").config();
const cron = require("node-cron");
const { fetchNews } = require("./news");
const { analyzeWithGemini } = require("./gemini");
const { writeFilter } = require("./filter-writer");
const { sendTelegram } = require("./telegram");

async function runOnce() {
    try {
        const news = await fetchNews();

        const raw = await analyzeWithGemini(
            process.env.GEMINI_API_KEY,
            news
        );

        const filter = writeFilter(process.env.FILTER_OUTPUT, raw);

        const msg =
            `สรุปข่าวทองคำล่าสุด
            Bias ตลาด: ${filter.marketBias}
            ผลต่อ USD: ${filter.usdImpact}
            ผลต่อทอง: ${filter.goldImpact}
            ความเสี่ยง: ${filter.riskLevel}
            Block Buy: ${filter.shouldBlockBuy}
            Block Sell: ${filter.shouldBlockSell}

            สรุป:
            ${filter.summary}

            เหตุผล:
            - ${filter.reasoning.join("\n- ")}`;

        await sendTelegram(
            process.env.TELEGRAM_BOT_TOKEN,
            process.env.TELEGRAM_CHAT_ID,
            msg
        );

        console.log("done");
    } catch (err) {
        console.error("runOnce error:", err.response?.data || err.message);
    }
}

// ทดสอบรันทันที 1 ครั้ง
runOnce();

// ตั้งให้รันทุก 10 นาที
cron.schedule("*/10 * * * *", async () => {
    await runOnce();
});