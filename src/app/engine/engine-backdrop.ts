/**
 * The backdrop: a quiet field of small marks in every empty cell, held back
 * from the subject by a clear margin so the subject reads as lifted off the
 * screen, the way the reference films surround a figure with bare background.
 */

/**
 * Grows the occupied mask by `radius` cells in every direction (a square
 * neighbourhood). Two separable window passes keep it linear in grid size.
 */
export function dilateMask(
  occupied: Uint8Array,
  cols: number,
  rows: number,
  radius: number,
): Uint8Array {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return occupied;
  const across = new Uint8Array(cols * rows);
  const grown = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    const offset = row * cols;
    let count = 0;
    // Prime the window with the cells right of the first column.
    for (let column = 0; column <= Math.min(cols - 1, r); column += 1) {
      count += occupied[offset + column];
    }
    for (let column = 0; column < cols; column += 1) {
      across[offset + column] = count > 0 ? 1 : 0;
      const leaving = column - r;
      const entering = column + r + 1;
      if (leaving >= 0) count -= occupied[offset + leaving];
      if (entering < cols) count += occupied[offset + entering];
    }
  }
  for (let column = 0; column < cols; column += 1) {
    let count = 0;
    for (let row = 0; row <= Math.min(rows - 1, r); row += 1) {
      count += across[row * cols + column];
    }
    for (let row = 0; row < rows; row += 1) {
      grown[row * cols + column] = count > 0 ? 1 : 0;
      const leaving = row - r;
      const entering = row + r + 1;
      if (leaving >= 0) count -= across[leaving * cols + column];
      if (entering < rows) count += across[entering * cols + column];
    }
  }
  return grown;
}
