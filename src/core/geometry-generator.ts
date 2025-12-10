import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';
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
}

export type PartType = 'base' | 'outer' | 'inner';

export interface CutterPart {
    geometry: THREE.BufferGeometry;
    type: PartType;
    contourIndex: number; // Index in the original contours array (or distinct ID)
    id: string; // Unique ID for React keys
}

export const generateGeometry = (
    contours: THREE.Vector2[][], // Raw pixel coordinates
    imgWidth: number,
    imgHeight: number,
    settings: CutterSettings
): CutterPart[] => {
    // 1. Normalize and Center contours
    const scale = settings.size / Math.max(imgWidth, imgHeight);
    const offsetX = imgWidth / 2;
    const offsetY = imgHeight / 2;

    const processedContours = contours.map(contour => {
        return contour.map(p => {
            return new THREE.Vector2(
                (offsetX - p.x) * scale, // Mirrored X
                (p.y + offsetY) * scale
            );
        });
    });

    if (processedContours.length === 0) return [];

    // 2. Classify Contours
    // Find the distinct outer perimeter (largest area or bounding box)
    // For simplicity, let's assume the contour with the largest bounding box diagonal is the outer one.
    // Or just length? Length is good for closed loops.
    let outerIndex = 0;
    let maxLen = 0;
    processedContours.forEach((c, i) => {
        // Approximate length
        const len = c.length; // Number of points is a decent proxy if sampling is uniform
        if (len > maxLen) {
            maxLen = len;
            outerIndex = i;
        }
    });

    const results: CutterPart[] = [];

    // 3. Generate Solid Base Plate (from Outer Contour)
    if (settings.withBase) {
        // Create a shape from the outer contour
        // We want the base to be slightly wider than the cutter? 
        // settings.baseThickness will be the "offset" amount for the base plate
        const baseOffset = offsetContour(processedContours[outerIndex], settings.baseThickness); // Reuse offset logic

        const shape = new THREE.Shape(baseOffset);

        // Extrude settings for the plate
        const extrudeSettings = {
            depth: settings.baseHeight, // Extrude along Z
            bevelEnabled: false,
            // Construct the mesh "upwards" or start at 0?
        };

        const baseGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // By default ExtrudeGeometry extrudes into +Z? Or -Z? 
        // We can just rotate if needed, but usually it's fine.
        // Let's assume Z 0 -> +baseHeight
        results.push({
            geometry: baseGeom,
            type: 'base',
            contourIndex: outerIndex,
            id: `base-${outerIndex}`
        });
    }

    // 4. Generate Outer Cutter Wall (Full Height)
    // Starts from Z = 0 ? Or Z = baseHeight?
    // Usually cutter walls go through the base or start from it.
    // Let's make them start from 0 to ensure solid connection, or from baseHeight?
    // If we want a solid object, overlapping is fine.
    // Let's start from 0 up to cutterHeight (which should be > baseHeight)
    const cutterWall = createExtrudedWall(processedContours[outerIndex], settings.cutterHeight, settings.cutterThickness, 0);
    results.push({
        geometry: cutterWall,
        type: 'outer',
        contourIndex: outerIndex,
        id: `outer-${outerIndex}`
    });

    // 5. Generate Inner Marker Walls (Marker Height)
    processedContours.forEach((contour, i) => {
        if (i === outerIndex) return; // Skip outer
        // These are markers, so they might be shorter
        // Height should be settings.markerHeight
        // They also start from 0 (or baseHeight)
        const markerWall = createExtrudedWall(contour, settings.markerHeight, settings.markerThickness, 0);
        results.push({
            geometry: markerWall,
            type: 'inner',
            contourIndex: i,
            id: `inner-${i}`
        });
    });

    return results;
};

const createExtrudedWall = (
    contour: THREE.Vector2[],
    height: number,
    thickness: number,
    zStart: number = 0
): THREE.BufferGeometry => {
    // Generate ribbon
    // Need 2 loops: Inner and Outer
    // Inner = contour
    // Outer = offsetContour(contour, thickness)

    const inner = contour;
    const outer = offsetContour(contour, thickness);

    const numPoints = inner.length;
    const vertices: number[] = [];

    // Vertices order:
    // Quad 1: Inner Wall (Inner[i], Inner[i+1], Inner[i+1]+H, Inner[i]+H)
    // Quad 2: Outer Wall (Outer[i+1], Outer[i], Outer[i]+H, Outer[i+1]+H)
    // Quad 3: Top Cap (Inner[i]+H, Inner[i+1]+H, Outer[i+1]+H, Outer[i]+H)
    // Quad 4: Bottom Cap (Inner[i+1], Inner[i], Outer[i], Outer[i+1])

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

        const i1 = new THREE.Vector3(inner[i].x, inner[i].y, zStart);
        const i2 = new THREE.Vector3(inner[next].x, inner[next].y, zStart);
        const i1_top = new THREE.Vector3(inner[i].x, inner[i].y, zStart + height);
        const i2_top = new THREE.Vector3(inner[next].x, inner[next].y, zStart + height);

        const o1 = new THREE.Vector3(outer[i].x, outer[i].y, zStart);
        const o2 = new THREE.Vector3(outer[next].x, outer[next].y, zStart);
        const o1_top = new THREE.Vector3(outer[i].x, outer[i].y, zStart + height);
        const o2_top = new THREE.Vector3(outer[next].x, outer[next].y, zStart + height);

        pushQuad(i1_top, i2_top, i2, i1); // Inner facing "in" (towards shape center)
        pushQuad(o1, o2, o2_top, o1_top); // Outer facing "out"
        pushQuad(i1_top, o1_top, o2_top, i2_top); // Top Rim
        pushQuad(i2, o2, o1, i1); // Bottom Rim
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
};

const offsetContour = (contour: THREE.Vector2[], distance: number): THREE.Vector2[] => {
    const result: THREE.Vector2[] = [];
    const len = contour.length;
    for (let i = 0; i < len; i++) {
        const prev = contour[(i - 1 + len) % len];
        const curr = contour[i];
        const next = contour[(i + 1) % len];

        // Edge vectors
        const v1 = new THREE.Vector2().subVectors(curr, prev).normalize();
        const v2 = new THREE.Vector2().subVectors(next, curr).normalize();

        // Normals (Rotate -90 deg for "Outside")
        const n1 = new THREE.Vector2(v1.y, -v1.x);
        const n2 = new THREE.Vector2(v2.y, -v2.x);

        // Average normal (bisector)
        const bisector = new THREE.Vector2().addVectors(n1, n2).normalize();

        // Miter length adjustment
        const dot = bisector.dot(n1);
        const miter = distance / Math.max(dot, 0.1); // Avoid div by zero

        // Limit miter to avoid huge spikes
        const limit = distance * 2;
        const offsetDist = Math.min(miter, limit);

        const offset = bisector.multiplyScalar(offsetDist);
        result.push(new THREE.Vector2().addVectors(curr, offset));
    }
    return result;
};



export const exportToSTL = (parts: CutterPart[], hiddenPartIds: Set<string>): Blob => {
    const exporter = new STLExporter();

    // Filter out hidden parts
    const visibleGeometries = parts
        .filter(p => !hiddenPartIds.has(p.id))
        .map(p => p.geometry);

    if (visibleGeometries.length === 0) {
        // Return empty or dummy
        return new Blob([], { type: 'application/octet-stream' });
    }

    const merged = mergeGeometries(visibleGeometries);
    const mesh = new THREE.Mesh(merged);

    const result = exporter.parse(mesh, { binary: true });
    return new Blob([result as any], { type: 'application/octet-stream' });
};
