const fs = require("fs");

function buildCalendarState(events) {
    const now = new Date();

    const usdEvents = events
        .filter(e => {
            const country = String(e.Country || "").toUpperCase();
            const importance = String(e.Importance || "").toLowerCase();
            return country.includes("UNITED STATES") || country === "US";
        })
        .map(e => {
            const eventTime = new Date(e.Date);
            const diffMin = Math.floor((eventTime.getTime() - now.getTime()) / 60000);

            return {
                event: e.Event,
                date: e.Date,
                importance: e.Importance,
                actual: e.Actual,
                previous: e.Previous,
                forecast: e.Forecast,
                diffMin
            };
        })
        .sort((a, b) => a.diffMin - b.diffMin);

    const highImpact = usdEvents.find(e =>
        ["high", "3"].includes(String(e.importance).toLowerCase())
    );

    let blockTrading = false;
    let reason = "normal";

    if (highImpact && highImpact.diffMin <= 30 && highImpact.diffMin >= -15) {
        blockTrading = true;
        reason = `high_impact_event_${highImpact.event}`;
    }

    return {
        updatedAt: now.toISOString(),
        nextHighImpact: highImpact || null,
        blockTrading,
        reason,
        events: usdEvents.slice(0, 10)
    };
}

function writeCalendarState(filePath, state) {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    return state;
}

function readCalendarState(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
    buildCalendarState,
    writeCalendarState,
    readCalendarState
};