import * as THREE from 'three';

export interface TraceResult {
    contours: THREE.Vector2[][];
    width: number;
    height: number;
}

export const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// V16: Smart Trace Options
export interface ProcessOptions {
    blur: number;       // 0-10 (px)
    threshold: number;  // 0-255
    invert: boolean;
}

export const processImage = (
    image: HTMLImageElement,
    options: ProcessOptions
): TraceResult => {
    const { blur, threshold, invert } = options;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context');

    // Resize for performance/consistency if needed, but keeping original resolution for now
    // or capping max dimension to avoid huge processing costs.
    const MAX_DIM = 1024; // Increased for better detail if needed
    let width = image.width;
    let height = image.height;

    if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;

    // 1. Apply Filtering (Blur)
    if (blur > 0) {
        ctx.filter = `blur(${blur}px)`;
    }
    ctx.drawImage(image, 0, 0, width, height);
    ctx.filter = 'none'; // Reset

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // 2. Binary Grid Generation (Thresholding)
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
        const row: number[] = [];
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Simple luminance
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];

            if (a < 50) {
                row.push(0); // Transparent is empty
                continue;
            }

            const luma = 0.299 * r + 0.587 * g + 0.114 * b; // CCIR 601

            // Invert logic: 
            // Standard: Dark = 1 (Solid), Light = 0 (Empty) -> For drawing on white paper
            // Invert checked: Light = 1, Dark = 0 -> For white chalk on blackboard

            // Default (invert=false should be standard drawing trace):
            // Luma < Threshold => Dark => Solid (1)

            let val = luma < threshold ? 1 : 0;

            if (invert) {
                // Invert means we want Light areas to be Solid
                val = 1 - val;
            }

            row.push(val);
        }
        grid.push(row);
    }

    const contours = extractContours(grid, width, height);

    return { contours, width, height };
};

// smoothContour was defined below, but we replaced the implementation above.
// Wait, I replaced simplifyContour above, but smoothContour was earlier in the file.
// I should check if I introduced a duplicate or need to move things.
// The file provided had processImage -> smoothContour -> extractContours -> simplifyContour.
// My previous edit replaced lines 274-293 (simplifyContour).
// I also included smoothContour in the replacement content?
// Ah, I mistakenly included smoothContour implementation in the previous 'ReplacementContent'
// BUT I targeted 'simplifyContour' lines at the end of the file.
// So I appended smoothContour at the end?
// The generic smoothContour was at lines 89-116.
// Let me verify where I wrote.
// I wrote 'simplifyContour' and 'smoothContour' in the replacement for lines 274-293.
// So I likely duplicated smoothContour at the bottom.
// I need to remove the first smoothContour if that's the case, or fix the imports.
// Actually, I should remove the OLD smoothContour at lines 89-116 to avoid duplicates/errors.

// Update trace to use smoothing? No, trace should return raw. App or Consumer calls smooth.
// Actually let's return smoothed contours from processImage? 
// The user might want toggle. Let's export smoothContour and apply it if requested. 
// For now, let's keep processImage raw tracing but optimized.


// Simple Marching Squares or similar contour tracing
// Using a basic Moore-Neighbor tracing or similar for single connected components
// For robustness, let's look for edge transitions.
const extractContours = (grid: number[][], width: number, height: number): THREE.Vector2[][] => {
    const contours: THREE.Vector2[][] = [];
    const visited = new Set<string>();

    // Helper to get value securely
    const getVal = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return 0;
        return grid[y][x];
    };

    // Moore-Neighbor Tracing
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === 1 && !visited.has(`${x},${y}`)) {
                // Found a start point of a new component (or hole? we treat 1 as solid)
                // Check if it's a boundary pixel (at least one 0 neighbor)
                let isBoundary = false;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (getVal(x + dx, y + dy) === 0) isBoundary = true;
                    }
                }

                if (isBoundary) {
                    // Start tracing
                    const contour = traceBoundary(x, y, grid, width, height, visited);
                    if (contour.length > 10) { // Filter tiny noise
                        contours.push(contour);
                    }
                } else {
                    // Internal pixel, just mark visited
                    visited.add(`${x},${y}`);
                }
            }
        }
    }

    return contours;
};

const traceBoundary = (
    startX: number,
    startY: number,
    grid: number[][],
    width: number,
    height: number,
    visited: Set<string>
): THREE.Vector2[] => {
    const contour: THREE.Vector2[] = [];

    // Moore-Neighbor Tracing
    // Directions: N, NE, E, SE, S, SW, W, NW
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

    let x = startX;
    let y = startY;

    // Helper to check valid and solid
    const isSolid = (cx: number, cy: number) => {
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) return false;
        return grid[cy][cx] === 1;
    };

    // 1. Backtrack to find a 0 neighbor to start search from
    // We scan W then NW then N... Since we enter from West (scanline), (x-1, y) should be 0 or visited?
    // Let's just find *any* 0 neighbor to serve as "from" direction.
    // Standard: Backtrack is West (6).

    contour.push(new THREE.Vector2(x, -y));
    visited.add(`${x},${y}`);

    let currentX = x;
    let currentY = y;
    // Enter direction (where we came from, pointing to current).
    // Initial: we came from West (x-1), so we point East (2).
    // So "backtrack" is West (6).
    // Warning: Start pixel must be boundary.

    let prevBacktrack = 6; // Start by looking at West

    // Max iterations to prevent infinite loop
    let iter = 0;
    const maxIter = width * height * 2;

    while (iter < maxIter) {
        iter++;

        let foundNext = false;
        // Search clockwise around current pixel, starting from prevBacktrack
        for (let i = 0; i < 8; i++) {
            const checkDir = (prevBacktrack + i) % 8;
            const nx = currentX + dx[checkDir];
            const ny = currentY + dy[checkDir];

            if (isSolid(nx, ny)) {
                // Found next boundary point
                currentX = nx;
                currentY = ny;
                contour.push(new THREE.Vector2(currentX, -currentY));
                visited.add(`${currentX},${currentY}`);

                // New backtrack direction is the opposite of the direction we just moved
                // Actually, Moore algorithm: enter from direction D, start search from (D + 4 + 1) % 8 ? No.
                // Standard: Backtrack is (checkDir + 4) % 8. 
                // Next search starts from (checkDir + 4 + 1) % 8 ???
                // Jacobsen's: "Enter P from b. Set c = b. Rotate c clockwise until neighbor is black."
                // Here 'checkDir' is the neighbor direction. We moved TO checkDir.
                // So we entered NEW pixel FROM (checkDir + 4) % 8.
                // Next search starts from (checkDir + 4 + 1) % 8 ?
                // Actually, standard is: Start search from (checkDir + 4 + 2) % 8 (Counter-Clockwise relative to entry)?
                // Let's stick to: Start search from 'previous white neighbor'.
                // If we moved to checkDir, the one *before* checkDir in the sweep was 0 (white).
                // So start search from (checkDir + 4 + 1) in CCW? Or (checkDir - 1) in CW?

                // Let's use simple logic:
                // We moved in direction 'checkDir'.
                // The direction *before* 'checkDir' (counter-clockwise) was empty.
                // So relative to the NEW pixel, that empty space is at (checkDir + 4 + 1)?

                // Let's try: Search start = (checkDir + 4 + 1) % 8? NO.
                // Works well: Search start = (checkDir + 5) % 8 (which is -3 from direction).
                prevBacktrack = (checkDir + 5) % 8;

                foundNext = true;
                break;
            }
        }

        if (!foundNext) {
            // Isolated pixel?
            break;
        }

        if (currentX === startX && currentY === startY) {
            // Check if we essentially closed the loop in similar direction?
            // Simple check: returned to start.
            // But we might touch start multiple times (figure 8).
            // Usually stopping at start is enough for simple shapes.
            break;
        }
    }

    // Simplification (Ramer-Douglas-Peucker) could be applied here if distinct points are too many
    return simplifyContour(contour, 1.0);
};

// Ramer-Douglas-Peucker Algorithm
// Reduces the number of points in a curve that is approximated by a series of points.
export const simplifyContour = (points: THREE.Vector2[], tolerance: number): THREE.Vector2[] => {
    if (points.length <= 2) return points;

    const sqTolerance = tolerance * tolerance;
    const len = points.length;

    // Find the point with the maximum distance
    let maxSqDist = 0;
    let index = 0;
    const end = len - 1;

    // Line segment from points[0] to points[end]
    const p1 = points[0];
    const p2 = points[end];

    for (let i = 1; i < end; i++) {
        const sqDist = getSqSegDist(points[i], p1, p2);
        if (sqDist > maxSqDist) {
            maxSqDist = sqDist;
            index = i;
        }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxSqDist > sqTolerance) {
        const firstPart = simplifyContour(points.slice(0, index + 1), tolerance);
        const secondPart = simplifyContour(points.slice(index), tolerance);

        return firstPart.slice(0, firstPart.length - 1).concat(secondPart);
    } else {
        return [p1, p2];
    }
};

// Helper: Square distance from a point p to a line segment v-w
function getSqSegDist(p: THREE.Vector2, v: THREE.Vector2, w: THREE.Vector2) {
    let x = v.x, y = v.y;
    let dx = w.x - x, dy = w.y - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = w.x;
            y = w.y;
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = p.x - x;
    dy = p.y - y;

    return dx * dx + dy * dy;
}

export const smoothContour = (points: THREE.Vector2[], iterations: number = 2): THREE.Vector2[] => {
    if (points.length < 3) return points;

    // Chaikin's Algorithm: Corner cutting
    let currentPoints = points;

    for (let k = 0; k < iterations; k++) {
        const nextPoints: THREE.Vector2[] = [];
        const len = currentPoints.length;

        // Since it's a closed loop for cookie cutters, we iterate nicely
        for (let i = 0; i < len; i++) {
            const p0 = currentPoints[i];
            const p1 = currentPoints[(i + 1) % len];

            // Cut at 25% and 75%
            const Q = new THREE.Vector2().copy(p0).lerp(p1, 0.25);
            const R = new THREE.Vector2().copy(p0).lerp(p1, 0.75);

            nextPoints.push(Q);
            nextPoints.push(R);
        }
        currentPoints = nextPoints;
    }
    return currentPoints;
};
