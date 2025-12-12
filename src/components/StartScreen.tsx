import { Cookie, Key, MousePointer2 } from 'lucide-react';

export type AppMode = 'cutter' | 'keychain' | 'free';

interface StartScreenProps {
    onSelectMode: (mode: AppMode) => void;
}

export function StartScreen({ onSelectMode }: StartScreenProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 text-white p-4">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Cutter Mode */}
                <button
                    onClick={() => onSelectMode('cutter')}
                    className="group relative flex flex-col items-center p-8 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500 hover:bg-zinc-800 transition-all text-center"
                >
                    <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
                        <Cookie className="w-10 h-10 text-blue-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Cortador</h2>
                    <p className="text-zinc-400 text-sm">
                        Diseña cortadores de galletas con base reforzada, muro de corte filo y sello opcional.
                    </p>
                </button>

                {/* Keychain Mode */}
                <button
                    onClick={() => onSelectMode('keychain')}
                    className="group relative flex flex-col items-center p-8 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-purple-500 hover:bg-zinc-800 transition-all text-center"
                >
                    <div className="w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center mb-6 group-hover:bg-purple-500/20 transition-colors">
                        <Key className="w-10 h-10 text-purple-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Llavero</h2>
                    <p className="text-zinc-400 text-sm">
                        Crea llaveros sólidos con relieve, orificio para anilla y base geométrica opcional.
                    </p>
                </button>

                {/* Free Edit Mode */}
                <button
                    onClick={() => onSelectMode('free')}
                    className="group relative flex flex-col items-center p-8 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 hover:bg-zinc-800 transition-all text-center"
                >
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
                        <MousePointer2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Edición Libre</h2>
                    <p className="text-zinc-400 text-sm">
                        Lienzo en blanco. Crea formas, extrusiones simples y opera con booleanas (Huecos) sin restricciones.
                    </p>
                </button>

            </div>
        </div>
    );
}
