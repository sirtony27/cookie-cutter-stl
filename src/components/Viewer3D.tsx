import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Stage } from '@react-three/drei';
import type { CutterPart } from '../core/geometry-generator';
import { useState } from 'react';

interface Viewer3DProps {
    parts: CutterPart[];
    colors: { baseColor: string; outerColor: string; innerColor: string };
    autoRotate: boolean;
    isEditMode: boolean;
    hiddenPartIds: Set<string>;
    onTogglePart: (id: string) => void;
}

export function Viewer3D({ parts, colors, autoRotate, isEditMode, hiddenPartIds, onTogglePart }: Viewer3DProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        <div className={`w-full h-[600px] bg-gray-900 rounded-xl overflow-hidden shadow-2xl relative border border-white/10 transition-colors duration-300 ${isEditMode ? 'border-red-500/50 shadow-red-900/10' : ''}`}>
            {parts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 z-10 pointer-events-none">
                    <p className="font-medium text-lg">Vista Previa 3D</p>
                    <p className="text-sm">Sube una imagen para ver el modelo</p>
                </div>
            )}

            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 80, 100], fov: 45 }}>
                <OrbitControls
                    makeDefault
                    autoRotate={autoRotate && !isEditMode} // Disable rotate in edit mode for easier clicking
                    maxPolarAngle={Math.PI / 1.5}
                />

                <Stage environment="city" intensity={0.6} adjustCamera={false}>
                    <group>
                        {parts.map(part => {
                            const isHidden = hiddenPartIds.has(part.id);
                            const isHovered = hoveredId === part.id;
                            const baseColor = getColor(part.type);

                            // If not edit mode and hidden, don't render
                            if (!isEditMode && isHidden) return null;

                            return (
                                <mesh
                                    key={part.id}
                                    geometry={part.geometry}
                                    castShadow={!isHidden}
                                    receiveShadow={!isHidden}
                                    onClick={(e) => {
                                        if (isEditMode) {
                                            e.stopPropagation();
                                            onTogglePart(part.id);
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
                                            // Ghost style for hidden parts in edit mode
                                            <meshBasicMaterial
                                                color="#ef4444"
                                                transparent
                                                opacity={0.15}
                                                wireframe
                                            />
                                        ) : (
                                            // Highlight style for visible parts in edit mode
                                            <meshStandardMaterial
                                                color={isHovered ? '#ffedd5' : baseColor}
                                                roughness={0.5}
                                                emissive={isHovered ? '#ff0000' : '#000000'}
                                                emissiveIntensity={isHovered ? 0.2 : 0}
                                            />
                                        )
                                    ) : (
                                        // Normal style
                                        <meshStandardMaterial
                                            color={baseColor}
                                            roughness={typeToRoughness(part.type)}
                                        />
                                    )}
                                </mesh>
                            );
                        })}
                    </group>
                </Stage>

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
