import { rn } from "./numberUtils";

export interface GridDimensions {
  spacing: number;
  cellsX: number;
  cellsY: number;
}

/** The rounded spacing and edge exclusion used by Grid generation; invalid requests have no estimate. */
export function getGridDimensions(width: number, height: number, cellsDesired: number): GridDimensions | null {
  if ([width, height, cellsDesired].some(value => !Number.isFinite(value) || value <= 0)) return null;

  const spacing = rn(Math.sqrt((width * height) / cellsDesired), 2);
  if (!Number.isFinite(spacing) || spacing <= 0) return null;

  const count = (size: number) => Math.floor((size + 0.5 * spacing - 1e-10) / spacing);
  const cellsX = count(width);
  const cellsY = count(height);
  if ([cellsX, cellsY].some(value => !Number.isSafeInteger(value) || value < 0)) return null;

  return { spacing, cellsX, cellsY };
}
