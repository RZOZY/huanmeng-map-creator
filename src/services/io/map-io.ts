export type MapIOKind = "save" | "load" | "generate";

export interface MapIOLease {
  readonly kind: MapIOKind;
  release(): void;
}

let owner: MapIOLease | null = null;

export function beginMapIO(kind: MapIOKind): MapIOLease | null {
  if (owner) return null;
  const lease: MapIOLease = {
    kind,
    release() {
      if (owner === lease) owner = null;
    }
  };
  owner = lease;
  return lease;
}

export function isMapIOBusy(): boolean {
  return owner !== null;
}
