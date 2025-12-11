import { Download, Sliders, Box, Layers, Pencil, Trash2, RefreshCw, Cookie, Tag, Eye, Settings2 } from 'lucide-react';
import type { CutterSettings } from '../core/geometry-generator';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import { Accordion } from './ui/Accordion';

interface ControlsProps {
    settings: CutterSettings;
    onChange: (newSettings: CutterSettings) => void;
    onExport: (isZip?: boolean) => void;
    disabled: boolean;
    viewerSettings: { baseColor: string; outerColor: string; innerColor: string; autoRotate: boolean };
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
        <div className="bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 text-stone-200 shadow-2xl h-[calc(100vh-8rem)] flex flex-col">

            {/* Header */}
            <div className="p-6 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                        <Sliders className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Configuración</h2>
                        <p className="text-[10px] text-stone-500">Parámetros de geometría</p>
                    </div>
                </div>

                {/* Output Mode Tabs */}
                <div className="flex bg-white/5 p-1 rounded-lg border border-white/5 mt-4">
                    <button
                        onClick={() => handleChange('outputType', 'cutter' as any)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2
                            ${settings.outputType === 'cutter' ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/10' : 'text-stone-500 hover:text-stone-300'}`}
                    >
                        <Cookie className="w-3 h-3" /> Cortador
                    </button>
                    <button
                        onClick={() => handleChange('outputType', 'keychain' as any)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2
                            ${settings.outputType === 'keychain' ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/10' : 'text-stone-500 hover:text-stone-300'}`}
                    >
                        <Tag className="w-3 h-3" /> Llavero
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">

                {/* 1. Dimensions Group */}
                <Accordion title="Dimensiones & Forma" icon={<Box className="w-4 h-4" />} defaultOpen={true}>
                    <Slider label="Tamaño Máximo" value={settings.size} min={30} max={200} unit="mm" onChange={(v) => handleChange('size', v)} />

                    <div className="h-px bg-white/5 my-4" />

                    <div className="grid grid-cols-2 gap-4">
                        <Slider label="Altura Total" value={settings.cutterHeight} min={5} max={40} unit="mm" onChange={(v) => handleChange('cutterHeight', v)} />
                        <Slider label="Grosor Pared" value={settings.cutterThickness} min={0.6} max={2.0} step={0.1} unit="mm" onChange={(v) => handleChange('cutterThickness', v)} />
                    </div>

                    {settings.outputType === 'keychain' && (
                        <div className="space-y-3 pt-4 border-t border-white/5 mt-4">
                            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Forma Base</label>
                            <div className="grid grid-cols-5 gap-1">
                                {[
                                    { id: 'silhouette', icon: '🎨' }, { id: 'circle', icon: '⚪' }, { id: 'square', icon: '⬜' },
                                    { id: 'hexagon', icon: '⬡' }, { id: 'heart', icon: '❤️' }
                                ].map((shape) => (
                                    <button
                                        key={shape.id}
                                        onClick={() => handleChange('keychainShape', shape.id as any)}
                                        className={`p-2 rounded border transition-all ${settings.keychainShape === shape.id ? 'bg-white/10 border-white/20 text-whiteShadow' : 'bg-transparent border-transparent hover:bg-white/5 text-stone-600'}`}
                                    >
                                        <span className="text-lg opacity-80 hover:opacity-100">{shape.icon}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </Accordion>

                {/* 2. Base & Support */}
                <Accordion title="Base & Soporte" icon={<Layers className="w-4 h-4" />}>
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-medium text-stone-400">Generar Base</span>
                        <Switch label="" checked={settings.withBase} onChange={(v) => handleChange('withBase', v)} />
                    </div>

                    {settings.withBase && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-top-1">
                            <div className="grid grid-cols-2 gap-4">
                                <Slider label="Altura Base" value={settings.baseHeight} min={0.6} max={5.0} step={0.2} unit="mm" onChange={(v) => handleChange('baseHeight', v)} />
                                <Slider label="Margen (Padding)" value={settings.keychainBasePadding || 4} min={0} max={20} step={0.5} unit="mm" onChange={(v) => handleChange('keychainBasePadding', v)} />
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-xs text-stone-400">Base Sólida</span>
                                <Switch label="" checked={settings.solidBase} onChange={(v) => handleChange('solidBase', v)} />
                            </div>

                            {/* Bevel Settings */}
                            {settings.outputType === 'keychain' && (
                                <div className="pt-4 border-t border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-stone-400">Biselado (Suavizado)</span>
                                        <Switch label="" checked={settings.keychainBevelEnabled || false} onChange={(v) => handleChange('keychainBevelEnabled', v)} />
                                    </div>
                                    {settings.keychainBevelEnabled && (
                                        <Slider label="Tamaño Bisel" value={settings.keychainBevelSize || 0.5} min={0.1} max={2.0} step={0.1} unit="mm" onChange={(v) => handleChange('keychainBevelSize', v)} />
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="h-px bg-white/5 my-4" />

                    <div className="flex justify-between items-center">
                        <div className="text-xs">
                            <span className="block font-medium text-stone-400">Puentes Automáticos</span>
                            <span className="text-[10px] text-stone-600">Conecta islas flotantes</span>
                        </div>
                        <Switch label="" checked={settings.automaticBridges} onChange={(v) => handleChange('automaticBridges', v)} />
                    </div>
                </Accordion>

                {/* 3. Advanced Details */}
                <Accordion title="Avanzado & Detalles" icon={<Settings2 className="w-4 h-4" />}>
                    {/* Interior Details */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Marcadores Internos</label>
                        <div className="grid grid-cols-2 gap-4">
                            <Slider label="Altura Marca" value={settings.markerHeight} min={2} max={settings.cutterHeight} unit="mm" onChange={(v) => handleChange('markerHeight', v)} />
                            <Slider label="Grosor Marca" value={settings.markerThickness} min={0.4} max={2.0} step={0.1} unit="mm" onChange={(v) => handleChange('markerThickness', v)} />
                        </div>
                    </div>

                    <div className="h-px bg-white/5 my-4" />

                    {/* Blade Profile (Cutter Only) */}
                    {settings.outputType === 'cutter' && (
                        <div className="flex justify-between items-center">
                            <div>
                                <span className="block text-xs font-medium text-stone-400">Perfil Cónico (Afilado)</span>
                                <span className="text-[10px] text-stone-600">Mejor corte, menos marcas</span>
                            </div>
                            <Switch label="" checked={settings.bladeProfile === 'stepped'} onChange={(v) => handleChange('bladeProfile', v ? 'stepped' : 'standard')} />
                        </div>
                    )}

                    {/* Hole Settings (Keychain Only) */}
                    {settings.outputType === 'keychain' && (
                        <div className="space-y-4 pt-2">
                            <Slider label="Diámetro Agujero" value={settings.keychainHoleDiameter} min={0} max={10} step={0.5} unit="mm" onChange={(v) => handleChange('keychainHoleDiameter', v)} />
                            {settings.keychainHoleDiameter > 0 && (
                                <div className="grid grid-cols-2 gap-4">
                                    <Slider label="Offset X"
                                        value={settings.keychainHoleOffset?.x || 0}
                                        min={-30} max={30} unit="mm"
                                        onChange={(v) => handleChange('keychainHoleOffset', { ...(settings.keychainHoleOffset || { x: 0, y: 0 }), x: v })}
                                    />
                                    <Slider label="Offset Y"
                                        value={settings.keychainHoleOffset?.y || 0}
                                        min={-30} max={30} unit="mm"
                                        onChange={(v) => handleChange('keychainHoleOffset', { ...(settings.keychainHoleOffset || { x: 0, y: 0 }), y: v })}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Generation Mode (Dual/Single) */}
                    {settings.outputType === 'cutter' && (
                        <div className="pt-4 mt-2 border-t border-white/5 space-y-4">
                            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Modo Generación</label>
                            <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
                                <button onClick={() => handleChange('generationMode', 'single' as any)} className={`flex-1 py-1 text-xs rounded-md ${settings.generationMode === 'single' ? 'bg-zinc-700 text-white shadow-sm ring-1 ring-white/10' : 'text-stone-500'}`}>Simple</button>
                                <button onClick={() => handleChange('generationMode', 'dual' as any)} className={`flex-1 py-1 text-xs rounded-md ${settings.generationMode === 'dual' ? 'bg-zinc-700 text-white shadow-sm ring-1 ring-white/10' : 'text-stone-500'}`}>Set 2 Piezas</button>
                            </div>

                            {settings.generationMode === 'dual' && (
                                <div className="space-y-3 pl-2 border-l border-zinc-700/50">
                                    <Slider label="Tolerancia" value={settings.stampTolerance} min={0.1} max={1.0} step={0.1} unit="mm" onChange={(v) => handleChange('stampTolerance', v)} />
                                    <Slider label="Altura Mango" value={settings.handleHeight} min={5} max={30} unit="mm" onChange={(v) => handleChange('handleHeight', v)} />
                                    <div className="flex justify-between">
                                        <span className="text-xs text-stone-400">Base Rejilla (Ahorro)</span>
                                        <Switch label="" checked={settings.stampGrid} onChange={(v) => handleChange('stampGrid', v)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </Accordion>

                {/* 4. Visualization */}
                <Accordion title="Visualización" icon={<Eye className="w-4 h-4" />}>
                    <div className="grid grid-cols-3 gap-2 mb-4 mt-2">
                        {['baseColor', 'outerColor', 'innerColor'].map((k, i) => (
                            <div key={k} className="space-y-2">
                                <div className="w-full aspect-square rounded-full border border-white/10 overflow-hidden relative group">
                                    <input type="color" value={(viewerSettings as any)[k]} onChange={(e) => onViewerChange(k, e.target.value)} className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer p-0 border-0" />
                                </div>
                                <label className="text-[9px] text-stone-500 block text-center uppercase tracking-widest">{['Base', 'Cortador', 'Interno'][i]}</label>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between items-center py-2 border-t border-white/5">
                        <span className="text-xs text-stone-400">Auto-Rotar</span>
                        <Switch label="" checked={viewerSettings.autoRotate} onChange={(v) => onViewerChange('autoRotate', v)} />
                    </div>
                </Accordion>

            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-white/5 space-y-3 shrink-0 bg-black/40">
                {/* Edit Mode Toggle */}
                <button
                    onClick={onToggleEditMode}
                    disabled={disabled}
                    className={`w-full py-2.5 px-3 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-2
                        ${isEditMode ? 'border-red-500/30 text-red-400 bg-red-500/5' : 'border-white/10 text-stone-400 hover:text-white hover:border-white/20 bg-white/5'}`}
                >
                    {isEditMode ? <Trash2 className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                    {isEditMode ? 'Modo Borrador Activo' : 'Editar / Borrar Partes'}
                </button>
                {hasHiddenParts && (
                    <button onClick={onResetHidden} className="w-full text-[10px] text-stone-500 hover:text-stone-300 flex items-center justify-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Restaurar partes borradas
                    </button>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => onExport(false)}
                        disabled={disabled}
                        className={`flex-1 py-3 bg-white text-black hover:bg-stone-200 active:scale-95 rounded-lg font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        <Download className="w-4 h-4" />
                        STL
                    </button>

                    {(settings.outputType === 'keychain' || settings.outputType === 'cutter') && (
                        <button
                            onClick={() => onExport(true)} // Pass true for ZIP
                            disabled={disabled}
                            className={`w-14 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white rounded-lg flex items-center justify-center transition-all active:scale-95
                                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            title="Descargar Multi-STL (ZIP) para Multicolor"
                        >
                            <Layers className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
