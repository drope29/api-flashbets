require('dotenv').config();
const axios = require('axios');
const FlashMarketService = require('./flashMarketService');

const DEBUG_MODE = true;

class RealDataService {
  constructor() {
    this.cachedMatches = [];
    this.activeMonitors = new Map(); // fixtureId -> intervalId
    this.io = null;
    this.flashService = null;

    // Start passive update interval (30 seconds for High Frequency)
    setInterval(() => this.updateLiveMatches(), 30 * 1000);

    // Initial load
    this.updateLiveMatches();
  }

  setIo(io) {
    this.io = io;
  }

  setFlashService(service) {
      this.flashService = service;
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
      if (DEBUG_MODE) {
          const now = Date.now();
          const debugMinute = Math.floor((now / 1000) % 90);

          const debugMatch = {
              fixture: {
                  id: 999999,
                  date: new Date().toISOString(),
                  status: {
                      short: 'IN_PLAY',
                      elapsed: debugMinute
                  }
              },
              league: {
                  name: 'Debug League',
                  logo: ''
              },
              teams: {
                  home: { name: '🔥 DEBUG TEAM', logo: '' },
                  away: { name: '🐛 BUG HUNTERS', logo: '' }
              },
              goals: {
                  home: 2,
                  away: 2
              },
              events: [
                  {
                      id: 101,
                      type: 'goal',
                      message: 'GOAL - 15\' 🔥 Debug Team (Dev Junior)', // Pre-formatted message or adapting on front
                      timestamp: new Date(now - 1000000).toLocaleTimeString()
                  },
                  {
                      id: 102,
                      type: 'red_card', // Using existing icon type
                      message: 'RED CARD - 42\' 🐛 Bug Hunters (Console Log)',
                      timestamp: new Date(now - 500000).toLocaleTimeString()
                  }
              ],
              serverTimestamp: now
          };

          debugMatch.markets = FlashMarketService.generateMarkets(debugMatch);

          // Check if exists to update or push
          const idx = this.cachedMatches.findIndex(m => m.fixture.id === 999999);
          if (idx >= 0) this.cachedMatches[idx] = debugMatch;
          else this.cachedMatches.push(debugMatch);
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
    if (fixtureId === 999999 && DEBUG_MODE) {
        console.log(`[MONITOR] Starting active monitoring for DEBUG fixture ${fixtureId}`);
        const intervalId = setInterval(() => {
            const now = Date.now();
            const debugMinute = Math.floor((now / 1000) % 90);

            const debugMatch = {
              fixture: { id: 999999, date: new Date().toISOString(), status: { short: 'IN_PLAY', elapsed: debugMinute } },
              league: { name: 'Debug League', logo: '' },
              teams: { home: { name: '🔥 DEBUG TEAM', logo: '' }, away: { name: '🐛 BUG HUNTERS', logo: '' } },
              goals: { home: 2, away: 2 },
              serverTimestamp: now
            };

            debugMatch.markets = FlashMarketService.generateMarkets(debugMatch);

            if (this.io) {
                this.io.to(`game_${fixtureId}`).emit('match_update', debugMatch);
                if (this.flashService) this.flashService.handleMatchUpdate(debugMatch);
            }
        }, 1000); // 1s update for debug smoothness
        this.activeMonitors.set(fixtureId, intervalId);
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
      if (['IN_PLAY', 'PAUSED'].includes(apiMatch.status)) {
           elapsed = apiMatch.minute || 0;
      } else if (apiMatch.status === 'FINISHED') {
           elapsed = 90;
      }

      const homeScore = apiMatch.score?.fullTime?.home ?? apiMatch.score?.current?.home ?? 0;
      const awayScore = apiMatch.score?.fullTime?.away ?? apiMatch.score?.current?.away ?? 0;

      return {
          fixture: {
              id: apiMatch.id,
              date: apiMatch.utcDate,
              status: {
                  short: apiMatch.status,
                  elapsed: elapsed
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
