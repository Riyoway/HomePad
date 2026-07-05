import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    // Dynamic dev-server port: override with PORT, otherwise fall back to the
    // next free port instead of hard-failing when 1420 is taken.
    // Note: `tauri dev` still pins devUrl to 1420 in tauri.conf.json, so keep
    // 1420 free (or update devUrl) when driving the app through Tauri.
    port: Number(process.env.PORT) || 1420,
    strictPort: false,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
  },
});
