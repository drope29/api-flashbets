class MarketService {
  constructor() {
    this.activeMarkets = [];
    this.marketIdCounter = 1;
    this.io = null;
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
    const market = {
      id: this.marketIdCounter++,
      type: 'next_goal_5min',
      odds: 2.50,
      status: 'OPEN',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    };

    this.activeMarkets.push(market);
    console.log(`[MARKET] New Market Created: ID ${market.id} (${market.type})`);

    if (this.io) {
      this.io.emit('market_update', market);
    }

    // Set timeout for LOSS
    setTimeout(() => {
      this.resolveMarketAsLoss(market.id);
    }, 5 * 60 * 1000);
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
}

module.exports = new MarketService();
