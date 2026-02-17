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
    const sec = displayTime % 60;

    return (
        <span className="font-mono tabular-nums tracking-widest">
            {min.toString().padStart(2, '0')}:{sec.toString().padStart(2, '0')}
        </span>
    );
};

export default MatchTimer;
