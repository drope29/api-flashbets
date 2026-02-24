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
              status: { short: 'IN_PLAY', elapsed: 0, second: 0 }
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
          if (match.fixture.id === 999999) {
              // Debug Match: Full simulation
              // Cycle: 0-45 (1H), 45-48 (1H Stoppage), 48-50 (HT), 50-95 (2H), 95-98 (2H Stoppage), 98-100 (FT) -> Loop
              const cycleDuration = 100 * 60; // 100 minutes total cycle for debug
              const cycleTime = Math.floor((now / 1000) % cycleDuration);
              const minute = Math.floor(cycleTime / 60);
              const second = cycleTime % 60;

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
              match.fixture.status.second = second;
              match.fixture.status.period = period;
              match.serverTimestamp = now;
          } else {
              // Real Match: Heartbeat increment
              if (match.fixture.status.short === 'IN_PLAY') {
                  if (typeof match.fixture.status.second !== 'number') match.fixture.status.second = 0;
                  match.fixture.status.second++;

                  // Limite de segurança: se a API atrasar a atualização do minuto,
                  // travamos os segundos no 59 para não mostrar "44:65"
                  if (match.fixture.status.second > 59) {
                      match.fixture.status.second = 59;
                  }
              }
          }

          // B. Trigger Flash Market Logic (The "Coração")
          if (this.flashService) {
              // Ensure tracking is active
              this.flashService.handleMatchUpdate(match);

              const gameState = this.flashService.activeGames.get(match.fixture.id);
              if (gameState && gameState.markets) {
                  match.markets = gameState.markets;
              }
          }

          // C. Emit Socket Update to specific room (for Match Details view)
          if (this.io) {
              this.io.to(`game_${match.fixture.id}`).emit('match_update', match);
          }
      });

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
      this.cachedMatches = matches.map(m => {
          const existing = this.cachedMatches.find(c => c.fixture.id === m.id);
          return this.adaptMatchData(m, existing);
      });

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

        // Find existing to preserve seconds
        const cachedIndex = this.cachedMatches.findIndex(m => m.fixture.id === parseInt(fixtureId));
        const existing = cachedIndex !== -1 ? this.cachedMatches[cachedIndex] : null;

        const adaptedMatch = this.adaptMatchData(apiMatch, existing);

        if (this.io) {
            this.io.to(`game_${fixtureId}`).emit('match_update', adaptedMatch);

            if (this.flashService) {
                this.flashService.handleMatchUpdate(adaptedMatch);
            }

            // Events logic (simplified for strict mode - only emitting if score changed based on cache)
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
                // If not in cache, add it (unlikely given flow but possible)
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
      let elapsed = 0;
      let period = '1H';

      if (['IN_PLAY', 'PAUSED'].includes(apiMatch.status)) {
           elapsed = apiMatch.minute || 0;
           // Heuristic for Period if not provided
           if (apiMatch.status === 'PAUSED') period = 'HT';
           else if (elapsed > 45) period = '2H'; // Fallback

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

      let second = 0;
      if (existingMatch) {
          if (existingMatch.fixture.status.elapsed !== elapsed) {
              // Minute changed, reset second
              second = 0;
          } else {
              // Minute same, preserve second
              second = existingMatch.fixture.status.second || 0;
          }
      }

      return {
          fixture: {
              id: apiMatch.id,
              date: apiMatch.utcDate,
              status: {
                  short: apiMatch.status,
                  elapsed: elapsed,
                  second: second, // Added second
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
