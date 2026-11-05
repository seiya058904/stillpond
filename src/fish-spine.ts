import type { Koi } from "./koi";
import { clamp } from "./math";

/** Every field the shared swimming wave reads. A Koi is one; so is a small fish's pose. */
export type SwimBody = Pick<Koi, "position" | "spine" | "renderSpine" | "heading" | "swimPhase" | "bodyLength" | "bodyWidth" | "tailEffort" | "turnBend">;
type SpinePose = Pick<Koi, "renderSpine" | "heading" | "bodyLength" | "turnBend">;

/** The head leads; each node follows the one before it, looser toward the tail. */
export function followSpine(fish: Pick<Koi, "position" | "spine" | "heading" | "bodyLength">): void {
  const {spine} = fish, last = spine.length - 1;
  spine[0] = { ...fish.position };
  const spacing = fish.bodyLength / last;
  for (let node = 1; node <= last; node += 1) {
    const leader = spine[node - 1], follower = spine[node];
    let directionX = follower.x - leader.x, directionY = follower.y - leader.y;
    const magnitude = Math.hypot(directionX, directionY);
    if (magnitude > 0.0001) { const inverse = 1 / magnitude; directionX *= inverse; directionY *= inverse; }
    else { directionX = -Math.cos(fish.heading); directionY = -Math.sin(fish.heading); }
    const constrainedX = leader.x + directionX * spacing, constrainedY = leader.y + directionY * spacing;
    const tailAmount = node / last;
    const stiffness = 0.94 - tailAmount * 0.17;
    follower.x += (constrainedX - follower.x) * stiffness;
    follower.y += (constrainedY - follower.y) * stiffness;
  }
}

// The original koi rendering wave, shared by every fish drawn along a spine.
export function buildRenderSpine(fish: Omit<SwimBody, "position" | "bodyLength">): void {
  const {spine, renderSpine} = fish, nodes = spine.length;
  renderSpine[0].x = spine[0].x; renderSpine[0].y = spine[0].y;
  for (let node = 1; node < nodes; node += 1) {
    const t = node / (nodes - 1);
    const ahead = spine[Math.max(0, node - 1)], behind = spine[Math.min(nodes - 1, node + 1)];
    let tangentX = ahead.x - behind.x, tangentY = ahead.y - behind.y;
    const magnitude = Math.hypot(tangentX, tangentY);
    if (magnitude > 0.0001) { const inverse = 1 / magnitude; tangentX *= inverse; tangentY *= inverse; }
    else { tangentX = Math.cos(fish.heading); tangentY = Math.sin(fish.heading); }
    const waveEnvelope = Math.pow(t, 1.72);
    const wave =
      Math.sin(fish.swimPhase - t * 6.1) *
      fish.bodyWidth *
      1.15 *
      waveEnvelope *
      (0.015 + fish.tailEffort * 0.985);
    const bend = Math.sin(t * Math.PI * 0.85) * t * fish.bodyWidth * fish.turnBend * 0.9;
    const offset = wave + bend, out = renderSpine[node];
    out.x = spine[node].x - tangentY * offset;
    out.y = spine[node].y + tangentX * offset;
  }
}

export interface SpineSample { x: number; y: number; forwardX: number; forwardY: number }

// The platinum butterfly koi's long, pointed fork. Coordinates are fractions of
// body length, measured back from the snout. The motion below is what every
// caudal fin shares; each species supplies its own contour.
export const LONG_TAIL: readonly (readonly [number, number])[] = [
  [0.94, 0.025], [1.08, 0.07], [1.26, 0.19], [1.46, 0.23],
  [1.68, 0.17], [1.74, 0.10], [1.51, 0.08], [1.30, 0.035], [1.1, 0.014],
];
// The Bristol Shubunkin's tail: broad, well spread and carried in two rounded lobes
// that form a soft "B", where the longfin's runs out to a long point.
export const SHUBUNKIN_TAIL: readonly (readonly [number, number])[] = [
  [0.94, 0.025], [1.05, 0.085], [1.18, 0.185], [1.32, 0.262], [1.46, 0.272],
  [1.57, 0.222], [1.6, 0.15], [1.54, 0.082], [1.46, 0.035], [1.4, 0],
];
export const LONG_TAIL_ANCHOR = 0.97;
export const longTailOpening = (body: Pick<Koi, "swimPhase">): number => 0.88 + Math.sin(body.swimPhase - 0.8) * 0.08;
export const longTailFlex = (body: Pick<Koi, "swimPhase" | "tailEffort">): number => Math.sin(body.swimPhase - 1.4) * 0.06 * (0.25 + body.tailEffort);

/**
 * A membrane point attached to ONE spine tangent. Sampling a different tangent at
 * every contour point folds wide fins inside out during sharp turns.
 */
export function membranePoint(body: SpinePose, anchor: number, t: number, width: number, flex: number, sample: SpineSample): void {
  sampleSwimSpine(body, anchor, sample);
  const along = (t - anchor) * body.bodyLength;
  const across = width * body.bodyLength + along * (flex + body.turnBend * 0.025);
  const {x, y, forwardX, forwardY} = sample;
  sample.x = x - forwardX * along - forwardY * across;
  sample.y = y - forwardY * along + forwardX * across;
}

/** Cubic centerline plus its tangent, including a tangent-continuous tail extension. */
export function sampleSwimSpine(body: SpinePose, t: number, out: SpineSample): void {
  const spine = body.renderSpine, last = spine.length - 1;
  const at = clamp(t, 0, 1) * last;
  const i = Math.min(last - 1, Math.floor(at)), u = at - i;
  const a = spine[i], b = spine[i + 1];
  const previous = spine[Math.max(0, i - 1)], next = spine[Math.min(last, i + 2)];
  const ax = i === 0 ? b.x - a.x : (b.x - previous.x) * 0.5;
  const ay = i === 0 ? b.y - a.y : (b.y - previous.y) * 0.5;
  const bx = i + 1 === last ? b.x - a.x : (next.x - a.x) * 0.5;
  const by = i + 1 === last ? b.y - a.y : (next.y - a.y) * 0.5;
  const h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u;
  const h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
  out.x = h00 * a.x + h10 * ax + h01 * b.x + h11 * bx;
  out.y = h00 * a.y + h10 * ay + h01 * b.y + h11 * by;
  const dx = (6 * u * u - 6 * u) * a.x + (3 * u * u - 4 * u + 1) * ax
    + (-6 * u * u + 6 * u) * b.x + (3 * u * u - 2 * u) * bx;
  const dy = (6 * u * u - 6 * u) * a.y + (3 * u * u - 4 * u + 1) * ay
    + (-6 * u * u + 6 * u) * b.y + (3 * u * u - 2 * u) * by;
  const magnitude = Math.hypot(dx, dy);
  out.forwardX = magnitude > 0.0001 ? -dx / magnitude : Math.cos(body.heading);
  out.forwardY = magnitude > 0.0001 ? -dy / magnitude : Math.sin(body.heading);
  if (t > 1) {
    out.x -= out.forwardX * (t - 1) * body.bodyLength;
    out.y -= out.forwardY * (t - 1) * body.bodyLength;
  }
}
