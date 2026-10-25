import type { PackedGraph } from "@/types/PackedGraph";

export interface InvalidCellReference {
  id: number;
  cells: number[];
}

export function repairCultureReferences(
  cells: Pick<PackedGraph["cells"], "culture">,
  cultures: readonly ({ removed?: boolean } | undefined)[]
): InvalidCellReference[] {
  const invalid = new Map<number, number[]>();
  for (let cell = 0; cell < cells.culture.length; cell++) {
    const id = cells.culture[cell];
    if (cultures[id] && !cultures[id].removed) continue;
    const affected = invalid.get(id);
    if (affected) affected.push(cell);
    else invalid.set(id, [cell]);
    cells.culture[cell] = 0;
  }
  return Array.from(invalid, ([id, cells]) => ({ id, cells }));
}

export interface InvalidRouteReference {
  id: number;
  from: number;
  to: number;
}

export function repairRouteReferences(
  links: PackedGraph["cells"]["routes"],
  routeIds: ReadonlySet<number>
): InvalidRouteReference[] {
  const invalid: InvalidRouteReference[] = [];
  for (const from in links) {
    const neighbors = links[+from];
    if (!neighbors) continue;
    if (Object.keys(neighbors).length === 0) {
      delete links[+from];
      continue;
    }
    for (const to in neighbors) {
      const id = neighbors[+to];
      if (routeIds.has(id)) continue;
      invalid.push({ id, from: +from, to: +to });
      delete neighbors[+to];
    }
  }
  return invalid;
}
