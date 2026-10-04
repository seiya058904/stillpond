import * as THREE from "three";
import { BUTTERFLIES } from "./config";
import type { SurfacePoint } from "./surface-geometry";

export interface ButterflyPalette {
  wing: THREE.Color;
  wingLight: THREE.Color;
  accent: THREE.Color;
  body: THREE.Color;
}
interface ColoredPoint extends SurfacePoint { color: THREE.Color; }
export interface ButterflyWing {
  shape: ColoredPoint[];
  silhouette: SurfacePoint[];
  veins: ColoredPoint[];
}
export interface ButterflyModel {
  forewing: ButterflyWing;
  hindwing: ButterflyWing;
  body: ColoredPoint[];
  antennae: ColoredPoint[];
}

function polygon(points: readonly SurfacePoint[], color: THREE.Color, target: ColoredPoint[]): void {
  const vectors = points.map(p => new THREE.Vector2(p.x, p.y));
  for (const triangle of THREE.ShapeUtils.triangulateShape(vectors, [])) {
    for (const index of triangle) target.push({ ...points[index], color });
  }
}
function ellipse(x: number, y: number, rx: number, ry: number, color: THREE.Color, target: ColoredPoint[]): void {
  const points = Array.from({ length: 8 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 4) * rx, y: y + Math.sin(i * Math.PI / 4) * ry }));
  polygon(points, color, target);
}
function outline(family: number, forewing: boolean): THREE.Shape {
  const shape = new THREE.Shape();
  if (forewing) {
    shape.moveTo(0.045, 0.12);
    if (family === 0) {
      shape.bezierCurveTo(0.22, 0.58, 0.62, 0.98, 0.94, 0.77);
      shape.bezierCurveTo(1.02, 0.66, 0.8, 0.27, 0.45, 0.055);
    } else if (family === 2) {
      shape.bezierCurveTo(0.18, 0.64, 0.65, 0.79, 0.87, 0.57);
      shape.bezierCurveTo(0.94, 0.32, 0.66, 0.08, 0.35, 0.015);
    } else {
      shape.bezierCurveTo(0.2, 0.66, 0.61, 0.88, 0.85, 0.58);
      shape.bezierCurveTo(0.94, 0.31, 0.73, 0.045, 0.36, -0.015);
    }
    shape.bezierCurveTo(0.13, -0.04, 0.04, 0.03, 0.045, 0.12);
  } else {
    shape.moveTo(0.055, 0.13);
    shape.bezierCurveTo(0.25, 0.17, 0.62, -0.015, 0.69, -0.26);
    if (family === 0) {
      shape.bezierCurveTo(0.87, -0.28, 0.9, -0.48, 0.74, -0.6);
      shape.lineTo(0.68, -0.92);
      shape.bezierCurveTo(0.61, -1.035, 0.59, -0.74, 0.56, -0.64);
      shape.bezierCurveTo(0.29, -0.88, 0.06, -0.53, 0.04, -0.1);
    } else {
      shape.bezierCurveTo(0.71, -0.48, 0.57, -0.62, 0.43, -0.6);
      shape.bezierCurveTo(0.3, -0.71, 0.12, -0.51, 0.07, -0.32);
      shape.bezierCurveTo(0.035, -0.2, 0.04, -0.08, 0.055, 0.13);
    }
  }
  shape.closePath();
  return shape;
}

function buildWing(family: number, forewing: boolean, palette: ButterflyPalette): ButterflyWing {
  const wing: ButterflyWing = { shape: [], silhouette: [], veins: [] };
  const contour = outline(family, forewing).getPoints(5);
  const dark = palette.body.clone().lerp(palette.accent, family === 2 ? 0.22 : 0.08);
  const faintVein = palette.wing.clone().lerp(dark, family === 0 ? 0.68 : 0.18);
  const edge = family === 0 || family === 2 ? dark : palette.wing.clone().multiplyScalar(0.89);
  polygon(contour, edge, wing.shape);
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const triangle of triangles) for (const index of triangle) wing.silhouette.push({ x: contour[index].x, y: contour[index].y });
  const inset = contour.map(p => ({ x: p.x * (family === 0 ? 0.84 : 0.9) + 0.012, y: p.y * 0.88 + 0.008 }));
  polygon(inset, forewing ? palette.wingLight : palette.wing, wing.shape);
  if (forewing) {
    if (family === 0) {
      polygon([{x:0.1,y:0.29},{x:0.22,y:0.39},{x:0.67,y:0.48},{x:0.77,y:0.4},{x:0.33,y:0.26},{x:0.08,y:0.2}], dark, wing.shape);
      for (let i = 0; i < 4; i++) ellipse(0.73 - i * 0.075, 0.59 - i * 0.105, 0.026, 0.043, palette.wingLight, wing.shape);
    } else {
      polygon([{x:0.55,y:0.65},{x:0.73,y:0.62},{x:0.85,y:0.52},{x:0.78,y:0.32},{x:0.69,y:0.4}], dark, wing.shape);
      ellipse(0.42, 0.25, 0.05, 0.06, dark, wing.shape);
      if (family === 1 || family === 2) ellipse(0.34, 0.075, 0.041, 0.045, dark, wing.shape);
      if (family === 2) ellipse(0.57, 0.43, 0.035, 0.038, dark, wing.shape);
    }
  } else if (family === 0) {
    polygon([{x:0.26,y:-0.42},{x:0.63,y:-0.19},{x:0.73,y:-0.4},{x:0.47,y:-0.66},{x:0.17,y:-0.42}], dark, wing.shape);
    for (let i = 0; i < 4; i++) ellipse(0.34 + i * 0.105, -0.5 + Math.sin(i * 0.8) * 0.1, 0.052, 0.034, palette.accent, wing.shape);
    ellipse(0.27, -0.51, 0.042, 0.048, palette.wingLight.clone().lerp(new THREE.Color(0xd77c43), 0.5), wing.shape);
  } else if (family === 2) {
    polygon([{x:0.17,y:-0.2},{x:0.58,y:-0.12},{x:0.6,y:-0.46},{x:0.39,y:-0.58},{x:0.15,y:-0.4}], dark, wing.shape);
    polygon([{x:0.2,y:-0.44},{x:0.43,y:-0.52},{x:0.59,y:-0.36},{x:0.6,y:-0.45},{x:0.42,y:-0.62},{x:0.15,y:-0.5}], palette.wingLight, wing.shape);
  }
  const ends = forewing ? [[0.73,0.66],[0.77,0.44],[0.63,0.24],[0.41,0.065]] : [[0.6,-0.19],[0.65,-0.4],[0.45,-0.54],[0.22,-0.43]];
  for (const [x, y] of ends) {
    const root = { x: 0.08, y: forewing ? 0.14 : -0.03 };
    const joint = { x: root.x + (x - root.x) * 0.47, y: root.y + (y - root.y) * 0.42 };
    wing.veins.push({ ...root, color: faintVein }, { ...joint, color: faintVein }, { ...joint, color: faintVein }, { x, y, color: faintVein });
  }
  const scale = family === 0 ? 1 : family === 2 ? 0.72 : 0.78;
  for (const point of [...wing.shape, ...wing.silhouette, ...wing.veins]) { point.x *= BUTTERFLIES.wingWidth * scale; point.y *= BUTTERFLIES.wingLength * scale; }
  return wing;
}

// These templates are built on settings refresh only. Every animation frame
// transforms their existing vertices into bounded, reusable GPU buffers.
export function buildButterflyModel(family: number, palette: ButterflyPalette): ButterflyModel {
  const body: ColoredPoint[] = [], antennae: ColoredPoint[] = [];
  const length = BUTTERFLIES.bodyLength, width = BUTTERFLIES.bodyWidth;
  const abdomen = new THREE.Shape();
  abdomen.moveTo(-width * 0.8, length * 0.12);
  abdomen.bezierCurveTo(-width * 1.15, -length * 0.13, -width * 0.75, -length * 0.49, 0, -length * 0.62);
  abdomen.bezierCurveTo(width * 0.75, -length * 0.49, width * 1.15, -length * 0.13, width * 0.8, length * 0.12);
  abdomen.closePath(); polygon(abdomen.getPoints(4), palette.body, body);
  ellipse(0, length * 0.19, width * 1.28, length * 0.17, palette.body, body);
  ellipse(0, length * 0.45, BUTTERFLIES.headRadius * 0.62, BUTTERFLIES.headRadius * 0.65, palette.body, body);
  const bodyLight = palette.body.clone().lerp(palette.wing, 0.2);
  ellipse(-width * 0.15, -length * 0.1, width * 0.36, length * 0.29, bodyLight, body);
  for (let sign = -1; sign <= 1; sign += 2) {
    const points = [{x:sign * width * 0.35,y:length * 0.49},{x:sign * 0.36,y:length * 0.49 + 0.8},{x:sign * 0.74,y:length * 0.49 + 1.48},{x:sign * 0.82,y:length * 0.49 + 1.7}];
    for (let i = 0; i < points.length - 1; i++) antennae.push({ ...points[i], color: palette.body }, { ...points[i+1], color: palette.body });
    ellipse(sign * 0.82, length * 0.49 + 1.7, 0.13, 0.16, palette.body, body);
  }
  return { forewing: buildWing(family % 4, true, palette), hindwing: buildWing(family % 4, false, palette), body, antennae };
}
