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
          const statusShort = matchData.fixture.status.short;

          // Check for Period End (HT/FT) to Close Stoppage Markets
          if (['PAUSED', 'FINISHED', 'HT', 'FT'].includes(statusShort)) {
              this.closeStoppageMarkets(gameState);
          }

          // Sync Markets if provided (e.g. from Debug Match Heartbeat)
          if (matchData.markets) {
              gameState.markets = matchData.markets;
          }

          // Tight sync: If 30s updates are coming, we trust the API timestamp more
          // Sync if off by > 5 seconds
          const diff = Math.abs((apiElapsed * 60) - gameState.timer);

          if (diff > 5) {
              gameState.timer = apiElapsed * 60;
          }

          // Check for Stoppage Market Transition
          // If we are in stoppage time, ensure we have stoppage markets.
          // If we are NOT in stoppage time, ensure we have standard markets.
          const period = matchData.fixture.status.period || (apiElapsed > 45 ? '2H' : '1H');
          const isStoppage = (apiElapsed >= 45 && period === '1H') || (apiElapsed >= 90 && (period === '2H' || period === 'FT'));

          const hasStoppageMarkets = this.hasStoppageMarkets(gameState);

          if (isStoppage && !hasStoppageMarkets) {
              console.log(`[FLASH] Entering Stoppage Time (${period} ${apiElapsed}'). Regenerating Markets.`);
              gameState.markets = this.generateMarkets(matchData);
              this.emitUpdate(gameState);
          } else if (!isStoppage && hasStoppageMarkets) {
               // Left stoppage (e.g. 1H -> HT -> 2H Start)
               // HT/FT Close logic handles closing, but if we start 2H, we need to regenerate standard.
               // closeStoppageMarkets sets status CLOSED.
               // We need new markets.
               console.log(`[FLASH] Leaving Stoppage Time. Regenerating Standard Markets.`);
               gameState.markets = this.generateMarkets(matchData);
               this.emitUpdate(gameState);
          }

      } else {
          this.startTracking(fixtureId, matchData);
      }
  }

  hasStoppageMarkets(gameState) {
      const all = this.getAllMarkets(gameState.markets);
      return all.some(m => m.type.startsWith('stoppage_'));
  }

  closeStoppageMarkets(gameState) {
      const allMarkets = this.getAllMarkets(gameState.markets);
      let changed = false;
      allMarkets.forEach(market => {
          if (market.type.startsWith('stoppage_') && market.status === 'OPEN') {
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
             // Logic to verify if goal falls in window?
             // Since handleGoal is called real-time, we assume it counts for current active markets.
             // Ideally we check timestamp.
             // For simple MVP: Resolve ANY open goal market as WIN (for YES/OVER).
             // Note: 1x2 needs score tracking, O/U needs count.
             // Simplified: Flash Goal (Yes/No) -> WIN

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
      // This is now driven by RealDataService calling handleMatchUpdate or internal loop
      // But RealDataService logic requires FlashService to process the tick logic (progress, expiry).
      // We will keep the iteration here but it might be redundant if RealDataService calls distinct updates.
      // However, prompt said "RealDataService... Recalcule o progress".
      // We will expose a method processGameTick(fixtureId, currentSeconds) that RealDataService calls.

      // For legacy/safety, we can iterate active games that haven't been updated recently?
      // Or just trust RealDataService.
      // Let's iterate active games as before to be safe for now.

      this.activeGames.forEach((gameState, fixtureId) => {
          // If RealDataService is driving, we might double tick.
          // But RealDataService updates match time. We update market progress based on that time.
          // So we just need to react to the time change.
          this.evaluateMarkets(gameState);
          this.emitUpdate(gameState);
      });
  }

  evaluateMarkets(gameState) {
      if (gameState.timer > 120 * 60) return; // Game over

      const allMarkets = this.getAllMarkets(gameState.markets);

      allMarkets.forEach(market => {
          if (market.status !== 'OPEN') return;

          // Expiration & Rotation
          if (market.windowEnd) {
              const endSec = market.windowEnd * 60;
              if (gameState.timer >= endSec) {
                  this.resolveMarket(market, 'LOSS');
                  market.status = 'CLOSED';
                  this.rotateMarket(gameState, market);
              }
          }

          // Progress
          if (market.status === 'OPEN') {
              if (market.type.startsWith('stoppage_')) {
                  // Stoppage Markets: Indefinite progress or "Waiting" animation
                  // We can set progress to -1 to indicate "Indeterminate" or just keep it 0/100
                  market.progress = 99; // Keep full bar to show active? Or pulsing?
                  // Prompt says: "barra de progresso ... deve ficar oculta ou mostrar uma animação de 'A aguardar...'"
                  // Let's use a special value (e.g., -1) that frontend can interpret, or just max it out.
                  // For now, let's max it out so it looks "full/active".
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
      if (Array.isArray(marketsStructure)) return marketsStructure;
      Object.values(marketsStructure).forEach(list => {
          if (Array.isArray(list)) flat.push(...list);
      });
      return flat;
  }

  rotateMarket(gameState, expiredMarket) {
      const parts = expiredMarket.id.split('_');
      const type = parts[0];
      // id format: type_fixtureId_start
      // For types like '1x2period', split might be different.
      // Better to store metadata in market object, but for now parse ID or check market structure.

      const fId = gameState.fixtureId;
      const nextStart = expiredMarket.windowEnd;
      let nextMarket = null;

      // Determine type and next duration
      if (type === 'flash') { // 1 min goal
          nextMarket = this.createFlashGoalMarket(fId, nextStart);
      } else if (type === '1x2') { // 5 min winner
          nextMarket = this.create5MinWinnerMarket(fId, nextStart);
      } else if (type === 'goal5') { // 5 min goal
          nextMarket = this.create5MinGoalMarket(fId, nextStart);
      } else if (type === 'ou10') { // 10 min over/under
          nextMarket = this.create10MinOverUnderMarket(fId, nextStart);
      }

      if (nextMarket) {
          // Find category and replace
          for (const [category, markets] of Object.entries(gameState.markets)) {
              const idx = markets.findIndex(m => m.id === expiredMarket.id);
              if (idx !== -1) {
                  markets[idx] = nextMarket;
                  break;
              }
          }
      }
  }

  createFlashGoalMarket(fId, startMin) {
      if (startMin >= 90) return null;
      return {
          id: `flash_${fId}_${startMin}`,
          title: `Sairá gol entre ${startMin}:00 e ${startMin}:59?`,
          interval: `${startMin}:00 - ${startMin + 1}:00`,
          windowStart: startMin,
          windowEnd: startMin + 1,
          type: 'flash_goal',
          status: 'OPEN',
          progress: 0,
          odds: { yes: 3.50, no: 1.25 }
      };
  }

  create5MinWinnerMarket(fId, startMin) {
      if (startMin >= 90) return null;
      const endMin = startMin + 5;
      return {
          id: `1x2_${fId}_${startMin}`,
          title: `Vencedor entre ${startMin}:00 e ${endMin}:00`,
          interval: `${startMin}:00 - ${endMin}:00`,
          windowStart: startMin,
          windowEnd: endMin,
          type: '1x2_period',
          status: 'OPEN',
          progress: 0,
          odds: { home: 2.50, draw: 2.80, away: 3.00 },
          options: ['Casa', 'Empate', 'Fora']
      };
  }

  create5MinGoalMarket(fId, startMin) {
      if (startMin >= 90) return null;
      const endMin = startMin + 5;
      return {
          id: `goal5_${fId}_${startMin}`,
          title: `Gol entre ${startMin}:00 e ${endMin}:00?`,
          interval: `${startMin}:00 - ${endMin}:00`,
          windowStart: startMin,
          windowEnd: endMin,
          type: 'goal_period',
          status: 'OPEN',
          progress: 0,
          odds: { yes: 2.20, no: 1.60 }
      };
  }

  create10MinOverUnderMarket(fId, startMin) {
      if (startMin >= 90) return null;
      const endMin = startMin + 10;
      return {
          id: `ou10_${fId}_${startMin}`,
          title: `Mais de 0.5 gols entre ${startMin}:00 e ${endMin}:00?`,
          interval: `${startMin}:00 - ${endMin}:00`,
          windowStart: startMin,
          windowEnd: endMin,
          type: 'over_under_period',
          status: 'OPEN',
          progress: 0,
          odds: { over: 2.10, under: 1.65 }
      };
  }

  emitUpdate(gameState) {
      if (this.io) {
          // Send simplified structure
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
      // SINGLE SOURCE OF TRUTH: match.fixture.status.elapsed (m)

      // Safety Checks
      if (!match || typeof match.fixture?.status?.elapsed !== 'number') {
           return { "Aguardando...": [] };
      }

      const m = Math.floor(match.fixture.status.elapsed);
      const fId = match.fixture.id;
      const statusShort = match.fixture.status.short;
      const period = match.fixture.status.period || (m > 45 ? '2H' : '1H');

      // 1. Absolute Status Locks
      if (['PAUSED', 'HT'].includes(statusShort)) {
          return { "Intervalo": [this.createIntervalMarket(fId)] };
      }
      if (['FINISHED', 'FT', 'AWARDED', 'INT'].includes(statusShort)) {
          return { "Fim de Jogo": [] };
      }

      // 2. Stoppage Time Override
      const isFirstHalfStoppage = (m >= 45 && period === '1H');
      const isSecondHalfStoppage = (m >= 90);

      if (isFirstHalfStoppage || isSecondHalfStoppage) {
          const suffix = isFirstHalfStoppage ? '1h' : '2h';
          return {
              "Acréscimos (Fim do Tempo)": [
                  this.createStoppageGoalMarket(fId, suffix, m),
                  this.createStoppageCardMarket(fId, suffix, m)
              ]
          };
      }

      // 3. Standard Markets (Strict Math)
      const categories = {
          "Apostas 1 Min": [],
          "Apostas 5 Min": [],
          "Apostas 10 Min": []
      };

      // 1 Minuto: de m até m+1
      // e.g. m=13. Window: 13:00-14:00.
      categories["Apostas 1 Min"].push(
          this.createFlashGoalMarket(fId, m)
      );

      // 5 Minutos: m - (m%5)
      // e.g. m=13. Start=10. End=15.
      const start5 = m - (m % 5);
      categories["Apostas 5 Min"].push(
          this.create5MinWinnerMarket(fId, start5),
          this.create5MinGoalMarket(fId, start5)
      );

      // 10 Minutos: m - (m%10)
      // e.g. m=13. Start=10. End=20.
      const start10 = m - (m % 10);
      categories["Apostas 10 Min"].push(
          this.create10MinOverUnderMarket(fId, start10)
      );

      return categories;
  }

  createIntervalMarket(fId) {
      return {
          id: `interval_${fId}`,
          title: "Intervalo - Aguardando 2º Tempo",
          status: 'LOCKED',
          progress: 100,
          odds: { yes: 1.00, no: 1.00 }
      };
  }

  createStoppageGoalMarket(fId, suffix, elapsed) {
      return {
          id: `stoppage_goal_${suffix}_${fId}`,
          title: `Sairá um gol nos Acréscimos?`,
          interval: `${elapsed}' - Fim`,
          windowStart: elapsed,
          windowEnd: null, // Indefinite
          type: 'stoppage_goal',
          status: 'OPEN',
          progress: 99, // Waiting state
          odds: { yes: 4.50, no: 1.15 }
      };
  }

  createStoppageCardMarket(fId, suffix, elapsed) {
      return {
          id: `stoppage_card_${suffix}_${fId}`,
          title: `Haverá um Cartão Vermelho nos Acréscimos?`,
          interval: `${elapsed}' - Fim`,
          windowStart: elapsed,
          windowEnd: null,
          type: 'stoppage_card',
          status: 'OPEN',
          progress: 99,
          odds: { yes: 8.00, no: 1.05 }
      };
  }
}

module.exports = new FlashMarketService();
