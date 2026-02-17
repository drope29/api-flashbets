class FlashMarketService {
  constructor() {
    this.activeGames = new Map(); // fixtureId -> { timer, currentMarket, nextMarket, ... }
    this.io = null;

    // High frequency ticker (1s)
    setInterval(() => this.processTick(), 1000);
  }

  setIo(io) {
    this.io = io;
  }

  startTracking(fixtureId, matchData) {
    if (this.activeGames.has(fixtureId)) return;

    // Safety: Don't track FINISHED games
    if (['FINISHED', 'AWARDED', 'FT'].includes(matchData.fixture.status.short)) {
        console.log(`[FLASH] Skipping finished game ${fixtureId}`);
        return;
    }

    console.log(`[FLASH] Starting Flash Markets for Game ${fixtureId}`);

    // Initialize Game State
    // Calculate initial 5-min window
    const elapsed = matchData.fixture.status.elapsed || 0;
    const windowStart = Math.floor(elapsed / 5) * 5;

    const gameState = {
        fixtureId,
        timer: elapsed * 60, // seconds
        lastApiUpdate: Date.now(),
        markets: {
            current: this.createMarket(fixtureId, windowStart, windowStart + 5),
            next: this.createMarket(fixtureId, windowStart + 5, windowStart + 10)
        }
    };

    this.activeGames.set(fixtureId, gameState);
    this.emitUpdate(gameState);
  }

  stopTracking(fixtureId) {
    if (this.activeGames.has(fixtureId)) {
        console.log(`[FLASH] Stopping Flash Markets for Game ${fixtureId}`);
        this.activeGames.delete(fixtureId);
    }
  }

  createMarket(fixtureId, startMin, endMin) {
    return {
        id: `${fixtureId}_${startMin}_${endMin}`,
        type: 'interval_goal',
        marketTitle: 'Goal in next 5 min', // Simple Title
        intervalLabel: `${startMin}:00 - ${endMin}:00`, // Explicit Interval
        startMin,
        endMin,
        status: 'OPEN',
        progress: 0, // 0-100
        odds: {
            yes: 1.80,
            no: 1.80
        }
    };
  }

  handleMatchUpdate(matchData) {
      const fixtureId = matchData.fixture.id;
      const gameState = this.activeGames.get(fixtureId);

      if (gameState) {
          const apiElapsed = matchData.fixture.status.elapsed;
          const internalMinutes = Math.floor(gameState.timer / 60);

          // Tight sync: If 30s updates are coming, we trust the API timestamp more
          // Sync if off by > 5 seconds
          const diff = Math.abs((apiElapsed * 60) - gameState.timer);

          if (diff > 5) {
              console.log(`[FLASH] Syncing Timer: Internal ${Math.floor(gameState.timer)}s -> API ${apiElapsed * 60}s`);
              gameState.timer = apiElapsed * 60;
          }

          // Force process tick to ensure markets update immediately with new data
          // this.processTick(); // Careful not to double tick, let interval handle it or just update markets logic here if needed
      } else {
          this.startTracking(fixtureId, matchData);
      }
  }

  handleGoal(fixtureId) {
      const gameState = this.activeGames.get(fixtureId);
      if (gameState && gameState.markets.current.status === 'OPEN') {
          console.log(`[FLASH] Goal Detected! Resolving Market: ${gameState.markets.current.intervalLabel}`);
          this.resolveMarket(gameState.markets.current, 'WIN');
          gameState.markets.current.status = 'WIN';
          this.emitUpdate(gameState);
      }
  }

  resolveMarket(market, result) {
      market.status = result;
  }

  processTick() {
      this.activeGames.forEach((gameState, fixtureId) => {
          // Check for game over (timer > 100 min or manual flag)
          // Ideally check 'status' from update, but for now safe limit
          if (gameState.timer > 120 * 60) {
              this.stopTracking(fixtureId);
              return;
          }

          gameState.timer += 1;

          const currentMin = Math.floor(gameState.timer / 60);

          // Check Window Expiration
          if (currentMin >= gameState.markets.current.endMin) {
              if (gameState.markets.current.status === 'OPEN') {
                  this.resolveMarket(gameState.markets.current, 'LOSS');
              }

              // Rotate Markets
              const oldNext = gameState.markets.next;
              gameState.markets.current = oldNext;

              const newStart = oldNext.endMin;
              const newEnd = newStart + 5;
              gameState.markets.next = this.createMarket(fixtureId, newStart, newEnd);
          }

          // Volatility / Odds Calculation
          if (gameState.markets.current.status === 'OPEN') {
              const windowStartSec = gameState.markets.current.startMin * 60;
              const secondsInWindow = gameState.timer - windowStartSec;
              const durationSec = 300; // 5 mins

              // Calculate Progress (0-100)
              const progress = Math.min(100, Math.max(0, (secondsInWindow / durationSec) * 100));
              gameState.markets.current.progress = progress;

              // Odds Logic
              const volatility = secondsInWindow * 0.01;
              const newYes = 1.80 + volatility;

              const decay = secondsInWindow * 0.0025;
              const newNo = Math.max(1.05, 1.80 - decay);

              gameState.markets.current.odds.yes = parseFloat(newYes.toFixed(2));
              gameState.markets.current.odds.no = parseFloat(newNo.toFixed(2));
          }

          this.emitUpdate(gameState);
      });
  }

  emitUpdate(gameState) {
      if (this.io) {
          // Send simplified structure
          this.io.to(`game_${gameState.fixtureId}`).emit('flash_update', {
              timer: gameState.timer,
              markets: {
                  current: {
                      id: gameState.markets.current.id,
                      title: gameState.markets.current.marketTitle,
                      interval: gameState.markets.current.intervalLabel,
                      progress: gameState.markets.current.progress,
                      status: gameState.markets.current.status,
                      odds: gameState.markets.current.odds
                  },
                  // We can skip 'next' if we want to simplify UI, but let's keep it for context if needed
                  next: {
                      id: gameState.markets.next.id,
                      title: gameState.markets.next.marketTitle,
                      interval: gameState.markets.next.intervalLabel,
                      status: gameState.markets.next.status,
                      odds: gameState.markets.next.odds
                  }
              }
          });
      }
  }

  placeBet(betData, socketId) {
      const { marketId, selection, odd, amount } = betData;
      const fixtureId = marketId.split('_')[0];
      const gameState = this.activeGames.get(parseInt(fixtureId)) || this.activeGames.get(fixtureId);

      if (!gameState) {
          if (this.io) this.io.to(socketId).emit('bet_rejected', { reason: 'Game not found' });
          return;
      }

      let market = null;
      if (gameState.markets.current.id === marketId) market = gameState.markets.current;
      else if (gameState.markets.next.id === marketId) market = gameState.markets.next;

      if (!market || market.status !== 'OPEN') {
          if (this.io) this.io.to(socketId).emit('bet_rejected', { reason: 'Market closed' });
          return;
      }

      console.log(`[FLASH] New Bet Accepted! R$ ${amount} on ${selection} @ ${odd}`);
      if (this.io) {
          this.io.to(socketId).emit('bet_accepted', {
              marketId, selection, odd, amount, timestamp: new Date()
          });
      }
  }
}

module.exports = new FlashMarketService();
