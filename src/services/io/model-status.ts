// A failed replacement can leave mixed globals. Releasing its I/O lease does not make them safe to save.
let stable = true;
let epoch = 0;

/** A replacement fence, not a change counter or a persisted map identity. */
export function getMapModelEpoch(): number {
  return epoch;
}

export function isMapModelStable(): boolean {
  return stable;
}

export function markMapModelUnstable(): void {
  epoch += 1;
  stable = false;
}

export function markMapModelStable(): void {
  stable = true;
}
