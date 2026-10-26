// A failed replacement can leave mixed globals. Releasing its I/O lease does not make them safe to save.
let stable = true;

export function isMapModelStable(): boolean {
  return stable;
}

export function markMapModelUnstable(): void {
  stable = false;
}

export function markMapModelStable(): void {
  stable = true;
}
