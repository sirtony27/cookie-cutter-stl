import { Download, Sliders, Box, Layers, Pencil, Trash2, RefreshCw } from 'lucide-react';
import type { CutterSettings } from '../core/geometry-generator';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';

interface ControlsProps {
    settings: CutterSettings;
    onChange: (newSettings: CutterSettings) => void;
    onExport: () => void;
    disabled: boolean;
    viewerSettings: { baseColor: string; outerColor: string; innerColor: string; autoRotate: boolean }; // Updated Interface
    onViewerChange: (key: string, value: any) => void;
    isEditMode: boolean;
    onToggleEditMode: () => void;
    hasHiddenParts: boolean;
    onResetHidden: () => void;
}

export function Controls({
    settings,
    onChange,
    onExport,
    disabled,
    viewerSettings,
    onViewerChange,
    isEditMode,
    onToggleEditMode,
    hasHiddenParts,
    onResetHidden
}: ControlsProps) {
    const handleChange = (key: keyof CutterSettings, value: number | boolean) => {
        onChange({ ...settings, [key]: value });
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 text-white shadow-2xl max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">

            {/* Header */}
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Sliders className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white">Configuración</h2>
                    <p className="text-xs text-gray-400">Personaliza tu cortador</p>
                </div>
            </div>

            {/* Edit Mode Toggle */}
            <div className="mb-8">
                <button
                    onClick={onToggleEditMode}
                    disabled={disabled}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all
                ${isEditMode
                            ? 'bg-red-500/20 border-red-500/50 text-red-200'
                            : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${isEditMode ? 'bg-red-500' : 'bg-gray-700'}`}>
                            {isEditMode ? (
                                <Trash2 className="w-4 h-4 text-white" />
                            ) : (
                                <Pencil className="w-4 h-4 text-white" />
                            )}
                        </div>
                        <div className="text-left">
                            <div className="text-sm font-bold"> Modo Borrador</div>
                            <div className="text-[10px] opacity-70">
                                {isEditMode ? 'Toca partes para borrar' : 'Clic para editar partes'}
                            </div>
                        </div>
                    </div>

                    <div className={`w-3 h-3 rounded-full ${isEditMode ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`} />
                </button>

                {hasHiddenParts && (
                    <button
                        onClick={onResetHidden}
                        className="mt-2 w-full text-xs text-red-300 hover:text-red-200 hover:underline flex items-center justify-center gap-1"
                    >
                        <RefreshCw className="w-3 h-3" /> Restaurar partes borradas
                    </button>
                )}
            </div>

            <div className="space-y-8">

                {/* Dimensions Group */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        <Box className="w-3 h-3" /> Dimensiones
                    </div>

                    <Slider
                        label="Tamaño Máximo"
                        value={settings.size}
                        min={30}
                        max={200}
                        unit="mm"
                        onChange={(v) => handleChange('size', v)}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Slider // Half width logic handled by CSS grid? Slider takes full width.
                            label="Altura"
                            value={settings.cutterHeight}
                            min={5}
                            max={40}
                            unit="mm"
                            onChange={(v) => handleChange('cutterHeight', v)}
                        />
                        <Slider
                            label="Grosor"
                            value={settings.cutterThickness}
                            min={0.4}
                            max={2.0}
                            step={0.1}
                            unit="mm"
                            onChange={(v) => handleChange('cutterThickness', v)}
                        />
                    </div>
                </section>

                {/* Base Settings Group */}
                <section className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <Layers className="w-3 h-3" /> Opciones de Base
                        </div>
                        <Switch
                            label="Habilitar Base"
                            checked={settings.withBase}
                            onChange={(v) => handleChange('withBase', v)}
                        />
                    </div>

                    {settings.withBase && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Slider
                                label="Altura Base"
                                value={settings.baseHeight}
                                min={0.6}
                                max={5.0}
                                step={0.2}
                                unit="mm"
                                onChange={(v) => handleChange('baseHeight', v)}
                            />
                            <Slider
                                label="Ancho Base"
                                value={settings.baseThickness}
                                min={1}
                                max={10}
                                step={0.5}
                                unit="mm"
                                onChange={(v) => handleChange('baseThickness', v)}
                            />
                        </div>
                    )}
                </section>

                {/* Helper / Stamp Settings */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500/50" /> Marcadores Internos
                    </div>
                    <p className="text-xs text-gray-500 italic mb-2">
                        Controla las líneas internas (ojos, boca, detalles)
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <Slider
                            label="Altura"
                            value={settings.markerHeight}
                            min={2}
                            max={settings.cutterHeight}
                            unit="mm"
                            onChange={(v) => handleChange('markerHeight', v)}
                        />
                        <Slider
                            label="Grosor"
                            value={settings.markerThickness}
                            min={0.4}
                            max={2.0}
                            step={0.1}
                            unit="mm"
                            onChange={(v) => handleChange('markerThickness', v)}
                        />
                    </div>
                </section>

                {/* Viewer Styling Group */}
                <section className="space-y-4">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Estilo de Vista Previa
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg border border-white/5 space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400 block text-center">Base</label>
                                <input
                                    type="color"
                                    value={viewerSettings.baseColor}
                                    onChange={(e) => onViewerChange('baseColor', e.target.value)}
                                    className="w-full h-8 rounded cursor-pointer bg-transparent border-0 p-0 block"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400 block text-center">Cortador</label>
                                <input
                                    type="color"
                                    value={viewerSettings.outerColor}
                                    onChange={(e) => onViewerChange('outerColor', e.target.value)}
                                    className="w-full h-8 rounded cursor-pointer bg-transparent border-0 p-0 block"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400 block text-center">Interno</label>
                                <input
                                    type="color"
                                    value={viewerSettings.innerColor}
                                    onChange={(e) => onViewerChange('innerColor', e.target.value)}
                                    className="w-full h-8 rounded cursor-pointer bg-transparent border-0 p-0 block"
                                />
                            </div>
                        </div>

                        <div className="pt-2 border-t border-white/5">
                            <Switch
                                label="Auto-Girar"
                                checked={viewerSettings.autoRotate}
                                onChange={(v) => onViewerChange('autoRotate', v)}
                            />
                        </div>
                    </div>
                </section>

            </div>

            <button
                onClick={onExport}
                disabled={disabled}
                className={`mt-8 w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-lg transition-all transform active:scale-95
          ${disabled
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                        : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-xl shadow-blue-900/20 border border-white/10'
                    }`}
            >
                <Download className="w-5 h-5" />
                Descargar STL
            </button>
        </div>
    );
}
