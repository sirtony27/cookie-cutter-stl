import * as THREE from 'three';

/**
 * Applies a 3D transformation matrix (from Gizmo) to a 2D contour.
 * Since contours are 2D (XY plane), we project the 3D transform back to 2D.
 * 
 * Logic:
 * 1. Convert Vector2 points to Vector3 (z=0).
 * 2. Calculate Centroid of the contour.
 * 3. Apply Matrix4 to points.
 * 4. Project back to Vector2 (ignoring Z, or flattening).
 * 
 * Note: The Gizmo usually applies transform relative to the object center.
 * However, our 'object' is generated from 0,0 usually.
 * The Viewer3D renders mesh at 0,0,0.
 * So the Matrix4 is World Space.
 */
export const applyTransformToContour = (
    contour: THREE.Vector2[],
    matrix: THREE.Matrix4,
    center: THREE.Vector2 = new THREE.Vector2(0, 0)
): THREE.Vector2[] => {
    // 1. Convert to Vector3, shifting by Center to get Local coordinates
    const points3 = contour.map(p => new THREE.Vector3(p.x - center.x, p.y - center.y, 0));

    // 2. Apply Matrix (Local -> New World)
    points3.forEach(p => p.applyMatrix4(matrix));

    // 3. Convert back to Vector2
    // We ignore Z. If rotation made it non-planar, we flatten it.
    return points3.map(p => new THREE.Vector2(p.x, p.y));
};
