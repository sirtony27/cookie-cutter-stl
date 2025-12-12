import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';

import { diffContours } from './boolean-ops'; // Import Diff logic

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface CutterSettings {
    size: number; // Max dimension in mm
    cutterHeight: number; // Height of the cutting wall
    cutterThickness: number; // Thickness of the cutting wall
    baseHeight: number; // Height of the base flange/plate
    baseThickness: number; // Width/Offset of the base flange
    mirror: boolean; // Mirror horizontally?
    withBase: boolean; // Generate base plate?
    markerHeight: number; // Height for inner details
    markerThickness: number; // Thickness for inner details

    // V7: Dual Mode Settings
    generationMode: 'single' | 'dual';
    stampTolerance: number; // Gap between cutter and stamp (mm)
    handleHeight: number; // Height of the stamp handle
    handleThickness: number; // Thickness of the stamp handle

    // V11.4: Automatic Bridges
    automaticBridges: boolean;
    // V13.2: Solid Base
    solidBase: boolean;
    // V15: Blade Profile
    bladeProfile: 'standard' | 'stepped';
    stampGrid: boolean;

    // V18: Keychain Mode
    outputType: 'cutter' | 'keychain';
    keychainHoleDiameter: number; // mm

    // V20.1: Backing Shape
    keychainShape: 'silhouette' | 'circle' | 'square' | 'hexagon' | 'heart';

    // V23: Custom Base Settings
    keychainBasePadding?: number;
    keychainHoleOffset?: { x: number, y: number };

    // V20.3: Chamfer/Fillet
    keychainBevelEnabled?: boolean;
    keychainBevelSize?: number;
}

export type ShapeType = 'standard' | 'rounded' | 'hexagon' | 'heart' | 'circle';
export type PartType = 'base' | 'inner' | 'outer' | 'handle' | 'bridge'; // Added 'bridge'

export interface CutterPart {
    geometry: THREE.BufferGeometry;
    type: PartType;
    contourIndex: number; // Index in the original contours array (or distinct ID)
    id: string; // Unique ID for React keys
    position?: [number, number, number]; // Position offset for rendering
    center?: THREE.Vector2; // Original center of the part
}

// Check if contour A is inside contour B
const isPointInPolygon2D = (p: THREE.Vector2, polygon: THREE.Vector2[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

interface ContourNode {
    id: number;
    contour: THREE.Vector2[];
    children: ContourNode[];
    depth: number;
}

const buildContourHierarchy = (contours: THREE.Vector2[][]): ContourNode[] => {
    const nodes: ContourNode[] = contours.map((c, i) => ({ id: i, contour: c, children: [], depth: 0 }));
    const roots: ContourNode[] = [];

    // Sort by area size (largest first) to ensure parents are processed before children
    const areas = contours.map((c, i) => ({ area: Math.abs(THREE.ShapeUtils.area(c)), index: i }));
    areas.sort((a, b) => b.area - a.area);

    for (let i = 0; i < areas.length; i++) {
        const currentIdx = areas[i].index;
        const currentNode = nodes[currentIdx];

        let bestParent: ContourNode | null = null;
        let smallestParentArea = Infinity;

        // Check against all POTENTIAL parents (larger areas processed before)
        for (let j = 0; j < i; j++) {
            const parentIdx = areas[j].index;
            const parentNode = nodes[parentIdx];

            // Check if current is inside parent
            // Test first point of current
            if (isPointInPolygon2D(currentNode.contour[0], parentNode.contour)) {
                if (areas[j].area < smallestParentArea) {
                    smallestParentArea = areas[j].area;
                    bestParent = parentNode;
                }
            }
        }

        if (bestParent) {
            bestParent.children.push(currentNode);
            currentNode.depth = bestParent.depth + 1;
        } else {
            roots.push(currentNode);
        }
    }

    return roots;
};

// Helper to expand a contour
const offsetContour = (contour: THREE.Vector2[], distance: number): THREE.Vector2[] => {
    if (distance === 0) return contour.map(p => p.clone());
    const result: THREE.Vector2[] = [];
    const len = contour.length;
    for (let i = 0; i < len; i++) {
        const prev = contour[(i - 1 + len) % len];
        const curr = contour[i];
        const next = contour[(i + 1) % len];

        // Edge vectors
        const v1 = new THREE.Vector2().subVectors(curr, prev).normalize();
        const v2 = new THREE.Vector2().subVectors(next, curr).normalize();

        // Normals (Rotate -90 deg for "Outside" if CCW)
        const n1 = new THREE.Vector2(v1.y, -v1.x);
        const n2 = new THREE.Vector2(v2.y, -v2.x);

        // Average normal (bisector)
        const bisector = new THREE.Vector2().addVectors(n1, n2).normalize();

        // Miter length adjustment
        const dot = bisector.dot(n1);
        const miter = distance / Math.max(dot, 0.1);

        // Limit miter to avoid huge spikes
        const limit = Math.abs(distance) * 2;
        const offsetDist = Math.max(-limit, Math.min(miter, limit));

        const offset = bisector.multiplyScalar(offsetDist);
        result.push(new THREE.Vector2().addVectors(curr, offset));
    }
    return result;
};

// Helper: Wall Geometry
const createExtrudedWall = (
    contour: THREE.Vector2[],
    height: number,
    thickness: number,
    zStart: number = 0
): THREE.BufferGeometry => {
    // Inner = contour
    // Outer = offsetContour(contour, thickness)
    const inner = contour;
    const outer = offsetContour(contour, thickness);

    // If offset failed (empty), fallback to inner
    if (outer.length !== inner.length) return new THREE.BufferGeometry();

    const numPoints = inner.length;
    const vertices: number[] = [];

    // Quad Helper
    const pushQuad = (p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, p4: THREE.Vector3) => {
        // Tri 1: p1, p2, p4
        vertices.push(p1.x, p1.y, p1.z);
        vertices.push(p2.x, p2.y, p2.z);
        vertices.push(p4.x, p4.y, p4.z);
        // Tri 2: p2, p3, p4
        vertices.push(p2.x, p2.y, p2.z);
        vertices.push(p3.x, p3.y, p3.z);
        vertices.push(p4.x, p4.y, p4.z);
    };

    for (let i = 0; i < numPoints; i++) {
        const next = (i + 1) % numPoints;

        // Bottom Z = zStart, Top Z = zStart + height
        const zBot = zStart;
        const zTop = zStart + height;

        const i1 = new THREE.Vector3(inner[i].x, inner[i].y, zBot);
        const i2 = new THREE.Vector3(inner[next].x, inner[next].y, zBot);
        const i1_top = new THREE.Vector3(inner[i].x, inner[i].y, zTop);
        const i2_top = new THREE.Vector3(inner[next].x, inner[next].y, zTop);

        const o1 = new THREE.Vector3(outer[i].x, outer[i].y, zBot);
        const o2 = new THREE.Vector3(outer[next].x, outer[next].y, zBot);
        const o1_top = new THREE.Vector3(outer[i].x, outer[i].y, zTop);
        const o2_top = new THREE.Vector3(outer[next].x, outer[next].y, zTop);

        // 1. Inner Wall (facing IN)
        // i1_top -> i2_top -> i2 -> i1
        pushQuad(i1_top, i2_top, i2, i1);

        // 2. Outer Wall (facing OUT)
        // o1 -> o2 -> o2_top -> o1_top
        pushQuad(o1, o2, o2_top, o1_top);

        // 3. Top Cap (Rim)
        // i1_top -> o1_top -> o2_top -> i2_top
        pushQuad(i1_top, o1_top, o2_top, i2_top);

        // 4. Bottom Cap (Rim)
        // i2 -> o2 -> o1 -> i1
        pushQuad(i2, o2, o1, i1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
};

// V15: Grid Generation Math

// Segment-Segment Intersection
const getIntersection = (p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2, p4: THREE.Vector2): THREE.Vector2 | null => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return null; // Parallel

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return new THREE.Vector2(p1.x + ua * (p2.x - p1.x), p1.y + ua * (p2.y - p1.y));
    }
    return null;
};

const createGridBase = (
    contour: THREE.Vector2[],
    height: number,
    thickness: number, // Width of grid lines
    spacing: number, // Spacing between lines
    rimWidth: number // Width of the solid perimeter
): THREE.BufferGeometry => {
    // 1. Create Rim
    // Inner = contour (already offset by tolerance in main loop)
    // Outer = offset(contour, -rimWidth) -- Inset again for rim inner edge
    const rimOuter = contour;
    const rimInner = offsetContour(contour, -rimWidth);

    // Rim Geometry
    const rimGeom = createExtrudedWall(rimOuter, height, -rimWidth, 0); // Negative thickness extrudes INWARD

    if (rimInner.length < 3) return rimGeom; // Too small for grid

    // 2. Create Grid (Scanlines)
    // Bounding Box
    const box = new THREE.Box2();
    rimInner.forEach(p => box.expandByPoint(p));

    const grids: THREE.BufferGeometry[] = [rimGeom];

    // X-Scan (Vertical Lines)
    for (let x = box.min.x; x <= box.max.x; x += spacing) {
        const p1 = new THREE.Vector2(x, box.min.y - 1);
        const p2 = new THREE.Vector2(x, box.max.y + 1);

        const intersections: number[] = [];

        for (let i = 0; i < rimInner.length; i++) {
            const next = (i + 1) % rimInner.length;
            const hit = getIntersection(p1, p2, rimInner[i], rimInner[next]);
            if (hit) intersections.push(hit.y);
        }

        intersections.sort((a, b) => a - b);

        // Pairs define segments
        for (let i = 0; i < intersections.length; i += 2) {
            if (i + 1 >= intersections.length) break;
            const yStart = intersections[i];
            const yEnd = intersections[i + 1];
            if (yEnd - yStart < 0.1) continue;

            const barGeo = new THREE.BoxGeometry(thickness, yEnd - yStart, height);
            barGeo.translate(x, yStart + (yEnd - yStart) / 2, height / 2);
            grids.push(barGeo);
        }
    }

    // Y-Scan (Horizontal Lines) - Optional: Cross Grid vs Lines
    // Let's do Cross Grid for strength
    for (let y = box.min.y; y <= box.max.y; y += spacing) {
        const p1 = new THREE.Vector2(box.min.x - 1, y);
        const p2 = new THREE.Vector2(box.max.x + 1, y);

        const intersections: number[] = [];

        for (let i = 0; i < rimInner.length; i++) {
            const next = (i + 1) % rimInner.length;
            const hit = getIntersection(p1, p2, rimInner[i], rimInner[next]);
            if (hit) intersections.push(hit.x);
        }

        intersections.sort((a, b) => a - b);

        for (let i = 0; i < intersections.length; i += 2) {
            if (i + 1 >= intersections.length) break;
            const xStart = intersections[i];
            const xEnd = intersections[i + 1];
            if (xEnd - xStart < 0.1) continue;

            const barGeo = new THREE.BoxGeometry(xEnd - xStart, thickness, height);
            barGeo.translate(xStart + (xEnd - xStart) / 2, y, height / 2);
            grids.push(barGeo);
        }
    }

    // Merge
    const merged = mergeGeometries(grids, false);
    return merged || rimGeom;
};

// Helper: Tapered Wall (Lofted Extrusion)
// This creates a multi-section wall where inner surface is vertical,
// but outer surface interpolates between thicknesses.
const createTaperedWall = (
    contour: THREE.Vector2[],
    zStart: number,
    heights: number[], // Height of each section (relative to previous)
    bottomThicknesses: number[], // Thickness at bottom of each section
    topThicknesses: number[] // Thickness at top of each section
): THREE.BufferGeometry => {
    // Inner surface is uniform (using contour).
    // Outer surface varies.

    // We assume matching lengths of arrays.
    // Example: 3 Sections
    // 1. Tip (High Detail): H=1, Thick=0.4 -> 0.4
    // 2. Taper (Slope): H=3, Thick=0.4 -> 0.8
    // 3. Base (Strong): H=Rest, Thick=0.8 -> 0.8

    const geometries: THREE.BufferGeometry[] = [];
    let currentZ = zStart;

    for (let i = 0; i < heights.length; i++) {
        const h = heights[i];
        const tBot = bottomThicknesses[i];
        const tTop = topThicknesses[i];

        // If thickness is uniform, use createExtrudedWall (optimized)
        // BUT createExtrudedWall makes vertical walls.
        // If tBot != tTop, we need a custom loft.

        // Inner Contour (Always same)
        const inner = contour;
        const outerBot = offsetContour(contour, tBot);
        const outerTop = offsetContour(contour, tTop);

        // Safety fallback
        if (outerBot.length !== inner.length || outerTop.length !== inner.length) continue;

        const numPoints = inner.length;
        const vertices: number[] = [];

        // Push Quad Helper (redefined here or moved to scope needed?)
        // Let's redefine for simplicity or hoist it.
        // It's small.
        const pushQuad = (p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, p4: THREE.Vector3) => {
            vertices.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p4.x, p4.y, p4.z);
            vertices.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
        };

        const zBot = currentZ;
        const zTop = currentZ + h;

        for (let j = 0; j < numPoints; j++) {
            const next = (j + 1) % numPoints;

            const i1 = new THREE.Vector3(inner[j].x, inner[j].y, zBot);
            const i2 = new THREE.Vector3(inner[next].x, inner[next].y, zBot);
            const i1_top = new THREE.Vector3(inner[j].x, inner[j].y, zTop);
            const i2_top = new THREE.Vector3(inner[next].x, inner[next].y, zTop);

            // Outer surface depends on Bot vs Top offsets
            const o1 = new THREE.Vector3(outerBot[j].x, outerBot[j].y, zBot);
            const o2 = new THREE.Vector3(outerBot[next].x, outerBot[next].y, zBot);
            const o1_top = new THREE.Vector3(outerTop[j].x, outerTop[j].y, zTop);
            const o2_top = new THREE.Vector3(outerTop[next].x, outerTop[next].y, zTop);

            // 1. Inner Wall (Vertical)
            pushQuad(i1_top, i2_top, i2, i1);

            // 2. Outer Wall (Sloped)
            pushQuad(o1, o2, o2_top, o1_top);

            // 3. Top Cap (Rim) (Only needed for top section? Or internal caps?)
            // Internal caps are hidden. Only top section needs a cap.
            // Actually, "stepped" implies no internal caps needed if continuous.
            if (i === heights.length - 1) {
                pushQuad(i1_top, o1_top, o2_top, i2_top);
            }

            // 4. Bottom Cap (Only needed for bottom section)
            if (i === 0) {
                pushQuad(i2, o2, o1, i1);
            }
        }

        const sectionGeom = new THREE.BufferGeometry();
        sectionGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        sectionGeom.computeVertexNormals();
        geometries.push(sectionGeom);

        currentZ += h;
    }

    return mergeGeometries(geometries, true);
};

// Helper: Stepped Wall (Legacy / Backup)
const createSteppedWall = (
    contour: THREE.Vector2[],
    totalHeight: number,
    baseThickness: number,
    tipThickness: number,
    tipHeight: number = 1.0,
    zStart: number = 0
): THREE.BufferGeometry => {
    // V23 Upgrade: Use Tapered Wall for "Stepped" profile request.
    // Structure:
    // 1. Tip: 1mm High, 0.4mm Thick (Vertical)
    // 2. Transition (Taper): 3mm High, 0.4mm -> BaseThickness
    // 3. Base: Remainder, BaseThickness (Vertical)


    // Tip is TOP. We build from Bottom Up? No, logic above is Bottom Up.
    // So:
    // Element 1 (Base): Z=0 to Z=(Total - Tip - Taper). Thick = BaseT -> BaseT.
    // Element 2 (Taper): Z to Z+Taper. Thick = BaseT -> TipT.
    // Element 3 (Tip): Z to Top. Thick = TipT -> TipT.

    // Check heights
    const hTip = tipHeight; // 1.0
    const hTaper = 3.0; // User requested ~smooth transition
    const hBase = Math.max(0, totalHeight - hTip - hTaper);

    const heights: number[] = [];
    const botTs: number[] = [];
    const topTs: number[] = [];

    // 1. Base Section (if height > 0)
    if (hBase > 0.1) {
        heights.push(hBase);
        botTs.push(baseThickness);
        topTs.push(baseThickness);
    }

    // 2. Taper Section
    heights.push(hTaper);
    botTs.push(baseThickness); // Start thick
    topTs.push(tipThickness);  // End thin

    // 3. Tip Section
    heights.push(hTip);
    botTs.push(tipThickness);
    topTs.push(tipThickness);

    return createTaperedWall(contour, zStart, heights, botTs, topTs);
};

// Helper to determine if a contour is an outer boundary or a hole
// This is a simplified heuristic based on winding order or point-in-polygon
// For robust hole detection, a full hierarchy build is better.
// Helper to determine if a contour is an outer boundary or a hole (Unused export for now, but good to keep or remove)
// Removed unused isOuterContour to fix lint


export const generateGeometry = (
    contours: THREE.Vector2[][], // Raw pixel coordinates
    roles: ('cut' | 'stamp' | 'auto' | 'base' | 'void')[] | undefined, // Added 'void' role
    imgWidth: number,
    imgHeight: number,
    settings: CutterSettings
): CutterPart[] => {
    // 1. Normalize and Center contours
    const scale = settings.size / Math.max(imgWidth, imgHeight);
    const offsetX = imgWidth / 2;
    const offsetY = imgHeight / 2;

    // V22: Determine Mirroring
    // Cutter = Mirrored (default)
    // Keychain = Normal (readable)
    const shouldMirror = settings.outputType === 'cutter' || settings.mirror;

    const processedRawContours = contours.map(contour => {
        return contour.map(p => {
            return new THREE.Vector2(
                shouldMirror ? (offsetX - p.x) * scale : (p.x - offsetX) * scale,
                (p.y + offsetY) * scale
            );
        });
    });

    if (processedRawContours.length === 0) return [];

    // 0. Pre-process Contours: Separate Solids and Voids (Holes)
    const solidContours: THREE.Vector2[][] = [];
    const voidContours: THREE.Vector2[][] = [];
    const solidIndices: number[] = []; // Map back to original index for selection

    processedRawContours.forEach((contour, i) => {
        if (roles && roles[i] === 'void') {
            voidContours.push(contour);
        } else {
            solidContours.push(contour);
            solidIndices.push(i);
        }
    });

    // Apply Boolean Difference if there are voids
    let finalProcessedParts: { points: THREE.Vector2[], originIdx: number }[] = [];

    if (voidContours.length > 0) {
        // Note: This simple implementation subtracts ALL voids from EACH solid.
        // Ideally, we'd only subtract overlapping ones, but diffContours handles non-overlaps efficiently (no-op).
        // However, diffContours(A, B) returns (A - B).
        // If we have multiple solids, we process each.

        // This mapping is tricky for Selection sync.
        // If Solid A (index 0) gets cut in half, we have A1 and A2. Both should select index 0.

        solidContours.forEach((solid, idx) => {
            let currentSolids = [solid];

            voidContours.forEach(voidShape => {
                // Subtract voidShape from all currentSolids
                const nextPass: THREE.Vector2[][] = [];
                currentSolids.forEach(s => {
                    const res = diffContours(s, voidShape); // Returns array of polygons
                    nextPass.push(...res);
                });
                currentSolids = nextPass;
            });

            // Add results
            currentSolids.forEach(c => {
                finalProcessedParts.push({ points: c, originIdx: solidIndices[idx] });
            });
        });
    } else {
        // If no voids, all processedRawContours are solids
        processedRawContours.forEach((c, i) => {
            finalProcessedParts.push({ points: c, originIdx: i });
        });
    }

    // Compatibility shim: Many downstream functions expect 'processedContours'
    const processedContours = finalProcessedParts.map(p => p.points);
    const originIndices = finalProcessedParts.map(p => p.originIdx);

    // 2. Classify Contours (now iterating over finalProcessedParts)
    let largestIndex = 0; // This will now refer to an index in finalProcessedParts
    let maxLen = 0;
    processedContours.forEach((c, i) => {
        const len = c.length;
        if (len > maxLen) {
            maxLen = len;
            largestIndex = i;
        }
    });

    const finalTypes = processedContours.map((_, i) => {
        const originalIdx = originIndices[i];
        const role = roles ? roles[originalIdx] : 'auto';
        if (role === 'cut') return 'outer';
        if (role === 'stamp') return 'inner';
        if (role === 'base') return 'base';
        return i === largestIndex ? 'outer' : 'inner'; // Auto heuristic on the *processed* parts
    });

    const results: CutterPart[] = [];

    // --- Automatic Bridges ---
    if (settings.automaticBridges) {
        // For bridges, we need to consider the original contours and their hierarchy
        // This part needs to be adapted to work with the boolean-processed contours
        // For simplicity, let's apply bridges to the *original* outer contours
        // and then merge them. This might need more sophisticated logic if bridges
        // should respect the boolean cuts.
        // For now, we'll use the original processedRawContours for bridge calculation
        // and assign them to the closest original index.

        const originalAreas = processedRawContours.map(THREE.ShapeUtils.area);
        const sortedOriginalIndices = processedRawContours.map((_, i) => i).sort((a, b) => Math.abs(originalAreas[a]) - Math.abs(originalAreas[b]));
        const parentMap = new Map<number, number>();

        for (let i = 0; i < sortedOriginalIndices.length; i++) {
            const childIdx = sortedOriginalIndices[i];
            const originalRole = roles ? roles[childIdx] : 'auto';

            // Only consider 'outer' or 'auto' contours that are not 'void' for bridge parents
            if (originalRole === 'void' || (originalRole === 'stamp' && !settings.automaticBridges)) continue;

            const childC = processedRawContours[childIdx];
            let bestParent = -1;
            let minParentArea = Infinity;

            for (let j = i + 1; j < sortedOriginalIndices.length; j++) {
                const parentIdx = sortedOriginalIndices[j];
                const parentC = processedRawContours[parentIdx];
                const parentRole = roles ? roles[parentIdx] : 'auto';

                if (parentRole === 'void') continue; // Voids cannot be parents

                // Only consider 'outer' or 'auto' (which might become inner/outer) for bridge parents.
                // We should avoid connecting to something that is explicitly 'stamp' if we are 'outer'.
                // But for now, just avoid voids.

                // Test first point of current
                if (isPointInPolygon2D(childC[0], parentC)) {
                    const pArea = Math.abs(originalAreas[parentIdx]);
                    if (pArea < minParentArea) {
                        minParentArea = pArea;
                        bestParent = parentIdx;
                        // No break here, we want the *smallest* enclosing parent
                    }
                }
            }
            if (bestParent !== -1) parentMap.set(childIdx, bestParent);
        }

        parentMap.forEach((parentIdx, childIdx) => {
            const childC = processedRawContours[childIdx];
            const parentC = processedRawContours[parentIdx];
            let minDistSq = Infinity;
            let pChild = new THREE.Vector2();
            let pParent = new THREE.Vector2();

            const stepC = Math.max(1, Math.floor(childC.length / 50));
            const stepP = Math.max(1, Math.floor(parentC.length / 50));

            for (let i = 0; i < childC.length; i += stepC) {
                for (let j = 0; j < parentC.length; j += stepP) {
                    const dSq = childC[i].distanceToSquared(parentC[j]);
                    if (dSq < minDistSq) {
                        minDistSq = dSq;
                        pChild.copy(childC[i]);
                        pParent.copy(parentC[j]);
                    }
                }
            }

            const bridgeVec = new THREE.Vector2().subVectors(pParent, pChild);
            const dist = bridgeVec.length();
            const angle = bridgeVec.angle();
            const mid = new THREE.Vector2().addVectors(pChild, pParent).multiplyScalar(0.5);

            const width = dist + 2;
            const thickness = 3;
            const bridgeH = Math.max(2, settings.cutterHeight - 5);

            const geometry = new THREE.BoxGeometry(width, thickness, bridgeH);
            geometry.rotateZ(angle);
            geometry.translate(mid.x, mid.y, bridgeH / 2);

            results.push({
                geometry,
                type: 'bridge',
                contourIndex: childIdx, // Use original child index
                id: `bridge-${childIdx}-${parentIdx}`
            });
        });
    }

    // --- Global Bounding Box (V20.4) ---
    const globalBox = new THREE.Box2();
    if (processedContours.length > 0) {
        processedContours.forEach(c => {
            const b = new THREE.Box2().setFromPoints(c);
            globalBox.union(b);
        });
    }
    const globalCenter = new THREE.Vector2();
    globalBox.getCenter(globalCenter);
    const globalSize = new THREE.Vector2();
    globalBox.getSize(globalSize);
    // const globalMaxDim = Math.max(globalSize.x, globalSize.y); // Unused V23

    const hasManualBase = roles ? roles.some(r => r === 'base') : false;

    // --- Generation Loop ---
    processedContours.forEach((contour, i) => {
        const type = finalTypes[i];

        if (settings.outputType === 'keychain') {
            // --- KEYCHAIN MODE ---

            // 1. Base Plate Logic
            if (settings.keychainShape === 'silhouette') {
                if (type === 'outer') {
                    const shape = new THREE.Shape(contour);
                    const baseGeom = new THREE.ExtrudeGeometry(shape, {
                        depth: settings.baseHeight,
                        bevelEnabled: !!settings.keychainBevelEnabled,
                        bevelThickness: settings.keychainBevelSize || 0,
                        bevelSize: settings.keychainBevelSize || 0,
                        bevelSegments: 3
                    });
                    results.push({ geometry: baseGeom, type: 'base', contourIndex: i, id: `keychain-base-${i}` });
                }

                if (i === largestIndex && settings.keychainHoleDiameter > 0) {
                    const box = new THREE.Box2().setFromPoints(contour);
                    const topCenter = new THREE.Vector2((box.min.x + box.max.x) / 2, box.max.y);

                    const outerRadius = (settings.keychainHoleDiameter / 2) + 2;
                    const innerRadius = settings.keychainHoleDiameter / 2;

                    const holeOffsetX = settings.keychainHoleOffset?.x || 0;
                    const holeOffsetY = settings.keychainHoleOffset?.y || 0;

                    const tabShape = new THREE.Shape();
                    const centerX = topCenter.x + holeOffsetX;
                    const centerY = (topCenter.y - 1) + holeOffsetY;

                    tabShape.absarc(centerX, centerY, outerRadius, 0, Math.PI * 2, false);

                    const holePath = new THREE.Path();
                    holePath.absarc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
                    tabShape.holes.push(holePath);

                    const tabGeom = new THREE.ExtrudeGeometry(tabShape, {
                        depth: settings.baseHeight,
                        bevelEnabled: !!settings.keychainBevelEnabled,
                        bevelThickness: settings.keychainBevelSize || 0,
                        bevelSize: settings.keychainBevelSize || 0,
                        bevelSegments: 3
                    });
                    results.push({ geometry: tabGeom, type: 'base', contourIndex: -1, id: `keychain-tab` });
                }
            }

            // Manual Base Logic
            if (hasManualBase) {
                if (roles && roles[i] === 'base') {
                    const shape = new THREE.Shape(contour);
                    const baseGeom = new THREE.ExtrudeGeometry(shape, {
                        depth: settings.baseHeight,
                        bevelEnabled: !!settings.keychainBevelEnabled,
                        bevelThickness: settings.keychainBevelSize || 0,
                        bevelSize: settings.keychainBevelSize || 0,
                        bevelSegments: 3
                    });
                    results.push({ geometry: baseGeom, type: 'base', contourIndex: i, id: `keychain-manual-base-${i}` });
                    return; // It's just a base
                }
            }

            // 3. Raised Relief
            if (roles && roles[i] === 'base') return;

            const thickness = type === 'outer' ? settings.cutterThickness : settings.markerThickness;
            const reliefHeight = settings.markerHeight;

            // Simplified relief for non-solid mode, but we use Solid Relief (V19) mainly now
            // This is fallback or for simple lines? 
            // Actually, for V19 Solid Relief, we handle it POST-LOOP (lines 800+).
            // But we still kept this "inner/outer" line generation for legacy or mixed?
            // Wait, looking at V19 logic:
            // "if (settings.outputType === 'keychain') { const rootNodes = ... }"
            // That happens AFTER this loop.
            // So THIS loop generates outlines.
            // If we want SOLID relief, we should probably SKIP this outline generation?
            // OR do we generate BOTH?
            // Outline adds definition. Solid fills it.
            // Let's keep outline for now as it makes edges crisp?
            // Actually, Solid Relief uses ExtrudeGeometry of the SHAPE.
            // Outline uses ExtrudedWall of the CONTOUR.
            // Having both is fine, creates a "stroke".

            const reliefGeom = createExtrudedWall(contour, reliefHeight, thickness, settings.baseHeight);
            results.push({ geometry: reliefGeom, type: 'inner', contourIndex: i, id: `keychain-relief-outline-${i}` });

        } else if (settings.generationMode === 'single') {
            if (type === 'outer') {
                if (settings.withBase) {
                    if (settings.solidBase) {
                        const shape = new THREE.Shape(contour);
                        const baseGeom = new THREE.ExtrudeGeometry(shape, { depth: settings.baseHeight, bevelEnabled: false });
                        results.push({ geometry: baseGeom, type: 'base', contourIndex: i, id: `base-${i}` });
                    } else {
                        const baseWall = createExtrudedWall(contour, settings.baseHeight, settings.baseThickness, 0);
                        results.push({ geometry: baseWall, type: 'base', contourIndex: i, id: `base-${i}` });
                    }
                }


                // Cutter Wall
                let cutterWall: THREE.BufferGeometry;
                if (settings.bladeProfile === 'stepped') {
                    const tipH = 1.0;
                    const tipT = 0.4;
                    const baseT = Math.max(settings.cutterThickness, 0.6);
                    cutterWall = createSteppedWall(contour, settings.cutterHeight, baseT, tipT, tipH, 0);
                } else {
                    cutterWall = createExtrudedWall(contour, settings.cutterHeight, settings.cutterThickness, 0);
                }

                // Center geometry
                const box = new THREE.Box2();
                contour.forEach(p => box.expandByPoint(p));
                const center = new THREE.Vector2();
                box.getCenter(center);

                cutterWall.translate(-center.x, -center.y, 0);

                results.push({
                    geometry: cutterWall,
                    type: 'outer',
                    contourIndex: i,
                    id: `wall-${i}`,
                    position: [center.x, center.y, 0],
                    center: center
                });

            } else {
                const markerWall = createExtrudedWall(contour, settings.markerHeight, settings.markerThickness, 0);

                const box = new THREE.Box2();
                contour.forEach(p => box.expandByPoint(p));
                const center = new THREE.Vector2();
                box.getCenter(center);

                markerWall.translate(-center.x, -center.y, 0);

                results.push({
                    geometry: markerWall,
                    type: 'inner',
                    contourIndex: i,
                    id: `marker-${i}`,
                    position: [center.x, center.y, 0],
                    center: center
                });
            }

        } else if (settings.generationMode === 'dual') {
            if (type === 'outer') {
                let cutterWall: THREE.BufferGeometry;
                if (settings.bladeProfile === 'stepped') {
                    const tipH = 1.0;
                    const tipT = 0.4;
                    const baseT = Math.max(settings.cutterThickness, 0.6);
                    cutterWall = createSteppedWall(contour, settings.cutterHeight, baseT, tipT, tipH, 0);
                } else {
                    cutterWall = createExtrudedWall(contour, settings.cutterHeight, settings.cutterThickness, 0);
                }
                // Center geometry
                const box = new THREE.Box2();
                contour.forEach(p => box.expandByPoint(p));
                const center = new THREE.Vector2();
                box.getCenter(center);

                cutterWall.translate(-center.x, -center.y, 0);

                results.push({
                    geometry: cutterWall,
                    type: 'outer',
                    contourIndex: i,
                    id: `dual-cut-${i}`,
                    position: [center.x, center.y, 0],
                    center: center
                });

                if (settings.withBase) {
                    if (settings.solidBase) {
                        const shape = new THREE.Shape(contour);
                        const baseGeom = new THREE.ExtrudeGeometry(shape, { depth: settings.baseHeight, bevelEnabled: false });

                        // Center geometry
                        const box = new THREE.Box2();
                        contour.forEach(p => box.expandByPoint(p));
                        const center = new THREE.Vector2();
                        box.getCenter(center);

                        baseGeom.translate(-center.x, -center.y, 0);

                        results.push({
                            geometry: baseGeom,
                            type: 'base',
                            contourIndex: i,
                            id: `dual-cut-base-${i}`,
                            position: [center.x, center.y, 0],
                            center: center
                        });
                    } else {
                        const baseWall = createExtrudedWall(contour, settings.baseHeight, settings.baseThickness, 0);

                        // Center geometry
                        const box = new THREE.Box2();
                        contour.forEach(p => box.expandByPoint(p));
                        const center = new THREE.Vector2();
                        box.getCenter(center);

                        baseWall.translate(-center.x, -center.y, 0);

                        results.push({
                            geometry: baseWall,
                            type: 'base',
                            contourIndex: i,
                            id: `dual-cut-base-${i}`,
                            position: [center.x, center.y, 0],
                            center: center
                        });
                    }
                }

                const tolerance = Math.max(0.1, settings.stampTolerance);
                const stampPlateContour = offsetContour(contour, -tolerance);

                if (stampPlateContour.length > 2) {
                    if (settings.stampGrid) {
                        const gridGeom = createGridBase(
                            stampPlateContour,
                            settings.baseHeight,
                            0.8,
                            4.0,
                            1.2
                        );

                        // Center geometry
                        const box = new THREE.Box2();
                        stampPlateContour.forEach(p => box.expandByPoint(p));
                        const center = new THREE.Vector2();
                        box.getCenter(center);

                        gridGeom.translate(-center.x, -center.y, 0);

                        results.push({
                            geometry: gridGeom,
                            type: 'base',
                            contourIndex: i,
                            id: `dual-stamp-plate-${i}`,
                            position: [center.x, center.y, 0],
                            center: center
                        });
                    } else {
                        const plateShape = new THREE.Shape(stampPlateContour);
                        const plateGeom = new THREE.ExtrudeGeometry(plateShape, { depth: settings.baseHeight, bevelEnabled: false });

                        // Center geometry
                        const box = new THREE.Box2();
                        stampPlateContour.forEach(p => box.expandByPoint(p));
                        const center = new THREE.Vector2();
                        box.getCenter(center);

                        plateGeom.translate(-center.x, -center.y, 0);

                        results.push({
                            geometry: plateGeom,
                            type: 'base',
                            contourIndex: i,
                            id: `dual-stamp-plate-${i}`,
                            position: [center.x, center.y, 0],
                            center: center
                        });
                    }

                    const box = new THREE.Box2();
                    stampPlateContour.forEach(p => box.expandByPoint(p));
                    const center = new THREE.Vector2();
                    box.getCenter(center);
                    const size = new THREE.Vector2();
                    box.getSize(size);

                    const hThickness = settings.handleThickness;
                    const hHeight = settings.handleHeight;

                    const handleGeo = new THREE.BoxGeometry(hThickness, Math.min(size.y * 0.8, size.y - 4), hHeight);
                    handleGeo.translate(center.x, center.y, settings.baseHeight + hHeight / 2);
                    results.push({ geometry: handleGeo, type: 'handle', contourIndex: i, id: `dual-stamp-handle-${i}` });
                }
            }
        }
    });

    // --- Post-Loop: Geometric Base (Global) ---
    if (settings.outputType === 'keychain' && settings.keychainShape !== 'silhouette' && !hasManualBase) {
        const center = globalCenter;

        // V23: Dynamic Padding from Settings (default 4)
        const padding = settings.keychainBasePadding ?? 4;

        const minX = globalBox.min.x;
        const maxX = globalBox.max.x;
        const minY = globalBox.min.y;
        const maxY = globalBox.max.y;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const halfW = (contentWidth / 2) + padding;
        const halfH = (contentHeight / 2) + padding;

        const maxHalf = Math.max(halfW, halfH);

        // Shape Size (Radius for circle-likes, Half-Dim for rects)
        const shapeSize = maxHalf + (settings.keychainHoleDiameter > 0 ? settings.keychainHoleDiameter / 2 : 0);

        const baseShape = new THREE.Shape();

        if (settings.keychainShape === 'circle') {
            baseShape.absarc(center.x, center.y, shapeSize, 0, Math.PI * 2, false);

        } else if (settings.keychainShape === 'square') {
            // V23: "Square" is now "Rounded Rectangle" adapting to content aspect ratio
            const r = 4; // Corner radius

            const holeSpace = (settings.keychainHoleDiameter > 0 ? settings.keychainHoleDiameter + 2 : 0);

            const x1 = minX - padding;
            const x2 = maxX + padding;
            const y1 = minY - padding;
            const y2 = maxY + padding + holeSpace;

            const bx = x1;
            const by = y1;
            const bw = x2 - x1;
            const bh = y2 - y1;

            baseShape.moveTo(bx + r, by);
            baseShape.lineTo(bx + bw - r, by);
            baseShape.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
            baseShape.lineTo(bx + bw, by + bh - r);
            baseShape.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
            baseShape.lineTo(bx + r, by + bh);
            baseShape.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
            baseShape.lineTo(bx, by + r);
            baseShape.quadraticCurveTo(bx, by, bx + r, by);

        } else if (settings.keychainShape === 'hexagon') {
            const r = shapeSize;
            for (let k = 0; k < 6; k++) {
                const angle = (Math.PI / 3) * k + (Math.PI / 6);
                const px = center.x + r * Math.cos(angle);
                const py = center.y + r * Math.sin(angle);
                if (k === 0) baseShape.moveTo(px, py);
                else baseShape.lineTo(px, py);
            }
            baseShape.closePath();

        } else if (settings.keychainShape === 'heart') {
            const x = center.x;
            const y = center.y - (shapeSize * 0.2);
            const s = shapeSize * 0.035;
            baseShape.moveTo(x, y + 10 * s);
            baseShape.bezierCurveTo(x, y + 7 * s, x - 15 * s, y + 15 * s, x - 15 * s, y + 25 * s);
            baseShape.bezierCurveTo(x - 15 * s, y + 35 * s, x, y + 30 * s, x, y + 50 * s);
            baseShape.bezierCurveTo(x, y + 30 * s, x + 15 * s, y + 35 * s, x + 15 * s, y + 25 * s);
            baseShape.bezierCurveTo(x + 15 * s, y + 15 * s, x, y + 7 * s, x, y + 10 * s);
        }

        // Hole
        if (settings.keychainHoleDiameter > 0) {
            const holeR = settings.keychainHoleDiameter / 2;
            const holePath = new THREE.Path();

            let defaultHoleX = center.x;
            let defaultHoleY = center.y + shapeSize - holeR - 3; // Circle default

            if (settings.keychainShape === 'square') {
                const topY = maxY + padding + (settings.keychainHoleDiameter + 2);
                defaultHoleY = topY - holeR - 3;
                defaultHoleX = center.x;
            } else if (settings.keychainShape === 'hexagon') {
                defaultHoleY = center.y + (shapeSize * Math.sin(Math.PI / 2)) - holeR - 3;
            }

            // Apply User Offset
            const userOffsetX = settings.keychainHoleOffset?.x || 0;
            const userOffsetY = settings.keychainHoleOffset?.y || 0;

            holePath.absarc(defaultHoleX + userOffsetX, defaultHoleY + userOffsetY, holeR, 0, Math.PI * 2, true);
            baseShape.holes.push(holePath);
        }

        const baseGeom = new THREE.ExtrudeGeometry(baseShape, {
            depth: settings.baseHeight,
            bevelEnabled: !!settings.keychainBevelEnabled,
            bevelThickness: settings.keychainBevelSize || 0,
            bevelSize: settings.keychainBevelSize || 0,
            bevelSegments: 3
        });
        results.push({ geometry: baseGeom, type: 'base', contourIndex: -1, id: `keychain-base-global` });
    }

    // --- Post-Loop: V19 Keychain Solid Relief ---
    if (settings.outputType === 'keychain') {
        const rootNodes = buildContourHierarchy(processedContours);

        const processNodeForRelief = (node: ContourNode) => {
            // We want to fill "Positive" spaces.
            // Depth 0 = Solid (e.g. Letter 'O' outer)
            // Depth 1 = Hole (e.g. Letter 'O' inner)
            // Depth 2 = Solid (e.g. Island inside hole)

            if (node.depth % 2 === 0) {
                const shape = new THREE.Shape(node.contour);

                // Add holes from immediate children
                node.children.forEach(child => {
                    const holePath = new THREE.Path();
                    holePath.setFromPoints(child.contour);
                    shape.holes.push(holePath);
                });

                const reliefHeight = settings.markerHeight;
                const reliefGeom = new THREE.ExtrudeGeometry(shape, {
                    depth: reliefHeight,
                    bevelEnabled: false
                });

                // Sit on top of base
                reliefGeom.translate(0, 0, settings.baseHeight);
                results.push({ geometry: reliefGeom, type: 'inner', contourIndex: node.id, id: `keychain-solid-relief-${node.id}` });
            }

            // Recurse
            node.children.forEach(processNodeForRelief);
        };

        rootNodes.forEach(processNodeForRelief);
    }

    return results;
};

export const exportToSTL = (parts: CutterPart[], hiddenIds?: Set<string>): Blob => {
    const exporter = new STLExporter();

    // Filter hidden parts
    const visibleParts = hiddenIds ? parts.filter(p => !hiddenIds.has(p.id)) : parts;

    const geometries = visibleParts.map(p => {
        let g = p.geometry.clone();

        // V36.2: Fix Export Position
        // Recently we started centering parts in `generateGeometry` and storing the offset in `p.position`.
        // The geometry itself was translated to (0,0) LOCAL.
        // We must re-apply the global position for the STL export to match the Viewer3D.
        if (p.position) {
            g.translate(p.position[0], p.position[1], p.position[2]);
        }

        if (g.attributes.uv) g.deleteAttribute('uv');
        if (g.attributes.color) g.deleteAttribute('color');
        if (g.index) g = g.toNonIndexed();
        return g;
    });

    if (geometries.length === 0) return new Blob([]);

    const merged = mergeGeometries(geometries, false);
    if (!merged) return new Blob([]);

    const result = exporter.parse(new THREE.Mesh(merged), { binary: true });
    return new Blob([result as any], { type: 'application/octet-stream' });
};
