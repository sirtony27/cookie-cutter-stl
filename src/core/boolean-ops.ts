import * as martinez from 'martinez-polygon-clipping';
import * as THREE from 'three';

// Martinez expects coordinates as [number, number]
type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

// Helper to convert THREE.Vector2[] to Martinez Polygon (single ring for now)
// We assume simple contours without holes for the input for simplicity in this version,
// or we treat them as separate polygons.
function toMartinez(contour: THREE.Vector2[]): Polygon {
    const ring: Ring = contour.map(p => [p.x, p.y]);
    if (ring.length > 0) {
        // Ensure closed
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push(first);
        }
    }
    return [ring];
}

// Helper to convert Martinez result back to THREE.Vector2[][]
// The result might be a MultiPolygon (multiple disjoint shapes) or Polygon (shape with holes)
// For our App, we treat "HOLES" as shapes with 'stamp' role? 
// OR we flatten everything into simple contours and let the user decide roles?
// For V34, simple approach: Flatten everything to array of contours. 
// Note: Holes in Martinez are inner rings.
// Our app supports "contours" which can be anything. 
// If we return holes as separate contours, they will be extruded as separate solids unless we classify them.
// For now, we returns all rings as separate contours.
function fromMartinez(geom: Polygon | MultiPolygon): THREE.Vector2[][] {
    const contours: THREE.Vector2[][] = [];

    const processPolygon = (poly: Polygon) => {
        poly.forEach(ring => {
            // Convert ring to Vector2[]
            // Remove last point if it duplicates first (Martinez closes rings)
            const points = ring.map(p => new THREE.Vector2(p[0], p[1]));
            if (points.length > 3 && points[0].distanceTo(points[points.length - 1]) < 0.001) {
                points.pop();
            }
            if (points.length >= 3) {
                contours.push(points);
            }
        });
    };

    if (Array.isArray(geom) && geom.length > 0 && Array.isArray(geom[0]) && Array.isArray(geom[0][0])) {
        // It's a MultiPolygon
        (geom as MultiPolygon).forEach(processPolygon);
    } else {
        // It's a Polygon
        processPolygon(geom as Polygon);
    }

    return contours;
}

export function unionContours(c1: THREE.Vector2[], c2: THREE.Vector2[]): THREE.Vector2[][] {
    const p1 = toMartinez(c1);
    const p2 = toMartinez(c2);
    const result = martinez.union(p1, p2);
    return fromMartinez(result);
}

export function diffContours(subject: THREE.Vector2[], clipper: THREE.Vector2[]): THREE.Vector2[][] {
    const p1 = toMartinez(subject);
    const p2 = toMartinez(clipper);
    const result = martinez.diff(p1, p2);
    return fromMartinez(result);
}

export function intersectContours(c1: THREE.Vector2[], c2: THREE.Vector2[]): THREE.Vector2[][] {
    const p1 = toMartinez(c1);
    const p2 = toMartinez(c2);
    const result = martinez.intersection(p1, p2);
    return fromMartinez(result);
}
