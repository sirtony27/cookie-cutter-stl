declare module 'martinez-polygon-clipping' {
    export type Point = [number, number];
    export type Ring = Point[];
    export type Polygon = Ring[];
    export type MultiPolygon = Polygon[];
    export type Geometry = Polygon | MultiPolygon;

    export function union(s: Geometry, c: Geometry): Geometry;
    export function intersection(s: Geometry, c: Geometry): Geometry;
    export function diff(s: Geometry, c: Geometry): Geometry;
    export function xor(s: Geometry, c: Geometry): Geometry;
}
