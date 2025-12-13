import * as THREE from 'three';

/**
 * Generates a circle contour.
 * @param radius Radius of the circle.
 * @param points Number of points to approximate the circle.
 */
export const generateCircle = (radius: number, points: number = 128): THREE.Vector2[] => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const spacedPoints = shape.getSpacedPoints(points);
    return spacedPoints.map(p => new THREE.Vector2(p.x, p.y));
};

/**
 * Generates a star contour.
 * @param outerRadius Distance from center to outer points.
 * @param innerRadius Distance from center to inner points.
 * @param points Number of points (spikes).
 */
export const generateStar = (outerRadius: number, innerRadius: number, points: number = 5): THREE.Vector2[] => {
    const contour: THREE.Vector2[] = [];
    const step = Math.PI / points;

    // Start at top (-PI/2 in standard trig, but let's align correctly)
    // We want the first point to be at (0, outerRadius) usually, or similar.
    let angle = Math.PI / 2;

    for (let i = 0; i < points; i++) {
        // Outer point
        contour.push(new THREE.Vector2(
            Math.cos(angle) * outerRadius,
            Math.sin(angle) * outerRadius
        ));
        angle += step;

        // Inner point
        contour.push(new THREE.Vector2(
            Math.cos(angle) * innerRadius,
            Math.sin(angle) * innerRadius
        ));
        angle += step;
    }

    // Close the shape? Shape logic usually expects open array if closed implied, 
    // but our app logic often treats last != first.
    return contour;
};

/**
 * Generates a heart contour.
 * @param scale Scale factor for the heart.
 * @param points Number of points for resolution.
 */
export const generateHeart = (scale: number, points: number = 128): THREE.Vector2[] => {


    // Heart formula:
    // x = 16sin^3(t)
    // y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)

    // We can use THREE.Shape bezier curves for a smooth heart or sample the formula.
    // Sampling formula is robust.

    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < points; i++) {
        const t = (i / points) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

        // Flip/Rotate if necessary? Formula produces upright heart.
        // V2: User reported it's upside down. Flip Y.
        contour.push(new THREE.Vector2(x * scale, -y * scale));
    }

    return contour;
};

/**
 * Generates a rounded rectangle.
 * @param width Width of rectangle.
 * @param height Height of rectangle.
 * @param radius Corner radius.
 */
export const generateRectangle = (width: number, height: number, radius: number): THREE.Vector2[] => {
    const shape = new THREE.Shape();
    const w = width / 2;
    const h = height / 2;
    // Clockwise rounded rect
    shape.moveTo(-w + radius, h);
    shape.lineTo(w - radius, h);
    shape.quadraticCurveTo(w, h, w, h - radius);
    shape.lineTo(w, -h + radius);
    shape.quadraticCurveTo(w, -h, w - radius, -h);
    shape.lineTo(-w + radius, -h);
    shape.quadraticCurveTo(-w, -h, -w, -h + radius);
    shape.lineTo(-w, h - radius);
    shape.quadraticCurveTo(-w, h, -w + radius, h);

    return shape.getSpacedPoints(128).map(p => new THREE.Vector2(p.x, p.y));
};
