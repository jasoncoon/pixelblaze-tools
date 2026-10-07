import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // Relative asset URLs, so the built page can be served from any path.
  base: "./",
  plugins: [preact()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    // Monaco is most of the bundle; for a local tool that is fine.
    chunkSizeWarningLimit: 4000,
  },
});
