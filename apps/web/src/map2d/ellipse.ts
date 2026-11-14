/**
 * Creates 2D polygon coordinates for an error ellipse centered at (cx, cy)
 * with semi-major axis a, semi-minor axis b, and orientation angle in degrees.
 */
export function createEllipseCoordinates(
  cx: number,
  cy: number,
  a: number,
  b: number,
  angleDeg: number,
  numPoints: number = 48,
): [number, number][] {
  const theta = (angleDeg * Math.PI) / 180;
  const coords: [number, number][] = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = (i * 2 * Math.PI) / numPoints;
    const x0 = a * Math.cos(t);
    const y0 = b * Math.sin(t);
    const x = cx + x0 * Math.cos(theta) - y0 * Math.sin(theta);
    const y = cy + x0 * Math.sin(theta) + y0 * Math.cos(theta);
    coords.push([x, y]);
  }

  return coords;
}
