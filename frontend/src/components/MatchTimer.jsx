export default function MatchTimer({ match }) {
    if (!match || !match.fixture || !match.fixture.status) return null;

    const { status, elapsed, second, extra } = match.fixture.status;
    const rawStatus = match.fixture.status.raw || match.fixture.status.short;

    // Estados parados
    if (rawStatus === 'HT') return <span className="font-bold text-yellow-500">INTERVALO</span>;
    if (status === 'FINISHED' || status === 'FT' || status === 'AWARDED') return <span className="font-bold text-red-500">FIM DE JOGO</span>;
    if (status === 'TIMED' || status === 'SCHEDULED') return <span className="text-gray-400">A COMEÇAR</span>;

    // Formatação visual (adicionar zero à esquerda)
    const displaySec = second < 10 ? `0${second}` : second;

    // Lógica de Acréscimos (Visual apenas)
    if (extra) {
         return <span className="text-red-500 font-bold font-mono tracking-widest animate-pulse">{elapsed}+{extra}</span>;
    }

    // Heurística de Acréscimo sem campo explícito (45+ ou 90+)
    if (elapsed >= 90 && rawStatus === '2H') {
         return <span className="text-red-500 font-bold font-mono tracking-widest animate-pulse">90+{elapsed - 90}:{displaySec}</span>;
    }
    if (elapsed >= 45 && rawStatus === '1H') {
         return <span className="text-red-500 font-bold font-mono tracking-widest animate-pulse">45+{elapsed - 45}:{displaySec}</span>;
    }

    // Tempo Normal
    const displayMin = elapsed < 10 ? `0${elapsed}` : elapsed;
    return <span className="font-mono tabular-nums tracking-widest font-bold">{displayMin}:{displaySec}</span>;
}
