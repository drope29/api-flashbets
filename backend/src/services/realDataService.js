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

    // Start passive update interval (30 seconds for High Frequency)
    setInterval(() => this.updateLiveMatches(), 30 * 1000);

    // Start Global Heartbeat (1s) - Simulates time and updates markets for ALL live games
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

  initDebugMatch() {
      const now = Date.now();
      debugMatchCache = {
          fixture: {
              id: 999999,
              date: new Date().toISOString(),
              status: { short: 'IN_PLAY', elapsed: 0 }
          },
          league: { name: 'Debug League', logo: '' },
          teams: {
              home: { name: '🔥 DEBUG TEAM', logo: '' },
              away: { name: '🐛 BUG HUNTERS', logo: '' }
          },
          goals: { home: 2, away: 2 },
          events: [], // Can add events later if needed
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
          // If not already in list (it might be added by updateLiveMatches if mocked properly, but let's ensure)
          if (!liveMatches.find(m => m.fixture.id === 999999)) {
              liveMatches.push(debugMatchCache);
          }
      }

      const now = Date.now();

      liveMatches.forEach(match => {
          // A. Simulate Time Progression
          // For real matches, we only increment if we haven't had an API update in a while?
          // Actually, we want smooth bars. So we rely on FlashService.
          // BUT, we need to update the `match` object's elapsed time for new markets to be generated correctly.
          // RealDataService `pollMatchDetails` updates it every 15s.
          // We can just interpolate seconds here.

          if (match.fixture.id === 999999) {
              // Debug Match: Full simulation
              // Cycle: 0-45 (1H), 45-48 (1H Stoppage), 48-50 (HT), 50-95 (2H), 95-98 (2H Stoppage), 98-100 (FT) -> Loop
              const cycleDuration = 100 * 60; // 100 minutes total cycle for debug
              const cycleTime = Math.floor((now / 1000) % cycleDuration);
              const minute = Math.floor(cycleTime / 60);

              let status = 'IN_PLAY';
              let period = '1H';
              let elapsed = minute;

              if (minute >= 45 && minute < 48) {
                  // 1H Stoppage
                  period = '1H';
                  elapsed = minute; // 45, 46, 47... will be treated as 45+
              } else if (minute >= 48 && minute < 50) {
                  // Half Time
                  status = 'PAUSED';
                  period = 'HT';
                  elapsed = 45;
              } else if (minute >= 50 && minute < 95) {
                  // 2nd Half
                  period = '2H';
                  elapsed = minute - 5 + 45; // Start 2H at 45m (when real time is 50m) -> 45 + (50-50) = 45?
                  // Let's just map 50->45, 95->90
                  elapsed = 45 + (minute - 50);
              } else if (minute >= 95) {
                  // 2H Stoppage & End
                  period = '2H';
                  elapsed = 90 + (minute - 95);
                  if (minute >= 98) {
                      status = 'FINISHED';
                      period = 'FT';
                  }
              }

              match.fixture.status.short = status;
              match.fixture.status.elapsed = elapsed;
              match.fixture.status.period = period;
              match.serverTimestamp = now;
          } else {
              // Real Match: Simple interpolation if needed, but FlashService uses internal timer initialized from elapsed.
              // We don't strictly need to modify match.fixture.elapsed here unless we want to emit it.
              // Let's trust FlashService's internal timer for markets.
          }

          // B. Trigger Flash Market Logic (The "Coração")
          if (this.flashService) {
              // Ensure tracking is active
              this.flashService.handleMatchUpdate(match);

              // Force Tick (Recalculate progress, close expired, rotate)
              // We access the service directly to trigger the logic for this specific match
              // The service maintains the `gameState` with high-res timer.
              // Note: FlashService has its own internal 1s interval called `processTick`.
              // If we add another call here, we double tick.
              // The prompt says: "O setInterval de 1 segundo ... agora deve rodar um loop ... A cada 1 segundo ... Recalcule ...".
              // So I should DISALBE FlashMarketService's internal loop and call it here?
              // OR, I keep FlashService's loop and this loop just updates the match data feeding it.
              // Given the strict prompt "RealDataService... A cada 1 segundo... Recalcule...",
              // I will assume RealDataService orchestrates it.
              // But FlashMarketService `processTick` iterates `activeGames`.
              // So simply ensuring the game is *active* in FlashService allows FlashService's loop to handle it.
              // BUT, to follow instructions precisely: "O setInterval de 1 segundo (que antes só afetava o Debug) agora deve rodar um loop..."
              // I will leave FlashMarketService to handle the *mechanics* via its own loop or this one.
              // Since FlashMarketService ALREADY has a loop `setInterval(() => this.processTick(), 1000)`,
              // I don't need to duplicate the logic in RealDataService's loop.
              // RealDataService's loop is vital for *Debug Match* time simulation.
              // For Real Matches, time passes naturally.
              // So, the most important thing here is that RealDataService updates the *Data Source* (debug match time)
              // and FlashService consumes it.

              // However, to sync back the generated markets to the `match` object (for new clients/list view), we do this:
              const gameState = this.flashService.activeGames.get(match.fixture.id);
              if (gameState && gameState.markets) {
                  match.markets = gameState.markets;
              }
          }

          // C. Emit Socket Update
          if (this.io) {
              this.io.to(`game_${match.fixture.id}`).emit('match_update', match);
          }
      });
  }

  getMatch(id) {
      if (id == 999999 && debugMatchCache) return debugMatchCache;
      return this.cachedMatches.find(m => m.fixture.id == id);
  }

  async updateLiveMatches() {
    console.log('[API] Fetching matches (Strict Mode - 5 Day Window)...');

    try {
      let matches = [];
      const token = process.env.FOOTBALL_DATA_TOKEN;

      if (token) {
          const headers = { 'X-Auth-Token': token };

          // Fetch matches for TODAY + 5 Days
          const today = new Date();
          const next5Days = new Date(today);
          next5Days.setDate(today.getDate() + 5);

          const dateFrom = today.toISOString().split('T')[0];
          const dateTo = next5Days.toISOString().split('T')[0];

          // Competitions filter (Major Leagues)
          const competitions = 'PL,SA,BL1,CL,PD,FL1';

          const response = await axios.get(`https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&competitions=${competitions}`, { headers });
          matches = response.data.matches || [];
      } else {
          console.error('[API ERROR] No FOOTBALL_DATA_TOKEN found. Cannot fetch real data.');
      }

      // Step A: Filter out FINISHED matches
      matches = matches.filter(m => !['FINISHED', 'AWARDED', 'FT'].includes(m.status));

      // Adapt data
      this.cachedMatches = matches.map(m => this.adaptMatchData(m));

      // Step B: Debug Injection
      if (DEBUG_MODE && debugMatchCache) {
          // Ensure debug match is in the list for the frontend list view
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

    // Handle Debug Match
    if (fixtureId == 999999 && DEBUG_MODE) {
        console.log(`[MONITOR] Debug fixture ${fixtureId} is handled by global heartbeat.`);
        return;
    }

    console.log(`[MONITOR] Starting active monitoring for fixture ${fixtureId}`);

    // Initial fetch
    this.pollMatchDetails(fixtureId);

    const intervalId = setInterval(() => {
        this.pollMatchDetails(fixtureId);
    }, 15000); // Poll every 15s

    this.activeMonitors.set(fixtureId, intervalId);
  }

  stopMonitoring(fixtureId) {
    // Check if room is empty before stopping
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
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) return;

    try {
        const headers = { 'X-Auth-Token': token };
        const response = await axios.get(`https://api.football-data.org/v4/matches/${fixtureId}`, { headers });
        const apiMatch = response.data;

        const adaptedMatch = this.adaptMatchData(apiMatch);

        if (this.io) {
            this.io.to(`game_${fixtureId}`).emit('match_update', adaptedMatch);

            if (this.flashService) {
                this.flashService.handleMatchUpdate(adaptedMatch);
            }

            // Events logic (simplified for strict mode - only emitting if score changed based on cache)
            const cachedIndex = this.cachedMatches.findIndex(m => m.fixture.id === parseInt(fixtureId));
            if (cachedIndex !== -1) {
                const cached = this.cachedMatches[cachedIndex];
                if (adaptedMatch.goals.home > cached.goals.home) {
                    this.emitEvent(fixtureId, 'goal', 'Home', adaptedMatch.fixture.status.elapsed);
                }
                if (adaptedMatch.goals.away > cached.goals.away) {
                    this.emitEvent(fixtureId, 'goal', 'Away', adaptedMatch.fixture.status.elapsed);
                }
                this.cachedMatches[cachedIndex] = adaptedMatch;
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

  adaptMatchData(apiMatch) {
      let elapsed = 0;
      let period = '1H';

      if (['IN_PLAY', 'PAUSED'].includes(apiMatch.status)) {
           elapsed = apiMatch.minute || 0;
           // Heuristic for Period if not provided
           if (apiMatch.status === 'PAUSED') period = 'HT';
           else if (elapsed > 45) period = '2H'; // Fallback

           // Normalization: If 2H starts at 1 instead of 46
           // Some APIs reset minute to 0 at HT.
           // If we detect period is 2H (e.g. from explicit field) and minute < 45, add 45.
           // However, football-data usually gives absolute minutes.
           // But prompt says: "algumas ligas enviam o minuto do 2º tempo a começar no 1"
           // We need to rely on explicit period flag from API if available, or just check if it resets.
           // apiMatch from football-data usually has `score.duration` or `period`.
           // Let's assume if elapsed < 45 but we know it's 2H (how?), we add 45.
           // Without explicit period from API, we can't know for sure if 5' is 1H or 2H reset.
           // But if we track it... RealDataService is stateless per request.
           // Let's implement the requested safety check:
           // "if (match.period === 'SECOND_HALF' ... match.minute < 45 ... match.minute += 45"

           // API V4 often uses `status` like `IN_PLAY`.
           // Let's look at `apiMatch.score.duration` or similar.
           // If not available, we can't reliably normalize without state.
           // BUT, if the PROMPT says so, we implement logic assuming `period` might be populated correctly upstream or we infer it?
           // Let's assume `apiMatch.period` exists or we try to find it.
           // In standard football-data, it's often implied by elapsed > 45.
           // If the API sends 1 for 2H, elapsed is 1. We'd think it's 1H.
           // This is tricky without `period` field.
           // Let's use `apiMatch.period` if it exists.

           if (apiMatch.period === 'SECOND_HALF' || apiMatch.period === '2H') {
               period = '2H';
               if (elapsed < 45) elapsed += 45;
           }

      } else if (apiMatch.status === 'FINISHED') {
           elapsed = 90;
           period = 'FT';
      }

      const homeScore = apiMatch.score?.fullTime?.home ?? apiMatch.score?.current?.home ?? 0;
      const awayScore = apiMatch.score?.fullTime?.away ?? apiMatch.score?.current?.away ?? 0;

      return {
          fixture: {
              id: apiMatch.id,
              date: apiMatch.utcDate,
              status: {
                  short: apiMatch.status,
                  elapsed: elapsed,
                  period: period // Added period
              }
          },
          league: {
              name: apiMatch.competition ? apiMatch.competition.name : 'Unknown League',
              logo: apiMatch.competition?.emblem || ''
          },
          teams: {
              home: { name: apiMatch.homeTeam?.name || 'Home', logo: apiMatch.homeTeam?.crest || '' },
              away: { name: apiMatch.awayTeam?.name || 'Away', logo: apiMatch.awayTeam?.crest || '' }
          },
          goals: { home: homeScore, away: awayScore },
          serverTimestamp: Date.now()
      };
  }
}

module.exports = new RealDataService();
