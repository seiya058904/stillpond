import type { Koi } from "./koi";
import { clamp, type Vec2 } from "./math";

/** Existing Wakin capsule avoidance, shared by the two ornamental populations. */
export function fishBodyAvoidance(fish: readonly Koi[], count: number, x: number, y: number, radius: number, out: Vec2): Vec2 {
  out.x = 0; out.y = 0;
  for (let index = 0; index < count; index++) {
    const other = fish[index];
    const fx = Math.cos(other.heading), fy = Math.sin(other.heading);
    const dx = x - other.position.x - other.velocity.x * 0.22;
    const dy = y - other.position.y - other.velocity.y * 0.22;
    const along = clamp(dx * fx + dy * fy, -other.bodyLength * 0.85, 0);
    const ox = dx - fx * along, oy = dy - fy * along;
    const distance = Math.hypot(ox, oy), reach = radius + other.bodyWidth + 7;
    if (distance >= reach) continue;
    const strength = Math.pow(1 - distance / reach, 2) * 3.8;
    if (distance > 0.001) { out.x += ox / distance * strength; out.y += oy / distance * strength; }
    else { out.x -= fy * strength; out.y += fx * strength; }
  }
  return out;
}
