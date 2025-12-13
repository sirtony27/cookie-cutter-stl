import { useState, useEffect, useRef } from 'react';
import { Type, X, Check } from 'lucide-react';
import * as THREE from 'three';
import { processImage } from '../core/image-processing';

// ------------------------------------------------------------------
// Font Library (Curated for Cutting)
// ------------------------------------------------------------------
const GOOGLE_FONTS = [
    // Scripts (Great for Names)
    { name: 'Pacifico', family: "'Pacifico', cursive", category: 'Script' },
    { name: 'Lobster', family: "'Lobster', cursive", category: 'Script' },
    { name: 'Dancing Script', family: "'Dancing Script', cursive", category: 'Script' },
    { name: 'Great Vibes', family: "'Great Vibes', cursive", category: 'Script' },
    { name: 'Satisfy', family: "'Satisfy', cursive", category: 'Script' },
    { name: 'Cookie', family: "'Cookie', cursive", category: 'Script' },
    { name: 'Sacramento', family: "'Sacramento', cursive", category: 'Script' },

    // Rounded / Friendly (Great for Kids)
    { name: 'Fredoka', family: "'Fredoka', sans-serif", category: 'Rounded' },
    { name: 'Varela Round', family: "'Varela Round', sans-serif", category: 'Rounded' },
    { name: 'Sniglet', family: "'Sniglet', system-ui", category: 'Rounded' },
    { name: 'Chewy', family: "'Chewy', system-ui", category: 'Fun' },

    // Bold / Display (Easy to Cut)
    { name: 'Bangers', family: "'Bangers', system-ui", category: 'Display' },
    { name: 'Luckiest Guy', family: "'Luckiest Guy', cursive", category: 'Display' },
    { name: 'Carter One', family: "'Carter One', system-ui", category: 'Display' },
    { name: 'Oswald', family: "'Oswald', sans-serif", category: 'Sans' },
    { name: 'Anton', family: "'Anton', sans-serif", category: 'Sans' },
    { name: 'Black Ops One', family: "'Black Ops One', system-ui", category: 'Display' },

    // Classic
    { name: 'Roboto', family: "'Roboto', sans-serif", category: 'Sans' },
    { name: 'Montserrat', family: "'Montserrat', sans-serif", category: 'Sans' },
    { name: 'Playfair Display', family: "'Playfair Display', serif", category: 'Serif' },
    { name: 'Abril Fatface', family: "'Abril Fatface', serif", category: 'Serif' },
    { name: 'Righteous', family: "'Righteous', cursive", category: 'Modern' },
    { name: 'Orbitron', family: "'Orbitron', sans-serif", category: 'Modern' },
];

interface TextToolPanelProps {
    onAdd: (contours: THREE.Vector2[][]) => void;
    onClose: () => void;
}

export function TextToolPanel({ onAdd, onClose }: TextToolPanelProps) {
    const [text, setText] = useState('Hola');
    const [selectedFont, setSelectedFont] = useState(GOOGLE_FONTS[0]);
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [fontSize, setFontSize] = useState(150); // Internal render size
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);

    // 1. Load Font
    useEffect(() => {
        const linkId = `font-${selectedFont.name.replace(/\s+/g, '-')}`;
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${selectedFont.name.replace(/\s+/g, '+')}:wght@400;700&display=swap`;
            document.head.appendChild(link);
        }
        // Force refresh after a tick to allow font logic to pick it up (imperfect but works generally)
        document.fonts.load(`100px ${selectedFont.family}`).then(() => {
            updatePreview();
        }).catch(() => {
            // Fallback refresh
            setTimeout(updatePreview, 500);
        });
    }, [selectedFont]);

    // 2. Update Preview
    useEffect(() => {
        const timer = setTimeout(updatePreview, 50);
        return () => clearTimeout(timer);
    }, [text, selectedFont, isBold, isItalic, fontSize]);

    const updatePreview = () => {
        if (!canvasRef.current || !previewCanvasRef.current) return;

        // Render High-Res for Tracing
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Size: Large enough for crisp curves
        const W = 2048;
        const H = 2048;
        canvasRef.current.width = W;
        canvasRef.current.height = H;

        // White Bg
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // Text
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const weight = isBold ? 'bold' : 'normal';
        const style = isItalic ? 'italic' : 'normal';
        ctx.font = `${style} ${weight} ${fontSize * 2}px ${selectedFont.family}`;
        ctx.fillText(text, W / 2, H / 2);

        // Copy to small preview canvas
        const pCtx = previewCanvasRef.current.getContext('2d');
        if (pCtx) {
            previewCanvasRef.current.width = 400;
            previewCanvasRef.current.height = 400; // Aspect ratio
            // Draw background grid
            pCtx.fillStyle = '#1a1a1a';
            pCtx.fillRect(0, 0, 400, 400);
            // Draw result
            pCtx.drawImage(canvasRef.current, 0, 0, W, H, 0, 0, 400, 400);
        }
    };

    const handleAdd = async () => {
        if (!text.trim()) return;
        setIsLoading(true);
        setLoadError(null);

        try {
            // 1. Get image from canvas
            // We can use the canvas directly via a dataURL to create an Image object for `processImage`
            const dataUrl = canvasRef.current?.toDataURL('image/png');
            if (!dataUrl) throw new Error("Canvas error");

            const img = new Image();
            img.src = dataUrl;
            await new Promise(r => img.onload = r);

            // 2. Trace
            // Settings: High quality, no blur (text is sharp), simple threshold
            const result = processImage(img, {
                blur: 0,
                threshold: 128,
                invert: false,
                mode: 'edges', // Edges or Luminance work fine for B/W
                adaptive: false,
                morphology: false,
                highRes: true // Ensure we get detail
            });

            if (result.contours.length === 0) {
                setLoadError("No se detectó texto. Intenta aumentar el tamaño.");
                setIsLoading(false);
                return;
            }

            // 3. Center and Scale
            // The result is in 2048x2048 space. We want it in "View Space".
            // Let's assume view space units ~ 100-500px typically.
            // We want the text to appear "normal size" (e.g. 100px height).
            // We'll calculate the bbox of the scanned text and center it.

            const rawContours = result.contours;
            // Calculate BBox of raw contours
            const bbox = new THREE.Box2();
            rawContours.flat().forEach(p => bbox.expandByPoint(p));

            const center = new THREE.Vector2();
            bbox.getCenter(center);

            // Re-center to (0,0) so we can place it in view center later (caller handles offset)
            const centeredContours = rawContours.map(c =>
                c.map(p => p.clone().sub(center))
            );

            // Scale down? The canvas was 2048. If text filled 1000px, that's huge.
            // Let's standardise: Scale so height is approx 100 units?
            // Or just leave as is. 1 unit = 1 pixel usually.
            // Code in Contour Editor usually handles 'view' units.
            // Let's scale it slightly down if it's massive.
            // ... Actually keeping 1:1 pixel scale from the input size (fontSize * 2) is predictable.
            // If user selected size 150, text is ~300px high. That's a good size.

            onAdd(centeredContours);
            setText(''); // Reset or Keep? Usually better to keep for multi-add
            // onClose(); // Optional: Close on add? Maybe keep open for adding multiple words.
            // User can close manually.

        } catch (e) {
            console.error(e);
            setLoadError("Error generando geometría.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute top-20 right-4 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-right-10 duration-200">
            {/* Header */}
            <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-2 text-white font-bold">
                    <Type className="w-4 h-4 text-purple-400" />
                    <span>Texto Profesional</span>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-red-400">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">

                {/* 1. Input */}
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Contenido</label>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 font-bold min-h-[80px]"
                        placeholder="Escribe algo..."
                    />
                </div>

                {/* 2. Font Picker */}
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Tipografía ({GOOGLE_FONTS.length})</label>
                    <div className="h-40 overflow-y-auto border border-slate-700 rounded-lg bg-slate-950 custom-scrollbar p-1 space-y-1">
                        {GOOGLE_FONTS.map(font => (
                            <button
                                key={font.name}
                                onClick={() => setSelectedFont(font)}
                                className={`w-full text-left px-3 py-2 rounded flex items-center justify-between group transition-colors ${selectedFont.name === font.name ? 'bg-purple-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                            >
                                <span style={{ fontFamily: font.family }} className="text-lg">{font.name}</span>
                                {selectedFont.name === font.name && <Check className="w-3 h-3" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 3. Style Controls */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsBold(!isBold)}
                        className={`flex-1 py-1.5 rounded text-sm font-bold border ${isBold ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
                    >
                        B
                    </button>
                    <button
                        onClick={() => setIsItalic(!isItalic)}
                        className={`flex-1 py-1.5 rounded text-sm italic border ${isItalic ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
                    >
                        I
                    </button>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                        <span>Tamaño</span>
                        <span>{fontSize}px</span>
                    </div>
                    <input
                        type="range"
                        min="50"
                        max="300"
                        value={fontSize}
                        onChange={e => setFontSize(Number(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                </div>

                {/* 4. Preview */}
                <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Vista Previa</label>
                    <div className="aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center p-2">
                        <canvas ref={previewCanvasRef} className="max-w-full max-h-full object-contain" />
                    </div>
                </div>

                {loadError && (
                    <div className="text-xs text-red-400 px-2 py-1 bg-red-900/20 rounded border border-red-900/50">
                        {loadError}
                    </div>
                )}

                {/* 5. Action */}
                <button
                    onClick={handleAdd}
                    disabled={isLoading || !text}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Procesando...</span>
                        </>
                    ) : (
                        <>
                            <Type className="w-4 h-4" />
                            <span>Añadir Texto</span>
                        </>
                    )}
                </button>
            </div>

            {/* Hidden High-Res Canvas */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
