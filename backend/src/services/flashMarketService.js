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

    const gameState = {
        fixtureId,
        timer: elapsed * 60, // seconds
        lastApiUpdate: Date.now(),
        markets: matchData.markets || this.generateMarkets(matchData)
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

  handleMatchUpdate(matchData) {
      const fixtureId = matchData.fixture.id;
      const gameState = this.activeGames.get(fixtureId);

      if (gameState) {
          const apiElapsed = matchData.fixture.status.elapsed;
          const statusShort = matchData.fixture.status.short;

          // Check for Period End (HT/FT) to Close Stoppage Markets
          if (['PAUSED', 'FINISHED', 'HT', 'FT'].includes(statusShort)) {
              this.closeStoppageMarkets(gameState);
          }

          // Sync Markets if provided (e.g. from Debug Match Heartbeat)
          if (matchData.markets) {
              gameState.markets = matchData.markets;
          }

          // Tight sync: If updates are coming, we trust the API timestamp more
          // Sync if off by > 5 seconds
          const diff = Math.abs((apiElapsed * 60) - gameState.timer);

          if (diff > 5) {
              gameState.timer = apiElapsed * 60;
          }

          // Regenerate markets based on latest match state (handles Stoppage/Standard transition)
          gameState.markets = this.generateMarkets(matchData);
          this.emitUpdate(gameState);

      } else {
          this.startTracking(fixtureId, matchData);
      }
  }

  closeStoppageMarkets(gameState) {
      const allMarkets = this.getAllMarkets(gameState.markets);
      let changed = false;
      allMarkets.forEach(market => {
          if (market?.type?.startsWith('stoppage_') && market.status === 'OPEN') {
              console.log(`[FLASH] Closing Stoppage Market: ${market.id}`);
              this.resolveMarket(market, 'LOSS'); // Default to LOSS if event didn't happen
              market.status = 'CLOSED';
              changed = true;
          }
      });
      if (changed) this.emitUpdate(gameState);
  }

  handleGoal(fixtureId) {
      const gameState = this.activeGames.get(fixtureId);
      if (!gameState) return;

      const allMarkets = this.getAllMarkets(gameState.markets);
      let changed = false;

      allMarkets.forEach(market => {
          if (market.status !== 'OPEN') return;

          // Resolve Goal Markets
          if (market.type.includes('goal') || market.type === '1x2_period' || market.type === 'over_under_period') {
             if (market.type === 'flash_goal' || market.type === 'goal_period' || market.type === 'stoppage_goal') {
                 console.log(`[FLASH] Goal! Resolving ${market.id}`);
                 this.resolveMarket(market, 'WIN');
                 market.status = 'WIN';
                 changed = true;
             }
          }
      });

      if (changed) this.emitUpdate(gameState);
  }

  resolveMarket(market, result) {
      market.status = result;
  }

  processTick() {
      this.activeGames.forEach((gameState, fixtureId) => {
          this.evaluateMarkets(gameState);
          this.emitUpdate(gameState);
      });
  }

  evaluateMarkets(gameState) {
      if (gameState.timer > 120 * 60) return; // Game over

      const allMarkets = this.getAllMarkets(gameState.markets);

      allMarkets.forEach(market => {
          if (market.status !== 'OPEN') return;

          // Expiration
          if (market.windowEnd) {
              const endSec = market.windowEnd * 60;
              if (gameState.timer >= endSec) {
                  this.resolveMarket(market, 'LOSS');
                  market.status = 'CLOSED';
                  // Rotation is now handled by generateMarkets on update
              }
          }

          // Progress
          if (market.status === 'OPEN') {
              if (market.type.startsWith('stoppage_')) {
                  market.progress = 99; // Keep full bar to show active
              } else if (market.windowStart !== undefined && market.windowEnd !== undefined) {
                  const startSec = market.windowStart * 60;
                  const endSec = market.windowEnd * 60;
                  const durationSec = endSec - startSec;
                  const secondsInWindow = gameState.timer - startSec;

                  if (secondsInWindow >= 0) {
                      market.progress = Math.min(100, Math.max(0, (secondsInWindow / durationSec) * 100));
                  } else {
                      market.progress = 0;
                  }
              }
          }

          // Odds Fluctuation
          if (market.status === 'OPEN') {
              this.fluctuateOdds(market);
          }
      });
  }

  fluctuateOdds(market) {
      const change = (Math.random() * 0.04) - 0.02;

      if (market.odds.yes) {
          market.odds.yes = Math.max(1.01, parseFloat((market.odds.yes + change).toFixed(2)));
          if (market.odds.no) market.odds.no = Math.max(1.01, parseFloat((market.odds.no - change).toFixed(2)));
      } else if (market.odds.home) {
          ['home', 'draw', 'away'].forEach(k => {
              const delta = (Math.random() * 0.02) - 0.01;
              market.odds[k] = Math.max(1.01, parseFloat((market.odds[k] + delta).toFixed(2)));
          });
      } else if (market.odds.over) {
          market.odds.over = Math.max(1.01, parseFloat((market.odds.over + change).toFixed(2)));
          market.odds.under = Math.max(1.01, parseFloat((market.odds.under - change).toFixed(2)));
      }
  }

  getAllMarkets(marketsStructure) {
      let flat = [];
      if (!marketsStructure) return [];
      if (Array.isArray(marketsStructure)) return marketsStructure;
      Object.values(marketsStructure).forEach(list => {
          if (Array.isArray(list)) flat.push(...list);
      });
      return flat;
  }

  emitUpdate(gameState) {
      if (this.io) {
          this.io.to(`game_${gameState.fixtureId}`).emit('flash_update', {
              timer: gameState.timer,
              markets: gameState.markets // Send array directly
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
      // Search in Groups
      const allMarkets = this.getAllMarkets(gameState.markets);
      market = allMarkets.find(m => m.id === marketId);

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

  generateMarkets(match) {
      // API-Football Fields Extraction
      // Use adaptMatchData mapping from RealDataService (match.fixture.status...)

      const m = match.fixture.status.elapsed;
      if (typeof m !== 'number') return {};

      const fId = match.fixture.id;
      const rawStatus = match.fixture.status.raw || match.fixture.status.short;
      const status = match.fixture.status.short; // mapped status
      const extraTime = match.fixture.status.extra || 0;

      // 1. Absolute Status Locks
      if (rawStatus === 'HT') return { "Intervalo": [] };
      if (status === 'FINISHED') return { "Fim de Jogo": [] };

      // 2. Stoppage Time Check (Native Logic)
      // Stoppage is when extraTime > 0 OR explicit status context implies it (like 45+ or 90+)
      // But prompt says: "use match.minute e match.extraTime"
      // "isStoppage = match.extraTime > 0 || (m === 45 && match.rawStatus === '1H') || (m === 90 && match.rawStatus === '2H')"

      const isStoppage = (extraTime > 0) || (m === 45 && rawStatus === '1H') || (m >= 90 && rawStatus === '2H');

      if (isStoppage) {
          return {
              "Acréscimos (Decisão Final)": [
                  {
                      id: `stop_${fId}`,
                      type: 'stoppage_goal',
                      title: "Gol nos Acréscimos?",
                      status: 'OPEN',
                      odds: { yes: 4.50, no: 1.15 }
                  }
              ]
          };
      }

      // 3. Standard Markets
      // Ensure 'type' is always defined
      return {
          "Apostas de 1 Min": [
              {
                  id: `f1_${fId}_${m}`,
                  type: 'flash_1',
                  title: `Gol entre ${m}:00 e ${m}:59?`,
                  windowStart: m,
                  windowEnd: m + 1,
                  status: 'OPEN',
                  odds: { yes: 3.50, no: 1.25 }
              }
          ],
           "Apostas de 5 Min": [
              {
                  id: `goal5_${fId}_${m}`,
                  type: 'goal_period',
                  title: `Gol nos próximos 5 min?`,
                  windowStart: m,
                  windowEnd: m + 5,
                  status: 'OPEN',
                  odds: { yes: 2.50, no: 1.50 }
              }
          ]
      };
  }
}

module.exports = new FlashMarketService();
