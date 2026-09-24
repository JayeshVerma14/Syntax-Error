/**
 * Camera projection for the cell grid.
 *
 * The sheet is a flat plane in world space. Tilt, pan and roll rotate that
 * plane, and a pinhole projection divides by depth, so a grid of marks
 * converges toward a vanishing point instead of staying axis-aligned. Marks
 * further from the camera also draw smaller, which is what reads as depth.
 *
 * The projection is normalised so the plane's centre always lands at scale 1.
 * That separates the two camera properties cleanly: Field of view sets how hard
 * the plane converges, and Distance only moves the camera back or forward.
 */

export type CameraSettings = Readonly<{
  /** 1 frames the sheet exactly; larger pulls the camera back. */
  distance: number;
  /** Full horizontal angle in degrees; wider converges more strongly. */
  fieldOfView: number;
  /** Rotation about the vertical axis, degrees; positive swings the right edge away. */
  pan: number;
  perspective: boolean;
  /** Rotation about the view axis, degrees. */
  roll: number;
  /** Rotation about the horizontal axis, degrees; positive tips the top away. */
  tilt: number;
}>;

export type Projection = Readonly<{
  /** Distance from the camera, for painter ordering. Larger is further. */
  depth: number;
  /** Size multiplier from foreshortening and framing. */
  scale: number;
  visible: boolean;
  x: number;
  y: number;
}>;

export type ProjectCell = (x: number, y: number) => Projection;

/**
 * Builds a projector for one frame. Returns plain pass-through when
 * perspective is off, so the flat path costs nothing extra.
 */
export function createProjector(
  camera: CameraSettings,
  width: number,
  height: number,
): ProjectCell {
  if (!camera.perspective) {
    return (x, y) => ({ depth: 0, scale: 1, visible: true, x, y });
  }

  const toRadians = Math.PI / 180;
  const cosTilt = Math.cos(-camera.tilt * toRadians);
  const sinTilt = Math.sin(-camera.tilt * toRadians);
  const cosPan = Math.cos(-camera.pan * toRadians);
  const sinPan = Math.sin(-camera.pan * toRadians);
  const cosRoll = Math.cos(camera.roll * toRadians);
  const sinRoll = Math.sin(camera.roll * toRadians);

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfSpan = Math.max(width, height) / 2;

  const fieldOfView = Math.max(10, Math.min(120, camera.fieldOfView));
  // The eye distance that frames the plane at this field of view.
  const eye = halfSpan / Math.tan(fieldOfView * 0.5 * toRadians);
  const zoom = 1 / Math.max(0.1, camera.distance);

  return (x, y) => {
    let px = x - halfWidth;
    let py = y - halfHeight;
    let pz = 0;

    // Roll first: it spins the sheet in its own plane.
    const rolledX = px * cosRoll - py * sinRoll;
    const rolledY = px * sinRoll + py * cosRoll;
    px = rolledX;
    py = rolledY;

    // Pan about the vertical axis.
    const pannedX = px * cosPan + pz * sinPan;
    const pannedZ = -px * sinPan + pz * cosPan;
    px = pannedX;
    pz = pannedZ;

    // Tilt about the horizontal axis.
    const tiltedY = py * cosTilt - pz * sinTilt;
    const tiltedZ = py * sinTilt + pz * cosTilt;
    py = tiltedY;
    pz = tiltedZ;

    const depth = eye + pz;
    if (depth <= eye * 0.02) {
      // Behind or level with the camera: drop the mark rather than mirroring it.
      return { depth: Number.POSITIVE_INFINITY, scale: 0, visible: false, x, y };
    }

    const k = (eye / depth) * zoom;
    return {
      depth,
      scale: k,
      visible: true,
      x: px * k + halfWidth,
      y: py * k + halfHeight,
    };
  };
}

/**
 * Inverse of the projector: casts a ray through a frame point and intersects
 * the rotated sheet plane, returning the plane coordinate under the pointer.
 * This is what lets painting land on the cell the user sees in 3D view.
 * Returns null when the ray misses the plane or hits it behind the camera.
 */
export function unprojectPoint(
  camera: CameraSettings,
  width: number,
  height: number,
  frameX: number,
  frameY: number,
): { x: number; y: number } | null {
  if (!camera.perspective) return { x: frameX, y: frameY };

  const toRadians = Math.PI / 180;
  const cosTilt = Math.cos(-camera.tilt * toRadians);
  const sinTilt = Math.sin(-camera.tilt * toRadians);
  const cosPan = Math.cos(-camera.pan * toRadians);
  const sinPan = Math.sin(-camera.pan * toRadians);
  const cosRoll = Math.cos(camera.roll * toRadians);
  const sinRoll = Math.sin(camera.roll * toRadians);

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfSpan = Math.max(width, height) / 2;
  const fieldOfView = Math.max(10, Math.min(120, camera.fieldOfView));
  const eye = halfSpan / Math.tan(fieldOfView * 0.5 * toRadians);
  const focal = eye / Math.max(0.1, camera.distance);

  const a = frameX - halfWidth;
  const b = frameY - halfHeight;

  // The sheet's normal after roll, pan and tilt; the plane passes through the
  // origin, and the pinhole sits at depth -eye.
  const nx = sinPan;
  const ny = -cosPan * sinTilt;
  const nz = cosPan * cosTilt;

  const denominator = (nx * a + ny * b) / focal + nz;
  if (Math.abs(denominator) < 1e-9) return null;
  const c = (nz * eye) / denominator;
  if (c <= eye * 0.02) return null;

  const worldX = (a * c) / focal;
  const worldY = (b * c) / focal;
  const worldZ = c - eye;

  // Undo tilt, then pan, then roll.
  const untiltedY = worldY * cosTilt + worldZ * sinTilt;
  const untiltedZ = -worldY * sinTilt + worldZ * cosTilt;
  const unpannedX = worldX * cosPan - untiltedZ * sinPan;
  const planeX = unpannedX * cosRoll + untiltedY * sinRoll;
  const planeY = -unpannedX * sinRoll + untiltedY * cosRoll;

  return { x: planeX + halfWidth, y: planeY + halfHeight };
}
