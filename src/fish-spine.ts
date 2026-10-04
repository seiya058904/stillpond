import { SPINE_NODES } from "./config";
import type { Koi } from "./koi";
import { add, clamp, fromAngle, mul, normalize, perpendicular, sub } from "./math";

// The original koi rendering wave, shared by every medium/large fish.
export function buildRenderSpine(fish: Koi): void {
  fish.renderSpine[0] = { ...fish.spine[0] };
  for (let node = 1; node < SPINE_NODES; node += 1) {
    const t = node / (SPINE_NODES - 1);
    const previous = Math.max(0, node - 1);
    const next = Math.min(SPINE_NODES - 1, node + 1);
    const tangent = normalize(
      sub(fish.spine[previous], fish.spine[next]),
      fromAngle(fish.heading),
    );
    const normal = perpendicular(tangent);
    const waveEnvelope = Math.pow(t, 1.72);
    const wave =
      Math.sin(fish.swimPhase - t * 6.1) *
      fish.bodyWidth *
      1.15 *
      waveEnvelope *
      (0.015 + fish.tailEffort * 0.985);
    const bend = Math.sin(t * Math.PI * 0.85) * t * fish.bodyWidth * fish.turnBend * 0.9;
    fish.renderSpine[node] = add(fish.spine[node], mul(normal, wave + bend));
  }
}

export interface SpineSample { x: number; y: number; forwardX: number; forwardY: number }

/** Cubic centerline plus its tangent, including a tangent-continuous tail extension. */
export function sampleSwimSpine(body: Koi, t: number, out: SpineSample): void {
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
