import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  resolve: {
    // The renderer imports shared types as "@shared/..." instead of climbing out of its folders.
    alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) },
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
  test: {
    root: ".",
    include: ["src/**/*.test.{ts,tsx}"],
    // Renderer tests opt into jsdom with a `@vitest-environment jsdom` docblock.
  },
});
