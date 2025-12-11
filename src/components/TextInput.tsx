import { useState, useEffect, useRef } from 'react';
import { Type, Sparkles } from 'lucide-react';
import { Slider } from './ui/Slider';

interface TextInputProps {
    onImageGenerated: (image: HTMLImageElement) => void;
}

// Curated Google Fonts
const FONTS = [
    { name: 'Fredoka', family: "'Fredoka', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&display=swap' },
    { name: 'Pacifico', family: "'Pacifico', cursive", url: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap' },
    { name: 'Lobster', family: "'Lobster', cursive", url: 'https://fonts.googleapis.com/css2?family=Lobster&display=swap' },
    { name: 'Bangers', family: "'Bangers', system-ui", url: 'https://fonts.googleapis.com/css2?family=Bangers&display=swap' },
    { name: 'Roboto', family: "'Roboto', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap' },
    { name: 'Dancing Script', family: "'Dancing Script', cursive", url: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap' },
    { name: 'Righteous', family: "'Righteous', cursive", url: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap' },
];

export function TextInput({ onImageGenerated }: TextInputProps) {
    const [text, setText] = useState('Hola');
    const [fontIndex, setFontIndex] = useState(0);
    const [fontSize, setFontSize] = useState(200);
    const [fontWeight, setFontWeight] = useState(700);
    const [isItalic, setIsItalic] = useState(false);

    // Safety delay to ensure font loads
    const [fontLoaded, setFontLoaded] = useState<Set<string>>(new Set());

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Load Fonts dynamically
    useEffect(() => {
        FONTS.forEach(font => {
            if (!document.querySelector(`link[href="${font.url}"]`)) {
                const link = document.createElement('link');
                link.href = font.url;
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
        });
        // Simple timeout to "hope" fonts load, real webfontloader is overkill for now
        // Usually, the browser will swap. 
        // We can force a re-render or check document.fonts
        document.fonts.ready.then(() => {
            // Trigger redraw
            setFontLoaded(prev => new Set(prev).add('loaded'));
        });
    }, []);

    useEffect(() => {
        drawPreview();
    }, [text, fontIndex, fontSize, fontWeight, isItalic, fontLoaded]);

    const drawPreview = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Canvas Size (High Res)
        canvas.width = 1024;
        canvas.height = 1024;

        // Clear (White Background for tracing)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Config
        const font = FONTS[fontIndex];
        const style = isItalic ? 'italic' : 'normal';
        ctx.font = `${style} ${fontWeight} ${fontSize}px ${font.family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'black';

        // Draw Text
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    };

    const handleGenerate = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/png');
        const img = new Image();
        img.onload = () => {
            onImageGenerated(img);
        };
        img.src = dataUrl;
    };

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
                <Type className="w-5 h-5 text-green-400" />
                Generador de Texto (V17)
            </h3>

            <div className="space-y-4">
                {/* Text Input */}
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Texto</label>
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-blue-500"
                        placeholder="Tu Texto..."
                    />
                </div>

                {/* Font Selector */}
                <div>
                    <label className="text-xs text-gray-400 block mb-2">Tipografía</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {FONTS.map((font, i) => (
                            <button
                                key={font.name}
                                onClick={() => setFontIndex(i)}
                                className={`px-3 py-2 rounded-lg text-lg transition-all border text-left truncate
                                ${fontIndex === i
                                        ? 'bg-blue-600 border-blue-400 text-white'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                                    }`}
                                style={{ fontFamily: font.family }}
                            >
                                {font.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Style Controls */}
                <div className="flex gap-4">
                    <div className="flex-1">
                        <Slider
                            label="Tamaño"
                            value={fontSize}
                            min={50}
                            max={400}
                            unit="px"
                            onChange={setFontSize}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-black/20 p-2 rounded-lg">
                    <button
                        onClick={() => setIsItalic(!isItalic)}
                        className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${isItalic ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Cursiva
                    </button>
                    <button
                        onClick={() => setFontWeight(fontWeight === 700 ? 400 : 700)}
                        className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${fontWeight === 700 ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Negrita
                    </button>
                </div>

                {/* Preview Canvas (Scaled Down for UI) */}
                <div className="aspect-video bg-white/10 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden relative">
                    <div className="absolute inset-0 pattern-grid opacity-10 pointer-events-none"></div>
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* Action */}
                <button
                    onClick={handleGenerate}
                    className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl shadow-green-900/20 hover:from-green-400 hover:to-emerald-500 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                    <Sparkles className="w-5 h-5" />
                    Crear Cortador de Texto
                </button>
            </div>
        </div>
    );
}
