const fs = require("fs");

function learnPatternWeights() {

    const dataDir = path.join(__dirname, "../data");
    const learningDir = path.join(__dirname, "learning");

    // const historyFile = "../data/trade-history.json";
    // const weightFile = "./pattern-weight.json";

    const historyFile = path.join(dataDir, "trade-history.json");
    const weightFile = path.join(learningDir, "pattern-weight.json");

    if (!fs.existsSync(historyFile)) return;

    const history = JSON.parse(fs.readFileSync(historyFile));

    const stats = {};

    history.forEach(trade => {

        if (!stats[trade.pattern]) {
            stats[trade.pattern] = {
                win: 0,
                loss: 0
            };
        }

        if (trade.result === "WIN") {
            stats[trade.pattern].win++;
        } else {
            stats[trade.pattern].loss++;
        }

    });

    const weights = {};

    for (const pattern in stats) {

        const { win, loss } = stats[pattern];

        const winRate = win / (win + loss);

        const score = (winRate - 0.5) * 10;

        weights[pattern] = Number(score.toFixed(2));

    }

    fs.writeFileSync(weightFile, JSON.stringify(weights, null, 2));

    return weights;

}

module.exports = { learnPatternWeights };