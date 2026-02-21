import { useState, useEffect } from 'react';

const MatchTimer = ({ match, flashTime }) => {
    const [displayTime, setDisplayTime] = useState(0);

    useEffect(() => {
        // Priority 1: Flash Timer (Synced with Backend Seconds)
        if (flashTime > 0) {
            setDisplayTime(flashTime);
            return;
        }

        // Priority 2: API Minute + Interpolation
        if (match?.fixture?.status?.elapsed && match?.serverTimestamp) {
            const now = Date.now();
            const elapsedSinceUpdate = (now - match.serverTimestamp) / 1000;
            const estimatedSeconds = (match.fixture.status.elapsed * 60) + elapsedSinceUpdate;
            setDisplayTime(Math.floor(estimatedSeconds));
            return;
        }

        // Priority 3: API Minute (Raw)
        if (match?.fixture?.status?.elapsed) {
            setDisplayTime(match.fixture.status.elapsed * 60);
            return;
        }

        // Priority 4: Fallback Logic (Date Diff)
        if (match?.fixture?.status?.short === 'IN_PLAY' && match?.fixture?.date) {
            const start = new Date(match.fixture.date).getTime();
            const now = Date.now();
            const diffSec = Math.floor((now - start) / 1000);
            setDisplayTime(Math.max(0, diffSec));
        }
    }, [match, flashTime]);

    // Local Ticker for smoothness
    useEffect(() => {
        const interval = setInterval(() => {
            setDisplayTime(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const min = Math.floor(displayTime / 60);
    const sec = Math.floor(displayTime % 60);

    // Safety Caps
    if (match?.fixture?.status?.short === 'PAUSED' || match?.fixture?.status?.short === 'HT') return <span className="font-bold text-yellow-500">INTERVALO</span>;
    if (match?.fixture?.status?.short === 'FINISHED' || match?.fixture?.status?.short === 'FT') return <span className="font-bold text-red-500">FIM DE JOGO</span>;

    let formattedTime = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    let isStoppage = false;

    // Stoppage Time Logic with Anti-Infinity Caps (Max +15)
    // First Half Stoppage (45+)
    if (min >= 45 && match?.fixture?.status?.period === '1H') {
        const extra = Math.min(min - 45, 15);
        formattedTime = `45+${extra}:${sec.toString().padStart(2, '0')}`;
        isStoppage = true;
    }
    // Second Half Stoppage (90+)
    else if (min >= 90) { // status period usually 2H here or not updated yet
         const extra = Math.min(min - 90, 15);
         formattedTime = `90+${extra}:${sec.toString().padStart(2, '0')}`;
         isStoppage = true;
    }

    return (
        <span className={`font-mono tabular-nums tracking-widest ${isStoppage ? 'text-red-500 animate-pulse font-black' : ''}`}>
            {formattedTime}
        </span>
    );
};

export default MatchTimer;
