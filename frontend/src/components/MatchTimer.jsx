import { useState, useEffect } from 'react';

const MatchTimer = ({ match }) => {
    // SINGLE SOURCE OF TRUTH: The API Minute (match.fixture.status.elapsed)
    // We only count seconds locally to smooth out the display between updates.

    const [seconds, setSeconds] = useState(0);
    const minute = match?.fixture?.status?.elapsed || 0;
    const status = match?.fixture?.status?.short;
    const period = match?.fixture?.status?.period;

    // Reset seconds whenever the official minute changes from the API
    useEffect(() => {
        setSeconds(0);
    }, [minute]);

    // Simple ticker: Count up to 59 seconds, then hold until API updates the minute
    useEffect(() => {
        if (status !== 'IN_PLAY' && status !== '1H' && status !== '2H') return;

        const interval = setInterval(() => {
            setSeconds(prev => (prev < 59 ? prev + 1 : 59));
        }, 1000);
        return () => clearInterval(interval);
    }, [status, minute]); // Reset ticker on status or minute change

    // 1. Status Logic (Overrides Time)
    if (status === 'PAUSED' || status === 'HT') return <span className="font-bold text-yellow-500">INTERVALO</span>;
    if (['FINISHED', 'FT', 'AWARDED', 'INT'].includes(status)) return <span className="font-bold text-red-500">FIM DE JOGO</span>;

    // 2. Formatting Logic
    const displaySecs = seconds < 10 ? `0${seconds}` : seconds;
    let isStoppage = false;
    let formattedTime = '';

    // Stoppage Time: 1H (45+)
    if (minute >= 45 && period === '1H') {
        const extra = minute - 45;
        formattedTime = `45+${extra}:${displaySecs}`;
        isStoppage = true;
    }
    // Stoppage Time: 2H (90+)
    else if (minute >= 90) {
        const extra = minute - 90;
        formattedTime = `90+${extra}:${displaySecs}`;
        isStoppage = true;
    }
    // Standard Time
    else {
        const displayMinute = minute < 10 ? `0${minute}` : minute;
        formattedTime = `${displayMinute}:${displaySecs}`;
    }

    return (
        <span className={`font-mono tabular-nums tracking-widest ${isStoppage ? 'text-red-500 animate-pulse font-black' : ''}`}>
            {formattedTime}
        </span>
    );
};

export default MatchTimer;
