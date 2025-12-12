import { useState, useEffect, useRef } from 'react';
import { Check, Wand2 } from 'lucide-react';
import type { ProcessOptions } from '../core/image-processing';

interface ImageProcessorProps {
    imageSrc: string;
    onConfirm: (options: ProcessOptions) => void;
    onCancel: () => void;
}

export function ImageProcessor({ imageSrc, onConfirm, onCancel }: ImageProcessorProps) {
    const [blur, setBlur] = useState(2);
    const [threshold, setThreshold] = useState(128);
    const [invert, setInvert] = useState(false);
    const [detectionMode, setDetectionMode] = useState<'standard' | 'text'>('standard');

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    // Apply processing to preview canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match dimensions
        // Display size vs actual size?
        // Let's us a reasonable preview size
        const MAX_W = 600;
        const scale = Math.min(1, MAX_W / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        canvas.width = w;
        canvas.height = h;

        // 1. Draw with Blur
        if (blur > 0) {
            ctx.filter = `blur(${blur}px)`;
        } else {
            ctx.filter = 'none';
        }
        ctx.drawImage(img, 0, 0, w, h);
        ctx.filter = 'none';

        // 2. Apply Threshold (Pixel manipulation)
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // If transparent, white
            if (a < 50) {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = 0; // Keep transparent? Or white background?
                // Let's keep transparent for consistency?
                // Actually for preview, checkerboard bg covers it. 
                continue;
            }

            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            let isBlack = luma < threshold;
            if (invert) isBlack = !isBlack;

            const val = isBlack ? 0 : 255;

            data[i] = val;     // R
            data[i + 1] = val;   // G
            data[i + 2] = val;   // B
            // Alpha stays same
        }

        ctx.putImageData(imageData, 0, 0);

    }, [imageSrc, blur, threshold, invert]);

    return (
        <div className="flex flex-col h-full bg-gray-900 border-l border-white/10">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-blue-400" />
                <h2 className="font-bold text-white">Preparar Imagen</h2>
            </div>

            {/* Preview Area */}
            <div className="flex-1 overflow-hidden p-4 flex items-center justify-center bg-black/40 relative">
                {/* Checkerboard pattern for transparency */}
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none"
                    style={{
                        backgroundImage: `linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)`,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                    }}
                />

                <img ref={imgRef} src={imageSrc} className="hidden" onLoad={() => setBlur(2)} /> {/* Trigger effect on load */}
                <canvas ref={canvasRef} className="max-w-full max-h-full shadow-2xl z-10 border border-white/20" />
            </div>

            {/* Controls */}
            <div className="p-6 bg-gray-800 border-t border-white/10 space-y-6">

                {/* Threshold */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
                        <span>Umbral (Detalle)</span>
                        <span>{threshold}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="255"
                        value={threshold}
                        onChange={(e) => setThreshold(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Más Negro</span>
                        <span>Más Blanco</span>
                    </div>
                </div>

                {/* Blur */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
                        <span>Suavizado (Ruido)</span>
                        <span>{blur}px</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="10"
                        value={blur}
                        onChange={(e) => setBlur(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                {/* V39: Detection Mode Selector */}
                <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Modo de Detección</span>
                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => { setDetectionMode('standard'); setThreshold(128); setBlur(2); }}
                            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${detectionMode === 'standard' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Logos / Personajes
                        </button>
                        <button
                            onClick={() => { setDetectionMode('text'); setThreshold(128); setBlur(0); }} // Text needs less blur
                            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${detectionMode === 'text' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Texto Avanzado
                        </button>
                    </div>

                    {detectionMode === 'text' && (
                        <div className="text-[10px] text-purple-300 bg-purple-500/10 p-2 rounded border border-purple-500/20">
                            Mejora para fuentes pequeñas y tipografías complejas.
                        </div>
                    )}
                </div>

                {/* Invert */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setInvert(!invert)}>
                    <span className="text-sm font-medium text-gray-300">Invertir Colores</span>
                    <div className={`w-5 h-5 rounded border border-gray-500 flex items-center justify-center ${invert ? 'bg-blue-500 border-blue-500' : ''}`}>
                        {invert && <Check className="w-3 h-3 text-white" />}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 rounded-xl font-bold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm({
                            blur,
                            threshold,
                            invert,
                            mode: 'luminance',
                            highRes: true,
                            adaptive: detectionMode === 'text',
                            morphology: detectionMode === 'text'
                        })}
                        className="flex-[2] py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Wand2 className="w-4 h-4" />
                        Trazar Modelo
                    </button>
                </div>
            </div >
        </div >
    );
}
