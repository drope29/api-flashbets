import React from 'react';
import { Wallet, Coins } from 'lucide-react';

export default function BetAmountPanel({ balance, currentAmount, setAmount }) {
    const quickAdd = (val) => {
        setAmount(prev => Math.min(balance, Number((prev + val).toFixed(2))));
    };

    const handleSliderChange = (e) => {
        setAmount(Number(e.target.value));
    };

    const handleInputChange = (e) => {
        let val = Number(e.target.value);
        if (val > balance) val = balance;
        if (val < 0) val = 0;
        setAmount(val);
    };

    return (
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg mb-6">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 text-gray-400">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-bold uppercase tracking-wide">Valor da Aposta</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-900 px-3 py-1 rounded-lg border border-gray-700">
                    <Wallet className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-400 font-mono font-bold text-sm">R$ {currentAmount.toFixed(2)}</span>
                </div>
            </div>

            {/* Range Slider */}
            <div className="relative mb-6">
                <input
                    type="range"
                    min="1"
                    max={balance > 0 ? balance : 100} // UX: Keep slider movable if balance 0 for visual, but capped
                    value={currentAmount}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all"
                    disabled={balance <= 0}
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-mono">
                    <span>R$ 1</span>
                    <span>R$ {balance.toFixed(0)}</span>
                </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-4 gap-2">
                <button
                    onClick={() => setAmount(10)}
                    disabled={balance < 10}
                    className="px-2 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    R$ 10
                </button>
                <button
                    onClick={() => quickAdd(10)}
                    disabled={currentAmount + 10 > balance}
                    className="px-2 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    +10
                </button>
                <button
                    onClick={() => quickAdd(50)}
                    disabled={currentAmount + 50 > balance}
                    className="px-2 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    +50
                </button>
                <button
                    onClick={() => setAmount(balance)}
                    disabled={balance <= 0}
                    className="px-2 py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 border border-yellow-600 rounded text-xs text-black font-black transition-all shadow-[0_0_10px_rgba(234,179,8,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ALL IN
                </button>
            </div>

            {/* Manual Input (Optional but good for precision) */}
            <div className="mt-4 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">R$</span>
                <input
                    type="number"
                    value={currentAmount}
                    onChange={handleInputChange}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 pl-10 pr-4 text-white font-mono text-sm focus:outline-none focus:border-green-500 transition-colors"
                    placeholder="Valor customizado"
                    min="1"
                    max={balance}
                />
            </div>
        </div>
    );
}
