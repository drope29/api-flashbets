import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Timer, Trophy, Info, Lock, Zap, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import MatchTimer from './MatchTimer';

// Compact Odds Button (Professional Style)
const FlashOddsButton = ({ title, odds, onClick, disabled, className = '' }) => {
    const [prevOdds, setPrevOdds] = useState(odds);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (odds > prevOdds) setFlashClass('text-green-400 font-black animate-pulse');
        else if (odds < prevOdds) setFlashClass('text-red-400 font-black animate-pulse');

        const timeout = setTimeout(() => setFlashClass('text-gray-200 font-bold'), 1000);
        setPrevOdds(odds);
        return () => clearTimeout(timeout);
    }, [odds]);

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                flex items-center justify-between w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
                border border-gray-300 dark:border-gray-700 rounded p-2 transition-all active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed
                ${className}
            `}
        >
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-400 truncate mr-2">{title}</span>
            <span className={`text-sm font-mono transition-colors ${flashClass || 'text-gray-800 dark:text-gray-200 font-bold'}`}>
                {odds.toFixed(2)}
            </span>
        </button>
    );
};

const getEventIcon = (type) => {
    const lowerType = type?.toLowerCase();
    switch(lowerType) {
      case 'goal': return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 'red_card': return <div className="w-3 h-4 bg-red-600 rounded-sm" />;
      case 'yellow_card': return <div className="w-3 h-4 bg-yellow-400 rounded-sm" />;
      case 'booking': return <div className="w-3 h-4 bg-yellow-400 rounded-sm" />;
      case 'danger': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'safe': return <Info className="w-4 h-4 text-blue-400" />;
      case 'resolution': return <Info className="w-4 h-4 text-green-400" />;
      default: return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
};

const Accordion = ({ title, isOpen, onToggle, children }) => {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm mb-4">
            <button
                onClick={onToggle}
                className={`w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors ${isOpen ? 'border-b border-gray-800' : ''}`}
            >
                <h3 className="font-bold text-gray-200 text-sm uppercase tracking-wider">{title}</h3>
                {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {isOpen && (
                <div className="p-2 md:p-4 bg-gray-900/50">
                    {children}
                </div>
            )}
        </div>
    );
};

const MarketGroup = ({ market, onBet, isFinished }) => {
    const isLocked = isFinished || market.status !== 'OPEN';

    // --- 1X2 Layout ---
    if (market.type === '1x2' || market.type === '1x2_period') {
        return (
            <div className="bg-gray-800/30 border border-gray-700/50 rounded p-3 mb-2 relative">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-green-500" />
                        <span className="text-xs font-bold text-gray-300">{market.title}</span>
                    </div>
                    {market.interval && <span className="text-[10px] font-mono text-gray-500">{market.interval}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {['home', 'draw', 'away'].map((opt, i) => (
                        <FlashOddsButton
                            key={opt}
                            title={market.options ? market.options[i] : opt}
                            odds={market.odds[opt]}
                            onClick={() => onBet(market.id, market.options ? market.options[i] : opt, market.odds[opt])}
                            disabled={isLocked}
                        />
                    ))}
                </div>
                {/* Progress Bar */}
                {market.progress >= 0 && (
                    <div className="mt-3 h-0.5 w-full bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                            style={{ width: `${market.progress}%` }}
                        ></div>
                    </div>
                )}
                {isLocked && <div className="absolute inset-0 bg-black/50 z-10 rounded cursor-not-allowed"></div>}
            </div>
        );
    }

    // --- Over/Under Layout ---
    if (market.type === 'over_under' || market.type === 'over_under_period') {
         return (
            <div className="bg-gray-800/30 border border-gray-700/50 rounded p-3 mb-2 relative">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-green-500" />
                        <span className="text-xs font-bold text-gray-300">{market.title}</span>
                    </div>
                    {market.interval && <span className="text-[10px] font-mono text-gray-500">{market.interval}</span>}
                </div>
                <div className="grid grid-cols-2 gap-px bg-gray-700 rounded overflow-hidden border border-gray-700">
                    <div className="bg-gray-900 p-2 text-center text-[10px] text-gray-500 font-bold uppercase">Mais</div>
                    <div className="bg-gray-900 p-2 text-center text-[10px] text-gray-500 font-bold uppercase">Menos</div>
                    <FlashOddsButton title="Mais" odds={market.odds.over} onClick={() => onBet(market.id, 'Over', market.odds.over)} disabled={isLocked} className="!rounded-none !border-0" />
                    <FlashOddsButton title="Menos" odds={market.odds.under} onClick={() => onBet(market.id, 'Under', market.odds.under)} disabled={isLocked} className="!rounded-none !border-0" />
                </div>
                {/* Progress Bar */}
                {market.progress >= 0 && (
                    <div className="mt-3 h-0.5 w-full bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                            style={{ width: `${market.progress}%` }}
                        ></div>
                    </div>
                )}
                {isLocked && <div className="absolute inset-0 bg-black/50 z-10 rounded cursor-not-allowed"></div>}
            </div>
        );
    }

    // --- Flash/Time Layout (Default - Yes/No) ---
    return (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded p-3 mb-2 relative group">
            <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-green-500" />
                    <span className="text-xs font-bold text-gray-300">{market.title}</span>
                 </div>
                 {market.interval && <span className="text-[10px] font-mono text-gray-500">{market.interval}</span>}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <FlashOddsButton title="SIM" odds={market.odds.yes} onClick={() => onBet(market.id, 'YES', market.odds.yes)} disabled={isLocked} />
                <FlashOddsButton title="NÃO" odds={market.odds.no} onClick={() => onBet(market.id, 'NO', market.odds.no)} disabled={isLocked} />
            </div>

            {/* Progress Bar */}
            {market.progress >= 0 && (
                <div className="mt-3 h-0.5 w-full bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                        style={{ width: `${market.progress}%` }}
                    ></div>
                </div>
            )}

            {isLocked && <div className="absolute inset-0 bg-black/50 z-10 rounded cursor-not-allowed"></div>}
        </div>
    );
};

const MatchDetails = ({ matchInfo, flashTimer, events, onBack, onBet }) => {
    const [isFinished, setIsFinished] = useState(false);
    const [openCategories, setOpenCategories] = useState({});

    // Initialize Accordion State (Open first 2 categories)
    useEffect(() => {
        if (matchInfo?.markets) {
            const keys = Object.keys(matchInfo.markets);
            const initial = {};
            keys.forEach((k, i) => {
                if (i < 2) initial[k] = true;
            });
            setOpenCategories(prev => Object.keys(prev).length === 0 ? initial : prev);
        }
    }, [matchInfo]);

    const toggleCategory = (cat) => {
        setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    // Lifecycle Monitor
    useEffect(() => {
        if (!matchInfo?.fixture?.status?.short) return;

        const status = matchInfo.fixture.status.short;
        if (['FINISHED', 'AWARDED', 'FT'].includes(status)) {
            setIsFinished(true);
            toast.warn("Partida Encerrada! Retornando ao menu...", { autoClose: 2000 });

            const timer = setTimeout(() => {
                onBack();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [matchInfo, onBack]);

    const getEventMessage = (ev) => {
        if (ev.message) return ev.message;
        if (ev.type === 'GOAL') return `GOAL! ${ev.team?.name || 'Team'} - ${ev.player?.name || 'Player'}`;
        if (ev.type === 'BOOKING') return `Card: ${ev.player?.name || 'Player'} (${ev.team?.name || 'Team'})`;
        return `${ev.type} at ${ev.minute}'`;
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
             {/* Back & Title */}
             <div className="flex items-center gap-4">
                <button onClick={onBack} disabled={isFinished} className="p-2 hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50">
                    <ArrowLeft className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex-1 text-center">
                    <h2 className="text-lg font-bold text-gray-300">{matchInfo.home} vs {matchInfo.away}</h2>
                </div>
                <div className="w-9"></div>
             </div>

             {/* Main Clock & Score */}
             <div className="flex flex-col items-center justify-center py-6 relative">
                <div className="absolute inset-0 bg-green-500/5 blur-[80px] rounded-full"></div>
                <div className="text-4xl font-bold text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
                    <MatchTimer match={matchInfo} flashTime={flashTimer} />
                </div>
                <div className="text-5xl font-black text-white mt-2 tracking-widest shadow-black drop-shadow-2xl z-10">
                    {matchInfo.score.home}-{matchInfo.score.away}
                </div>
             </div>

             {/* Markets Accordion */}
             {matchInfo.markets && typeof matchInfo.markets === 'object' && !Array.isArray(matchInfo.markets) ? (
                 <div className="space-y-2">
                     {Object.entries(matchInfo.markets).map(([category, markets]) => (
                         <Accordion
                            key={category}
                            title={category}
                            isOpen={openCategories[category]}
                            onToggle={() => toggleCategory(category)}
                         >
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                 {Array.isArray(markets) && markets.map(market => (
                                     <MarketGroup
                                        key={market.id}
                                        market={market}
                                        onBet={onBet}
                                        isFinished={isFinished}
                                     />
                                 ))}
                             </div>
                         </Accordion>
                     ))}
                 </div>
             ) : (
                 // Waiting State
                 <div className="bg-gray-900 border border-gray-800 rounded-2xl p-1 relative overflow-hidden shadow-2xl">
                     <div className="p-12 text-center text-gray-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <h3 className="text-xl font-bold">Aguardando abertura de mercado...</h3>
                     </div>
                 </div>
             )}

             {/* Feed */}
             <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 flex flex-col h-[300px] overflow-hidden">
                <div className="p-4 border-b border-gray-700 bg-gray-800/50 backdrop-blur flex justify-between items-center">
                    <h3 className="font-bold text-gray-300 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Info className="w-4 h-4 text-blue-400" /> LANCE A LANCE
                    </h3>
                    <span className={`w-2 h-2 rounded-full ${isFinished ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {events.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
                            <Info className="w-8 h-8 opacity-20" />
                            <p className="text-sm">Aguardando eventos...</p>
                        </div>
                    )}

                    {(events || []).slice().reverse().map((ev, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-gray-700/20 rounded-lg border border-gray-700/30 hover:bg-gray-700/40 transition-colors animate-slideIn">
                            <div className="mt-0.5 p-1.5 bg-gray-800 rounded-md shadow-sm border border-gray-700/50">{getEventIcon(ev.type)}</div>
                            <div>
                                <p className="text-sm text-gray-200 font-medium leading-snug">{getEventMessage(ev)}</p>
                                {ev.minute && <p className="text-[10px] text-gray-500 mt-1 font-mono">{ev.minute}'</p>}
                                {ev.timestamp && !ev.minute && <p className="text-[10px] text-gray-500 mt-1 font-mono">{ev.timestamp}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MatchDetails;
