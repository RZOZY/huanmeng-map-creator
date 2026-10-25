import { defineConfig } from "vitest/config";

// Native UI tests mock Electron APIs and need neither a window nor the Electron binary.
export default defineConfig({
  test: {
    environment: "node",
    include: ["electron/**/*.test.ts"]
  }
});
