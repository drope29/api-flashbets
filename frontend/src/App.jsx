import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Lock, Timer, Info, Trophy, AlertTriangle, Wallet, ArrowLeft, Play, Globe, Calendar, Zap, Clock } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MatchTimer from './components/MatchTimer';
import MatchDetails from './components/MatchDetails';

const SOCKET_URL = 'http://localhost:3001';

// --- Main Components ---

const MatchCard = ({ match, onJoin }) => {
  return (
    <div
      onClick={() => onJoin(match.fixture.id)}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:bg-gray-750 hover:border-green-500/30 transition-all cursor-pointer group shadow-lg"
    >
      <div className="flex justify-between items-center mb-3 text-xs text-gray-400 font-mono tracking-wider">
        <span className="flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            {match.league.name}
        </span>
        {['IN_PLAY', 'PAUSED', 'LIVE'].includes(match.fixture.status.short) ? (
             <div className="text-sm font-bold text-green-400 bg-green-900/20 px-2 py-0.5 rounded border border-green-500/30">
                 <MatchTimer match={match} flashTime={0} />
             </div>
        ) : (
            <span className="px-2 py-0.5 rounded bg-gray-700/50 text-gray-300">
                {match.fixture.status.short}
            </span>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div className="flex-1 text-right pr-4">
            <h3 className="font-bold text-gray-200 group-hover:text-white truncate">{match.teams.home.name}</h3>
        </div>

        <div className="bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-700 font-mono font-bold text-lg text-white group-hover:border-green-500/50 transition-colors">
            {match.goals.home}-{match.goals.away}
        </div>

        <div className="flex-1 text-left pl-4">
            <h3 className="font-bold text-gray-200 group-hover:text-white truncate">{match.teams.away.name}</h3>
        </div>
      </div>

      <div className="mt-3 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-green-400 font-bold flex items-center gap-1">
            <Zap className="w-3 h-3 fill-green-400" />
            Flash Betting Available
        </span>
      </div>
    </div>
  );
};

// Bet Modal Component
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700 w-full max-w-sm shadow-2xl transform transition-all scale-100 ring-1 ring-white/10">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400 fill-current" />
                Confirm Bet
            </h3>
            <div className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-400">ID: #B3T-X9</div>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-xl border border-gray-700">
             <span className={`text-2xl font-black ${selection === 'YES' ? 'text-green-400' : 'text-red-400'}`}>{selection}</span>
             <div className="text-right">
                 <div className="text-xs text-gray-500 uppercase tracking-wide">Odds</div>
                 <div className="text-3xl font-mono font-bold text-white">{odds.toFixed(2)}</div>
             </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2 font-medium">Stake Amount (R$)</label>
            <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 pl-12 text-white focus:ring-2 focus:ring-green-500 outline-none text-2xl font-mono placeholder-gray-700"
                  placeholder="0"
                  autoFocus
                />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="py-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-lg transition-colors shadow-lg shadow-green-900/40"
            >
              PLACE BET
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [socket, setSocket] = useState(null);
  const [view, setView] = useState('list');
  const [activeFixtureId, setActiveFixtureId] = useState(null);
  const [activeTab, setActiveTab] = useState('LIVE');

  // Data State
  const [matchList, setMatchList] = useState([]);
  const [matchInfo, setMatchInfo] = useState({ home: '', away: '', score: { home: 0, away: 0 } });
  const [events, setEvents] = useState([]);

  // Flash State
  const [flashTimer, setFlashTimer] = useState(0);
  const [flashMarkets, setFlashMarkets] = useState({ current: null });

  // Wallet State
  const [balance, setBalance] = useState(1000.00);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBet, setCurrentBet] = useState(null);

  // Initial Fetch of Match List
  useEffect(() => {
    const fetchMatches = async () => {
        try {
            const res = await fetch('http://localhost:3001/matches');
            const data = await res.json();
            setMatchList(data);

            const hasLive = data.some(m => ['IN_PLAY', 'PAUSED'].includes(m.fixture.status.short));
            if (hasLive) setActiveTab('LIVE');
            else setActiveTab('TODAY');

        } catch (err) {
            console.error("Failed to fetch matches:", err);
        }
    };
    fetchMatches();
  }, []);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to backend');
    });

    // Flash Updates (High Frequency)
    newSocket.on('flash_update', (data) => {
        setFlashTimer(data.timer);
        setFlashMarkets(data.markets);
    });

    // Betting Events
    newSocket.on('bet_accepted', (data) => {
        setBalance(prev => prev - data.amount);
        toast.success(`Bet Confirmed! R$ ${data.amount}`, { theme: "dark", autoClose: 2000 });
    });

    newSocket.on('bet_rejected', (data) => {
        toast.error(`Bet Rejected: ${data.reason}`, { theme: "dark" });
    });

    // Standard Match Update (Score)
    newSocket.on('match_update', (match) => {
        setMatchInfo({
            home: match.teams.home.name,
            away: match.teams.away.name,
            score: match.goals,
            fixture: match.fixture,
            serverTimestamp: match.serverTimestamp, // Pass timestamp for interpolation
            markets: match.markets
        });
    });

    // Global Matches Update (for List View)
    newSocket.on('matches_update', (updatedMatches) => {
        setMatchList(prevList => {
            // Create a map for faster lookup
            const listMap = new Map(prevList.map(m => [m.fixture.id, m]));

            updatedMatches.forEach(updatedMatch => {
                listMap.set(updatedMatch.fixture.id, updatedMatch);
            });

            return Array.from(listMap.values());
        });
    });

    return () => newSocket.close();
  }, []); // Run once on mount

  // Handle Game Room Join/Leave
  useEffect(() => {
      if (!socket) return;

      if (view === 'game' && activeFixtureId) {
          // Re-emit join_game if socket reconnected or view changed
          // This ensures we are in the room even if socket was reset (though we use single socket now)
          socket.emit('join_game', activeFixtureId);
      }
  }, [view, activeFixtureId, socket]);

  // Handlers
  const handleJoinGame = (fixtureId) => {
      if (!socket) return;
      const match = matchList.find(m => m.fixture.id === fixtureId);
      if (match) {
          setMatchInfo({
              home: match.teams.home.name,
              away: match.teams.away.name,
              score: match.goals,
              fixture: match.fixture,
              markets: match.markets
          });
          setActiveFixtureId(fixtureId);
          setEvents(match.events || []); // Initialize with historical/debug events
          setFlashMarkets({ current: null });

          socket.emit('join_game', fixtureId);
          setView('game');
      }
  };

  const handleLeaveGame = () => {
      if (!socket) return;
      socket.emit('leave_game', activeFixtureId);
      setActiveFixtureId(null);
      setView('list');
  };

  const openBetModal = (marketId, selection, odds) => {
      setCurrentBet({ marketId, selection, odds });
      setIsModalOpen(true);
  };

  const handleConfirmBet = (amount) => {
      if (!socket || !currentBet) return;
      socket.emit('place_bet', {
          marketId: currentBet.marketId,
          selection: currentBet.selection,
          odd: currentBet.odds,
          amount: amount
      });
      setIsModalOpen(false);
      setCurrentBet(null);
  };

  // Helper for Tabs
  const getMatchCategory = (match) => {
    const status = match.fixture.status.short;
    if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(status)) return 'LIVE';

    const matchDate = new Date(match.fixture.date).toDateString();
    const today = new Date().toDateString();

    if (matchDate === today) return 'TODAY';
    return 'UPCOMING';
  };

  const counts = {
      LIVE: matchList.filter(m => getMatchCategory(m) === 'LIVE').length,
      TODAY: matchList.filter(m => getMatchCategory(m) === 'TODAY').length,
      UPCOMING: matchList.filter(m => getMatchCategory(m) === 'UPCOMING').length,
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-green-500 selection:text-black">
      <ToastContainer position="bottom-right" />

      <BetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmBet}
        selection={currentBet?.selection}
        odds={currentBet?.odds || 0}
        balance={balance}
      />

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 p-4 shadow-xl sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div className="container mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 flex items-center gap-2 cursor-pointer" onClick={handleLeaveGame}>
                <Zap className="text-green-400 fill-current" /> FLASHBETS
            </h1>

            <div className="bg-gray-800 px-4 py-1.5 rounded-full border border-gray-700 flex items-center gap-3">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span className="font-mono font-bold text-emerald-300">
                    R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
            </div>
        </div>
      </header>

      <main className="container mx-auto p-4 mt-2">

        {view === 'list' ? (
            // LIST VIEW
            <div className="space-y-6">
                 {/* Tabs */}
                 <div className="flex gap-4 border-b border-gray-800 pb-1">
                    {['LIVE', 'TODAY', 'UPCOMING'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-3 text-sm font-bold tracking-wide transition-colors relative ${activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {tab}
                            <span className="ml-2 text-xs opacity-60">({counts[tab]})</span>
                            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>}
                        </button>
                    ))}
                 </div>

                 {/* Grid */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {matchList.filter(m => getMatchCategory(m) === activeTab).map(match => (
                        <MatchCard key={match.fixture.id} match={match} onJoin={handleJoinGame} />
                    ))}
                 </div>
            </div>
        ) : (
            // GAME VIEW (FLASH MODE)
            <MatchDetails
                matchInfo={matchInfo}
                flashTimer={flashTimer}
                flashMarkets={flashMarkets}
                events={events}
                onBack={handleLeaveGame}
                onBet={openBetModal}
            />
        )}

      </main>
    </div>
  );
}

export default App;
