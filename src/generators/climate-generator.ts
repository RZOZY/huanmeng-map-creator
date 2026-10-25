declare global {
  var Climate: ClimateModule;
}

class ClimateModule {
  /** Rebuild climate-dependent data on the current graph, preserving the terrain. */
  regenerate(): void {
    Temperature.generate();
    Precipitation.generate();

    const heights = pack.cells.h.slice();
    try {
      Rivers.generate();
      Rivers.specify();
    } finally {
      pack.cells.h = heights;
    }

    Biomes.define();
    Features.defineGroups();
    Features.defineNames();
    Ice.generate();
  }
}

// biome-ignore lint/suspicious/noRedeclare: legacy global and module export
export const Climate = new ClimateModule();
window.Climate = Climate;
