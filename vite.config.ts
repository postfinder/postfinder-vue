/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: "src/index.ts", name: "PostFinderVue", fileName: "index" },
    rollupOptions: {
      // Vue stays a peer: bundling it gives a consumer two Vues, and the
      // symptoms of that are hard to trace back to this package.
      external: ["vue"],
      output: { globals: { vue: "Vue" } },
    },
  },
  test: { environment: "jsdom", globals: true },
});
