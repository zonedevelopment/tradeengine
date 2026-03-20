const crypto = require('crypto');

// ... (existing helper functions) ...

function generateContextHash(candles) {
    if (!candles || candles.length === 0) return null;
    const relevantCandles = candles.slice(-10); // Use last 10 candles for context
    const candleShapes = relevantCandles.map(c => {
        const body = Math.abs(c.close - c.open);
        const upperWick = c.high - Math.max(c.open, c.close);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const total = c.high - c.low;
        if (total === 0) return 'doji';
        const bodyRatio = body / total;
        const upperWickRatio = upperWick / total;
        const lowerWickRatio = lowerWick / total;

        if (bodyRatio < 0.2) return 'doji';
        if (upperWickRatio > 0.6) return 'shooting_star_shape';
        if (lowerWickRatio > 0.6) return 'hammer_shape';
        if (c.close > c.open) return 'bullish';
        return 'bearish';
    });
    const stringToHash = candleShapes.join(',');
    return crypto.createHash('md5').update(stringToHash).digest('hex');
}

// ... (inside runDailyLearning) ...

let failedPatterns = {};
if (fs.existsSync(failedPatternsPath)) {
    try {
        failedPatterns = JSON.parse(fs.readFileSync(failedPatternsPath, 'utf8'));
    } catch(e) {}
}

// ... (inside the loop for processing trades) ...
if (matchedCandleLog) {
    const isWin = t.profit > 0;
    
    // Feature Extraction for failure analysis
    if (!isWin) {
        const contextHash = generateContextHash(matchedCandleLog.candles);
        if (contextHash) {
            if (!failedPatterns[contextHash]) {
                const triggerPattern = detectMotherFishPattern({ candles: matchedCandleLog.candles }).type;
                failedPatterns[contextHash] = {
                    failureCount: 0,
                    wins: 0,
                    description: `A ${triggerPattern} pattern that failed after a sequence of candles.`,
                    firstSeen: new Date().toISOString(),
                    lastSeen: '',
                    status: 'MONITORING'
                };
            }
            failedPatterns[contextHash].failureCount++;
            failedPatterns[contextHash].lastSeen = new Date().toISOString();
        }
    } else { // It's a WIN
        const contextHash = generateContextHash(matchedCandleLog.candles);
        if (contextHash && failedPatterns[contextHash]) {
            failedPatterns[contextHash].wins++;
        }
    }

    // Update Status based on new counts
    for (const hash in failedPatterns) {
        const pattern = failedPatterns[hash];
        const totalTrades = pattern.wins + pattern.failureCount;
        if (totalTrades < 5) {
            pattern.status = 'MONITORING'; // Not enough data yet
        } else {
            const failureRate = (pattern.failureCount / totalTrades) * 100;
            if (failureRate >= 70) {
                pattern.status = 'BLACKLIST';
            } else if (failureRate >= 55) {
                pattern.status = 'WARNING';
            } else {
                pattern.status = 'WHITELIST'; // It's actually a winning pattern
            }
        }
    }

    // ... (rest of the mapping logic) ...
}

// ... (after the loop) ...
fs.writeFileSync(failedPatternsPath, JSON.stringify(failedPatterns, null, 2));

console.log('[Daily Learner] Failed Patterns database updated.');
