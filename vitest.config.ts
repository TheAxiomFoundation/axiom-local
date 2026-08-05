import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration-heavy suite: CLI tests spawn bun + compile wasm slices,
    // and the setup tests drive real git fixtures. The 5s default flakes
    // under load; a hang still dies here.
    testTimeout: 30_000,
  },
});
