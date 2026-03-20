const fs = require("fs");

function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
        return JSON.parse(cleaned);
    }
}

function writeFilter(outputPath, rawText) {
    const parsed = safeParseJson(rawText);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const riskLevel = parsed.riskLevel || "medium";
    const shouldBlockBuy = Boolean(parsed.shouldBlockBuy);
    const shouldBlockSell = Boolean(parsed.shouldBlockSell);

    const payload = {
        updatedAt: now.toISOString(),
        expiresAt,
        marketBias: parsed.marketBias || "neutral",
        usdImpact: parsed.usdImpact || "neutral",
        goldImpact: parsed.goldImpact || "neutral",
        riskLevel,
        shouldBlockBuy,
        shouldBlockSell,
        canTrade: riskLevel !== "high",
        summary: parsed.summary || "",
        reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : []
    };

    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
    return payload;
}

/* ------------------------------
   NEW FUNCTION
-------------------------------- */

function readFilter(filePath = "./trade-filter.json") {

    if (!fs.existsSync(filePath)) {

        return {
            marketBias: "neutral",
            riskLevel: "medium",
            canTrade: true,
            summary: ""
        };

    }

    const data = fs.readFileSync(filePath, "utf8");

    return JSON.parse(data);

}

module.exports = {
    writeFilter,
    readFilter
};