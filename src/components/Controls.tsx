import { Download, Sliders, Box, Layers, Pencil, Trash2, RefreshCw, Cookie, Tag } from 'lucide-react';
import type { CutterSettings } from '../core/geometry-generator';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';

interface ControlsProps {
    settings: CutterSettings;
    onChange: (newSettings: CutterSettings) => void;
    onExport: (isZip?: boolean) => void;
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
    const handleChange = (key: keyof CutterSettings, value: any) => {
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

            {/* Output Mode Switcher (V18) */}
            <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 p-4 rounded-xl border border-white/10 mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-emerald-500 rounded-lg">
                        {settings.outputType === 'keychain' ? (
                            <Tag className="w-5 h-5 text-white" />
                        ) : (
                            <Cookie className="w-5 h-5 text-white" />
                        )}
                    </div>
                    <div>
                        <div className="font-bold text-sm">Tipo de Objeto</div>
                        <div className="text-[10px] text-gray-400">
                            {settings.outputType === 'keychain' ? 'Llavero / Placa (Sólido)' : 'Cortador de Galletas (Hueco)'}
                        </div>
                    </div>
                </div>

                <div className="flex bg-black/40 rounded-lg p-1">
                    <button
                        onClick={() => handleChange('outputType', 'cutter' as any)}
                        className={`flex-1 py-2 text-xs font-bold rounded-md transition-all
                            ${settings.outputType === 'cutter' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Cortador
                    </button>
                    <button
                        onClick={() => handleChange('outputType', 'keychain' as any)}
                        className={`flex-1 py-2 text-xs font-bold rounded-md transition-all
                            ${settings.outputType === 'keychain' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Llavero
                    </button>
                </div>

                {/* Keychain Specific Settings */}
                {settings.outputType === 'keychain' && (
                    <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="h-px bg-white/5 my-2" />

                        <div className="space-y-2">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Forma Base</div>
                            <div className="grid grid-cols-5 gap-1">
                                {[
                                    { id: 'silhouette', label: 'Silueta', icon: '🎨' },
                                    { id: 'circle', label: 'Círculo', icon: '⚪' },
                                    { id: 'square', label: 'Cuadrado', icon: '⬜' },
                                    { id: 'hexagon', label: 'Hex', icon: '⬡' },
                                    { id: 'heart', label: 'Corazón', icon: '❤️' }
                                ].map((shape) => (
                                    <button
                                        key={shape.id}
                                        onClick={() => handleChange('keychainShape', shape.id as any)}
                                        className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all
                                            ${settings.keychainShape === shape.id
                                                ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-emerald-900/20 shadow-lg'
                                                : 'bg-black/20 border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                                            }`}
                                        title={shape.label}
                                    >
                                        <span className="text-lg leading-none mb-1">{shape.icon}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Slider
                            label="Diámetro Agujero"
                            value={settings.keychainHoleDiameter}
                            min={0}
                            max={10}
                            step={0.5}
                            unit="mm"
                            onChange={(v) => handleChange('keychainHoleDiameter', v)}
                        />
                        <p className="text-[10px] text-emerald-200/60">* Ajusta a 0 para quitar el agujero.</p>

                        {/* Base Padding */}
                        <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
                            <Slider
                                label="Margen Base"
                                value={settings.keychainBasePadding || 4}
                                min={0}
                                max={20}
                                step={0.5}
                                unit="mm"
                                onChange={(v) => handleChange('keychainBasePadding', v)}
                            />
                        </div>

                        {/* Hole Position (Offset) */}
                        {settings.keychainHoleDiameter > 0 && (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                    Posición Agujero
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <Slider
                                        label="Offset X"
                                        value={settings.keychainHoleOffset?.x || 0}
                                        min={-30}
                                        max={30}
                                        step={1}
                                        unit="mm"
                                        onChange={(v) => handleChange('keychainHoleOffset', { ...settings.keychainHoleOffset, x: v })}
                                    />
                                    <Slider
                                        label="Offset Y"
                                        value={settings.keychainHoleOffset?.y || 0}
                                        min={-30}
                                        max={30}
                                        step={1}
                                        unit="mm"
                                        onChange={(v) => handleChange('keychainHoleOffset', { ...settings.keychainHoleOffset, y: v })}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Bevel Settings */}
                        <div className="pt-2 border-t border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-300">Biselado (Suavizado)</span>
                                <Switch
                                    label=""
                                    checked={settings.keychainBevelEnabled || false}
                                    onChange={(v) => handleChange('keychainBevelEnabled', v)}
                                />
                            </div>
                            {settings.keychainBevelEnabled && (
                                <div className="animate-in fade-in slide-in-from-top-1">
                                    <Slider
                                        label="Tamaño Bisel"
                                        value={settings.keychainBevelSize || 0.5}
                                        min={0.1}
                                        max={2.0}
                                        step={0.1}
                                        unit="mm"
                                        onChange={(v) => handleChange('keychainBevelSize', v)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Multicolor Tip */}
                        <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-500/20 text-[10px] text-emerald-200 mt-2">
                            <div className="font-bold flex items-center gap-1 mb-1">
                                🌈 Impresión Multicolor
                            </div>
                            Para dos colores (Base + Relieve):
                            <ul className="list-disc pl-3 mt-1 space-y-1 opacity-80">
                                <li>Programa una <b>pausa</b> en tu laminador a <b>{settings.baseHeight.toFixed(2)}mm</b>.</li>
                                <li>Cambia el filamento cuando la impresora pare.</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* Generation Mode Switch */}
            {settings.outputType === 'cutter' && (
                <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-xl border border-white/10 mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-500 rounded-lg">
                                {settings.generationMode === 'dual' ? (
                                    <Box className="w-5 h-5 text-white" />
                                ) : (
                                    <Cookie className="w-5 h-5 text-white" />
                                )}
                            </div>
                            <div>
                                <div className="font-bold text-sm">Modo de Generación</div>
                                <div className="text-[10px] text-gray-400">
                                    {settings.generationMode === 'single' ? '1 Pieza (Híbrido)' : '2 Piezas (Cortador + Sello)'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex bg-black/40 rounded-lg p-1">
                        <button
                            onClick={() => handleChange('generationMode', 'single' as any)}
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all
                            ${settings.generationMode === 'single' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Simple
                        </button>
                        <button
                            onClick={() => handleChange('generationMode', 'dual' as any)}
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all
                            ${settings.generationMode === 'dual' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Set 2 Piezas
                        </button>
                    </div>

                    {settings.generationMode === 'dual' && (
                        <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="h-px bg-white/5 my-2" />
                            <p className="text-[10px] uppercase font-bold text-purple-300 tracking-wider">Ajustes de Sello</p>
                            <Slider
                                label="Tolerancia (Holgura)"
                                value={settings.stampTolerance}
                                min={0.1}
                                max={1.0}
                                step={0.1}
                                unit="mm"
                                onChange={(v) => handleChange('stampTolerance', v)}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <Slider
                                    label="Altura Mango"
                                    value={settings.handleHeight}
                                    min={5}
                                    max={30}
                                    unit="mm"
                                    onChange={(v) => handleChange('handleHeight', v)}
                                />
                                <Slider
                                    label="Grosor Mango"
                                    value={settings.handleThickness}
                                    min={2}
                                    max={10}
                                    unit="mm"
                                    onChange={(v) => handleChange('handleThickness', v)}
                                />
                            </div>

                            <div className="pt-2 border-t border-white/10 mt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-gray-300">Base de Rejilla</span>
                                    <Switch
                                        label=""
                                        checked={settings.stampGrid}
                                        onChange={(v) => handleChange('stampGrid', v)}
                                    />
                                </div>
                                {settings.stampGrid && (
                                    <div className="text-[9px] text-gray-400">
                                        Genera una trama ligera en lugar de sólida. (-40% material)
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-8">

                {/* Dimensions Group */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        <Box className="w-3 h-3" /> Dimensiones
                    </div>

                    {settings.outputType === 'cutter' && (
                        <div className="bg-white/5 p-3 rounded-lg border border-white/5 mb-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-blue-200">Perfil Afilado (Blade)</span>
                                <Switch
                                    label=""
                                    checked={settings.bladeProfile === 'stepped'}
                                    onChange={(v) => handleChange('bladeProfile', v ? 'stepped' : 'standard')}
                                />
                            </div>
                            {settings.bladeProfile === 'stepped' && (
                                <div className="mt-2 text-[10px] text-gray-400">
                                    Genera una hoja escalonada: base gruesa para resistencia y punta fina (0.4mm) para corte limpio.
                                </div>
                            )}
                        </div>
                    )}

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
                            label="Grosor Base"
                            value={settings.cutterThickness}
                            min={0.6}
                            max={2.0}
                            step={0.1}
                            unit="mm"
                            onChange={(v) => handleChange('cutterThickness', v)}
                        />
                    </div>
                </section>

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
                        <div className="flex justify-end mb-2">
                            <Switch
                                label="Base Sólida"
                                checked={settings.solidBase}
                                onChange={(v) => handleChange('solidBase', v)}
                            />
                        </div>
                    )}

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

                {/* Advanced Bridges Group */}
                <section className="space-y-4 p-4 bg-blue-900/10 rounded-xl border border-blue-500/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-300 uppercase tracking-wider">
                            <Box className="w-3 h-3" /> Puentes Automáticos
                        </div>
                        <Switch
                            label="Generar Soportes"
                            checked={settings.automaticBridges}
                            onChange={(v) => handleChange('automaticBridges', v)}
                        />
                    </div>
                    {settings.automaticBridges && (
                        <div className="text-[10px] text-blue-200/60 animate-in fade-in">
                            * Conecta islas flotantes al marco exterior automáticamente.
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

            <div className="pt-4 border-t border-white/10">
                <div className="flex gap-2">
                    <button
                        onClick={() => onExport(false)}
                        disabled={disabled}
                        className={`flex-1 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <Download className="w-5 h-5" />
                        Descargar STL
                    </button>

                    {(settings.outputType === 'keychain' || settings.outputType === 'cutter') && (
                        <button
                            onClick={() => onExport(true)} // Pass true for ZIP
                            disabled={disabled}
                            className={`w-14 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center justify-center transition-all active:scale-95
                                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            title="Descargar Multi-STL (ZIP) para Multicolor"
                        >
                            <Layers className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}
