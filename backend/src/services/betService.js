const { v4: uuidv4 } = require('uuid');

class BetService {
    constructor() {
        this.activeBets = [];
        this.io = null;
        this.usersDb = null;
    }

    setIo(io) {
        this.io = io;
    }

    setUsersDb(db) {
        this.usersDb = db;
    }

    placeBet(betData, socketId) {
        const bet = {
            id: uuidv4(),
            socketId: socketId,
            userId: betData.userId, // Link to user account
            matchId: parseInt(betData.matchId),
            marketId: betData.marketId,
            type: betData.type,
            option: betData.option,
            windowEnd: betData.windowEnd,
            initialScore: betData.currentScore,
            amount: parseFloat(betData.amount),
            odd: parseFloat(betData.odd),
            status: 'PENDING',
            placedAt: Date.now()
        };

        this.activeBets.push(bet);
        console.log(`[BET] New Bet Placed: ${bet.id} on Match ${bet.matchId} (${bet.type} - ${bet.option}) by ${bet.userId}`);

        return bet;
    }

    hasPendingBetsForMatch(matchId) {
        return this.activeBets.some(b => b.matchId === matchId && b.status === 'PENDING');
    }

    resolveBets(liveMatches) {
        if (this.activeBets.length === 0) return;

        let resolvedCount = 0;

        this.activeBets.forEach(bet => {
            if (bet.status !== 'PENDING') return;

            const match = liveMatches.find(m => m.fixture.id === bet.matchId);
            if (!match) return;

            const currentMinute = match.fixture.status.elapsed;
            const currentScore = `${match.goals.home}-${match.goals.away}`;
            const isFinished = ['FINISHED', 'FT', 'AET', 'PEN'].includes(match.fixture.status.short);

            if (currentMinute > bet.windowEnd || isFinished) {
                console.log(`\n⚖️ [JUIZ] RESOLVENDO APOSTA: ${bet.id}`);
                console.log(`Placar Inicial: ${bet.initialScore} | Placar Atual: ${currentScore}`);

                this.settleBet(bet, currentScore);
                resolvedCount++;
            }
        });

        if (resolvedCount > 0) {
            this.activeBets = this.activeBets.filter(b => b.status === 'PENDING');
        }
    }

    settleBet(bet, finalScore) {
        let isWin = false;

        const parseScore = (scoreStr) => {
            const parts = scoreStr.split('-').map(s => parseInt(s.trim()));
            return { home: parts[0], away: parts[1] };
        };

        const initial = parseScore(bet.initialScore);
        const final = parseScore(finalScore);

        const goalHappened = (final.home !== initial.home) || (final.away !== initial.away);

        if (bet.type.includes('goal') || bet.type === 'flash_1' || bet.type === 'stoppage_goal') {
             if (bet.option === 'YES' && goalHappened) isWin = true;
             else if (bet.option === 'NO' && !goalHappened) isWin = true;
        }
        else if (bet.type.includes('1x2')) {
             const homeDiff = final.home - initial.home;
             const awayDiff = final.away - initial.away;
             if (bet.option === 'Home' && homeDiff > awayDiff) isWin = true;
             else if (bet.option === 'Away' && awayDiff > homeDiff) isWin = true;
             else if (bet.option === 'Draw' && homeDiff === awayDiff) isWin = true;
        }

        bet.status = isWin ? 'WIN' : 'LOSS';
        const payout = isWin ? (bet.amount * bet.odd) : 0;

        // Credit to "Bank" (Users DB)
        let newBalance = 0;
        if (this.usersDb && bet.userId && this.usersDb[bet.userId]) {
            if (isWin) {
                this.usersDb[bet.userId].balance += payout;
            }
            newBalance = this.usersDb[bet.userId].balance;
        }

        console.log(`Resultado: ${bet.status} | Payout: R$ ${payout} | User Balance: ${newBalance}`);

        if (this.io) {
            this.io.to(bet.socketId).emit('bet_resolved', {
                bet: bet,
                payout: payout,
                finalScore: finalScore,
                newBalance: newBalance // Sync authoritative balance
            });
        }
    }
}

module.exports = new BetService();
