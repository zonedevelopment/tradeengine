const fs = require("fs");
const axios = require("axios");
const path = require("path");

const sourcesFile = path.join(__dirname, "sources.json");

const KEYWORDS = [
    "แม่ปลาปากกาเขียว เทรดทอง",
    "mother fish trading strategy gold",
    "แม่ปลา trading system เข้าออเดอร์",
    "price action mother fish trading"
];

async function searchWeb(keyword) {

    const url =
        "https://api.duckduckgo.com/?q=" +
        encodeURIComponent(keyword) +
        "&format=json";

    const res = await axios.get(url);

    if (!res.data.RelatedTopics)
        return [];

    const results = res.data.RelatedTopics
        .filter(x => x.Text)
        .map(x => ({
            source: "web-search",
            keyword,
            content: x.Text,
            timestamp: new Date().toISOString()
        }));

    return results;

}

function loadSources() {

    if (!fs.existsSync(sourcesFile))
        return [];

    const raw = fs.readFileSync(sourcesFile, "utf8");

    if (!raw.trim())
        return [];

    return JSON.parse(raw);

}

async function runSocialListener() {

    const sources = loadSources();

    let newItems = [];

    for (const keyword of KEYWORDS) {

        try {

            const results =
                await searchWeb(keyword);

            newItems =
                newItems.concat(results);

        } catch (err) {

            console.log(
                "search error",
                err.message
            );

        }

    }

    const merged = [...sources, ...newItems];

    fs.writeFileSync(
        sourcesFile,
        JSON.stringify(merged, null, 2)
    );

    console.log(
        "Web listening added",
        newItems.length,
        "items"
    );

}

runSocialListener();