/** Keep the original pixel-art scale on the short axis. Expand the world,
 * never stretch fish geometry or multiply the simulation by screen DPR. */
export function pondSize(width: number, height: number) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) {
    return { width: 480, height: 270 };
  }
  const scale = 270 / Math.min(width, height);
  return { width: width * scale, height: height * scale };
}

export function pondPoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  world: { width: number; height: number },
) {
  return {
    x: Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width))) * world.width,
    y: Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height))) * world.height,
  };
}
