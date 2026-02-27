require('dotenv').config();
const axios = require('axios');
const FlashMarketService = require('./flashMarketService');

const DEBUG_MODE = true;
let debugMatchCache = null;

class RealDataService {
  constructor() {
    this.cachedMatches = [];
    this.activeMonitors = new Map(); // fixtureId -> intervalId
    this.io = null;
    this.flashService = null;
    this.betService = null;

    // Start passive update interval (60 seconds for API-Football Quota)
    setInterval(() => this.updateLiveMatches(), 60 * 1000);

    // Start Global Heartbeat (1s) - Increments seconds locally for smooth UI
    if (DEBUG_MODE) {
        this.initDebugMatch();
    }

    setInterval(() => this.processGlobalHeartbeat(), 1000);

    // Initial load
    this.updateLiveMatches();
  }

  setIo(io) {
    this.io = io;
  }

  setFlashService(service) {
      this.flashService = service;
  }

  setBetService(service) {
      this.betService = service;
  }

  initDebugMatch() {
      const now = Date.now();
      debugMatchCache = {
          fixture: {
              id: 999999,
              date: new Date().toISOString(),
              status: { short: 'IN_PLAY', elapsed: 0, second: 0, period: '1H' }
          },
          league: { name: 'Debug League', logo: '' },
          teams: {
              home: { name: '🔥 DEBUG TEAM', logo: '' },
              away: { name: '🐛 BUG HUNTERS', logo: '' }
          },
          goals: { home: 2, away: 2 },
          events: [],
          serverTimestamp: now
      };

      // Generate Initial Markets
      debugMatchCache.markets = FlashMarketService.generateMarkets(debugMatchCache);
      console.log('[DEBUG] Debug Match Initialized');
  }

  processGlobalHeartbeat() {
      // 1. Collect all live matches (Real + Debug)
      const liveMatches = this.cachedMatches.filter(m => ['IN_PLAY', 'PAUSED'].includes(m.fixture.status.short));

      // Ensure Debug Match is included if active
      if (DEBUG_MODE && debugMatchCache) {
          if (!liveMatches.find(m => m.fixture.id === 999999)) {
              liveMatches.push(debugMatchCache);
          }
      }

      const now = Date.now();

      liveMatches.forEach(match => {
          // A. Simulate Time Progression
          if (match.fixture.id === 999999) {
              // Debug Match: Full simulation
              const cycleDuration = 100 * 60; // 100 minutes total cycle for debug
              const cycleTime = Math.floor((now / 1000) % cycleDuration);
              const minute = Math.floor(cycleTime / 60);
              const second = cycleTime % 60;

              let status = 'IN_PLAY';
              let period = '1H';
              let elapsed = minute;

              if (minute >= 45 && minute < 48) {
                  period = '1H';
                  elapsed = minute;
              } else if (minute >= 48 && minute < 50) {
                  status = 'PAUSED';
                  period = 'HT';
                  elapsed = 45;
              } else if (minute >= 50 && minute < 95) {
                  period = '2H';
                  elapsed = minute - 5 + 45;
                  elapsed = 45 + (minute - 50);
              } else if (minute >= 95) {
                  period = '2H';
                  elapsed = 90 + (minute - 95);
                  if (minute >= 98) {
                      status = 'FINISHED';
                      period = 'FT';
                  }
              }

              match.fixture.status.short = status;
              match.fixture.status.elapsed = elapsed;
              match.fixture.status.second = second;
              match.fixture.status.period = period;
              match.fixture.status.raw = period;
              match.serverTimestamp = now;
          } else {
              // Real Match: Heartbeat increment
              if (match.fixture.status.short === 'IN_PLAY') {
                  if (typeof match.fixture.status.second !== 'number') match.fixture.status.second = 0;
                  match.fixture.status.second++;
                  if (match.fixture.status.second > 59) {
                      match.fixture.status.second = 59;
                  }
              }
          }

          // B. Trigger Flash Market Logic
          if (this.flashService) {
              this.flashService.handleMatchUpdate(match);
              const gameState = this.flashService.activeGames.get(match.fixture.id);
              if (gameState && gameState.markets) {
                  match.markets = gameState.markets;
              }
          }

          // C. Emit Socket Update to specific room
          if (this.io) {
              this.io.to(`game_${match.fixture.id}`).emit('match_update', match);
          }
      });

      // D. Bet Settlement Engine (The "Judge")
      // Call explicitly here to ensure active bets are checked against time progress
      if (this.betService) {
          this.betService.resolveBets(this.cachedMatches); // Use full cache to catch finished games too
      }

      // Emit Global Update for List View
      if (this.io && liveMatches.length > 0) {
          this.io.emit('matches_update', liveMatches);
      }
  }

  getMatch(id) {
      if (id == 999999 && debugMatchCache) return debugMatchCache;
      return this.cachedMatches.find(m => m.fixture.id == id);
  }

  async updateLiveMatches() {
    console.log('[API] Fetching LIVE matches from API-Football...');

    // 1. THE JUDGE: Resolve bets BEFORE updating/cleaning matches
    // This ensures that if a match is about to disappear or change status to finished, we settle pending bets first.
    if (this.betService) {
        this.betService.resolveBets(this.cachedMatches);
    }

    try {
      const apiKey = process.env.API_SPORTS_KEY;
      let matches = [];

      if (apiKey) {
          const headers = {
              'x-apisports-key': apiKey,
              'x-apisports-host': 'v3.football.api-sports.io'
          };

          const response = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', { headers });
          matches = response.data.response || [];
      } else {
          console.error('[API ERROR] No API_SPORTS_KEY found. Cannot fetch real data.');
          // Keep existing cache if API fails? Or assume empty? For strictness, if no key, no real matches.
      }

      // 2. THE UNDERTAKER: Mark missing matches as FINISHED instead of deleting immediately
      // This handles cases where a match disappears from "live=all" because it finished.
      this.cachedMatches.forEach(oldMatch => {
          // Don't touch debug match
          if (oldMatch.fixture.id === 999999) return;

          const stillLive = matches.find(m => m.fixture.id === oldMatch.fixture.id);
          if (!stillLive) {
              console.log(`[CLEANUP] Match ${oldMatch.fixture.id} disappeared from API. Marking as FINISHED.`);
              oldMatch.fixture.status.short = 'FINISHED';
              oldMatch.fixture.status.raw = 'FT'; // Ensure robust finished check
          }
      });

      // Adapt new data
      const adaptedNewMatches = matches.map(m => {
          const existing = this.cachedMatches.find(c => c.fixture.id === m.fixture.id);
          return this.adaptMatchData(m, existing);
      });

      // Merge: Update existing, add new, keep "finished ghosts" if needed
      // We rebuild cachedMatches carefully
      let mergedMatches = [...adaptedNewMatches];

      // Add back the "ghosts" (finished matches that were in cache but not in new list)
      // Only if they are not already in adaptedNewMatches (which they aren't by definition of filter)
      this.cachedMatches.forEach(oldMatch => {
          if (oldMatch.fixture.id === 999999) return; // Debug handled later

          const isRevised = adaptedNewMatches.find(m => m.fixture.id === oldMatch.fixture.id);
          if (!isRevised && oldMatch.fixture.status.short === 'FINISHED') {
              mergedMatches.push(oldMatch);
          }
      });

      // 3. THE GARBAGE COLLECTOR: Remove finished matches ONLY if no pending bets
      this.cachedMatches = mergedMatches.filter(match => {
          if (match.fixture.id === 999999) return false; // Remove debug temporarily, re-add later

          if (match.fixture.status.short !== 'FINISHED') return true;

          // If finished, check for pending bets
          let hasPending = false;
          if (this.betService) {
              hasPending = this.betService.hasPendingBetsForMatch(match.fixture.id);
          }

          if (hasPending) {
              console.log(`[GC] Keeping finished match ${match.fixture.id} due to pending bets.`);
              return true;
          }

          return false; // Remove if finished and no bets
      });

      // Step B: Debug Injection
      if (DEBUG_MODE && debugMatchCache) {
          const idx = this.cachedMatches.findIndex(m => m.fixture.id === 999999);
          if (idx >= 0) this.cachedMatches[idx] = debugMatchCache;
          else this.cachedMatches.push(debugMatchCache);
      }

      console.log(`[API] Updated cache with ${this.cachedMatches.length} matches.`);

    } catch (error) {
      console.error('[API ERROR] Failed to update matches:', error.response?.data || error.message);
    }
  }

  getMatches() {
    return this.cachedMatches;
  }

  startMonitoring(fixtureId) {
    if (this.activeMonitors.has(fixtureId)) return;

    if (fixtureId == 999999 && DEBUG_MODE) {
        console.log(`[MONITOR] Debug fixture ${fixtureId} is handled by global heartbeat.`);
        return;
    }

    console.log(`[MONITOR] Starting active monitoring for fixture ${fixtureId}`);

    this.pollMatchDetails(fixtureId);

    const intervalId = setInterval(() => {
        this.pollMatchDetails(fixtureId);
    }, 60000);

    this.activeMonitors.set(fixtureId, intervalId);
  }

  stopMonitoring(fixtureId) {
    if (this.io) {
        const room = this.io.sockets.adapter.rooms.get(`game_${fixtureId}`);
        if (!room || room.size === 0) {
            if (this.activeMonitors.has(fixtureId)) {
                console.log(`[MONITOR] No listeners left. Stopping active monitoring for fixture ${fixtureId}`);
                clearInterval(this.activeMonitors.get(fixtureId));
                this.activeMonitors.delete(fixtureId);
            }
        } else {
            console.log(`[MONITOR] Listeners still active for fixture ${fixtureId}. Monitoring continues.`);
        }
    }
  }

  async pollMatchDetails(fixtureId) {
    const apiKey = process.env.API_SPORTS_KEY;
    if (!apiKey) return;

    try {
        const headers = {
            'x-apisports-key': apiKey,
            'x-apisports-host': 'v3.football.api-sports.io'
        };

        const response = await axios.get(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, { headers });
        const apiMatch = response.data.response && response.data.response[0];

        if (!apiMatch) return;

        const cachedIndex = this.cachedMatches.findIndex(m => m.fixture.id === parseInt(fixtureId));
        const existing = cachedIndex !== -1 ? this.cachedMatches[cachedIndex] : null;

        const adaptedMatch = this.adaptMatchData(apiMatch, existing);

        if (this.io) {
            this.io.to(`game_${fixtureId}`).emit('match_update', adaptedMatch);

            if (this.flashService) {
                this.flashService.handleMatchUpdate(adaptedMatch);
            }

            if (cachedIndex !== -1) {
                const cached = this.cachedMatches[cachedIndex];
                if (adaptedMatch.goals.home > cached.goals.home) {
                    this.emitEvent(fixtureId, 'goal', 'Home', adaptedMatch.fixture.status.elapsed);
                }
                if (adaptedMatch.goals.away > cached.goals.away) {
                    this.emitEvent(fixtureId, 'goal', 'Away', adaptedMatch.fixture.status.elapsed);
                }
                this.cachedMatches[cachedIndex] = adaptedMatch;
            } else {
                this.cachedMatches.push(adaptedMatch);
            }
        }

    } catch (error) {
        console.error(`[API ERROR] Polling fixture ${fixtureId}:`, error.response?.data || error.message);
    }
  }

  emitEvent(fixtureId, type, team, minute) {
      if (this.io) {
          const event = {
              type: type,
              fixtureId: fixtureId,
              timestamp: new Date(),
              details: { minute: minute || 0, team: team, player: 'Unknown (API)' }
          };
          this.io.to(`game_${fixtureId}`).emit('sport_event', event);
      }
  }

  adaptMatchData(apiMatch, existingMatch = null) {
      const rawStatus = apiMatch.fixture.status.short;
      const elapsed = apiMatch.fixture.status.elapsed || 0;
      const extra = apiMatch.fixture.status.extra || null;

      let status = 'SCHEDULED';
      if (['1H', '2H', 'ET', 'P', 'BT', 'INT', 'LIVE'].includes(rawStatus)) {
          status = 'IN_PLAY';
      } else if (rawStatus === 'HT') {
          status = 'PAUSED';
      } else if (['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(rawStatus)) {
          status = 'FINISHED';
      }

      let second = 0;
      if (existingMatch) {
          if (existingMatch.fixture.status.elapsed !== elapsed) {
              second = 0;
          } else {
              second = existingMatch.fixture.status.second || 0;
          }
      }

      return {
          fixture: {
              id: apiMatch.fixture.id,
              date: apiMatch.fixture.date,
              status: {
                  short: status,
                  raw: rawStatus,
                  period: rawStatus,
                  elapsed: elapsed,
                  second: second,
                  extra: extra
              }
          },
          league: {
              name: apiMatch.league?.name || 'Unknown League',
              logo: apiMatch.league?.logo || ''
          },
          teams: {
              home: { name: apiMatch.teams.home.name || 'Home', logo: apiMatch.teams.home.logo || '' },
              away: { name: apiMatch.teams.away.name || 'Away', logo: apiMatch.teams.away.logo || '' }
          },
          goals: {
              home: apiMatch.goals.home ?? 0,
              away: apiMatch.goals.away ?? 0
          },
          serverTimestamp: Date.now()
      };
  }
}

module.exports = new RealDataService();
