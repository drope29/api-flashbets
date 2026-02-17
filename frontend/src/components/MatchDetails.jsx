import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Timer, Trophy, Info, Lock, Zap, Calendar, Wallet } from 'lucide-react';
import { toast } from 'react-toastify';
import MatchTimer from './MatchTimer';

const FlashOddsButton = ({ type, odds, onClick, disabled }) => {
    const [prevOdds, setPrevOdds] = useState(odds);
    const [flashClass, setFlashClass] = useState('');

    useEffect(() => {
        if (odds > prevOdds) {
            setFlashClass('bg-green-500 text-white animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.8)]');
        } else if (odds < prevOdds) {
            setFlashClass('bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]');
        }

        const timeout = setTimeout(() => setFlashClass(''), 500);
        setPrevOdds(odds);
        return () => clearTimeout(timeout);
    }, [odds]);

    const baseColor = type === 'YES' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500';

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                relative flex flex-col items-center justify-center py-8 rounded-xl font-black text-2xl transition-all active:scale-[0.98] shadow-lg
                disabled:opacity-50 disabled:grayscale
                ${flashClass || `${baseColor} text-white border-t border-white/10`}
            `}
        >
            <span className="text-xs uppercase tracking-widest opacity-90 mb-1 font-bold">{type}</span>
            <span className="text-4xl font-mono tracking-tighter">{odds.toFixed(2)}</span>
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

const MatchDetails = ({ matchInfo, flashTimer, events, onBack, onBet }) => {
    const [isFinished, setIsFinished] = useState(false);

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
        <div className="max-w-4xl mx-auto space-y-8">
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
             <div className="flex flex-col items-center justify-center py-8 relative">
                <div className="absolute inset-0 bg-green-500/5 blur-[100px] rounded-full"></div>
                <div className="text-4xl font-bold text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
                    <MatchTimer match={matchInfo} flashTime={flashTimer} />
                </div>
                <div className="text-6xl font-black text-white mt-4 tracking-widest shadow-black drop-shadow-2xl z-10">
                    {matchInfo.score.home}-{matchInfo.score.away}
                </div>
                <div className="text-xs font-bold text-gray-500 mt-2 tracking-[0.2em] uppercase z-10">
                    {isFinished ? 'MATCH FINISHED' : 'LIVE MATCH TIME'}
                </div>
             </div>

             {/* Markets Grid */}
             {matchInfo.markets && matchInfo.markets.length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {matchInfo.markets.map(market => (
                         <div key={market.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 relative overflow-hidden shadow-xl">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                                    <Clock className="w-4 h-4 text-green-400" />
                                    {market.title}
                                </h3>
                                <div className="text-xs font-mono font-bold bg-gray-800 px-2 py-1 rounded text-gray-300 border border-gray-700">
                                    {market.interval}
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-6">
                                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                                    <div
                                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                                        style={{ width: `${market.progress || 0}%` }}
                                    ></div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="grid grid-cols-2 gap-2">
                                <FlashOddsButton
                                    type="YES"
                                    odds={market.odds?.yes || 1.0}
                                    onClick={() => onBet(market.id, 'YES', market.odds.yes)}
                                    disabled={isFinished || market.status !== 'OPEN'}
                                />
                                <FlashOddsButton
                                    type="NO"
                                    odds={market.odds?.no || 1.0}
                                    onClick={() => onBet(market.id, 'NO', market.odds.no)}
                                    disabled={isFinished || market.status !== 'OPEN'}
                                />
                            </div>

                            {isFinished && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
                                    <Lock className="w-8 h-8 text-gray-500" />
                                </div>
                            )}
                         </div>
                     ))}
                 </div>
             ) : (
                 // Waiting State
                 <div className="bg-gray-900 border border-gray-800 rounded-2xl p-1 relative overflow-hidden shadow-2xl">
                     <div className="p-12 text-center text-gray-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <h3 className="text-xl font-bold">Waiting for market...</h3>
                     </div>
                 </div>
             )}

             {/* Feed */}
             <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 flex flex-col h-[300px] overflow-hidden">
                <div className="p-4 border-b border-gray-700 bg-gray-800/50 backdrop-blur flex justify-between items-center">
                    <h3 className="font-bold text-gray-300 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Info className="w-4 h-4 text-blue-400" /> Live Feed
                    </h3>
                    <span className={`w-2 h-2 rounded-full ${isFinished ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {events.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
                            <Info className="w-8 h-8 opacity-20" />
                            <p className="text-sm">Waiting for match events...</p>
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
