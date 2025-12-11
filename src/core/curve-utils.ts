import * as THREE from 'three';

export type NodeType = 'corner' | 'smooth';

/**
 * Interpolates a contour based on node types.
 * Uses Catmull-Rom logic for smooth sections and linear for corners.
 * For simplicity, if a segment connects two 'smooth' nodes, it curves.
 * If either is 'corner', it's linear.
 */
export const interpolateContour = (
    points: THREE.Vector2[],
    nodeTypes: NodeType[],
    closed: boolean = true,
    samplesPerSegment: number = 10
): THREE.Vector2[] => {
    if (points.length < 2) return points;

    const result: THREE.Vector2[] = [];

    for (let i = 0; i < points.length; i++) {
        // If not closed and last point, break
        if (!closed && i === points.length - 1) break;

        const pCurrent = points[i];
        const pNext = points[(i + 1) % points.length];

        const typeCurrent = nodeTypes[i] || 'corner';
        const typeNext = nodeTypes[(i + 1) % points.length] || 'corner';

        if (typeCurrent === 'smooth' && typeNext === 'smooth') {
            // Calculate 4 control points with wrapping
            const pPrev = points[(i - 1 + points.length) % points.length];
            const pNextNext = points[(i + 2) % points.length];

            // Manual Catmull-Rom for segment between p1(current) and p2(next)
            for (let s = 0; s < samplesPerSegment; s++) {
                // Avoid duplicating points (start point is added, end point is handled by next segment start)
                const t = s / samplesPerSegment;
                const pt = getCatmullRomPoint(t, pPrev, pCurrent, pNext, pNextNext);
                result.push(pt);
            }

        } else {
            // Linear : push Start only (End is pushed by next iter)
            result.push(pCurrent.clone());
        }
    }

    if (!closed && points.length > 0) {
        result.push(points[points.length - 1].clone());
    }

    return result;
};

// Custom Catmull-Rom interpolation for 2D vectors
// Computes point at t [0, 1] between p1 and p2, influenced by p0 and p3.
function getCatmullRomPoint(t: number, p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2): THREE.Vector2 {
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite Basis simplified
    const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    return new THREE.Vector2(x, y);
}


export interface SnapResult {
    pos: THREE.Vector2;
    snapped: boolean;
    type?: 'grid' | 'node' | 'align';
    ref?: THREE.Vector2; // Refterence point
}

export const snapPoint = (
    current: THREE.Vector2,
    otherPoints: THREE.Vector2[], // Excludes current being moved
    gridSize: number,
    threshold: number,
    active: boolean
): SnapResult => {
    if (!active) return { pos: current.clone(), snapped: false };

    let bestDist = threshold;
    let bestPos = current.clone();
    let snapped = false;
    let type: 'grid' | 'node' | 'align' | undefined;

    // 1. Snap to Nodes (Highest Priority)
    for (const p of otherPoints) {
        const d = current.distanceTo(p);
        if (d < bestDist) {
            bestDist = d;
            bestPos = p.clone();
            snapped = true;
            type = 'node';
        }
    }
    if (snapped) return { pos: bestPos, snapped, type };

    // 2. Snap to Grid
    if (gridSize > 0) {
        const gx = Math.round(current.x / gridSize) * gridSize;
        const gy = Math.round(current.y / gridSize) * gridSize;
        const gridPos = new THREE.Vector2(gx, gy);
        const d = current.distanceTo(gridPos);

        if (d < bestDist) {
            bestPos = gridPos;
            snapped = true;
            type = 'grid';
        }
    }

    return { pos: bestPos, snapped, type };
};
