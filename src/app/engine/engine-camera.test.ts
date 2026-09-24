import { describe, expect, it } from "vitest";

import {
  createProjector,
  unprojectPoint,
  type CameraSettings,
} from "./engine-camera";

const WIDTH = 1080;
const HEIGHT = 720;

function camera(overrides: Partial<CameraSettings>): CameraSettings {
  return {
    distance: 1,
    fieldOfView: 60,
    pan: 0,
    perspective: true,
    roll: 0,
    tilt: 0,
    ...overrides,
  };
}

const angles: readonly Partial<CameraSettings>[] = [
  {},
  { tilt: 45 },
  { pan: -35 },
  { roll: 90 },
  { distance: 2.5, fieldOfView: 100, pan: 20, roll: -30, tilt: 60 },
  { distance: 0.6, fieldOfView: 20, pan: -70, tilt: -15 },
];

describe("camera projection", () => {
  it("passes points straight through in flat view", () => {
    const project = createProjector(camera({ perspective: false }), WIDTH, HEIGHT);
    expect(project(123, 456)).toEqual({
      depth: 0,
      scale: 1,
      visible: true,
      x: 123,
      y: 456,
    });
  });

  it("keeps the sheet centre fixed at unit scale for every angle", () => {
    for (const overrides of angles) {
      const project = createProjector(
        camera({ ...overrides, distance: 1 }),
        WIDTH,
        HEIGHT,
      );
      const centre = project(WIDTH / 2, HEIGHT / 2);
      expect(centre.x).toBeCloseTo(WIDTH / 2, 6);
      expect(centre.y).toBeCloseTo(HEIGHT / 2, 6);
      expect(centre.scale).toBeCloseTo(1, 6);
    }
  });

  it("tips the top away under positive tilt", () => {
    const project = createProjector(camera({ tilt: 50 }), WIDTH, HEIGHT);
    const top = project(WIDTH / 2, 0);
    const bottom = project(WIDTH / 2, HEIGHT);
    expect(top.scale).toBeLessThan(1);
    expect(bottom.scale).toBeGreaterThan(1);
    expect(top.depth).toBeGreaterThan(bottom.depth);
  });

  it("swings the right edge away under positive pan", () => {
    const project = createProjector(camera({ pan: 40 }), WIDTH, HEIGHT);
    const left = project(0, HEIGHT / 2);
    const right = project(WIDTH, HEIGHT / 2);
    expect(right.scale).toBeLessThan(1);
    expect(left.scale).toBeGreaterThan(1);
  });

  it("round-trips a sheet point through projection and back", () => {
    const samples: readonly (readonly [number, number])[] = [
      [0, 0],
      [WIDTH, 0],
      [WIDTH / 2, HEIGHT / 2],
      [WIDTH * 0.2, HEIGHT * 0.9],
      [WIDTH * 0.85, HEIGHT * 0.3],
    ];
    for (const overrides of angles) {
      const settings = camera(overrides);
      const project = createProjector(settings, WIDTH, HEIGHT);
      for (const [x, y] of samples) {
        const projected = project(x, y);
        if (!projected.visible) continue;
        const plane = unprojectPoint(
          settings,
          WIDTH,
          HEIGHT,
          projected.x,
          projected.y,
        );
        expect(plane).not.toBeNull();
        expect(plane?.x).toBeCloseTo(x, 4);
        expect(plane?.y).toBeCloseTo(y, 4);
      }
    }
  });
});
