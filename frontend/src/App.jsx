import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Lock, Timer, Info, Trophy, AlertTriangle, Wallet } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const SOCKET_URL = 'http://localhost:3001';

// Custom Modal Component
const BetModal = ({ isOpen, onClose, onConfirm, selection, odds, balance }) => {
  const [amount, setAmount] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    const val = parseFloat(amount);
    if (!val || isNaN(val) || val <= 0) {
      toast.error("Please enter a valid amount!");
      return;
    }
    if (val > balance) {
      toast.error("Insufficient balance!");
      return;
    }
    onConfirm(val);
    setAmount('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 w-full max-w-sm shadow-2xl transform transition-all scale-100">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          Place Bet: <span className={selection === 'YES' ? 'text-green-400' : 'text-red-400'}>{selection}</span>
        </h3>

        <div className="space-y-4">
          <div className="flex justify-between text-sm text-gray-400">
             <span>Odds:</span>
             <span className="font-bold text-white">{odds.toFixed(2)}</span>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Stake Amount (R$)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-green-500 outline-none text-lg font-mono"
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-colors shadow-lg shadow-green-900/20"
            >
              Confirm Bet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

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

  // Wallet State
  const [balance, setBalance] = useState(1000.00);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBet, setCurrentBet] = useState(null); // { selection: 'YES', odds: 2.50 }

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
    newSocket.on('market_update', (newMarket) => setMarket(newMarket));
    newSocket.on('market_created', (newMarket) => setMarket(newMarket));
    newSocket.on('markets_update', (markets) => setMarket(markets.length > 0 ? markets[0] : null));
    newSocket.on('markets_suspended', (markets) => setMarket(markets.length > 0 ? markets[0] : null));
    newSocket.on('markets_unsuspended', (markets) => setMarket(markets.length > 0 ? markets[0] : null));
    newSocket.on('odds_update', (markets) => setMarket(markets.length > 0 ? markets[0] : null));

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

    // Betting Events
    newSocket.on('bet_accepted', (data) => {
        // Update balance
        setBalance(prev => prev - data.amount);

        // Show success toast
        toast.success(
            <div>
                <span className="font-bold">Bet Confirmed!</span>
                <br/>
                <span className="text-sm">R$ {data.amount.toFixed(2)} on {data.selection} @ {data.odd.toFixed(2)}</span>
            </div>,
            {
                position: "top-right",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                theme: "dark",
            }
        );
    });

    newSocket.on('bet_rejected', (data) => {
        toast.error(`Bet Rejected: ${data.reason}`, {
            position: "top-right",
            autoClose: 5000,
            theme: "dark",
        });
    });

    // Sport Events
    newSocket.on('sport_event', (event) => {
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

      setEvents(prev => [...prev, {
        type: event.type,
        message: `${event.type.toUpperCase().replace('_', ' ')} - ${event.details.minute}' ${event.details.team} (${event.details.player})`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    return () => newSocket.close();
  }, []);

  const openBetModal = (selection, odds) => {
      if (!market || market.status !== 'OPEN') return;
      setCurrentBet({ selection, odds });
      setIsModalOpen(true);
  };

  const handleConfirmBet = (amount) => {
      if (!socket || !currentBet) return;

      socket.emit('place_bet', {
          marketId: market.id,
          selection: currentBet.selection,
          odd: currentBet.odds,
          amount: amount
      });

      setIsModalOpen(false);
      setCurrentBet(null);
  };

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
      <ToastContainer />

      {/* Bet Modal */}
      <BetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmBet}
        selection={currentBet?.selection}
        odds={currentBet?.odds}
        balance={balance}
      />

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 shadow-lg sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
            <h1 className="text-xl font-bold text-green-400 flex items-center gap-2">
                <Timer /> FlashBets Admin Dashboard
            </h1>

            <div className="flex items-center gap-4">
                <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-700 flex items-center gap-2 shadow-inner">
                    <Wallet className="w-5 h-5 text-yellow-500" />
                    <span className="font-mono font-bold text-lg text-yellow-400">
                        R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="text-xs text-gray-500 hidden md:block">
                    {socket?.connected ? '🟢 Online' : '🔴 Offline'}
                </div>
            </div>
        </div>
      </header>

      <main className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">

        {/* Left Column: Match Info & Market */}
        <div className="md:col-span-2 space-y-6">

            {/* Scoreboard */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 flex flex-col items-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>

                <div className="text-gray-400 text-xs font-bold tracking-[0.2em] mb-4 uppercase">Premier League (Simulated)</div>

                <div className="flex items-center justify-between w-full max-w-xl px-4">
                    <div className="text-center w-1/3">
                        <h2 className="text-xl md:text-2xl font-bold truncate">{matchInfo.home}</h2>
                    </div>

                    <div className="text-center w-1/3 flex flex-col items-center">
                        <div className="bg-black/40 backdrop-blur-md rounded-lg py-3 px-8 border border-gray-700/50 shadow-xl">
                            <span className="text-4xl md:text-5xl font-mono font-bold text-white tracking-widest">
                                {matchInfo.score.home}-{matchInfo.score.away}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-green-400 text-sm font-mono animate-pulse bg-green-900/20 px-2 py-0.5 rounded">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            {matchInfo.time}
                        </div>
                    </div>

                    <div className="text-center w-1/3">
                        <h2 className="text-xl md:text-2xl font-bold truncate">{matchInfo.away}</h2>
                    </div>
                </div>
            </div>

            {/* Market Card */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 relative overflow-hidden min-h-[320px] flex flex-col justify-center transition-all duration-300">

                {!market ? (
                    <div className="flex flex-col items-center justify-center text-gray-500 space-y-4 animate-pulse">
                        <Timer className="w-16 h-16 opacity-50" />
                        <span className="text-xl font-light">Waiting for market opportunity...</span>
                    </div>
                ) : (
                    <>
                         {/* Header */}
                        <div className="flex justify-between items-start mb-8 border-b border-gray-700/50 pb-4">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-1">Next Goal (5 Mins)</h3>
                                <p className="text-sm text-gray-400">Will a goal be scored in the next 5 minutes?</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${market.status === 'OPEN' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {market.status}
                                </span>
                                <span className="text-[10px] text-gray-600 font-mono">ID: {market.id}</span>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="grid grid-cols-2 gap-6">
                            <button
                                onClick={() => openBetModal('YES', market.odds.yes)}
                                disabled={market.status !== 'OPEN'}
                                className="group relative bg-gradient-to-br from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:grayscale text-white py-8 rounded-xl font-bold text-xl flex flex-col items-center transition-all active:scale-[0.98] shadow-lg shadow-green-900/20 border-t border-green-400/20"
                            >
                                <span className="text-sm text-green-200 mb-1 font-medium tracking-wide">YES (GOAL)</span>
                                <span className="text-4xl font-mono tracking-tighter group-hover:scale-110 transition-transform duration-200">{market.odds.yes.toFixed(2)}</span>
                            </button>

                            <button
                                onClick={() => openBetModal('NO', market.odds.no)}
                                disabled={market.status !== 'OPEN'}
                                className="group relative bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:grayscale text-white py-8 rounded-xl font-bold text-xl flex flex-col items-center transition-all active:scale-[0.98] shadow-lg shadow-red-900/20 border-t border-red-400/20"
                            >
                                <span className="text-sm text-red-200 mb-1 font-medium tracking-wide">NO (GOAL)</span>
                                <span className="text-4xl font-mono tracking-tighter group-hover:scale-110 transition-transform duration-200">{market.odds.no.toFixed(2)}</span>
                            </button>
                        </div>

                        {/* Suspended Overlay */}
                        {market.status === 'SUSPENDED' && (
                            <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 animate-fadeIn">
                                <Lock className="w-16 h-16 text-gray-500 mb-4" />
                                <span className="text-2xl font-bold text-gray-300 tracking-wider">MARKET SUSPENDED</span>
                                <span className="text-sm text-gray-500 mt-2">Odds are currently locked</span>
                            </div>
                        )}
                    </>
                )}
            </div>

        </div>

        {/* Right Column: Event Feed */}
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 flex flex-col h-[600px] overflow-hidden">
            <div className="p-4 border-b border-gray-700 bg-gray-800/50 backdrop-blur flex justify-between items-center">
                <h3 className="font-bold text-gray-300 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Info className="w-4 h-4 text-blue-400" /> Live Feed
                </h3>
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {events.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
                        <Info className="w-8 h-8 opacity-20" />
                        <p className="text-sm">Waiting for match start...</p>
                    </div>
                )}

                {events.slice().reverse().map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-gray-700/20 rounded-lg border border-gray-700/30 hover:bg-gray-700/40 transition-colors animate-slideIn">
                        <div className="mt-0.5 p-1.5 bg-gray-800 rounded-md shadow-sm border border-gray-700/50">{getEventIcon(ev.type)}</div>
                        <div>
                            <p className="text-sm text-gray-200 font-medium leading-snug">{ev.message}</p>
                            {ev.timestamp && <p className="text-[10px] text-gray-500 mt-1 font-mono">{ev.timestamp}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>

      </main>
    </div>
  );
}

export default App;
