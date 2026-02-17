class MarketService {
  constructor() {
    this.activeMarkets = [];
    this.marketIdCounter = 1;
    this.io = null;

    // Start odds updater interval
    setInterval(() => this.updateOdds(), 1000);
  }

  setIo(io) {
    this.io = io;
  }

  processEvent(event) {
    console.log(`[MARKET] Processing event: ${event.type}`);

    // 1. Resolve Markets (Goal -> WIN)
    if (event.type === 'goal') {
      this.resolveMarkets('WIN');
      return;
    }

    // 2. Suspend Markets (Corner, Danger, Penalty, Free Kick)
    // Note: Simulator currently emits 'corner', 'danger', 'red_card', 'yellow_card'.
    // We treat 'corner' and 'danger' as suspension triggers.
    if (['corner', 'danger', 'red_card', 'penalty', 'free_kick'].includes(event.type)) {
      this.suspendMarkets(event.type);
      return;
    }

    // 3. Create Market (Safe -> Open new market if none exists)
    // Also Unsuspend if active market exists?
    if (event.type === 'safe') {
      if (this.activeMarkets.length === 0) {
        this.createMarket();
      } else {
        // Optional: Unsuspend if safe? The prompt didn't explicitly ask for this,
        // but typically 'safe' means we can reopen.
        // For now, I'll just log that we are safe.
        // Actually, let's reopen it to make it realistic, otherwise it stays suspended forever until timeout.
        this.unsuspendMarkets();
      }
    }
  }

  createMarket() {
    const durationSeconds = 300; // 5 minutes
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

    const market = {
      id: this.marketIdCounter++,
      type: 'next_goal_5min',
      odds: { yes: 2.50, no: 1.50 }, // Initial odds
      initial_odds: { yes: 2.50, no: 1.50 },
      status: 'OPEN',
      created_at: now,
      expires_at: expiresAt, // 5 minutes from now
      duration_seconds: durationSeconds
    };

    this.activeMarkets.push(market);
    console.log(`[MARKET] New Market Created: ID ${market.id} (${market.type})`);

    if (this.io) {
      this.io.emit('market_update', market);
    }

    // Set timeout for LOSS
    setTimeout(() => {
      this.resolveMarketAsLoss(market.id);
    }, durationSeconds * 1000);
  }

  suspendMarkets(reason) {
    let changed = false;
    this.activeMarkets.forEach(market => {
      if (market.status !== 'SUSPENDED') {
        market.status = 'SUSPENDED';
        console.log(`[MARKET] Market ID ${market.id} SUSPENDED due to ${reason}`);
        changed = true;
      }
    });

    if (changed && this.io) {
      this.io.emit('markets_update', this.activeMarkets);
    }
  }

  unsuspendMarkets() {
    let changed = false;
    this.activeMarkets.forEach(market => {
      if (market.status === 'SUSPENDED') {
        market.status = 'OPEN';
        console.log(`[MARKET] Market ID ${market.id} RE-OPENED (Safe)`);
        changed = true;
      }
    });

    if (changed && this.io) {
      this.io.emit('markets_update', this.activeMarkets);
    }
  }

  resolveMarkets(result) {
    if (this.activeMarkets.length === 0) return;

    this.activeMarkets.forEach(market => {
      console.log(`[MARKET] Market ID ${market.id} RESOLVED: ${result}`);
      market.status = result;
      market.resolved_at = new Date();
    });

    if (this.io) {
      this.io.emit('markets_resolved', this.activeMarkets);
    }

    // Clear resolved markets
    this.activeMarkets = [];
  }

  resolveMarketAsLoss(marketId) {
    const index = this.activeMarkets.findIndex(m => m.id === marketId);
    if (index !== -1) {
      const market = this.activeMarkets[index];
      // Only resolve if not already resolved (e.g. by goal)
      if (market.status !== 'WIN' && market.status !== 'LOSS') {
        console.log(`[MARKET] Market ID ${market.id} RESOLVED: LOSS (Timeout)`);
        market.status = 'LOSS';
        market.resolved_at = new Date();

        if (this.io) {
          this.io.emit('market_resolved', market);
        }

        // Remove from active
        this.activeMarkets.splice(index, 1);
      }
    }
  }

  updateOdds() {
    if (this.activeMarkets.length === 0) return;

    const now = new Date();
    let changed = false;

    this.activeMarkets.forEach(market => {
      if (market.status === 'OPEN') {
        const timeLeftMs = market.expires_at.getTime() - now.getTime();
        const timeLeft = Math.max(0, timeLeftMs / 1000); // Seconds
        const timeTotal = market.duration_seconds;

        // Simple linear decay logic for MVP
        // As time decreases, Probability(No Goal) increases -> Odds(No) decrease
        // As time decreases, Probability(Goal) decreases -> Odds(Yes) increase

        const progress = 1 - (timeLeft / timeTotal); // 0 (start) to 1 (end)

        // Linear interpolation for simplicity:
        // YES odds rise from 2.50 -> 10.00
        // NO odds drop from 1.50 -> 1.01

        const newYes = 2.50 + (progress * 7.5); // 2.50 -> 10.00
        const newNo = 1.50 - (progress * 0.49); // 1.50 -> 1.01

        market.odds.yes = parseFloat(newYes.toFixed(2));
        market.odds.no = parseFloat(newNo.toFixed(2));

        console.log(`[ODDS] Market ${market.id} Update: YES @ ${market.odds.yes} | NO @ ${market.odds.no} (Time left: ${Math.floor(timeLeft)}s)`);
        changed = true;
      }
    });

    if (changed && this.io) {
      this.io.emit('odds_update', this.activeMarkets);
    }
  }
}

module.exports = new MarketService();
