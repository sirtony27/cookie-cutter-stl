import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import * as THREE from 'three';
import { MousePointer2, PenTool, Circle as CircleIcon, Square as SquareIcon, Brush, X, Wand2, Magnet, Edit, Heart, Star, Move, FileMinus, FlipHorizontal, FlipVertical, Keyboard, Type } from 'lucide-react';
import { generateCircle, generateHeart, generateStar, generateRectangle } from '../core/shape-templates';
import { snapPoint, interpolateContour, sampleBezierPath, type NodeType } from '../core/curve-utils';

import { simplifyContour as simplifyContourFn, analyzeImage, type TracePresetType } from '../core/image-processing';
import { TextToolPanel } from './TextToolPanel';

export type ContourRole = 'cut' | 'stamp' | 'auto' | 'base' | 'void';

// V54: Robust getBBox Helper (Explicit Definition)
const getRobustBBox = (points: THREE.Vector2[]): THREE.Box2 => {
    const box = new THREE.Box2();
    if (!points || points.length === 0) return box;
    points.forEach(p => box.expandByPoint(p));
    return box;
};

interface ContourEditorProps {
    contours: THREE.Vector2[][];
    width: number;
    height: number;
    onChange: (
        newContours: THREE.Vector2[][],
        newRoles: ContourRole[],
        newNodeTypes: NodeType[][],
        newHandles: ({ in: THREE.Vector2, out: THREE.Vector2 } | null)[][]
    ) => void;
    referenceImage?: string | null;
    roles?: ContourRole[];
    nodeTypes?: NodeType[][];
    handles?: ({ in: THREE.Vector2, out: THREE.Vector2 } | null)[][]; // V43: Input Handles
    onUndo?: () => void;
    onRedo?: () => void;
    // V34: Lifted Selection
    selectedIndices: Set<number>;
    onSelectionChange: (indices: Set<number>) => void;
}



// V50: Dimensions Display
const SelectionDimensions = ({ selectedIndices, localContours, view }: { selectedIndices: Set<number>, localContours: THREE.Vector2[][], view: { w: number, h: number } }) => {
    if (selectedIndices.size === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedIndices.forEach(idx => {
        const c = localContours[idx];
        if (!c) return;
        c.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });
    });

    if (minX === Infinity) return null;

    const width = maxX - minX;
    const height = maxY - minY;
    // Scale text based on view width to remain readable but not huge
    const fontSize = Math.max(view.w / 50, 2);

    return (
        <g className="pointer-events-none">
            <text x={(minX + maxX) / 2} y={minY - (view.w / 100)} textAnchor="middle" fill="#38bdf8" fontSize={fontSize} fontWeight="bold" style={{ textShadow: '0px 1px 2px black' }}>{Math.round(width)} mm</text>
            <text x={maxX + (view.w / 100)} y={(minY + maxY) / 2} textAnchor="start" dominantBaseline="middle" fill="#38bdf8" fontSize={fontSize} fontWeight="bold" style={{ textShadow: '0px 1px 2px black' }}>{Math.round(height)} mm</text>
            <rect x={minX} y={minY} width={width} height={height} fill="none" stroke="#38bdf8" strokeWidth={view.w / 500} strokeDasharray="4 2" opacity={0.6} />
        </g>
    );
};

// V55: Keyboard Shortcuts Guide
const ShortcutsHelp = ({ onClose }: { onClose: () => void }) => {
    const sections = [
        {
            title: "General",
            items: [
                { keys: ["Supr", "Backspace"], desc: "Eliminar selección" },
                { keys: ["Ctrl", "Z"], desc: "Deshacer" },
                { keys: ["Ctrl", "Shift", "Z"], desc: "Rehacer" },
            ]
        },
        {
            title: "Navegación",
            items: [
                { keys: ["Espacio", "Drag"], desc: "Mover vista (Pan)" },
                { keys: ["Rueda"], desc: "Zoom in/out" },
            ]
        },
        {
            title: "Transformación",
            items: [
                { keys: ["Flechas"], desc: "Mover suavemente" },
                { keys: ["Shift", "Drag"], desc: "Escalar proporcional" },
            ]
        },
        {
            title: "Edición de Nodos",
            items: [
                { keys: ["Doble Click"], desc: "Editar Nodos" },
                { keys: ["Alt", "Click"], desc: "Suavizar / Afilar curva" },
            ]
        }
    ];

    return (
        <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 text-xs select-none" onClick={onClose}>
            <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/5">
                    <h3 className="font-bold text-gray-100 flex items-center gap-2">
                        <Keyboard className="w-4 h-4 text-blue-400" /> Atajos de Teclado
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    {sections.map((section, idx) => (
                        <div key={idx}>
                            <h4 className="text-blue-400 font-bold mb-2 uppercase tracking-wider text-[10px]">{section.title}</h4>
                            <div className="space-y-1.5">
                                {section.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-gray-300">
                                        <span>{item.desc}</span>
                                        <div className="flex gap-1">
                                            {item.keys.map(k => (
                                                <span key={k} className="bg-white/10 border border-white/5 rounded px-1.5 py-0.5 font-mono text-[10px] text-gray-200 min-w-[20px] text-center">
                                                    {k}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-3 bg-white/5 border-t border-white/10 text-center text-gray-500 italic">
                    Click afuera para cerrar
                </div>
            </div>
        </div>
    );
};

export function ContourEditor({
    contours,
    width,
    height,
    onChange,
    referenceImage,
    roles = [],
    nodeTypes = [],
    handles = [], // Default empty
    onUndo,
    onRedo,
    selectedIndices,
    onSelectionChange
}: ContourEditorProps) {
    // Local state
    const [localContours, setLocalContours] = useState<THREE.Vector2[][]>(contours);
    const [localRoles, setLocalRoles] = useState<ContourRole[]>(roles);
    // Ensure nodeTypes structure matches contours if new shape added
    const [localNodeTypes, setLocalNodeTypes] = useState<NodeType[][]>(nodeTypes);
    // V43: Control Handles for Beziers
    const [localHandles, setLocalHandles] = useState<({ in: THREE.Vector2, out: THREE.Vector2 } | null)[][]>(handles);

    // V49: Snapping State
    const [snapEnabled, setSnapEnabled] = useState(false);
    const gridSize = 10; // Pixels


    // Helper: Snap coordinates if enabled
    const applySnap = (p: THREE.Vector2): THREE.Vector2 => {
        if (!snapEnabled) return p;
        return new THREE.Vector2(
            Math.round(p.x / gridSize) * gridSize,
            Math.round(p.y / gridSize) * gridSize
        );
    };

    // Ensure handles match contoursMatch contours
    useEffect(() => {
        if (localContours.length !== localHandles.length) {
            // Resize handles array
            const newHandles = localContours.map((c, i) => {
                return localHandles[i] || new Array(c.length).fill(null);
            });
            setLocalHandles(newHandles);
        }
    }, [localContours]);

    // V43: Sync handles from props (e.g. Undo/Redo)
    useEffect(() => {
        if (handles) setLocalHandles(handles);
    }, [handles]);

    // V27: Magic Wand State
    const [traceCandidates, setTraceCandidates] = useState<THREE.Vector2[][]>([]);
    // V29: Added mode and highRes
    // V32: Added preset tracking
    type WizardPreset = 'general' | 'text' | 'sketch' | 'shapes' | 'img'; // Added 'img'
    const [wizardPreset, setWizardPreset] = useState<WizardPreset>('img');
    const [detectedType, setDetectedType] = useState<TracePresetType | null>(null);

    // V44: Internal Clipboard
    interface LocalClipboardItem {
        contour: THREE.Vector2[];
        role: ContourRole;
        types: NodeType[];
        handles: ({ in: THREE.Vector2, out: THREE.Vector2 } | null)[];
    }
    const [clipboard, setClipboard] = useState<LocalClipboardItem[] | null>(null);

    // V40: Auto-Analyze Image
    useEffect(() => {
        if (referenceImage) {
            const img = new Image();
            img.crossOrigin = 'Anonymous'; // Ensure cross-origin loading
            img.onload = () => {
                const result = analyzeImage(img);
                setDetectedType(result.type);
                // Auto-Apply Settings
                setTraceSettings(s => ({
                    ...s,
                    blur: result.blur,
                    threshold: result.threshold,
                    adaptive: result.adaptive,
                    morphology: result.morphology
                }));
            };
            img.onerror = (e) => {
                console.error("Failed to load reference image for analysis:", e);
                setDetectedType(null);
            };
            img.src = referenceImage;
        } else {
            setDetectedType(null);
        }
    }, [referenceImage]);

    const [traceSettings, setTraceSettings] = useState({
        threshold: 128,
        invert: false,
        blur: 2, // Added blur
        mode: 'luminance' as 'luminance' | 'edges',
        highRes: false,
        adaptive: false,
        morphology: false
    });
    const [isTracing, setIsTracing] = useState(false);
    // Silence unused warning for now or use it for loading state
    useEffect(() => { if (isTracing) console.log('Tracing active...'); }, [isTracing]);

    // Tools
    type ToolType = 'select' | 'node' | 'pen' | 'brush' | 'circle' | 'square' | 'wand' | 'text';
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    // V55: Shortcuts Modal State
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Selection & Transform (Modified for V34 Multi-Selection)
    // Removed local state: const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const selectedIdx = selectedIndices.size === 1 ? Array.from(selectedIndices)[0] : null;




    const [transformState, setTransformState] = useState<{
        mode: 'scale' | 'rotate' | 'move';
        startPos: THREE.Vector2;
        center: THREE.Vector2; // Pivot
        startScale: THREE.Vector2; // For reference (1,1)
        startRotation: number;
        handle?: string; // 'tl','tr','bl','br','t','b','l','r','rot'
        originalContours: Map<number, THREE.Vector2[]>; // V52: Snapshot for multi-selection
    } | null>(null);

    // Drawing State (Moved up)
    const [pendingContour, setPendingContour] = useState<THREE.Vector2[]>([]);
    const [dragStart, setDragStart] = useState<THREE.Vector2 | null>(null);

    // V33: Keyboard Shortcuts for Tools (V=Select, A=Node, P=Pen, etc)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement).tagName)) return;
            switch (e.key.toLowerCase()) {
                case 'v': setActiveTool('select'); break;
                case 'a': setActiveTool('node'); break; // Adobe Illustrator / Figma style
                case 'p': setActiveTool('pen'); break;
                case 'b': setActiveTool('brush'); break;
                case 'w': setActiveTool('wand'); break;
                case 'delete':
                case 'backspace':
                    if (selectedIndices.size > 0) {
                        const newC = localContours.filter((_, i) => !selectedIndices.has(i));
                        const newR = localRoles.filter((_, i) => !selectedIndices.has(i));
                        const newT = localNodeTypes.filter((_, i) => !selectedIndices.has(i));
                        update(newC, newR, newT);
                        onSelectionChange(new Set());
                    }
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndices, localContours, localRoles, localNodeTypes]);

    // V27: Process Image for Magic Wand
    useEffect(() => {
        if (activeTool !== 'wand' || !referenceImage) return;

        const runTrace = async () => {
            setIsTracing(true);
            try {
                // We need the raw file or an Image object. referenceImage is a string URL.
                // We can use processImage, but first we need to load it into an HTMLImageElement if not passed as one.
                // processImage takes HTMLImageElement.
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = referenceImage;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                // Import dynamically to avoid circular dep if any (optional, but safe)
                const { processImage } = await import('../core/image-processing');

                const result = processImage(img, traceSettings);

                // IMPORTANT: processImage returns contours in image coordinate space (0..imgWidth).
                // Our view might be different? 
                // Reference Image is rendered at (0,0) width=width height=height.
                // processImage (with V27 edit) returns contours in 0..originalWidth.
                // We need to scale them to match the 'width/height' props of ContourEditor if the image is displayed scaled?
                // In ContourEditor, <image> is rendered with x=0 y=0 width={width} height={height}.
                // So we should map candidates to this size.

                const scaleX = width / result.width;
                const scaleY = height / result.height;

                const mapped = result.contours.map(c =>
                    c.map(p => new THREE.Vector2(p.x * scaleX, p.y * scaleY))
                );

                setTraceCandidates(mapped);
            } catch (e) {
                console.error("Trace failed", e);
            } finally {
                setIsTracing(false);
            }
        };

        const timeoutId = setTimeout(runTrace, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [activeTool, referenceImage, traceSettings, width, height]);

    // UI Toggles - Consolidated in V49
    // Removed old snappingEnabled/gridSize and effect

    // Sync
    useEffect(() => {
        setLocalContours(contours);
    }, [contours]);

    useEffect(() => {
        if (roles) setLocalRoles(roles);
    }, [roles]);

    useEffect(() => {
        if (nodeTypes) setLocalNodeTypes(nodeTypes);
    }, [nodeTypes]);

    // Internal Helper to update all
    const update = (
        newContours: THREE.Vector2[][],
        newRoles: ContourRole[],
        newNodeTypes?: NodeType[][],
        newHandles?: ({ in: THREE.Vector2, out: THREE.Vector2 } | null)[][]
    ) => {
        setLocalContours(newContours);
        setLocalRoles(newRoles);

        // Ensure nodeTypes exist for all contours
        const types = newNodeTypes || newContours.map((c, i) => localNodeTypes[i] || new Array(c.length).fill('corner'));
        setLocalNodeTypes(types);

        const handles = newHandles || newContours.map((c, i) => localHandles[i] || new Array(c.length).fill(null));
        setLocalHandles(handles);

        // Output: We must export the SAMPLED polyline for the 3D engine /Boolean ops to understand the curves.
        // Wait, if we export sampled points, 'localContours' (Editing State) might get desynced if we loop back?
        // App.tsx passes 'contours' back. 
        // IF we export sampled points, App acts on sampled points. 
        // If App passes sampled points BACK to Editor, Editor will see TONS of points and lose the Bezier Nodes.
        // ISSUE: Is 'onChange' for "Save Final Geometry" or "Update State"?
        // It's used for "Update State". App.tsx stores 'contours'.
        // IF we want to preserve Editable Beziers, the App State must handle Beziers or we must store them separately.
        // Current Plan: 'onChange' sends the *Key Points*. The App's `interpolateContour` logic (which we verified in 4022) 
        // must be upgraded to ALSO use `sampleBezierPath` if we pass handle info?
        // OR: Editor handles the sampling and sends DENSE geometry to App?
        // If Editor sends DENSE, we lose editability on Reload.
        // SOLUTION: Editor sends KeyPoints. App calculates Smoothness.
        // BUT App doesn't know about Handles yet (onChange signature is fixed).
        // QUICK FIX: Render the Bezier in Editor visually. Export the KeyPoints + Types. 
        // The 3D Engine will still use Catmull-Rom (Auto Smooth).
        // If User drags handles, we need to pass that info.
        // Changing 'onChange' signature touches App.tsx. I should do that.

        // For this step (V43), I will just update the local state.
        onChange(newContours, newRoles, types, handles);
    };

    // Interaction State
    const [draggingNode, setDraggingNode] = useState<{ cIdx: number; pIdx: number } | null>(null);
    // V43: Dragging Handle
    const [draggingHandle, setDraggingHandle] = useState<{ cIdx: number, pIdx: number, type: 'in' | 'out' } | null>(null);
    const [draggingPan, setDraggingPan] = useState<{ startX: number; startY: number; startViewX: number; startViewY: number } | null>(null);
    const [view, setView] = useState({ x: 0, y: 0, w: width, h: height });
    // const [isFullscreen, setIsFullscreen] = useState(false); // Removed per user request

    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const groupRef = useRef<SVGGElement>(null);

    // Initial Center
    useEffect(() => {
        if (contours.length > 0) {
            const bbox = new THREE.Box2();
            contours.flat().forEach(p => bbox.expandByPoint(p));
            const center = new THREE.Vector2();
            bbox.getCenter(center);
            const size = new THREE.Vector2();
            bbox.getSize(size);
            const margin = Math.max(size.x, size.y) * 0.2;
            const newW = size.x + margin * 2;
            const newH = size.y + margin * 2;
            const newX = center.x - newW / 2;
            const newY = center.y - newH / 2;
            setView({ x: newX, y: newY, w: newW, h: newH });
        } else {
            setView({ x: 0, y: 0, w: width, h: height });
        }
    }, [width, height]);

    // Wheel Zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (e: globalThis.WheelEvent) => {
            e.preventDefault();
            const zoomFactor = 0.1;
            const delta = e.deltaY > 0 ? 1 + zoomFactor : 1 - zoomFactor;
            setView(prev => {
                let newW = prev.w * delta;
                let newH = prev.h * delta;
                if (newW < 10) newW = 10;
                if (newH < 10) newH = 10;
                if (newW > width * 5) newW = width * 5;
                const dx = (prev.w - newW) / 2;
                const dy = (prev.h - newH) / 2;
                return { x: prev.x + dx, y: prev.y + dy, w: newW, h: newH };
            });
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, [width]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIndices.size > 0) {
                    const newC = localContours.filter((_, i) => !selectedIndices.has(i));
                    const newR = localRoles.filter((_, i) => !selectedIndices.has(i));
                    const newT = localNodeTypes.filter((_, i) => !selectedIndices.has(i));
                    update(newC, newR, newT);
                    onSelectionChange(new Set());
                }
            }

            // Undo/Redo (Ctrl+Z / Ctrl+Y)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    if (onRedo) onRedo();
                } else {
                    if (onUndo) onUndo();
                }
            }

            // V44: Copy / Paste
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (selectedIndices.size > 0) {
                    e.preventDefault(); // Prevent browser copy (optional, but good for app feel)
                    const items: LocalClipboardItem[] = [];
                    selectedIndices.forEach(idx => {
                        if (localContours[idx]) {
                            items.push({
                                contour: localContours[idx].map(p => p.clone()),
                                role: localRoles[idx],
                                types: [...(localNodeTypes[idx] || [])],
                                handles: localHandles[idx]?.map(h => h ? { in: h.in.clone(), out: h.out.clone() } : null) || []
                            });
                        }
                    });
                    setClipboard(items);
                    // Could add toast here: "Copied!"
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (clipboard && clipboard.length > 0) {
                    e.preventDefault();
                    const newContours = [...localContours];
                    const newRoles = [...localRoles];
                    const newTypes = [...localNodeTypes];
                    const newHandlesList = [...localHandles];
                    const newSelection = new Set<number>();

                    // Offset 10px down-right
                    const offset = new THREE.Vector2(view.w / 50, view.w / 50);

                    clipboard.forEach(item => {
                        const nextIdx = newContours.length;
                        newContours.push(item.contour.map(p => p.clone().add(offset)));
                        newRoles.push(item.role);
                        newTypes.push([...item.types]);
                        newHandlesList.push(item.handles.map(h => h ? { in: h.in.clone(), out: h.out.clone() } : null));
                        newSelection.add(nextIdx);
                    });

                    update(newContours, newRoles, newTypes, newHandlesList);
                    onSelectionChange(newSelection);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                onRedo?.();
            }

            // Tools (Ignore if Ctrl is pressed)
            if (!e.ctrlKey && !e.metaKey) {
                if (e.key.toLowerCase() === 'v') setActiveTool('select');
                if (e.key.toLowerCase() === 'p') setActiveTool('pen');
                if (e.key.toLowerCase() === 'b') setActiveTool('brush');
                if (e.key.toLowerCase() === 'b') setActiveTool('brush');
                if (e.key.toLowerCase() === 'w') setActiveTool('wand');
                if (e.key.toLowerCase() === 't') setActiveTool('text');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndices, localContours, localRoles, localNodeTypes, onUndo, onRedo]);

    // Helper: Simplify
    const simplifyContour = (points: THREE.Vector2[], threshold: number) => {
        if (points.length < 3) return points;
        const newPoints = [points[0]];
        let lastPt = points[0];
        for (let i = 1; i < points.length; i++) {
            if (points[i].distanceTo(lastPt) > threshold) {
                newPoints.push(points[i]);
                lastPt = points[i];
            }
        }
        return newPoints;
    };

    // Helper: Get BBox
    const getBBox = (points: THREE.Vector2[]) => {
        const box = new THREE.Box2();
        points.forEach(p => box.expandByPoint(p));
        return box;
    };

    const handleMouseDown = (e: ReactMouseEvent) => {
        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg || !group) return;

        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const globalToGroup = group.getScreenCTM()?.inverse();
        if (!globalToGroup) return;
        const modelPt = pt.matrixTransform(globalToGroup);
        const mousePos = new THREE.Vector2(modelPt.x, modelPt.y);

        // 0. Middle Click Pan (Universal)
        if (e.button === 1) { // Middle button
            e.preventDefault();
            setDraggingPan({
                startX: e.clientX,
                startY: e.clientY,
                startViewX: view.x,
                startViewY: view.y
            });
            return;
        }

        // A. Gizmo Handle Interaction (Prioritized)
        if (selectedIdx !== null && activeTool === 'select' && !draggingNode) {
            // Checked via sub-components propagation stop
        }

        if (activeTool === 'select') {
            // B. Click to Select Contour
            let clickedContour = -1;
            const threshold = view.w / 50;
            let minD = Infinity;

            localContours.forEach((c, idx) => {
                for (let i = 0; i < c.length; i++) {
                    const p1 = c[i];
                    const p2 = c[(i + 1) % c.length];
                    const d = distToSegmentSq(mousePos, p1, p2);
                    if (d < threshold * threshold && d < minD) {
                        minD = d;
                        clickedContour = idx;
                    }
                }
            });

            if (clickedContour !== -1 && !draggingNode) {
                // Multi-Selection Logic
                if (e.shiftKey) {
                    const newSet = new Set(selectedIndices);
                    if (newSet.has(clickedContour)) {
                        newSet.delete(clickedContour);
                    } else {
                        newSet.add(clickedContour);
                    }
                    onSelectionChange(newSet);
                } else {
                    // Single Selection
                    if (!selectedIndices.has(clickedContour) || selectedIndices.size > 1) {
                        onSelectionChange(new Set([clickedContour]));
                    }
                }

                // Drag Logic (Single or Multi)
                if (activeTool === 'select' && !e.shiftKey && selectedIndices.has(clickedContour)) {
                    // V52: Multi-Selection Drag Init
                    const indicesToDrag = Array.from(selectedIndices);

                    // Calculate Global BBox of all selected
                    const allPoints: THREE.Vector2[] = [];
                    const snapshot = new Map<number, THREE.Vector2[]>();

                    indicesToDrag.forEach(idx => {
                        const c = localContours[idx];
                        if (c) {
                            c.forEach(p => allPoints.push(p));
                            snapshot.set(idx, c.map(p => p.clone()));
                        }
                    });

                    if (allPoints.length > 0) {
                        const box = getBBox(allPoints);
                        const center = box.getCenter(new THREE.Vector2());

                        setTransformState({
                            mode: 'move',
                            startPos: mousePos.clone(),
                            originalContours: snapshot,
                            center: center,
                            handle: 'body',
                            startScale: new THREE.Vector2(1, 1),
                            startRotation: 0
                        });
                    }
                }
            } else if (!transformState && !draggingNode) {
                // Deselect if clicking empty space (unless Shift is held?)
                if (!e.shiftKey) {
                    onSelectionChange(new Set());
                }
                // Start Pan
                setDraggingPan({
                    startX: e.clientX,
                    startY: e.clientY,
                    startViewX: view.x,
                    startViewY: view.y
                });
            }
        } else if (activeTool === 'brush') {
            onSelectionChange(new Set());
            setPendingContour([mousePos]);
            setDragStart(mousePos);
        } else if (activeTool === 'circle' || activeTool === 'square') {
            onSelectionChange(new Set());
            setDragStart(mousePos);
            setPendingContour([]);
        }
    };


    // V56: Handle Text Add
    const handleAddText = (newContours: THREE.Vector2[][]) => {
        const center = new THREE.Vector2(view.x + view.w / 2, view.y + view.h / 2);
        const movedContours = newContours.map(c => c.map(p => p.clone().add(center)));

        const nextIdx = localContours.length;
        const addedContours = [...localContours, ...movedContours];
        const addedRoles = [...localRoles, ...new Array(movedContours.length).fill('auto') as ContourRole[]];

        // Types: 'corner' is safe for high-res trace
        const addedTypes = [...localNodeTypes, ...movedContours.map(c => new Array(c.length).fill('corner') as NodeType[])];
        const addedHandles = [...localHandles, ...movedContours.map(c => new Array(c.length).fill(null))];

        // Select new items
        const newSel = new Set<number>();
        for (let i = 0; i < movedContours.length; i++) {
            newSel.add(nextIdx + i);
        }

        update(addedContours, addedRoles, addedTypes, addedHandles);
        onSelectionChange(newSel);
        setActiveTool('select');
    };

    // V46: Shape Tool Logic
    const handleAddShape = (type: 'circle' | 'heart' | 'star' | 'rect') => {
        const center = new THREE.Vector2(view.x + view.w / 2, view.y + view.h / 2);
        const size = Math.min(view.w, view.h) * 0.3; // Responsive size relative to view

        let points: THREE.Vector2[] = [];

        if (type === 'circle') points = generateCircle(size / 2);
        if (type === 'heart') points = generateHeart(size / 30); // Heart scale is different
        if (type === 'star') points = generateStar(size / 2, size * 0.2, 5);
        if (type === 'rect') points = generateRectangle(size, size * 0.7, size * 0.1);

        // Center the points
        const centeredPoints = points.map(p => new THREE.Vector2(p.x + center.x, p.y + center.y));

        const newContours = [...localContours, centeredPoints];
        const newRoles = [...localRoles, 'auto' as ContourRole];

        // Initialize types and handles for new shape
        const newTypes = [...localNodeTypes]; // Copy current types array
        newTypes[newContours.length - 1] = new Array(centeredPoints.length).fill('corner');

        const newHandles = localHandles.map(row => [...(row || [])]);
        newHandles[newContours.length - 1] = new Array(centeredPoints.length).fill(null);

        update(newContours, newRoles, newTypes, newHandles);

        // Auto select
        onSelectionChange(new Set([newContours.length - 1]));
    };

    const handleMouseMove = (e: ReactMouseEvent) => {
        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg) return;

        // 0. Transform Gizmo Dragging
        const hasSelection = selectedIndices.size > 0;
        if (transformState && group && hasSelection) { // Gizmo works for single or multi
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const globalToGroup = group.getScreenCTM()?.inverse();
            if (globalToGroup) {
                const modelPt = pt.matrixTransform(globalToGroup);
                const currentPos = new THREE.Vector2(modelPt.x, modelPt.y);

                // V52: Multi-Contour Transform Logic (Applied to all selected)
                const originalContours = transformState.originalContours;
                const center = transformState.center;

                // Create copies of current state to mutate
                const newContours = [...localContours];

                // Iterate all selected contours in the snapshot
                originalContours.forEach((original, idx) => {
                    let transformed = [...original];

                    if (transformState.mode === 'move') {
                        // Offset
                        const delta = currentPos.clone().sub(transformState.startPos);
                        transformed = original.map(p => p.clone().add(delta));
                    } else if (transformState.mode === 'scale') {
                        const startDelta = transformState.startPos.clone().sub(center);
                        const currentDelta = currentPos.clone().sub(center);

                        let sx = 1, sy = 1;
                        if (Math.abs(startDelta.x) > 0.001) sx = currentDelta.x / startDelta.x;
                        if (Math.abs(startDelta.y) > 0.001) sy = currentDelta.y / startDelta.y;

                        const h = transformState.handle || '';
                        if (e.shiftKey) { // Uniform
                            if (h === 'l' || h === 'r') sy = sx;
                            else if (h === 't' || h === 'b') sx = sy;
                            else {
                                const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
                                sx = s; sy = s;
                            }
                        } else { // Non-Uniform
                            if (h === 't' || h === 'b') sx = 1;
                            if (h === 'l' || h === 'r') sy = 1;
                        }

                        // Apply scale relative to Group Center
                        transformed = original.map(p => {
                            const rel = p.clone().sub(center);
                            rel.x *= sx;
                            rel.y *= sy;
                            return rel.add(center);
                        });
                    } else if (transformState.mode === 'rotate') { // V53: Group Rotation
                        const v1 = transformState.startPos.clone().sub(center);
                        const v2 = currentPos.clone().sub(center);
                        const angle = v2.angle() - v1.angle();
                        transformed = original.map(p => p.clone().rotateAround(center, angle));
                    }

                    newContours[idx] = transformed;
                });

                // Batch Update
                setLocalContours(newContours);
            }
            return;
        }

        // 0. Dragging Handle
        if (draggingHandle && group) {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const globalToGroup = group.getScreenCTM()?.inverse();
            if (globalToGroup) {
                const svgP = pt.matrixTransform(globalToGroup);
                let currentPos = new THREE.Vector2(svgP.x, svgP.y);

                const { cIdx, pIdx, type } = draggingHandle;
                const contour = localContours[cIdx];
                const nodePos = contour[pIdx];

                // Calculate Delta (Handle Position relative to Node)
                const delta = currentPos.clone().sub(nodePos);

                // Update Handles
                const newHandles = localHandles.map(row => [...(row || [])]);
                if (!newHandles[cIdx]) newHandles[cIdx] = new Array(contour.length).fill(null);
                if (newHandles[cIdx].length !== contour.length) newHandles[cIdx] = new Array(contour.length).fill(null); // Safety

                // Ensure we have an object for this node
                // Copy existing or create new
                const oldH = newHandles[cIdx][pIdx];
                const currentHandleObj = oldH ? { in: oldH.in.clone(), out: oldH.out.clone() } : { in: new THREE.Vector2(0, 0), out: new THREE.Vector2(0, 0) };

                // Update the dragged handle
                if (type === 'in') currentHandleObj.in = delta;
                else currentHandleObj.out = delta;

                // Check logic for Smooth
                const nodeType = localNodeTypes[cIdx][pIdx];
                if (nodeType === 'smooth') {
                    // Mirror the OTHER handle
                    if (type === 'in') {
                        const angle = delta.angle() + Math.PI;
                        const len = currentHandleObj.out.length() || delta.length(); // Preserve length if exists, else match
                        currentHandleObj.out = new THREE.Vector2(Math.cos(angle) * len, Math.sin(angle) * len);
                    } else {
                        const angle = delta.angle() + Math.PI;
                        const len = currentHandleObj.in.length() || delta.length();
                        currentHandleObj.in = new THREE.Vector2(Math.cos(angle) * len, Math.sin(angle) * len);
                    }
                }

                newHandles[cIdx][pIdx] = currentHandleObj;

                setLocalHandles(newHandles);
            }
            return;
        }

        // 1. Dragging Node (Node Tool Only)
        if (draggingNode && group && activeTool === 'node') {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const globalToGroup = group.getScreenCTM()?.inverse();
            if (globalToGroup) {
                const svgP = pt.matrixTransform(globalToGroup);
                let currentPos = new THREE.Vector2(svgP.x, svgP.y);

                // SNAPPING LOGIC
                const isShift = e.shiftKey; // Shift toggles snapping (inverted?)
                // Usually Shift disables snapping if enabled by default
                const shouldSnap = snapEnabled ? !isShift : isShift;

                if (shouldSnap) {
                    // Collect candidate points
                    const candidates: THREE.Vector2[] = [];
                    localContours.forEach((c, cI) => {
                        c.forEach((p, pI) => {
                            if (cI === draggingNode.cIdx && pI === draggingNode.pIdx) return; // Skip self
                            candidates.push(p);
                        });
                    });

                    // V49: Grid Snapping Logic
                    const snapped = applySnap(currentPos);
                    // Override with grid snap (priority over point snap for now)
                    if (snapped.x !== currentPos.x || snapped.y !== currentPos.y) {
                        currentPos.x = snapped.x;
                        currentPos.y = snapped.y;
                    } else {
                        // Fallback to point snap (if we implement object snapping later)
                        const snapRes = snapPoint(currentPos, candidates, gridSize, view.w / 50, true);
                        if (snapRes.snapped) {
                            currentPos = snapRes.pos;
                        }
                    }
                }

                const newContours = [...localContours];
                const newContour = [...newContours[draggingNode.cIdx]];
                newContour[draggingNode.pIdx] = currentPos;
                newContours[draggingNode.cIdx] = newContour;
                setLocalContours(newContours);
            }
        }
        // 2. Pan (Select)
        else if (draggingPan && activeTool === 'select') {
            const dxPx = e.clientX - draggingPan.startX;
            const dyPx = e.clientY - draggingPan.startY;
            const clientRect = svg.getBoundingClientRect();
            const scaleX = view.w / clientRect.width;
            const scaleY = view.h / clientRect.height;
            setView({
                ...view,
                x: draggingPan.startViewX - dxPx * scaleX,
                y: draggingPan.startViewY - dyPx * scaleY
            });
        }
        // 3. Drawing Tools
        else if (dragStart && group) {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const globalToGroup = group.getScreenCTM()?.inverse();
            if (globalToGroup) {
                const modelPt = pt.matrixTransform(globalToGroup);
                const currentPos = new THREE.Vector2(modelPt.x, modelPt.y);

                if (activeTool === 'brush') {
                    setPendingContour(prev => [...prev, currentPos]);
                } else if (activeTool === 'circle') {
                    const radius = dragStart.distanceTo(currentPos);
                    const segments = 40;
                    const points = [];
                    for (let i = 0; i < segments; i++) {
                        const theta = (i / segments) * Math.PI * 2;
                        points.push(new THREE.Vector2(
                            dragStart.x + Math.cos(theta) * radius,
                            dragStart.y + Math.sin(theta) * radius
                        ));
                    }
                    setPendingContour(points);
                } else if (activeTool === 'square') {
                    const minX = Math.min(dragStart.x, currentPos.x);
                    const maxX = Math.max(dragStart.x, currentPos.x);
                    const minY = Math.min(dragStart.y, currentPos.y);
                    const maxY = Math.max(dragStart.y, currentPos.y);
                    setPendingContour([
                        new THREE.Vector2(minX, minY),
                        new THREE.Vector2(maxX, minY),
                        new THREE.Vector2(maxX, maxY),
                        new THREE.Vector2(minX, maxY)
                    ]);
                }
            }
        }
    };

    const handleMouseUp = () => {
        if (draggingNode) {
            update(localContours, localRoles, localNodeTypes);
        }
        // V43: Commit Handle Drag
        if (draggingHandle) {
            update(localContours, localRoles, localNodeTypes, localHandles);
        }

        if (transformState) {
            update(localContours, localRoles, localNodeTypes); // Commit transform
            setTransformState(null);
        }

        // Commit Drawing
        if ((activeTool === 'brush' || activeTool === 'circle' || activeTool === 'square') && dragStart) {
            if (pendingContour.length > 2) {
                let finalContour = pendingContour;
                if (activeTool === 'brush') {
                    finalContour = simplifyContour(pendingContour, view.w / 200);
                }
                const newLocal = [...localContours, finalContour];
                const newRoles = [...localRoles, 'auto' as ContourRole];

                // New logic: Initialize node types for new shape
                const newTypes = [...localNodeTypes];
                newTypes[newLocal.length - 1] = new Array(finalContour.length).fill('corner');

                update(newLocal, newRoles, newTypes);
                // Auto Select the new shape to allow immediate edit
                onSelectionChange(new Set([newLocal.length - 1]));
            }
            setPendingContour([]);
            setDragStart(null);
        }

        setDraggingNode(null);
        setDraggingHandle(null);
        setDraggingPan(null);
    };

    // Transform Gizmo Initialization
    const initTransform = (mode: 'scale' | 'rotate' | 'move', handle: string, e: ReactMouseEvent) => {
        e.stopPropagation();
        if (selectedIndices.size === 0) return; // Allow multi-selection

        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg || !group) return;

        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const globalToGroup = group.getScreenCTM()?.inverse();
        if (!globalToGroup) return;
        const modelPt = pt.matrixTransform(globalToGroup);
        const startPos = new THREE.Vector2(modelPt.x, modelPt.y);

        // Multi-Selection Init for Gizmo Handle
        const indicesToDrag = Array.from(selectedIndices);
        const snapshot = new Map<number, THREE.Vector2[]>();
        const allPoints: THREE.Vector2[] = [];

        indicesToDrag.forEach(idx => {
            const c = localContours[idx];
            if (c) {
                c.forEach(p => allPoints.push(p));
                snapshot.set(idx, c.map(p => p.clone()));
            }
        });

        // If for some reason allPoints is empty (shouldn't happen if selectedIdx matches), fallback
        if (allPoints.length === 0) return;

        const box = getRobustBBox(allPoints);
        const groupCenter = box.getCenter(new THREE.Vector2());

        setTransformState({
            mode,
            startPos,
            center: groupCenter,
            startScale: new THREE.Vector2(1, 1),
            startRotation: 0,
            handle,
            originalContours: snapshot
        });
    };

    const handleNodeDown = (cIdx: number, pIdx: number, e: ReactMouseEvent) => {
        e.stopPropagation();
        if (activeTool === 'node') {
            if (e.altKey) {
                // Toggle Node Type
                const newTypes = [...localNodeTypes];
                if (!newTypes[cIdx] || newTypes[cIdx].length !== localContours[cIdx].length) {
                    newTypes[cIdx] = new Array(localContours[cIdx].length).fill('corner');
                }

                const cTypes = [...newTypes[cIdx]];
                const current = cTypes[pIdx] || 'corner';
                const nextType = current === 'corner' ? 'smooth' : 'corner';
                cTypes[pIdx] = nextType;
                newTypes[cIdx] = cTypes;

                // V43: Handle Logic
                const newHandles = localHandles.map(row => [...(row || [])]);
                if (!newHandles[cIdx]) newHandles[cIdx] = new Array(localContours[cIdx].length).fill(null);

                if (nextType === 'smooth') {
                    // Generate Auto Handles based on neighbors
                    const contour = localContours[cIdx];
                    const prev = contour[(pIdx - 1 + contour.length) % contour.length];
                    const curr = contour[pIdx];
                    const next = contour[(pIdx + 1) % contour.length];

                    // Tangent is parallel to (prev -> next)
                    const tangent = next.clone().sub(prev).normalize();
                    const distPrev = curr.distanceTo(prev);
                    const distNext = curr.distanceTo(next);

                    // Heuristic: Handle length = 1/3 of neighbor distance
                    const handleLenIn = distPrev * 0.3;
                    const handleLenOut = distNext * 0.3;

                    newHandles[cIdx][pIdx] = {
                        in: tangent.clone().multiplyScalar(-handleLenIn), // Pointing towards prev
                        out: tangent.clone().multiplyScalar(handleLenOut) // Pointing towards next
                    };
                } else {
                    // Corner: Remove handles? Or keep them? 
                    // If we just remove them, it reverts to Polyline.
                    newHandles[cIdx][pIdx] = null;
                }

                update(localContours, localRoles, newTypes, newHandles);
                return;
            }

            setDraggingNode({ cIdx, pIdx });
            onSelectionChange(new Set([cIdx])); // Node editing implies single selection
        }
    };

    const distToSegmentSq = (p: { x: number, y: number }, v: { x: number, y: number }, w: { x: number, y: number }) => {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    };

    const handleClick = (e: ReactMouseEvent) => {
        if (activeTool !== 'pen') return;

        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg || !group) return;

        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const globalToGroup = group.getScreenCTM()?.inverse();
        if (!globalToGroup) return;
        const modelPt = pt.matrixTransform(globalToGroup);
        // V49: Snap Pen Input
        const newPt = applySnap(new THREE.Vector2(modelPt.x, modelPt.y));

        if (pendingContour.length > 2) {
            const first = pendingContour[0];
            if (first.distanceTo(newPt) < (view.w / 40)) {
                const newC = [...pendingContour];
                const newLocal = [...localContours, newC];
                const newRoles = [...localRoles, 'auto' as ContourRole]; // New role for new contour
                const newTypes = [...localNodeTypes];
                newTypes[newLocal.length - 1] = new Array(newC.length).fill('corner');

                update(newLocal, newRoles, newTypes);
                setPendingContour([]);
                onSelectionChange(new Set([newLocal.length - 1]));
                return;
            }
        }
        setPendingContour([...pendingContour, newPt]);
    };

    const handleDoubleClick = (e: ReactMouseEvent) => {
        // V33: Double click on Shape -> Enter Node Mode
        if (activeTool === 'select' && selectedIdx !== null) { // Only for single selection
            setActiveTool('node');
            return;
        }

        // Node Mode actions (Add/Remove Node)
        if (activeTool !== 'node') return;

        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg || !group) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const globalToGroup = group.getScreenCTM()?.inverse();
        if (!globalToGroup) return;
        const modelPt = pt.matrixTransform(globalToGroup);
        const clickThreshold = view.w / 50;
        const thresholdSq = clickThreshold * clickThreshold;
        // 1. Delete
        for (let i = 0; i < localContours.length; i++) {
            for (let j = 0; j < localContours[i].length; j++) {
                const p = localContours[i][j];
                const dx = p.x - modelPt.x;
                const dy = p.y - modelPt.y;
                if (dx * dx + dy * dy < thresholdSq) {
                    const newContours = [...localContours];
                    if (newContours[i].length <= 3) return;

                    // Remove node
                    const newC = newContours[i].filter((_, idx) => idx !== j);
                    newContours[i] = newC;

                    // Remove node type
                    const newT = [...localNodeTypes];
                    if (newT[i]) {
                        const cTypes = newT[i].filter((_, idx) => idx !== j);
                        newT[i] = cTypes;
                    }

                    setLocalContours(newContours);
                    update(newContours, localRoles, newT);
                    return;
                }
            }
        }
        // 2. Add
        let bestDistSq = Infinity;
        let bestSeg = { cIdx: -1, pIdx: -1, insertAt: -1 };
        for (let i = 0; i < localContours.length; i++) {
            const contour = localContours[i];
            for (let j = 0; j < contour.length; j++) {
                const p1 = contour[j];
                const p2 = contour[(j + 1) % contour.length];
                const dSq = distToSegmentSq(modelPt, p1, p2);
                if (dSq < thresholdSq && dSq < bestDistSq) {
                    bestDistSq = dSq;
                    bestSeg = { cIdx: i, pIdx: j, insertAt: j + 1 };
                }
            }
        }
        if (bestSeg.cIdx !== -1) {
            const newContours = [...localContours];
            const c = [...newContours[bestSeg.cIdx]];
            c.splice(bestSeg.insertAt, 0, new THREE.Vector2(modelPt.x, modelPt.y));
            newContours[bestSeg.cIdx] = c;

            // Add Node Type (inherit from prev?)
            const newT = [...localNodeTypes];
            if (!newT[bestSeg.cIdx]) newT[bestSeg.cIdx] = new Array(c.length - 1).fill('corner');
            const cTypes = [...newT[bestSeg.cIdx]];
            cTypes.splice(bestSeg.insertAt, 0, 'corner');
            newT[bestSeg.cIdx] = cTypes;

            setLocalContours(newContours);
            update(newContours, localRoles, newT);
        }
    };

    const ToolButton = ({ tool, icon: Icon, label }: { tool: ToolType, icon: any, label: string }) => (
        <button
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTool(tool);
                onSelectionChange(new Set()); // Clear selection when changing tools
            }}
            className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center gap-3 text-xs font-medium
                ${activeTool === tool
                    ? 'bg-white text-black shadow-lg shadow-white/10 scale-100'
                    : 'text-stone-400 hover:text-white hover:bg-white/10 hover:translate-x-1'}`}
            title={label}
        >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
        </button>
    );

    // Render Gizmo
    const renderGizmo = () => {
        if (selectedIndices.size === 0) return null; // Render if anything selected

        // Calculate Group BBox
        let allPoints: THREE.Vector2[] = [];
        selectedIndices.forEach(idx => {
            if (localContours[idx]) {
                allPoints = allPoints.concat(localContours[idx]);
            }
        });
        if (allPoints.length === 0) return null;

        const bbox = getRobustBBox(allPoints);
        const min = bbox.min;
        const max = bbox.max;
        const w = max.x - min.x;
        const h = max.y - min.y; // Standard Cartesian (Y up? No, Y down usually in SVG but we use min/max)
        // Actually getBBox returns THREE.Box2.
        // If Y is down (SVG), min.y is top, max.y is bottom.
        // getBBox uses Math.min/max.

        // Prevent crash on zero-size
        if (w === 0 && h === 0) return null;

        const handleSize = view.w / 60;

        // Handle Positions
        // Using standard naming: tl (top-left), tr (top-right), etc.
        const handles = [
            { id: 'tl', x: min.x, y: min.y, c: 'nw-resize' },
            { id: 't', x: min.x + w / 2, y: min.y, c: 'n-resize' },
            { id: 'tr', x: max.x, y: min.y, c: 'ne-resize' },
            { id: 'r', x: max.x, y: min.y + h / 2, c: 'e-resize' },
            { id: 'br', x: max.x, y: max.y, c: 'se-resize' },
            { id: 'b', x: min.x + w / 2, y: max.y, c: 's-resize' },
            { id: 'bl', x: min.x, y: max.y, c: 'sw-resize' },
            { id: 'l', x: min.x, y: min.y + h / 2, c: 'w-resize' },
        ];

        return (
            <g>
                <rect
                    x={min.x} y={min.y} width={w} height={h}
                    fill="none" stroke="#fbbf24" strokeWidth={view.w / 400} strokeDasharray={`${view.w / 50},${view.w / 50} `}
                    vectorEffect="non-scaling-stroke"
                />

                {/* Rotation Handle (Top) */}
                <line x1={min.x + w / 2} y1={min.y} x2={min.x + w / 2} y2={min.y - view.w / 15} stroke="#fbbf24" strokeWidth={view.w / 500} />
                <circle
                    cx={min.x + w / 2} cy={min.y - view.w / 15} r={handleSize}
                    fill="white" stroke="#fbbf24" strokeWidth={view.w / 500}
                    className="cursor-alias"
                    onMouseDown={(e) => initTransform('rotate', 'rot', e)}
                />

                {handles.map(h => (
                    <rect
                        key={h.id}
                        x={h.x - handleSize / 2} y={h.y - handleSize / 2}
                        width={handleSize} height={handleSize}
                        fill="white" stroke="#fbbf24" strokeWidth={1}
                        className="transition-transform"
                        style={{ cursor: h.c }}
                        onMouseDown={(e) => initTransform('scale', h.id, e)}
                    />
                ))}
            </g>
        );
    };

    return (
        <div
            ref={containerRef}
            className={`bg-gray-900 border border-white/10 relative overflow-hidden transition-all duration-300 w-full h-full rounded-xl
                ${activeTool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'} `}
            onMouseMove={handleMouseMove}

            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
        >
            {/* Toolbar */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10" onMouseDown={(e) => e.stopPropagation()}>
                <div className="bg-black/90 backdrop-blur-xl rounded-xl p-2 flex flex-col gap-1 border border-white/10 shadow-2xl min-w-[170px]">
                    <ToolButton tool="select" icon={MousePointer2} label="Transformar (V)" />
                    <ToolButton tool="node" icon={Edit} label="Editar Nodos (A)" />
                    <div className="w-full h-px bg-white/10 my-0.5" />
                    <ToolButton tool="brush" icon={Brush} label="Pincel (B)" />
                    <ToolButton tool="pen" icon={PenTool} label="Pluma (P)" />
                    <ToolButton tool="wand" icon={Wand2} label="Varita Mágica (W)" />
                    <ToolButton tool="text" icon={Type} label="Texto Profesional (T)" />
                    <div className="w-full h-px bg-white/10 my-0.5" />
                    <ToolButton tool="circle" icon={CircleIcon} label="Dibujar Círculo" />
                    <ToolButton tool="square" icon={SquareIcon} label="Dibujar Cuadrado" />
                    <div className="w-full h-px bg-white/10 my-0.5" />

                    {/* Shape Templates */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-gray-500 text-center">Formas</span>
                        <div className="grid grid-cols-2 gap-1">
                            <button onClick={() => handleAddShape('circle')} className="p-1.5 rounded hover:bg-white/10 text-stone-400 hover:text-white" title="Insertar Círculo"><CircleIcon className="w-4 h-4" /></button>
                            <button onClick={() => handleAddShape('heart')} className="p-1.5 rounded hover:bg-white/10 text-stone-400 hover:text-pink-400" title="Insertar Corazón"><Heart className="w-4 h-4" /></button>
                            <button onClick={() => handleAddShape('star')} className="p-1.5 rounded hover:bg-white/10 text-stone-400 hover:text-yellow-400" title="Insertar Estrella"><Star className="w-4 h-4" /></button>
                            <button onClick={() => handleAddShape('rect')} className="p-1.5 rounded hover:bg-white/10 text-stone-400 hover:text-green-400" title="Insertar Rectángulo"><SquareIcon className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-black/80 backdrop-blur text-xs px-3 py-2 rounded text-stone-300 pointer-events-none max-w-[200px] border border-white/5 absolute top-2 left-1/2 -translate-x-1/2 z-10 text-center shadow-lg">
                {activeTool === 'select' && (
                    <>
                        <div className="font-bold mb-1 text-blue-300">Modo Transformar</div>
                        • Click: Seleccionar<br />
                        • Arrastrar: Mover Forma<br />
                        • Doble Clic: Editar Nodos
                    </>
                )}
                {activeTool === 'node' && (
                    <>
                        <div className="font-bold mb-1 text-green-300">Modo Nodos</div>
                        • Mover: Arrastrar Punto<br />
                        • +/- Nodo: Doble Clic<br />
                        • Tipo: <b>Alt + Clic</b>
                    </>
                )}
                {activeTool === 'pen' && (
                    <>
                        <div className="font-bold mb-1 text-purple-300">Modo Pluma</div>
                        • Click: Añadir punto<br />
                        • Click Inicial: Cerrar
                    </>
                )}
                {activeTool === 'wand' && (
                    <>
                        <div className="font-bold mb-1 text-cyan-300">Varita Mágica</div>
                        • Click en "fantasma" para calcar.<br />
                        • Ajusta el umbral si no ves tu forma.
                    </>
                )}
            </div>

            {/* Wand Settings Panel */}
            {activeTool === 'wand' && (

                <div className="absolute bottom-20 left-4 bg-black/90 backdrop-blur rounded p-2 flex flex-col gap-2 border border-white/10 shadow-xl w-64 text-xs text-stone-300 z-50" onMouseDown={e => e.stopPropagation()}>
                    <div className="font-bold text-center text-cyan-400 mb-1 border-b border-white/10 pb-1 flex justify-between items-center px-2">
                        <span>MAGIC WAND v2</span>
                        {detectedType && (
                            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded border border-white/5 text-gray-400 font-normal capitalize">
                                {detectedType}
                            </span>
                        )}
                    </div>

                    {/* V39: Detection Mode Toggle */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Modo de Detección</span>
                        <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                            <button
                                onClick={() => setTraceSettings(s => ({ ...s, adaptive: false, morphology: false, blur: 2, threshold: 128 }))}
                                className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-all ${!traceSettings.adaptive ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                Logos / Personajes
                            </button>
                            <button
                                onClick={() => setTraceSettings(s => ({ ...s, adaptive: true, morphology: true, blur: 0, threshold: 128 }))}
                                className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-all ${traceSettings.adaptive ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            >
                                Texto Avanzado
                            </button>
                        </div>
                    </div>

                    {/* Presets (Secondary) */}
                    <div className="flex flex-col gap-1">
                        <label className="text-gray-500 text-[10px] font-bold">Presets Adicionales:</label>
                        <select
                            className="bg-white/5 border border-white/20 rounded px-2 py-1.5 text-white outline-none focus:border-cyan-500 transition-colors text-xs"
                            value={wizardPreset}
                            onChange={(e) => {
                                const p = e.target.value as WizardPreset;
                                setWizardPreset(p);
                                // Apply Preset Logic
                                switch (p) {
                                    case 'text':
                                        // Text preset now enables adaptive!
                                        setTraceSettings(s => ({ ...s, mode: 'luminance', highRes: true, blur: 0, threshold: 128, adaptive: true, morphology: true }));
                                        break;
                                    case 'sketch':
                                        setTraceSettings(s => ({ ...s, mode: 'edges', highRes: true, blur: 2, threshold: 40, adaptive: false, morphology: false }));
                                        break;
                                    case 'shapes':
                                        setTraceSettings(s => ({ ...s, mode: 'luminance', highRes: false, blur: 5, threshold: 128, adaptive: false, morphology: false }));
                                        break;
                                    case 'general':
                                    default:
                                        setTraceSettings(s => ({ ...s, mode: 'luminance', highRes: false, blur: 2, threshold: 128, adaptive: false, morphology: false }));
                                        break;
                                }
                            }}
                        >
                            <option value="general">General (Estándar)</option>
                            <option value="text">Texto / Logotipos (HD)</option>
                            <option value="sketch">Dibujo / Boceto (Bordes)</option>
                            <option value="shapes">Formas Básicas (Suave)</option>
                        </select>
                    </div>

                    {/* Advanced Controls (Collapsible or Always Visible?) - Always visible for PRO feel */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10 mt-1">
                        {/* Blur Control */}
                        <div className="flex flex-col gap-1">
                            <label className="flex justify-between text-[10px] text-stone-500">
                                <span>Suavizado (Blur)</span>
                                <span className="text-white font-mono">{traceSettings.blur}px</span>
                            </label>
                            <input
                                type="range" min="0" max="10"
                                value={traceSettings.blur}
                                onChange={(e) => {
                                    setTraceSettings(p => ({ ...p, blur: parseInt(e.target.value) }));
                                    setWizardPreset('general'); // Switch to custom/general if manual tweak
                                }}
                                className="accent-cyan-500 w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Mode Specific Threshold */}
                        {traceSettings.mode === 'luminance' && (
                            <div className="flex flex-col gap-1">
                                <label className="flex justify-between text-stone-400">
                                    <span>Umbral (Brillo)</span>
                                    <span className="text-white font-mono">{traceSettings.threshold}</span>
                                </label>
                                <input
                                    type="range" min="0" max="255"
                                    value={traceSettings.threshold}
                                    onChange={(e) => setTraceSettings(p => ({ ...p, threshold: parseInt(e.target.value) }))}
                                    className="accent-cyan-500 w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-stone-500 px-1">
                                    <span>Oscuro</span>
                                    <span>Claro</span>
                                </div>
                            </div>
                        )}

                        {traceSettings.mode === 'edges' && (
                            <div className="flex flex-col gap-1">
                                <label className="flex justify-between text-purple-300">
                                    <span>Sensibilidad Bordes</span>
                                    <span className="text-white font-mono">{traceSettings.threshold}</span>
                                </label>
                                <input
                                    type="range" min="10" max="200"
                                    value={traceSettings.threshold}
                                    onChange={(e) => setTraceSettings(p => ({ ...p, threshold: parseInt(e.target.value) }))}
                                    className="accent-purple-500 w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/10">
                        <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                            <input
                                type="checkbox"
                                checked={traceSettings.invert}
                                onChange={(e) => setTraceSettings(p => ({ ...p, invert: e.target.checked }))}
                                className="rounded bg-white/10 border-white/20 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                            />
                            Invertir Selección
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                            <input
                                type="checkbox"
                                checked={traceSettings.highRes}
                                onChange={(e) => setTraceSettings(p => ({ ...p, highRes: e.target.checked }))}
                                className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-0 focus:ring-offset-0"
                            />
                            <span className={traceSettings.highRes ? "text-purple-300 font-bold" : ""}>Alta Resolución (HQ)</span>
                        </label>
                    </div>
                </div>
            )}

            {/* V56: Text Tool Panel */}
            {activeTool === 'text' && (
                <TextToolPanel
                    onAdd={handleAddText}
                    onClose={() => setActiveTool('select')}
                />
            )}


            {/* Fullscreen Toggle Removed */}

            {/* Boolean Toolbar (Only when >1 selected) */}
            {
                selectedIndices.size > 1 && (
                    <div
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-2 flex gap-2 z-50 shadow-2xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <button
                            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded flex items-center gap-2 text-sm text-gray-200 hover:text-white transition group border border-transparent hover:border-white/10"
                            title="Centrar Todo"
                            onClick={(e) => {
                                e.stopPropagation();
                                // V53: Align Center Logic
                                const indices = Array.from(selectedIndices);
                                const allPoints: THREE.Vector2[] = [];
                                indices.forEach(idx => {
                                    localContours[idx].forEach(p => allPoints.push(p));
                                });

                                if (allPoints.length === 0) return;

                                const groupBBox = getRobustBBox(allPoints);
                                const groupCenter = groupBBox.getCenter(new THREE.Vector2());

                                const newContours = [...localContours];
                                indices.forEach(idx => {
                                    const c = newContours[idx];
                                    const box = getRobustBBox(c);
                                    const localCenter = box.getCenter(new THREE.Vector2());
                                    const delta = groupCenter.clone().sub(localCenter);
                                    newContours[idx] = c.map(p => p.clone().add(delta));
                                });

                                update(newContours, localRoles, localNodeTypes);
                            }}
                        >
                            <Move className="w-4 h-4 group-hover:scale-110 transition-transform" /> Centrar formas
                        </button>
                    </div>
                )
            }

            {/* Context Actions (When Selected) - Modified for Bulk Edit */}
            {
                selectedIndices.size > 0 && (
                    <div
                        className="absolute z-50 p-3 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl flex flex-col gap-2 min-w-[200px]"
                        style={{
                            top: '50%', right: '20px', transform: 'translateY(-50%)', bottom: 'auto', left: 'auto'
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="text-xs text-gray-400 font-medium px-1 mb-1 border-b border-white/10 pb-2">
                            {selectedIndices.size} Elemento{selectedIndices.size > 1 ? 's' : ''} Seleccionado{selectedIndices.size > 1 ? 's' : ''}
                        </div>

                        {/* Role Selectors (Bulk) */}
                        <div className="flex gap-1 mb-1">
                            {['cut', 'stamp', 'base', 'void'].map((r) => (
                                <button
                                    key={r}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newRoles = [...localRoles];
                                        selectedIndices.forEach(idx => newRoles[idx] = r as ContourRole);
                                        update(localContours, newRoles, localNodeTypes);
                                    }}
                                    className={`flex-1 py-1.5 px-1 rounded text-[10px] items-center justify-center flex gap-1 border transition-colors
                                        ${Array.from(selectedIndices).every(i => localRoles[i] === r)
                                            ? (r === 'cut' ? 'bg-red-500/20 text-red-500 border-red-500/50' :
                                                r === 'stamp' ? 'bg-blue-500/20 text-blue-500 border-blue-500/50' :
                                                    r === 'base' ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50' :
                                                        'bg-orange-500/20 text-orange-500 border-orange-500/50')
                                            : 'border-white/5 text-gray-400 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {r === 'void' && <FileMinus className="w-3 h-3" />}
                                    <span className="capitalize">
                                        {r === 'cut' ? 'Cortar' : r === 'stamp' ? 'Sellar' : r === 'base' ? 'Base' : 'Hueco'}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Flip Tools */}
                        <div className="flex gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const allPoints: THREE.Vector2[] = [];
                                    selectedIndices.forEach(idx => localContours[idx].forEach(p => allPoints.push(p)));
                                    if (allPoints.length === 0) return;

                                    const bbox = getRobustBBox(allPoints);
                                    const center = bbox.getCenter(new THREE.Vector2());

                                    const newContours = [...localContours];
                                    selectedIndices.forEach(idx => {
                                        const c = newContours[idx];
                                        newContours[idx] = c.map(p => {
                                            const newX = center.x + (center.x - p.x);
                                            return new THREE.Vector2(newX, p.y);
                                        });
                                    });
                                    update(newContours, localRoles, localNodeTypes);
                                }}
                                className="flex-1 py-1.5 px-1 rounded text-[10px] items-center justify-center flex gap-1 border border-white/5 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                                title="Espejar Horizontalmente"
                            >
                                <FlipHorizontal className="w-3 h-3" /> Espejar H
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const allPoints: THREE.Vector2[] = [];
                                    selectedIndices.forEach(idx => localContours[idx].forEach(p => allPoints.push(p)));
                                    if (allPoints.length === 0) return;

                                    const bbox = getRobustBBox(allPoints);
                                    const center = bbox.getCenter(new THREE.Vector2());

                                    const newContours = [...localContours];
                                    selectedIndices.forEach(idx => {
                                        const c = newContours[idx];
                                        newContours[idx] = c.map(p => {
                                            const newY = center.y + (center.y - p.y);
                                            return new THREE.Vector2(p.x, newY);
                                        });
                                    });
                                    update(newContours, localRoles, localNodeTypes);
                                }}
                                className="flex-1 py-1.5 px-1 rounded text-[10px] items-center justify-center flex gap-1 border border-white/5 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                                title="Espejar Verticalmente"
                            >
                                <FlipVertical className="w-3 h-3" /> Espejar V
                            </button>
                        </div>

                        <button
                            className="w-full text-xs bg-white/5 text-purple-300 px-2 py-1.5 rounded hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition-colors mb-1 border border-purple-500/20"
                            onClick={(e) => {
                                e.stopPropagation();
                                const newContours = [...localContours];
                                const newTypes = [...localNodeTypes];

                                selectedIndices.forEach(idx => {
                                    const raw = newContours[idx];
                                    // 1. Simplify (Ramer-Douglas-Peucker) - Remove noise
                                    // Tolerance 0.7px is a good balance for editor scale
                                    // V41: Only Simplify! Do not add Chaikin points.
                                    // Use a slightly more aggressive simplification for cleanups? 0.7 is safe.
                                    let optimized = simplifyContourFn(raw, 0.7);

                                    newContours[idx] = optimized;
                                    // Preservation: try to Map old types? It's hard.
                                    // Reset to corner is safer, let user smooth manually.
                                    newTypes[idx] = new Array(optimized.length).fill('corner');
                                });

                                update(newContours, localRoles, newTypes);
                            }}
                        >
                            <Wand2 className="w-3 h-3" /> Simplificar Nodos
                        </button>

                        <button
                            className="w-full text-xs bg-white/5 text-gray-300 px-2 py-1.5 rounded hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition-colors mb-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                const newTypes = [...localNodeTypes];
                                selectedIndices.forEach(idx => {
                                    const current = newTypes[idx] || [];
                                    const allSmooth = current.every(t => t === 'smooth');
                                    newTypes[idx] = new Array(localContours[idx].length).fill(allSmooth ? 'corner' : 'smooth');
                                });
                                update(localContours, localRoles, newTypes);
                            }}
                        >
                            <Edit className="w-3 h-3" /> Tipo: Suave/Esquina
                        </button>

                        <button
                            className="w-full text-xs bg-red-500/10 text-red-400 px-2 py-1.5 rounded hover:bg-red-500/20 hover:text-red-300 flex items-center justify-center gap-2 transition-colors border border-red-500/20"
                            onClick={(e) => {
                                e.stopPropagation();
                                const newC = localContours.filter((_, i) => !selectedIndices.has(i));
                                const newR = localRoles.filter((_, i) => !selectedIndices.has(i));
                                const newT = localNodeTypes.filter((_, i) => !selectedIndices.has(i));
                                update(newC, newR, newT);
                                onSelectionChange(new Set());
                            }}
                        >
                            <X className="w-3 h-3" /> Eliminar
                        </button>
                    </div>
                )
            }

            {/* Top Right Controls (Fullscreen & Reset) - Fullscreen Removed */}


            {/* Reset View Button */}
            {/* Bottom Left Controls (Keyboard Shortcuts) */}
            <div className="absolute bottom-4 left-4 z-40" onMouseDown={e => e.stopPropagation()}>
                <button
                    onClick={() => setShowShortcuts(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-black/80 border border-white/10 text-white hover:bg-white/10 transition-all backdrop-blur-md shadow-lg group"
                    title="Atajos de teclado"
                >
                    <Keyboard className="w-5 h-5 group-hover:scale-110 transition-transform text-blue-400" />
                </button>
            </div>

            {/* Bottom Right Controls (Reset & Snapping) */}
            <div className="absolute bottom-4 right-4 flex gap-2 z-20 items-end" onMouseDown={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setView({ x: 0, y: 0, w: width, h: height });
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-2 rounded transition backdrop-blur border border-white/5 h-9 flex items-center"
                >
                    Resetear Vista
                </button>

                <div className="relative">
                    {snapEnabled && <div className="absolute bottom-10 right-0 bg-black/60 text-[9px] text-center text-purple-300 font-mono px-2 py-1 rounded backdrop-blur border border-white/10 whitespace-nowrap mb-1">GRID: {gridSize}px</div>}

                    <button
                        onClick={(e) => { e.stopPropagation(); setSnapEnabled(!snapEnabled); }}
                        className={`p-2 rounded transition-colors w-9 h-9 flex items-center justify-center ${snapEnabled ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'bg-white/10 text-stone-300 hover:text-white hover:bg-white/20 border border-white/5 backdrop-blur'}`}
                        title={snapEnabled ? "Desactivar Magnetismo" : "Activar Magnetismo (Imán)"}
                    >
                        <Magnet className={`w-4 h-4 ${snapEnabled ? 'fill-current' : ''}`} />
                    </button>
                </div>
            </div>



            <svg
                ref={svgRef}
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h} `}
                className="w-full h-full touch-none"
                preserveAspectRatio="xMidYMid meet"
            >
                {/* Visual Grid for context */}
                <defs>
                    <pattern id="grid" width={Math.max(view.w / 10, 1)} height={Math.max(view.w / 10, 1)} patternUnits="userSpaceOnUse">
                        <path d={`M ${view.w / 10} 0 L 0 0 0 ${view.w / 10} `} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={view.w / 2000 + 0.5} />
                    </pattern>
                </defs>
                <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#grid)" />

                {/* V42: Removed Flip Logic. Now standard SVG (Y-Down). */}
                <g
                    ref={groupRef}
                // style={{ transform: 'scale(-1, -1)', transformBox: 'fill-box', transformOrigin: 'center' }}
                >
                    {/* Reference Image Layer (Behind everything) */}
                    {/* Reference Image Layer (Behind everything) */}
                    {referenceImage && (
                        <image
                            href={referenceImage}
                            x={0} y={0}
                            width={width} height={height}
                            opacity={0.4}
                            preserveAspectRatio="none"
                            style={{
                                pointerEvents: 'none',
                            }}
                        />
                    )}

                    {/* Contours Render */}
                    {localContours.map((contour, cIdx) => {
                        const role = localRoles[cIdx];
                        const isSelected = selectedIndices.has(cIdx);

                        // Determine fill and stroke based on role and selection
                        let fillColor = "transparent";
                        let strokeColor = "#3b82f6"; // Default blue
                        let strokeWidth = view.w / 200;
                        let strokeDasharray = "none";

                        if (role === 'cut') {
                            fillColor = "rgba(239, 68, 68, 0.1)"; // Red
                            strokeColor = "#ef4444";
                        } else if (role === 'stamp') {
                            fillColor = "rgba(59, 130, 246, 0.1)"; // Blue
                            strokeColor = "#3b82f6";
                            strokeDasharray = `${view.w / 100},${view.w / 100}`;
                        } else { // 'auto' or 'base'
                            fillColor = "rgba(16, 185, 129, 0.1)"; // Green
                            strokeColor = "#10b981";
                        }

                        if (isSelected) {
                            strokeColor = "#fbbf24"; // Yellow for selected
                            strokeColor = '#fbbf24'; // Yellow for selected
                            strokeWidth = view.w / 150; // Thicker when selected
                        }

                        // V43: Use Bezier Sampling if handles exist
                        let displayPoints = contour;
                        const types = localNodeTypes[cIdx] || [];
                        const handles = localHandles[cIdx];
                        const hasHandles = handles && handles.some(h => h !== null);

                        if (hasHandles) {
                            const bezierNodes = contour.map((p, i) => ({
                                pos: p,
                                handleIn: handles[i]?.in || new THREE.Vector2(0, 0),
                                handleOut: handles[i]?.out || new THREE.Vector2(0, 0),
                                type: types[i] === 'smooth' ? 'smooth' : 'corner' as any
                            }));
                            displayPoints = sampleBezierPath(bezierNodes, true, 1);
                        } else if (types.some(t => t === 'smooth')) {
                            // Interpolate for display only (4 samples approx)
                            displayPoints = interpolateContour(contour, types, true, 4);
                        }

                        const drawPath = `M ${displayPoints.map(p => `${p.x} ${p.y}`).join(' ')} Z`;

                        return (
                            <g key={cIdx}
                                opacity={selectedIndices.size > 0 && !isSelected ? 0.5 : 1}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Top Right Controls: Snapping & Help */}

                                {/* Selection Highlight Halo (behind path) */}
                                {isSelected && (
                                    <path
                                        d={drawPath}
                                        fill="none"
                                        stroke="#fbbf24"
                                        strokeWidth={strokeWidth * 1.5} // Thicker halo
                                        strokeOpacity={0.3}
                                        vectorEffect="non-scaling-stroke"
                                        pointerEvents="none"
                                    />
                                )}
                                {/* Render Path */}
                                <path
                                    d={drawPath}
                                    fill={fillColor}
                                    stroke={strokeColor}
                                    strokeWidth={strokeWidth}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                    strokeDasharray={strokeDasharray}
                                    className="transition-colors duration-200"
                                />

                                {
                                    /* Render Nodes (Only in Node Mode and if single selected) */
                                    activeTool === 'node' && selectedIdx === cIdx && contour.map((p, pIdx) => {
                                        const types = localNodeTypes[cIdx] || [];
                                        const h = localHandles[cIdx]?.[pIdx];
                                        const isDragging = draggingNode?.cIdx === cIdx && draggingNode?.pIdx === pIdx;
                                        const isSmooth = types[pIdx] === 'smooth';

                                        // Render Handles if they exist and node is selected (or neighboring?)
                                        // For now, show handles for ALL nodes in shape if shape is selected? Or just active node?
                                        // Illustrator shows handles for selected anchor points.
                                        // We'll show handles for ALL points to be intuitive for now.
                                        const handles = [];
                                        if (h) {
                                            // Handle In
                                            handles.push(
                                                <line key={`hi-${pIdx}`} x1={p.x} y1={p.y} x2={p.x + h.in.x} y2={p.y + h.in.y} stroke="#8b5cf6" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                            );
                                            handles.push(
                                                <circle key={`hi-c-${pIdx}`} cx={p.x + h.in.x} cy={p.y + h.in.y} r={view.w / 200} fill="#8b5cf6" className="cursor-pointer"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setDraggingHandle({ cIdx, pIdx, type: 'in' });
                                                    }}
                                                />
                                            );
                                            // Handle Out
                                            handles.push(
                                                <line key={`ho-${pIdx}`} x1={p.x} y1={p.y} x2={p.x + h.out.x} y2={p.y + h.out.y} stroke="#8b5cf6" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                            );
                                            handles.push(
                                                <circle key={`ho-c-${pIdx}`} cx={p.x + h.out.x} cy={p.y + h.out.y} r={view.w / 200} fill="#8b5cf6" className="cursor-pointer"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setDraggingHandle({ cIdx, pIdx, type: 'out' });
                                                    }}
                                                />
                                            );
                                        }

                                        return (
                                            <g key={pIdx}>
                                                {handles}
                                                <circle
                                                    cx={p.x} cy={p.y} r={view.w / 150}
                                                    // Color: Green for smooth, Yellow for corner
                                                    fill={isDragging ? "#ffffff" : isSmooth ? "#10b981" : "#fbbf24"}
                                                    stroke="black" strokeWidth={1}
                                                    vectorEffect="non-scaling-stroke"
                                                    onMouseDown={(e) => handleNodeDown(cIdx, pIdx, e)}
                                                    className="cursor-pointer"
                                                >
                                                    <title>Arrastra para mover. Alt+Click para tipo de curva.</title>
                                                </circle>
                                            </g>
                                        );
                                    })}
                            </g>
                        )
                    })}

                    {/* Transform Gizmo (Scale/Rotate) */
                    }
                    {
                        activeTool === 'select' && renderGizmo()
                    }

                    {/* V27: Magic Wand Candidates (Ghosts) */}
                    {activeTool === 'wand' && traceCandidates.map((contour, idx) => (
                        <path
                            key={`ghost-${idx}`}
                            d={`M ${contour.map(p => `${p.x},${p.y}`).join(' L ')} Z`}
                            fill="transparent"
                            stroke="#06b6d4" // Cyan-500
                            strokeWidth={view.w / 200} // Thicker scan
                            strokeDasharray={`${view.w / 50},${view.w / 50}`} // Larger dash
                            vectorEffect="non-scaling-stroke"
                            className="hover:stroke-cyan-300 hover:stroke-2 cursor-copy opacity-80 hover:opacity-100 transition-all z-50" // Higher default opacity
                            onClick={(e) => {
                                e.stopPropagation();
                                if (contour.length < 3) return; // Ignore tiny noise

                                const newC = [...contour];
                                // V27: Add as new shape
                                const newLocal = [...localContours, newC];
                                const newRoles = [...localRoles, 'auto' as ContourRole];
                                const newTypes = [...localNodeTypes];
                                newTypes[newLocal.length - 1] = new Array(newC.length).fill('corner');

                                update(newLocal, newRoles, newTypes);
                                onSelectionChange(new Set([newLocal.length - 1]));
                                setActiveTool('select');
                            }}
                        >
                            <title>Click para calcar</title>
                        </path>
                    ))}

                    {/* Pending Contour (Drawing) */}
                    {pendingContour.length > 0 && (
                        <polyline
                            points={pendingContour.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth={view.w / 200}
                            vectorEffect="non-scaling-stroke"
                            strokeDasharray="4 4"
                        />
                    )}
                    {/* V50: Selection Dimensions Layer (Top) */}
                    <SelectionDimensions selectedIndices={selectedIndices} localContours={localContours} view={view} />
                </g>
            </svg>


            {/* Shortcuts Modal */}
            {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
        </div>
    );
}
