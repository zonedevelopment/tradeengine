async function analyzeTrade(data) {

    const market =
        await getMarketData();

    const news =
        await getNewsAnalysis();

    const pattern =
        await analyzePattern(data);

    const decision =
        await openclawAgent.run({
            task: "analyze_trade",
            market,
            news,
            pattern
        });

    return decision;

}

module.exports = { analyzeTrade };