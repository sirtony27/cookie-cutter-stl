import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, TransformControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import type { CutterPart } from '../core/geometry-generator';
import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Move, RotateCw, Trash2, MousePointer2, Scaling, Settings, Undo2, Redo2 } from 'lucide-react';

interface Viewer3DProps {
    parts: CutterPart[];
    colors: { baseColor: string; outerColor: string; innerColor: string };
    autoRotate: boolean;
    isEditMode: boolean;
    hiddenPartIds: Set<string>;
    onTogglePart: (id: string) => void;
    // V34: Lifted Selection
    selectedIndices: Set<number>;
    onSelectionChange: (indices: Set<number>) => void;
    // V36: Manipulation
    onTransformPart?: (index: number, matrix: THREE.Matrix4) => void;
    onDeleteParts?: (indices: Set<number>) => void;
    isPreview?: boolean; // V44
    onUndo?: () => void;
    onRedo?: () => void;
}

export function Viewer3D({ parts, colors, autoRotate, isEditMode, hiddenPartIds, onTogglePart, selectedIndices, onSelectionChange, onTransformPart, onDeleteParts, isPreview = false, onUndo, onRedo }: Viewer3DProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [tool, setTool] = useState<'select' | 'translate' | 'rotate' | 'scale'>('select');

    // V44: Local rotation state for Preview
    const [isRotating, setIsRotating] = useState(autoRotate);
    // V44: Highlight Settings
    const [highlightEnabled, setHighlightEnabled] = useState(true);
    const [highlightColor, setHighlightColor] = useState('#fbbf24'); // Default Amber
    const [showPreviewSettings, setShowPreviewSettings] = useState(false);

    // Sync if prop changes (except in preview where user might toggle it manually)
    useEffect(() => {
        if (!isPreview) setIsRotating(autoRotate);
    }, [autoRotate, isPreview]);

    const [showSettings, setShowSettings] = useState(false);
    const [viewSettings, setViewSettings] = useState({
        showGrid: true,
        gridSize: 10,
        gridColor: '#4f4f4f',
        floorColor: '#1a1a1a',
        floorOpacity: 0.5,
        // V38: Snapping
        snapMove: 1, // mm
        snapRotate: Math.PI / 4 // 45 degrees
    });

    // Helper to get the single active selection (for transforms)
    const activeIndex = selectedIndices.size === 1 ? Array.from(selectedIndices)[0] : null;

    // V38: Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            // V45: Undo/Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    onRedo?.();
                } else {
                    onUndo?.();
                }
                e.preventDefault();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                onRedo?.();
                e.preventDefault();
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'v': setTool('select'); break;
                case 'g': if (selectedIndices.size > 0) setTool('translate'); break;
                case 'r': if (selectedIndices.size > 0) setTool('rotate'); break;
                case 's': if (selectedIndices.size > 0) setTool('scale'); break;
                case 'delete':
                case 'backspace':
                    if (selectedIndices.size > 0 && onDeleteParts) onDeleteParts(selectedIndices);
                    break;
                case 'escape':
                    if (tool !== 'select') setTool('select');
                    else if (selectedIndices.size > 0) onSelectionChange(new Set());
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tool, selectedIndices, onDeleteParts, onSelectionChange]);

    useEffect(() => {
        if (selectedIndices.size !== 1 && tool !== 'select') {
            // Optional: Force select mode if multi-selection isn't supported yet
            // setTool('select');
        }
    }, [selectedIndices.size]);

    const getColor = (type: string) => {
        switch (type) {
            case 'base': return colors.baseColor;
            case 'outer': return colors.outerColor;
            case 'inner': return colors.innerColor;
            case 'handle': return '#f59e0b'; // Amber for handle
            default: return '#ffffff';
        }
    };

    return (
        <div className={`bg-gray-900 overflow-hidden shadow-2xl relative border border-white/10 transition-colors duration-300 w-full h-full rounded-xl
            ${isEditMode ? 'border-red-500/50 shadow-red-900/10' : ''}`}
        >
            {/* 3D Toolbar (Floating) - Hidden in Preview Mode */}
            {!isPreview && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-1 p-1 bg-black/50 backdrop-blur-md rounded-lg border border-white/10">
                    <button
                        onClick={() => setTool('select')}
                        className={`p-2 rounded hover:bg-white/20 transition-colors ${tool === 'select' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                        title="Seleccionar (V)"
                    >
                        <MousePointer2 className="w-4 h-4" />
                    </button>
                    <div className="w-px bg-white/10 my-1 mx-1" />
                    <button
                        onClick={() => setTool('translate')}
                        className={`p-2 rounded hover:bg-white/20 transition-colors ${tool === 'translate' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                        title="Mover (G)"
                        disabled={selectedIndices.size !== 1}
                    >
                        <Move className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setTool('rotate')}
                        className={`p-2 rounded hover:bg-white/20 transition-colors ${tool === 'rotate' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                        title="Rotar (R)"
                        disabled={selectedIndices.size !== 1}
                    >
                        <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setTool('scale')}
                        className={`p-2 rounded hover:bg-white/20 transition-colors ${tool === 'scale' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                        title="Escalar (S)"
                        disabled={selectedIndices.size !== 1}
                    >
                        <Scaling className="w-4 h-4" />
                    </button>
                    <div className="w-px bg-white/10 my-1 mx-1" />
                    <button
                        onClick={() => onDeleteParts && selectedIndices.size > 0 && onDeleteParts(selectedIndices)}
                        className="p-2 rounded hover:bg-red-500/20 text-red-400 hover:text-red-200 transition-colors"
                        title="Eliminar (Supr)"
                        disabled={selectedIndices.size === 0}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="w-px bg-white/10 my-1 mx-1" />
                    <button
                        onClick={onUndo}
                        disabled={!onUndo}
                        className="p-2 rounded hover:bg-white/20 transition-colors text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                        title="Deshacer (Ctrl+Z)"
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!onRedo}
                        className="p-2 rounded hover:bg-white/20 transition-colors text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                        title="Rehacer (Ctrl+Y)"
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>

                    <div className="w-px bg-white/10 my-1 mx-1" />
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded hover:bg-white/20 transition-colors ${showSettings ? 'bg-white/20 text-white' : 'text-gray-400'}`}
                        title="Configuración de Vista"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* V44: Preview Controls */}
            {isPreview && (
                <div className="absolute top-2 left-2 z-10 flex flex-col gap-2 items-start">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setIsRotating(!isRotating)}
                            className={`p-1.5 rounded-lg border transition-all flex items-center gap-2 text-[10px] font-medium
                            ${isRotating ? 'bg-blue-500/20 border-blue-500/30 text-blue-200' : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'}`}
                        >
                            <RotateCw className={`w-3 h-3 ${isRotating ? 'animate-spin' : ''}`} />
                            {isRotating ? 'Girando' : 'Pausado'}
                        </button>

                        <div className="flex bg-black/40 border border-white/10 rounded-lg">
                            <button
                                onClick={onUndo}
                                disabled={!onUndo}
                                className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent rounded-l-lg transition-colors text-stone-300"
                                title="Deshacer (Ctrl+Z)"
                            >
                                <Undo2 className="w-3 h-3" />
                            </button>
                            <div className="w-px bg-white/10" />
                            <button
                                onClick={onRedo}
                                disabled={!onRedo}
                                className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent rounded-r-lg transition-colors text-stone-300"
                                title="Rehacer (Ctrl+Y)"
                            >
                                <Redo2 className="w-3 h-3" />
                            </button>
                        </div>

                        <button
                            onClick={() => setShowPreviewSettings(!showPreviewSettings)}
                            className={`p-1.5 rounded-lg border transition-all flex items-center justify-center
                            ${showPreviewSettings ? 'bg-white/10 text-white border-white/20' : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'}`}
                            title="Ajustes de Visualización"
                        >
                            <Settings className="w-3 h-3" />
                        </button>
                    </div>

                    {/* Highlight Settings Popover */}
                    {showPreviewSettings && (
                        <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-3 flex flex-col gap-2 w-48 shadow-xl">
                            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Resaltado</div>

                            <label className="flex items-center gap-2 text-xs text-stone-200 cursor-pointer hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={highlightEnabled}
                                    onChange={(e) => setHighlightEnabled(e.target.checked)}
                                    className="accent-blue-500 rounded sm"
                                />
                                Resaltar Selección
                            </label>

                            {highlightEnabled && (
                                <div className="flex items-center justify-between text-xs text-stone-300">
                                    <span>Color</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={highlightColor}
                                            onChange={(e) => setHighlightColor(e.target.value)}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* View Settings Panel */}
            {showSettings && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl flex flex-col gap-4">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-white">Espacio de Trabajo</span>
                    </div>

                    {/* Grid Toggle & Size */}
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Mostrar Rejilla</label>
                            <input
                                type="checkbox"
                                checked={viewSettings.showGrid}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, showGrid: e.target.checked }))}
                                className="toggle-checkbox accent-blue-600"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Tamaño Celda</label>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="5"
                                value={viewSettings.gridSize}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, gridSize: Number(e.target.value) }))}
                                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-white/10" />

                    {/* Snapping */}
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Snap Mover ({viewSettings.snapMove}mm)</label>
                            <input
                                type="range"
                                min="0"
                                max="10"
                                step="1"
                                value={viewSettings.snapMove}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, snapMove: Number(e.target.value) }))}
                                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Snap Rotar</label>
                            <select
                                value={viewSettings.snapRotate}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, snapRotate: Number(e.target.value) }))}
                                className="bg-black/50 border border-white/20 rounded text-xs text-white p-1"
                            >
                                <option value={0}>Libre</option>
                                <option value={Math.PI / 12}>15°</option>
                                <option value={Math.PI / 8}>22.5°</option>
                                <option value={Math.PI / 4}>45°</option>
                                <option value={Math.PI / 2}>90°</option>
                            </select>
                        </div>
                    </div>

                    <div className="h-px bg-white/10" />

                    {/* Colors */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Color Rejilla</label>
                            <input
                                type="color"
                                value={viewSettings.gridColor}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, gridColor: e.target.value }))}
                                className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Color Suelo</label>
                            <input
                                type="color"
                                value={viewSettings.floorColor}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, floorColor: e.target.value }))}
                                className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-400">Opacidad Suelo</label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={viewSettings.floorOpacity}
                                onChange={(e) => setViewSettings(prev => ({ ...prev, floorOpacity: Number(e.target.value) }))}
                                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>
                </div>
            )}

            {parts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 z-10 pointer-events-none">
                    <p className="font-medium text-lg">Vista Previa 3D</p>
                    <p className="text-sm">Sube una imagen para ver el modelo</p>
                </div>
            )}

            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 80, 100], fov: 45 }}>
                <OrbitControls
                    makeDefault
                    autoRotate={isRotating && !isEditMode} // Use local state
                    maxPolarAngle={Math.PI / 1.5}
                />

                <Grid
                    key={`grid-${viewSettings.showGrid}-${viewSettings.gridSize}-${viewSettings.gridColor}`}
                    infiniteGrid
                    fadeDistance={400}
                    sectionColor={viewSettings.gridColor}
                    cellColor={viewSettings.gridColor}
                    sectionSize={viewSettings.gridSize * 2} // Make major sections larger
                    cellSize={viewSettings.gridSize}
                    position={[0, -0.02, 0]} // Move below shadows
                />

                <ContactShadows
                    position={[0, -0.01, 0]} // Just below object, above grid
                    opacity={0.4}
                    scale={50}
                    blur={2}
                    far={10}
                    resolution={512}
                    color="#000000"
                />

                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 20, 10]} intensity={1} castShadow shadow-mapSize={[2048, 2048]} />
                <Environment preset="city" />

                {/* Rotated Group to make Z-extrusion stand Up (Y-up) */}
                <group rotation={[-Math.PI / 2, 0, 0]}>
                    <group>
                        {parts.map(part => {
                            const isHidden = hiddenPartIds.has(part.id);
                            const isHovered = hoveredId === part.id;
                            const isSelected = selectedIndices.has(part.contourIndex);
                            const baseColor = getColor(part.type);

                            // Highlight Logic (V44)
                            const showHighlight = isSelected && highlightEnabled;

                            // If not edit mode and hidden, don't render
                            if (!isEditMode && isHidden) return null;

                            const mesh = (
                                <mesh
                                    key={part.id}
                                    geometry={part.geometry}
                                    position={part.position ? [part.position[0], part.position[1], part.position[2]] : [0, 0, 0]}
                                    rotation={[0, 0, 0]}
                                    scale={[1, 1, 1]}
                                    castShadow={!isHidden}
                                    receiveShadow={!isHidden}
                                    onClick={(e) => {
                                        if (isEditMode) {
                                            e.stopPropagation();
                                            onTogglePart(part.id);
                                        } else {
                                            e.stopPropagation();
                                            const idx = part.contourIndex;
                                            if (idx < 0) return;

                                            const newSet = new Set(e.shiftKey ? selectedIndices : []);
                                            if (e.shiftKey && selectedIndices.has(idx)) {
                                                newSet.delete(idx);
                                            } else {
                                                newSet.add(idx);
                                            }
                                            onSelectionChange(newSet);
                                        }
                                    }}
                                    onPointerOver={(e) => {
                                        if (isEditMode) {
                                            e.stopPropagation();
                                            setHoveredId(part.id);
                                            document.body.style.cursor = 'pointer';
                                        }
                                    }}
                                    onPointerOut={() => {
                                        setHoveredId(null);
                                        document.body.style.cursor = 'default';
                                    }}
                                >
                                    {isEditMode ? (
                                        isHidden ? (
                                            <meshBasicMaterial color="#ef4444" transparent opacity={0.15} wireframe />
                                        ) : (
                                            <meshStandardMaterial
                                                color={isHovered ? '#ffedd5' : baseColor}
                                                roughness={0.5}
                                                emissive={isHovered ? '#ff0000' : '#000000'}
                                                emissiveIntensity={isHovered ? 0.2 : 0}
                                            />
                                        )
                                    ) : (
                                        <meshStandardMaterial
                                            color={showHighlight ? highlightColor : baseColor}
                                            roughness={typeToRoughness(part.type)}
                                            emissive={showHighlight ? highlightColor : '#000000'}
                                            emissiveIntensity={showHighlight ? 0.5 : 0}
                                        />
                                    )}
                                </mesh>
                            );

                            // Attach TransformControls if active
                            if (isSelected && activeIndex === part.contourIndex && tool !== 'select' && onTransformPart) {
                                // ... existing TC logic ...
                                return (
                                    <TransformControls
                                        key={`tc-${part.id}`}
                                        mode={tool as 'translate' | 'rotate' | 'scale'}
                                        space="local"
                                        size={0.7}
                                        translationSnap={viewSettings.snapMove || null}
                                        rotationSnap={viewSettings.snapRotate || null}
                                        onMouseUp={(e) => {
                                            const object = (e as any)?.target?.object;
                                            if (object && onTransformPart) {
                                                onTransformPart(activeIndex, object.matrix);
                                            }
                                        }}
                                    >
                                        {mesh}
                                    </TransformControls>
                                );
                            }

                            return mesh;
                        })}
                    </group>
                </group>

                {/* Solid Floor - Rendered Last / Below */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
                    <planeGeometry args={[1000, 1000]} />
                    <meshStandardMaterial
                        key={`floor-${viewSettings.floorColor}-${viewSettings.floorOpacity}`}
                        color={viewSettings.floorColor}
                        transparent
                        opacity={viewSettings.floorOpacity}
                        roughness={0.8}
                    />
                </mesh>

                <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport axisColors={['#9d4b4b', '#2f7f4f', '#3b5b9d']} labelColor="white" />
                </GizmoHelper>
            </Canvas>

            {/* Edit Mode Instruction */}
            {isEditMode && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-xs bg-black/50 px-3 py-1 rounded-full pointer-events-none">
                    Haz clic en una parte para ocultarla/mostrarla
                </div>
            )}
        </div>
    );
}

function typeToRoughness(type: string) {
    if (type === 'base') return 0.7;
    return 0.5;
}
