import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
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
