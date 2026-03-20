const fs = require("fs");
const path = require("path");

// const rawFile = path.join(__dirname, "raw-sources.json");
const cleanFile = path.join(__dirname, "sources.json");

function safeReadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const raw = fs.readFileSync(file, "utf8").trim();
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.log("safeReadJson error:", file, err.message);
        return fallback;
    }
}

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function similarityScore(a, b) {
    const sa = new Set(normalizeText(a).split(" ").filter(Boolean));
    const sb = new Set(normalizeText(b).split(" ").filter(Boolean));

    if (sa.size === 0 || sb.size === 0) return 0;

    let common = 0;
    for (const word of sa) {
        if (sb.has(word)) common++;
    }

    return common / Math.max(sa.size, sb.size);
}

function looksTooGeneric(text) {
    const t = normalizeText(text);

    const genericPhrases = [
        "แนวรับแนวต้าน",
        "ปิดเกิน 50",
        "กลางกรอบ",
        "price action",
        "buy sell",
        "timeframe m5",
        "แท่งเขียวแท่งแดง"
    ];

    let hit = 0;
    for (const p of genericPhrases) {
        if (t.includes(normalizeText(p))) hit++;
    }

    return t.length < 40 || hit >= 2;
}

function hasUsefulSignal(text) {
    const t = normalizeText(text);

    const usefulKeywords = [
        "liquidity",
        "sweep",
        "momentum",
        "session",
        "news",
        "false breakout",
        "volume",
        "invalid",
        "avoid",
        "cut loss",
        "take profit",
        "entry",
        "exit",
        "structure",
        "hh",
        "hl",
        "lh",
        "ll",
        "demand",
        "supply",
        "order block",
        "swing",
        "retest",
        "confirmation",
        "stop loss",
        "new york",
        "london"
    ];

    return usefulKeywords.some((k) => t.includes(normalizeText(k)));
}

function dedupeAndClean(rawItems, existingItems) {
    const kept = [...existingItems];
    const newAccepted = [];

    for (const item of rawItems) {
        const content = String(item.content || "").trim();
        if (!content) continue;

        const duplicate = kept.some(
            (x) => similarityScore(x.content || "", content) >= 0.8
        );

        if (duplicate) continue;

        const useful = hasUsefulSignal(content);
        const generic = looksTooGeneric(content);

        if (!useful && generic) continue;

        const cleanedItem = {
            source: item.source || "unknown",
            keyword: item.keyword || "",
            title: item.title || "",
            content,
            url: item.url || "",
            timestamp: item.timestamp || new Date().toISOString()
        };

        kept.push(cleanedItem);
        newAccepted.push(cleanedItem);
    }

    return { merged: kept, newAccepted };
}

// function runSourceCleaner() {
//     const rawItems = safeReadJson(rawFile, []);
//     const existingItems = safeReadJson(cleanFile, []);

//     const { merged, newAccepted } = dedupeAndClean(rawItems, existingItems);

//     fs.writeFileSync(cleanFile, JSON.stringify(merged, null, 2), "utf8");

//     console.log("source-cleaner done");
//     console.log("raw items:", rawItems.length);
//     console.log("accepted new items:", newAccepted.length);
//     console.log("total clean items:", merged.length);

//     return {
//         rawCount: rawItems.length,
//         acceptedCount: newAccepted.length,
//         totalCount: merged.length,
//         acceptedItems: newAccepted
//     };
// }

if (require.main === module) {
    runSourceCleaner();
}

module.exports = { runSourceCleaner };