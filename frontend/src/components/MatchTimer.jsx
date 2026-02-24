export default function MatchTimer({ match }) {
    if (!match || !match.fixture || !match.fixture.status) return null;

    const status = match.fixture.status.short;
    const period = match.fixture.status.period;
    const m = match.fixture.status.elapsed || 0;
    const s = match.fixture.status.second || 0;

    // Estados parados
    if (status === 'PAUSED' || status === 'HT') return <span className="font-bold text-yellow-500">INTERVALO</span>;
    if (status === 'FINISHED' || status === 'FT' || status === 'AWARDED') return <span className="font-bold text-red-500">FIM DE JOGO</span>;
    if (status === 'TIMED' || status === 'SCHEDULED') return <span className="text-gray-400">A COMEÇAR</span>;

    // Formatação visual (adicionar zero à esquerda)
    const displayMin = m < 10 ? `0${m}` : m;
    const displaySec = s < 10 ? `0${s}` : s;

    // Lógica de Acréscimos (Visual apenas)
    if (m >= 90) return <span className="text-red-500 font-bold font-mono tracking-widest animate-pulse">90+{m - 90}:{displaySec}</span>;
    if (m >= 45 && period === '1H') return <span className="text-red-500 font-bold font-mono tracking-widest animate-pulse">45+{m - 45}:{displaySec}</span>;

    return <span className="font-mono tabular-nums tracking-widest font-bold">{displayMin}:{displaySec}</span>;
}
