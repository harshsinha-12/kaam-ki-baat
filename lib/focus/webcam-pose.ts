/** MediaPipe pose matrices are column-major, in a right-handed camera space. */
export interface WebcamPoseMatrix {
  rows: number;
  columns: number;
  data: readonly number[];
}

/**
 * Input must be the unmirrored camera frame. CSS may mirror a preview, but the
 * inference input must not be mirrored. +yaw is the user's LEFT (screen right
 * in an unmirrored image), matching selector.ts. Translation/scale are ignored.
 */
export function webcamYawDeg(matrix: WebcamPoseMatrix | undefined): number | null {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length !== 16
    || !matrix.data.every(Number.isFinite)) return null;
  const [x, y, z] = [matrix.data[8], matrix.data[9], matrix.data[10]];
  if (Math.hypot(x, y, z) < 0.01 || Math.hypot(x, z) < 0.01) return null;
  return Math.atan2(x, z) * 180 / Math.PI;
}
