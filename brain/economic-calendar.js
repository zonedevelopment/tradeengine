const axios = require("axios");

let cachedEvents = [];

async function fetchCalendar() {

    try {

        const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

        const res = await axios.get(url);

        cachedEvents = res.data;

        console.log("Economic calendar updated");

    } catch (err) {

        console.log("calendar fetch error", err.message);

    }

}

function checkCalendar() {
    // fetchCalendar()
    const now = new Date();

    for (const event of cachedEvents) {

        const impact = event.impact;

        if (impact !== "High")
            continue;

        const eventTime = new Date(event.date);

        const diffMinutes =
            (eventTime - now) / 60000;

        if (diffMinutes > -10 && diffMinutes < 30) {

            return {
                blockTrading: true,
                reason: event.title,
                currency: event.currency
            };

        }

    }

    return {
        blockTrading: false
    };

}

module.exports = {
    fetchCalendar,
    checkCalendar
};