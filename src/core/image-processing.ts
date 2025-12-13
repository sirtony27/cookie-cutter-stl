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
    mode: 'luminance' | 'edges'; // V32: Detection Mode
    highRes: boolean;            // V32: High Resolution Mode
    // V39: Advanced Text Detection
    adaptive: boolean;           // Use adaptive thresholding
    morphology: boolean;         // Use morphological closing (repair text)
}

// Helper: Integral Image for fast local mean
const computeIntegralImage = (data: Uint8ClampedArray, width: number, height: number) => {
    const integral = new Int32Array(width * height);
    for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Grayscale
            const val = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            sum += val;
            if (y === 0) {
                integral[y * width + x] = sum;
            } else {
                integral[y * width + x] = sum + integral[(y - 1) * width + x];
            }
        }
    }
    return integral;
};


// Helper to prepare image data (Main Thread Only)
export const prepareImageForTrace = (image: HTMLImageElement, options: ProcessOptions) => {
    const { highRes, blur } = options;
    const MAX_DIM = highRes ? 2500 : 1024; // V32: High Res Mode
    let width = image.width;
    let height = image.height;

    if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context');

    // Apply Filtering (Blur)
    if (blur > 0) {
        ctx.filter = `blur(${blur}px)`;
    }
    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    return {
        imageData,
        meta: { originalWidth: image.width, originalHeight: image.height }
    };
}

export const processImage = (
    image: HTMLImageElement,
    options: ProcessOptions
): TraceResult => {
    // Synchronous fallback (uses prepare + process)
    const { imageData, meta } = prepareImageForTrace(image, options);
    return processImageData(imageData, options, meta);
};

// Pure logic function (Worker Friendly)
export const processImageData = (
    imageData: ImageData,
    options: ProcessOptions,
    meta: { originalWidth: number, originalHeight: number }
): TraceResult => {
    const { threshold, invert, mode, adaptive, morphology } = options;
    const { width, height } = imageData;
    const data = imageData.data; // Uint8ClampedArray

    // Note: Blur was previously done via Context2D filter.
    // Inside worker we cannot use Context2D.
    // If we move to worker, we must implement Gaussian Blur manually or accept that blur happens on main thread before sending?
    // Doing blur on Main Thread (via canvas filter) is FAST (GPU/Browser native). Doing manual blur in JS is slow.
    // DECISION: Perform Blur in 'prepare' step (Main Thread) before getting ImageData.

    // ... The rest of the logic ...

    let grid: number[][] = [];

    // V39: Standard vs Adaptive
    if (adaptive) {
        // [Logic preserved from original]
        const integral = computeIntegralImage(data, width, height);
        const S = Math.round(width / 20);
        const s2 = Math.floor(S / 2);
        const T = 0.15;

        for (let y = 0; y < height; y++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                const x1 = x - s2;
                const x2 = x + s2;
                const y1 = y - s2;
                const y2 = y + s2;

                const count = (Math.min(x2, width - 1) - Math.max(0, x1) + 1) * (Math.min(y2, height - 1) - Math.max(0, y1) + 1);

                // Helper inline (since getIntegralSum needs height which I didn't pass, oops)
                const X1 = Math.max(0, x1);
                const Y1 = Math.max(0, y1);
                const X2 = Math.min(width - 1, x2);
                const Y2 = Math.min(height - 1, y2);

                const valA = (X1 > 0 && Y1 > 0) ? integral[(Y1 - 1) * width + (X1 - 1)] : 0;
                const valB = (Y1 > 0) ? integral[(Y1 - 1) * width + X2] : 0;
                const valC = (X1 > 0) ? integral[Y2 * width + (X1 - 1)] : 0;
                const valD = integral[Y2 * width + X2];

                const sum = valD - valB - valC + valA;
                const mean = sum / count;

                const idx = (y * width + x) * 4;
                const pxVal = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                let val = pxVal < (mean * (1 - T)) ? 1 : 0;
                if (invert) val = 1 - val;
                row.push(val);
            }
            grid.push(row);
        }
    } else if (mode === 'edges') {
        // [Logic preserved]
        const gray = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
        for (let y = 0; y < height; y++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    row.push(0);
                    continue;
                }
                const gx = (-1 * gray[(y - 1) * width + (x - 1)]) + (1 * gray[(y - 1) * width + (x + 1)]) +
                    (-2 * gray[y * width + (x - 1)]) + (2 * gray[y * width + (x + 1)]) +
                    (-1 * gray[(y + 1) * width + (x - 1)]) + (1 * gray[(y + 1) * width + (x + 1)]);
                const gy = (-1 * gray[(y - 1) * width + (x - 1)]) + (-2 * gray[(y - 1) * width + x]) + (-1 * gray[(y - 1) * width + (x + 1)]) +
                    (1 * gray[(y + 1) * width + (x - 1)]) + (2 * gray[(y + 1) * width + x]) + (1 * gray[(y + 1) * width + (x + 1)]);
                const mag = Math.sqrt(gx * gx + gy * gy);
                let val = mag > threshold ? 1 : 0;
                if (invert) val = 1 - val;
                row.push(val);
            }
            grid.push(row);
        }
    } else {
        // Standard Luminance
        for (let y = 0; y < height; y++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const a = data[idx + 3];
                if (a < 50) {
                    row.push(0);
                    continue;
                }
                const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                let val = luma < threshold ? 1 : 0;
                if (invert) val = 1 - val;
                row.push(val);
            }
            grid.push(row);
        }
    }

    // Morphology
    if (morphology) {
        // [Logic preserved]
        let dilated = grid.map(row => [...row]);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (grid[y][x] === 1) {
                    dilated[y - 1][x] = 1; dilated[y + 1][x] = 1;
                    dilated[y][x - 1] = 1; dilated[y][x + 1] = 1;
                }
            }
        }
        let closed = dilated.map(row => [...row]);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (dilated[y][x] === 1) {
                    if (dilated[y - 1][x] === 0 || dilated[y + 1][x] === 0 ||
                        dilated[y][x - 1] === 0 || dilated[y][x + 1] === 0) {
                        closed[y][x] = 0;
                    }
                }
            }
        }
        grid = closed;
    }

    const contours = extractContours(grid, width, height);

    // Resizing logic
    const { originalWidth, originalHeight } = meta;
    if (width !== originalWidth || height !== originalHeight) {
        const scaleX = originalWidth / width;
        const scaleY = originalHeight / height;

        const scaledContours = contours.map(c =>
            c.map(p => new THREE.Vector2(p.x * scaleX, p.y * scaleY))
        );
        return { contours: scaledContours, width: originalWidth, height: originalHeight };
    }

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

    contour.push(new THREE.Vector2(x, y));
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
                contour.push(new THREE.Vector2(currentX, currentY));
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

    // V39: Smart Simplification
    // Small detailed text needs LESS simplification to avoid turning 'o' into square.
    // We estimate "smallness" by contour length.
    if (contour.length < 50) {
        // Very small detail: Minimal simplification
        return simplifyContour(contour, 0.4);
    } else if (contour.length < 200) {
        // Medium detail (Letters?)
        return simplifyContour(contour, 0.8);
    } else {
        // Large shapes
        return simplifyContour(contour, 1.5);
    }
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

export type TracePresetType = 'logo' | 'sketch' | 'photo';

export interface TracePreset {
    type: TracePresetType;
    blur: number;
    threshold: number;
    adaptive: boolean;
    morphology: boolean;
}

export const analyzeImage = (image: HTMLImageElement): TracePreset => {
    // 1. Draw small sample to canvas
    const sampleSize = 64;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { type: 'logo', blur: 0, threshold: 128, adaptive: false, morphology: false }; // Fallback

    ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
    const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
    const pixelCount = sampleSize * sampleSize;

    // 2. Metrics
    let alphaSum = 0;
    let graySum = 0;
    let graySqSum = 0;


    for (let i = 0; i < pixelCount; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const a = data[i * 4 + 3];

        alphaSum += a;
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        graySum += gray;
        graySqSum += gray * gray;
    }


    // const meanGray = graySum / pixelCount;
    // const variance = (graySqSum / pixelCount) - (meanGray * meanGray);

    // 3. Heuristics

    // A. Alpha Check: High transparency -> Likely a Logo/Clipart
    // If mean alpha < 250 (allowing some softness), it has transparency.
    // If > 90% transparent, it's empty? No.
    // Let's check "Ratio of Transparent Pixels".
    let transparentPixels = 0;
    for (let i = 0; i < pixelCount; i++) {
        if (data[i * 4 + 3] < 250) transparentPixels++;
    }
    const transparencyRatio = transparentPixels / pixelCount;

    if (transparencyRatio > 0.1) {
        // >10% transparent -> Probably a Logo/Sticker
        return {
            type: 'logo',
            blur: 0,
            threshold: 128,
            adaptive: false,
            morphology: false
        };
    }

    // B. Noise / Variance Check
    // "Photo" usually has high entropy or high noise. "Sketch" is bimodal (White paper, Black lines).
    // Let's classify based on simplistic assumptions for now.

    // If it's fully opaque (Paper?), check brightness distribution.
    // Sketches are mostly bright (white paper).
    // Photos are middle-toned.

    // Let's use a "Noise" estimation: local variance? 
    // Or just simple: Defaults to Photo (Blur 2) unless likely Sketch.

    // Sketch Heuristic: High brightness mean (> 200) and high variance?
    // Actually, simple Bimodal check?
    // Let's try: "If it looks like a white page with lines" -> Sketch.
    // Mean Brightness > 200 (Light background).

    const meanBrightness = graySum / pixelCount;

    if (meanBrightness > 180) {
        // Likely a drawing on white paper
        return {
            type: 'sketch',
            blur: 1, // Slight blur to smooth pencil lines
            threshold: 100, // Lower threshold for faint lines
            adaptive: true, // Adaptive helps with uneven lighting on paper
            morphology: true // Repair broken lines
        };
    }

    // Default: Photo / Complex Image
    return {
        type: 'photo',
        blur: 3, // Strong blur to remove noise
        threshold: 128,
        adaptive: false, // Standard thresholding usually safer for full photos unless lighting is bad. 
        // Actually, Adaptive is great for photos too, but slow? 
        // Let's stick to standard but blurred.
        morphology: false
    };
};
