import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Lock, Timer, Info, Trophy, AlertTriangle } from 'lucide-react';

const SOCKET_URL = 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [market, setMarket] = useState(null);
  const [events, setEvents] = useState([]);
  const [matchInfo, setMatchInfo] = useState({
    home: 'Home Team',
    away: 'Away Team',
    score: { home: 0, away: 0 },
    time: '00:00'
  });

  const eventsEndRef = useRef(null);

  const scrollToBottom = () => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to backend');
      setEvents(prev => [...prev, { type: 'system', message: 'Connected to live server' }]);
    });

    // Market Events
    newSocket.on('market_update', (newMarket) => {
      setMarket(newMarket);
    });

    newSocket.on('market_created', (newMarket) => {
        setMarket(newMarket);
    });

    newSocket.on('markets_update', (markets) => {
      if (markets.length > 0) {
        // For MVP, just take the first active market
        setMarket(markets[0]);
      } else {
        setMarket(null);
      }
    });

    newSocket.on('markets_suspended', (markets) => {
         if (markets.length > 0) {
            setMarket(markets[0]);
         }
    });

    newSocket.on('markets_unsuspended', (markets) => {
         if (markets.length > 0) {
            setMarket(markets[0]);
         }
    });

    newSocket.on('odds_update', (markets) => {
      if (markets.length > 0) {
        setMarket(markets[0]);
      }
    });

    newSocket.on('market_resolved', (resolvedMarket) => {
      setMarket(null);
      setEvents(prev => [...prev, {
        type: 'resolution',
        message: `Market Resolved: ${resolvedMarket.status} (Winner: ${resolvedMarket.status === 'WIN' ? 'YES' : 'NO'})`
      }]);
    });

    newSocket.on('markets_resolved', (resolvedMarkets) => {
        setMarket(null);
        resolvedMarkets.forEach(m => {
            setEvents(prev => [...prev, {
                type: 'resolution',
                message: `Market Resolved: ${m.status}`
              }]);
        });
    });

    // Sport Events
    newSocket.on('sport_event', (event) => {
      // Update match info based on event details
      setMatchInfo(prev => ({
        ...prev,
        time: `${event.details.minute}:00`,
      }));

      if (event.type === 'goal') {
        setMatchInfo(prev => {
           const isHome = event.details.team === 'Home';
           return {
               ...prev,
               score: {
                   home: isHome ? prev.score.home + 1 : prev.score.home,
                   away: !isHome ? prev.score.away + 1 : prev.score.away
               }
           }
        });
      }

      // Add to feed
      setEvents(prev => [...prev, {
        type: event.type,
        message: `${event.type.toUpperCase().replace('_', ' ')} - ${event.details.minute}' ${event.details.team} (${event.details.player})`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    return () => newSocket.close();
  }, []);

  const getEventIcon = (type) => {
    switch(type) {
      case 'goal': return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 'red_card': return <div className="w-3 h-4 bg-red-600 rounded-sm" />;
      case 'yellow_card': return <div className="w-3 h-4 bg-yellow-400 rounded-sm" />;
      case 'danger': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'safe': return <Info className="w-4 h-4 text-blue-400" />;
      case 'resolution': return <Info className="w-4 h-4 text-green-400" />;
      default: return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 shadow-lg">
        <div className="container mx-auto flex items-center justify-between">
            <h1 className="text-xl font-bold text-green-400 flex items-center gap-2">
                <Timer /> FlashBets Admin Dashboard
            </h1>
            <div className="text-sm text-gray-400">Live Connection: {socket?.connected ? 'Online' : 'Offline'}</div>
        </div>
      </header>

      <main className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">

        {/* Left Column: Match Info & Market */}
        <div className="md:col-span-2 space-y-6">

            {/* Scoreboard */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 flex flex-col items-center">
                <div className="text-gray-400 text-sm font-semibold tracking-wider mb-2">PREMIER LEAGUE (SIMULATED)</div>
                <div className="flex items-center justify-between w-full max-w-md">
                    <div className="text-center w-1/3">
                        <h2 className="text-2xl font-bold">{matchInfo.home}</h2>
                    </div>
                    <div className="text-center w-1/3 bg-gray-900 rounded-lg py-2 px-4 border border-gray-700">
                        <span className="text-4xl font-mono font-bold text-white">
                            {matchInfo.score.home} - {matchInfo.score.away}
                        </span>
                        <div className="text-green-500 text-sm font-mono mt-1 animate-pulse">{matchInfo.time}</div>
                    </div>
                    <div className="text-center w-1/3">
                        <h2 className="text-2xl font-bold">{matchInfo.away}</h2>
                    </div>
                </div>
            </div>

            {/* Market Card */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 relative overflow-hidden min-h-[300px] flex flex-col justify-center">

                {!market ? (
                    <div className="flex flex-col items-center justify-center text-gray-500 space-y-3">
                        <Timer className="w-12 h-12 animate-spin-slow" />
                        <span className="text-lg">Waiting for market opportunity...</span>
                    </div>
                ) : (
                    <>
                         {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white">Next Goal (5 Mins)</h3>
                                <p className="text-sm text-gray-400">Will there be a goal in the next 5 minutes?</p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-gray-400">Market ID: {market.id}</span>
                                <span className={`text-xs px-2 py-1 rounded font-bold ${market.status === 'OPEN' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                                    {market.status}
                                </span>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                disabled={market.status !== 'OPEN'}
                                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-6 rounded-lg font-bold text-xl flex flex-col items-center transition-all active:scale-95"
                            >
                                <span>YES (GOAL)</span>
                                <span className="text-3xl mt-1">{market.odds.yes.toFixed(2)}</span>
                            </button>

                            <button
                                disabled={market.status !== 'OPEN'}
                                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-6 rounded-lg font-bold text-xl flex flex-col items-center transition-all active:scale-95"
                            >
                                <span>NO (GOAL)</span>
                                <span className="text-3xl mt-1">{market.odds.no.toFixed(2)}</span>
                            </button>
                        </div>

                        {/* Suspended Overlay */}
                        {market.status === 'SUSPENDED' && (
                            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                <Lock className="w-16 h-16 text-gray-400 mb-2" />
                                <span className="text-2xl font-bold text-gray-200">MARKET SUSPENDED</span>
                            </div>
                        )}
                    </>
                )}
            </div>

        </div>

        {/* Right Column: Event Feed */}
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-700 bg-gray-800 rounded-t-xl">
                <h3 className="font-bold text-gray-300 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Live Event Feed
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {events.length === 0 && <p className="text-center text-gray-500 text-sm mt-10">No events yet...</p>}

                {events.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg border border-gray-700/50 hover:bg-gray-700/50 transition-colors">
                        <div className="mt-1">{getEventIcon(ev.type)}</div>
                        <div>
                            <p className="text-sm text-gray-200">{ev.message}</p>
                            {ev.timestamp && <p className="text-xs text-gray-500 mt-1">{ev.timestamp}</p>}
                        </div>
                    </div>
                ))}
                <div ref={eventsEndRef} />
            </div>
        </div>

      </main>
    </div>
  );
}

export default App;
