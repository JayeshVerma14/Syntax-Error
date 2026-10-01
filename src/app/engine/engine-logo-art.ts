/**
 * The uploaded logo prepared for assembly: a grid of filled blocks at the
 * chosen block size, each with its own colour, plus a crisp copy of the logo
 * that the blocks resolve into. Built once per logo, size and block pitch.
 *
 * Logos with transparency are cut out by alpha. A logo on a solid backdrop
 * (a JPG, or a PNG without alpha) is cut out against the colour of its
 * corners, so its backdrop never becomes blocks.
 */

export type LogoArt = Readonly<{
  /** Height over width of the logo. */
  aspect: number;
  /** Per filled block: column, row, red, green, blue (0..255), 5 floats each. */
  blocks: Float32Array;
  cols: number;
  /** CSS colour per filled block, in the same order as `blocks`. */
  colors: readonly string[];
  count: number;
  /** The logo at full resolution, masked like the blocks. */
  crisp: OffscreenCanvas | null;
  key: string;
  rows: number;
}>;

type LogoImage = HTMLImageElement;

const CRISP_WIDTH = 1400;

let cached: LogoArt | null = null;

function drawInto(image: LogoImage, width: number, height: number): OffscreenCanvasRenderingContext2D | null {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return context;
}

/** The colour behind the logo when it has no transparency, or null when it does. */
function backdropOf(pixels: Uint8ClampedArray, width: number, height: number): number[] | null {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 250) return null;
  }
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const sum = [0, 0, 0];
  for (const corner of corners) {
    for (let channel = 0; channel < 3; channel += 1) sum[channel] += pixels[corner * 4 + channel];
  }
  return sum.map((value) => value / corners.length);
}

/** How strongly a pixel belongs to the logo, 0..1. */
function coverage(pixels: Uint8ClampedArray, offset: number, backdrop: number[] | null): number {
  if (!backdrop) return pixels[offset + 3] / 255;
  const distance =
    Math.abs(pixels[offset] - backdrop[0]) +
    Math.abs(pixels[offset + 1] - backdrop[1]) +
    Math.abs(pixels[offset + 2] - backdrop[2]);
  return Math.min(1, Math.max(0, (distance - 30) / 90));
}

/** Column, row and colour of every cell the logo fills, five numbers each. */
function filledCells(pixels: Uint8ClampedArray, cols: number, rows: number): number[] {
  const backdrop = backdropOf(pixels, cols, rows);
  // Bound before the scan so the loop hands the pixel reads numbers only.
  const covered = (offset: number) => coverage(pixels, offset, backdrop);
  const channel = (offset: number) => pixels[offset];
  const cells: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const offset = (row * cols + column) * 4;
      if (covered(offset) < 0.4) continue;
      cells.push(column, row, channel(offset), channel(offset + 1), channel(offset + 2));
    }
  }
  return cells;
}

function buildBlocks(image: LogoImage, cols: number, rows: number): Float32Array {
  const context = drawInto(image, cols, rows);
  if (!context) return new Float32Array(0);
  return Float32Array.from(filledCells(context.getImageData(0, 0, cols, rows).data, cols, rows));
}

function buildCrisp(image: LogoImage, aspect: number): OffscreenCanvas | null {
  const width = CRISP_WIDTH;
  const height = Math.max(1, Math.round(CRISP_WIDTH * aspect));
  const context = drawInto(image, width, height);
  if (!context) return null;
  const frame = context.getImageData(0, 0, width, height);
  const backdrop = backdropOf(frame.data, width, height);
  if (backdrop) {
    // Cut an opaque logo out of its backdrop, so only the mark remains.
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      frame.data[offset + 3] = Math.round(coverage(frame.data, offset, backdrop) * 255);
    }
    context.putImageData(frame, 0, 0);
  }
  return context.canvas;
}

/**
 * The logo's blocks at `cols` blocks across. Rebuilt only when the logo, the
 * block count or the image's size changes.
 */
export function logoArtFor(resourceRef: string, image: LogoImage, cols: number): LogoArt | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) return null;
  const aspect = height / width;
  const across = Math.max(4, Math.min(200, Math.round(cols)));
  const down = Math.max(2, Math.round(across * aspect));
  const key = `${resourceRef}|${across}|${width}x${height}`;
  if (cached && cached.key === key) return cached;
  const blocks = buildBlocks(image, across, down);
  const crisp = cached && cached.key.startsWith(`${resourceRef}|`) && cached.key.endsWith(`|${width}x${height}`)
    ? cached.crisp
    : buildCrisp(image, aspect);
  const colors: string[] = [];
  for (let index = 0; index < blocks.length; index += 5) {
    colors.push(`rgb(${blocks[index + 2]},${blocks[index + 3]},${blocks[index + 4]})`);
  }
  cached = { aspect, blocks, colors, cols: across, count: blocks.length / 5, crisp, key, rows: down };
  return cached;
}

let tinted: { canvas: OffscreenCanvas | null; key: string } | null = null;

/** The crisp logo filled with one ink, keeping its shape; cached per ink. */
export function tintedCrisp(art: LogoArt, ink: string): OffscreenCanvas | null {
  const source = art.crisp;
  if (!source) return null;
  const key = `${art.key}|${ink}`;
  if (tinted && tinted.key === key) return tinted.canvas;
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext("2d");
  if (context) {
    context.drawImage(source, 0, 0);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = ink;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  tinted = { canvas: context ? canvas : null, key };
  return tinted.canvas;
}

type LogoSizing = Readonly<{ block: number; ink: string; size: number; tint: boolean }>;

/**
 * The logo ready to draw on a frame: blocks at the block size the logo's box
 * gives, and the crisp copy in its ink or its own colours. The renderer sizes
 * the box the same way, so blocks land exactly on the crisp mark.
 */
export function prepareLogoFrame(
  resourceRef: string,
  image: HTMLImageElement,
  logo: LogoSizing,
  frameWidth: number,
  frameHeight: number,
): Readonly<{ art: LogoArt; crisp: OffscreenCanvas | null }> | null {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;
  const aspect = naturalHeight / naturalWidth;
  let width = (frameWidth * logo.size) / 100;
  if (width * aspect > frameHeight * 0.86) width = (frameHeight * 0.86) / aspect;
  const art = logoArtFor(resourceRef, image, width / logo.block);
  if (!art) return null;
  return { art, crisp: logo.tint ? tintedCrisp(art, logo.ink) : art.crisp };
}
