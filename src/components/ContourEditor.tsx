import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import * as THREE from 'three';
import { MousePointer2, PenTool, Circle as CircleIcon, Square as SquareIcon, Brush, X, Scissors, Stamp, Wand2, Maximize, Minimize, Magnet, Edit } from 'lucide-react';
import { interpolateContour, snapPoint, type NodeType } from '../core/curve-utils';

export type ContourRole = 'cut' | 'stamp' | 'auto' | 'base';

interface ContourEditorProps {
    contours: THREE.Vector2[][];
    width: number;
    height: number;
    onChange: (newContours: THREE.Vector2[][], newRoles: ContourRole[], newNodeTypes: NodeType[][]) => void;
    referenceImage?: string | null;
    roles?: ContourRole[];
    nodeTypes?: NodeType[][];
    onUndo?: () => void;
    onRedo?: () => void;
}

export function ContourEditor({ contours, width, height, onChange, referenceImage, roles = [], nodeTypes = [], onUndo, onRedo }: ContourEditorProps) {
    // Local state
    const [localContours, setLocalContours] = useState<THREE.Vector2[][]>(contours);
    const [localRoles, setLocalRoles] = useState<ContourRole[]>(roles);
    // Ensure nodeTypes structure matches contours if new shape added
    const [localNodeTypes, setLocalNodeTypes] = useState<NodeType[][]>(nodeTypes);

    // V27: Magic Wand State
    const [traceCandidates, setTraceCandidates] = useState<THREE.Vector2[][]>([]);
    // V29: Added mode and highRes
    // V32: Added preset tracking
    type WizardPreset = 'general' | 'text' | 'sketch' | 'shapes';
    const [wizardPreset, setWizardPreset] = useState<WizardPreset>('general');
    const [traceSettings, setTraceSettings] = useState({
        threshold: 128,
        invert: false,
        blur: 2, // Added blur
        mode: 'luminance' as 'luminance' | 'edges',
        highRes: false
    });
    const [isTracing, setIsTracing] = useState(false);

    // Tools
    type ToolType = 'select' | 'node' | 'pen' | 'brush' | 'circle' | 'square' | 'wand';
    const [activeTool, setActiveTool] = useState<ToolType>('select');

    // Selection & Transform (Moved up to avoid TDZ)
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [transformState, setTransformState] = useState<{
        mode: 'scale' | 'rotate' | 'move';
        startPos: THREE.Vector2;
        center: THREE.Vector2; // Pivot
        startScale: THREE.Vector2; // For reference (1,1)
        startRotation: number;
        handle?: string; // 'tl','tr','bl','br','t','b','l','r','rot'
        originalContour: THREE.Vector2[]; // Snapshot for diff-based transform
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
                    if (selectedIdx !== null) {
                        // Delete shape logic if needed, or keep for node deletion
                        // For now we rely on UI buttons or specific delete logic
                    }
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIdx]);

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

    // UI Toggles
    const [snappingEnabled, setSnappingEnabled] = useState(true);
    const [gridSize, setGridSize] = useState(0); // 0 = off, else size in units

    // Default grid to 10 units?
    useEffect(() => setGridSize(width / 40 > 5 ? width / 40 : 10), [width]);

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
    const update = (newContours: THREE.Vector2[][], newRoles: ContourRole[], newNodeTypes?: NodeType[][]) => {
        setLocalContours(newContours);
        setLocalRoles(newRoles);

        // Ensure nodeTypes exist for all contours
        const types = newNodeTypes || newContours.map((c, i) => localNodeTypes[i] || new Array(c.length).fill('corner'));
        setLocalNodeTypes(types);
        onChange(newContours, newRoles, types);
    };

    // Interaction State
    const [draggingNode, setDraggingNode] = useState<{ cIdx: number; pIdx: number } | null>(null);
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

            // Delete
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIdx !== null) {
                    const newC = localContours.filter((_, i) => i !== selectedIdx);
                    const newR = localRoles.filter((_, i) => i !== selectedIdx);
                    const newT = localNodeTypes.filter((_, i) => i !== selectedIdx);
                    update(newC, newR, newT);
                    setSelectedIdx(null);
                }
            }

            // Undo/Redo (Ctrl+Z / Ctrl+Y)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    onRedo?.();
                } else {
                    onUndo?.();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                onRedo?.();
            }

            // Tools
            if (e.key.toLowerCase() === 'v') setActiveTool('select');
            if (e.key.toLowerCase() === 'p') setActiveTool('pen');
            if (e.key.toLowerCase() === 'b') setActiveTool('brush');
            if (e.key.toLowerCase() === 'w') setActiveTool('wand');
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIdx, localContours, localRoles, localNodeTypes, onUndo, onRedo]);

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
                setSelectedIdx(clickedContour);

                // Start Dragging/Moving the Shape immediately
                // Initialize Transform State for 'move'
                const contour = localContours[clickedContour];
                const box = getBBox(contour);
                const center = box.getCenter(new THREE.Vector2());
                setTransformState({
                    mode: 'move',
                    startPos: mousePos.clone(),
                    originalContour: contour.map(p => p.clone()),
                    center: center,
                    handle: 'body',
                    startScale: new THREE.Vector2(1, 1),
                    startRotation: 0
                });

            } else if (!transformState && !draggingNode) {
                // Deselect if clicking empty space
                setSelectedIdx(null);
                // Start Pan
                setDraggingPan({
                    startX: e.clientX,
                    startY: e.clientY,
                    startViewX: view.x,
                    startViewY: view.y
                });
            }
        } else if (activeTool === 'brush') {
            setSelectedIdx(null);
            setPendingContour([mousePos]);
            setDragStart(mousePos);
        } else if (activeTool === 'circle' || activeTool === 'square') {
            setSelectedIdx(null);
            setDragStart(mousePos);
            setPendingContour([]);
        }
    };

    const handleMouseMove = (e: ReactMouseEvent) => {
        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg) return;

        // 0. Transform Gizmo Dragging
        if (transformState && group && selectedIdx !== null) {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const globalToGroup = group.getScreenCTM()?.inverse();
            if (globalToGroup) {
                const modelPt = pt.matrixTransform(globalToGroup);
                const currentPos = new THREE.Vector2(modelPt.x, modelPt.y);

                const original = transformState.originalContour;
                const center = transformState.center;

                let newContour = [...original];

                if (transformState.mode === 'move') {
                    // Offset
                    const delta = currentPos.clone().sub(transformState.startPos);
                    newContour = original.map(p => p.clone().add(delta));
                } else if (transformState.mode === 'scale') {
                    // Scale based on handle
                    // Simple implementation: Scale = Distance(Current, Center) / Distance(Start, Center) ?
                    // Better: Bounding Box scaling.
                    const startDelta = transformState.startPos.clone().sub(center);
                    const currentDelta = currentPos.clone().sub(center);

                    let sx = 1, sy = 1;
                    // Prevent zero division
                    if (Math.abs(startDelta.x) > 0.001) sx = currentDelta.x / startDelta.x;
                    if (Math.abs(startDelta.y) > 0.001) sy = currentDelta.y / startDelta.y;

                    // Constrain based on handle
                    const h = transformState.handle || '';
                    if (h === 't' || h === 'b') sx = 1; // Only Y
                    if (h === 'l' || h === 'r') sy = 1; // Only X

                    // Apply scale
                    newContour = original.map(p => {
                        const rel = p.clone().sub(center);
                        rel.x *= sx;
                        rel.y *= sy;
                        return rel.add(center);
                    });
                } else if (transformState.mode === 'rotate') {
                    // Angle delta
                    const v1 = transformState.startPos.clone().sub(center);
                    const v2 = currentPos.clone().sub(center);
                    const angle = v2.angle() - v1.angle();

                    newContour = original.map(p => {
                        return p.clone().rotateAround(center, angle);
                    });
                }

                // Update Local Contours
                const nextContours = [...localContours];
                nextContours[selectedIdx] = newContour;
                setLocalContours(nextContours);
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
                const shouldSnap = snappingEnabled ? !isShift : isShift;

                if (shouldSnap) {
                    // Collect candidate points
                    const candidates: THREE.Vector2[] = [];
                    localContours.forEach((c, cI) => {
                        c.forEach((p, pI) => {
                            if (cI === draggingNode.cIdx && pI === draggingNode.pIdx) return; // Skip self
                            candidates.push(p);
                        });
                    });

                    const snapRes = snapPoint(currentPos, candidates, gridSize, view.w / 50, true);
                    if (snapRes.snapped) {
                        currentPos = snapRes.pos;
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
                setSelectedIdx(newLocal.length - 1);
            }
            setPendingContour([]);
            setDragStart(null);
        }

        setDraggingNode(null);
        setDraggingPan(null);
    };

    // Transform Gizmo Initialization
    const initTransform = (mode: 'scale' | 'rotate' | 'move', handle: string, e: ReactMouseEvent) => {
        e.stopPropagation();
        if (selectedIdx === null) return;

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

        const contour = localContours[selectedIdx];
        const bbox = getBBox(contour);
        const center = new THREE.Vector2();
        bbox.getCenter(center);

        setTransformState({
            mode,
            startPos,
            center,
            startScale: new THREE.Vector2(1, 1),
            startRotation: 0,
            handle,
            originalContour: [...contour]
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
                cTypes[pIdx] = current === 'corner' ? 'smooth' : 'corner';
                newTypes[cIdx] = cTypes;

                update(localContours, localRoles, newTypes);
                return;
            }

            setDraggingNode({ cIdx, pIdx });
            setSelectedIdx(cIdx);
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
        const newPt = new THREE.Vector2(modelPt.x, modelPt.y);

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
                setSelectedIdx(newLocal.length - 1);
                return;
            }
        }
        setPendingContour([...pendingContour, newPt]);
    };

    const handleDoubleClick = (e: ReactMouseEvent) => {
        // V33: Double click on Shape -> Enter Node Mode
        if (activeTool === 'select' && selectedIdx !== null) {
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
                setSelectedIdx(null);
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
        if (selectedIdx === null || !localContours[selectedIdx]) return null;
        const contour = localContours[selectedIdx];
        if (contour.length === 0) return null;

        const bbox = getBBox(contour);
        const min = bbox.min;
        const max = bbox.max;
        const size = new THREE.Vector2();
        bbox.getSize(size);
        const w = size.x;
        const h = size.y;

        // Prevent crash on zero-size (single point)
        if (w === 0 && h === 0) return null;

        const handleSize = view.w / 60;

        // Handle Positions
        const handles = [
            { id: 'tl', x: min.x, y: max.y, c: 'nw-resize' },
            { id: 't', x: min.x + w / 2, y: max.y, c: 'n-resize' },
            { id: 'tr', x: max.x, y: max.y, c: 'ne-resize' },
            { id: 'r', x: max.x, y: min.y + h / 2, c: 'e-resize' },
            { id: 'br', x: max.x, y: min.y, c: 'se-resize' },
            { id: 'b', x: min.x + w / 2, y: min.y, c: 's-resize' },
            { id: 'bl', x: min.x, y: min.y, c: 'sw-resize' },
            { id: 'l', x: min.x, y: min.y + h / 2, c: 'w-resize' },
        ];

        return (
            <g>
                <rect
                    x={min.x} y={min.y} width={w} height={h}
                    fill="none" stroke="#fbbf24" strokeWidth={view.w / 400} strokeDasharray={`${view.w / 50},${view.w / 50} `}
                    vectorEffect="non-scaling-stroke"
                />

                <line x1={min.x + w / 2} y1={max.y} x2={min.x + w / 2} y2={max.y + view.w / 15} stroke="#fbbf24" strokeWidth={view.w / 500} />
                <circle
                    cx={min.x + w / 2} cy={max.y + view.w / 15} r={handleSize}
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
                    <div className="w-full h-px bg-white/10 my-0.5" />
                    <ToolButton tool="circle" icon={CircleIcon} label="Círculo" />
                    <ToolButton tool="square" icon={SquareIcon} label="Cuadrado" />
                    <div className="w-full h-px bg-white/10 my-0.5" />
                    {/* Snapping Toggle */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setSnappingEnabled(!snappingEnabled); }}
                        className={`p-2 rounded transition-colors ${snappingEnabled ? 'bg-purple-600 text-white' : 'text-stone-400 hover:text-white hover:bg-white/10'}`}
                        title="Magnetismo (Snapping)"
                    >
                        <Magnet className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-black/60 backdrop-blur text-xs px-3 py-2 rounded text-stone-300 pointer-events-none max-w-[200px] border border-white/5">
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
                    <div className="bg-black/90 backdrop-blur rounded p-2 flex flex-col gap-2 border border-white/10 shadow-xl w-52 text-xs text-stone-300" onMouseDown={e => e.stopPropagation()}>
                        <div className="font-bold text-center text-cyan-400 mb-1 border-b border-white/10 pb-1">MAGIC WAND v2</div>

                        <div className="flex flex-col gap-2">
                            <label className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Optimizado Para:</label>
                            <select
                                className="bg-white/5 border border-white/20 rounded px-2 py-1.5 text-white outline-none focus:border-cyan-500 transition-colors text-xs"
                                value={wizardPreset}
                                onChange={(e) => {
                                    const p = e.target.value as WizardPreset;
                                    setWizardPreset(p);
                                    // Apply Preset Logic
                                    switch (p) {
                                        case 'text':
                                            setTraceSettings(s => ({ ...s, mode: 'luminance', highRes: true, blur: 0, threshold: 128 }));
                                            break;
                                        case 'sketch':
                                            setTraceSettings(s => ({ ...s, mode: 'edges', highRes: true, blur: 2, threshold: 40 }));
                                            break;
                                        case 'shapes':
                                            setTraceSettings(s => ({ ...s, mode: 'luminance', highRes: false, blur: 5, threshold: 128 }));
                                            break;
                                        case 'general':
                                        default:
                                            setTraceSettings(s => ({ ...s, mode: 'luminance', highRes: false, blur: 2, threshold: 128 }));
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
            </div>

            {/* Fullscreen Toggle Removed */}

            {/* Context Actions (When Selected) */}
            {
                selectedIdx !== null && activeTool === 'select' && (
                    <div className="absolute top-16 right-4 flex flex-col gap-2 z-10 bg-black/80 backdrop-blur rounded p-2 border border-white/10 max-w-[200px]" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="text-xs font-bold text-gray-400 uppercase mb-1 flex justify-between">
                            <span>Propiedades</span>
                            <span className="text-blue-400">#{selectedIdx}</span>
                        </div>

                        {/* Roles */}
                        <div className="flex bg-black/40 rounded p-1 gap-1 mb-2">
                            <button
                                className={`flex-1 p-1 rounded flex items-center justify-center gap-1 text-[10px] ${localRoles[selectedIdx] === 'cut' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newRoles = [...localRoles];
                                    newRoles[selectedIdx] = 'cut';
                                    update(localContours, newRoles, localNodeTypes);
                                }}
                                title="Cortador (Exterior)"
                            >
                                <Scissors className="w-3 h-3" />
                            </button>
                            <button
                                className={`flex-1 p-1 rounded flex items-center justify-center gap-1 text-[10px] ${localRoles[selectedIdx] === 'stamp' ? 'bg-green-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newRoles = [...localRoles];
                                    newRoles[selectedIdx] = 'stamp';
                                    update(localContours, newRoles, localNodeTypes);
                                }}
                                title="Sello/Detalle (Interior)"
                            >
                                <Stamp className="w-3 h-3" />
                            </button>
                            <button
                                className={`flex-1 p-1 rounded flex items-center justify-center gap-1 text-[10px] ${(!localRoles[selectedIdx] || localRoles[selectedIdx] === 'auto') ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newRoles = [...localRoles];
                                    newRoles[selectedIdx] = 'auto';
                                    update(localContours, newRoles, localNodeTypes);
                                }}
                                title="Automático (Detectar ID)"
                            >
                                <Wand2 className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Actions */}
                        <button
                            className="w-full text-xs bg-white/5 text-gray-300 px-2 py-1.5 rounded hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition-colors mb-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                // Toggle all to smooth
                                const newTypes = [...localNodeTypes];
                                const current = newTypes[selectedIdx] || [];
                                const allSmooth = current.every(t => t === 'smooth');
                                newTypes[selectedIdx] = new Array(localContours[selectedIdx].length).fill(allSmooth ? 'corner' : 'smooth');
                                update(localContours, localRoles, newTypes);
                            }}
                        >
                            <Edit className="w-3 h-3" /> Suavizar Todo
                        </button>

                        <button
                            className="w-full text-xs bg-white/5 text-gray-300 px-2 py-1.5 rounded hover:bg-red-500/20 hover:text-red-300 flex items-center justify-center gap-2 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                const newC = localContours.filter((_, i) => i !== selectedIdx);
                                const newR = localRoles.filter((_, i) => i !== selectedIdx);
                                // Also types
                                const newT = localNodeTypes.filter((_, i) => i !== selectedIdx);

                                update(newC, newR, newT);
                                setSelectedIdx(null);
                            }}
                        >
                            <X className="w-3 h-3" /> Eliminar Forma
                        </button>
                    </div>
                )
            }

            {/* Top Right Controls (Fullscreen & Reset) - Fullscreen Removed */}
            <div className="absolute top-4 right-4 flex gap-2 z-20" onMouseDown={(e) => e.stopPropagation()}>
                {/* Just container kept for layout consistency if needed, or empty */}
            </div>

            {/* Reset View Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setView({ x: 0, y: 0, w: width, h: height });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute bottom-4 right-4 bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded transition z-10"
            >
                Resetear Vista
            </button>

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

                {/* Flip Logic: Scale(-1, -1) for H+V flip (180 deg) */}
                <g
                    ref={groupRef}
                    style={{ transform: 'scale(-1, -1)', transformBox: 'fill-box', transformOrigin: 'center' }}
                >
                    {/* Reference Image Layer (Behind everything) */}
                    {referenceImage && (
                        <image
                            href={referenceImage}
                            x={0} y={0}
                            width={width} height={height}
                            opacity={0.4}
                            preserveAspectRatio="none"
                            style={{ pointerEvents: 'none' }} // Ensure clicks go through
                        />
                    )}

                    {/* Contours */}
                    {localContours.map((contour, cIdx) => {
                        const types = localNodeTypes[cIdx] || new Array(contour.length).fill('corner');
                        const hasSmooth = types.some(t => t === 'smooth');
                        const drawPoints = hasSmooth ? interpolateContour(contour, types, true, 8) : contour;

                        return (
                            <g key={cIdx}
                                opacity={selectedIdx !== null && selectedIdx !== cIdx ? 0.5 : 1}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Render Path */}
                                <path
                                    d={`M ${drawPoints.map(p => `${p.x},${p.y}`).join(' L ')} Z`}
                                    fill={selectedIdx === cIdx ? "rgba(251, 191, 36, 0.2)" : "rgba(59, 130, 246, 0.1)"}
                                    stroke={selectedIdx === cIdx ? "#fbbf24" : "#3b82f6"}
                                    strokeWidth={view.w / 200}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                />

                                {
                                    /* Render Nodes (Only in Node Mode) */
                                    activeTool === 'node' && selectedIdx === cIdx && contour.map((p, pIdx) => {
                                        const isDragging = draggingNode?.cIdx === cIdx && draggingNode?.pIdx === pIdx;
                                        const isSmooth = types[pIdx] === 'smooth';
                                        return (
                                            <circle
                                                key={pIdx}
                                                cx={p.x} cy={p.y} r={view.w / 150}
                                                // Color: Green for smooth, Yellow for corner
                                                fill={isDragging ? "#ffffff" : isSmooth ? "#10b981" : "#fbbf24"}
                                                stroke="black" strokeWidth={1}
                                                vectorEffect="non-scaling-stroke"
                                                vectorEffect="non-scaling-stroke"
                                                onMouseDown={(e) => handleNodeDown(cIdx, pIdx, e)}
                                                className="cursor-pointer"
                                            >
                                                <title>Arrastra para mover. Alt+Click para tipo de curva.</title>
                                            </circle>
                                        );
                                    })}
                            </g>
                        )
                    })}

                    {renderGizmo()}

                    {/* V27: Magic Wand Candidates (Ghosts) */}
                    {activeTool === 'wand' && traceCandidates.map((contour, idx) => (
                        <path
                            key={`ghost-${idx}`}
                            d={`M ${contour.map(p => `${p.x},${p.y}`).join(' L ')} Z`}
                            fill="transparent"
                            stroke="#06b6d4" // Cyan-500
                            strokeWidth={view.w / 250}
                            strokeDasharray={`${view.w / 100},${view.w / 100}`}
                            vectorEffect="non-scaling-stroke"
                            className="hover:stroke-cyan-300 hover:stroke-2 cursor-copy opacity-50 hover:opacity-100 transition-all"
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
                                setSelectedIdx(newLocal.length - 1);
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
                </g>
            </svg>
        </div >
    );
}
