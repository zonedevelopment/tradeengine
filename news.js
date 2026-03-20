const axios = require("axios");

async function fetchNews() {

    const apiKey = process.env.NEWS_API_KEY;

    const url = "https://newsapi.org/v2/everything";

    const query = "gold OR xauusd OR federal reserve OR inflation OR usd";

    const res = await axios.get(url, {
        params: {
            q: query,
            language: "en",
            sortBy: "publishedAt",
            pageSize: 10,
            apiKey: apiKey
        }
    });

    const articles = res.data.articles || [];

    const news = articles.map(a => ({
        title: a.title,
        description: a.description,
        source: a.source?.name,
        time: a.publishedAt
    }));

    return news;
}

module.exports = { fetchNews };