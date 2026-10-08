import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/application/state/CampaignContext",
        replacement: fileURLToPath(new URL("./fixtures.ts", import.meta.url)),
      },
      {
        find: "../api/analyticsApi",
        replacement: fileURLToPath(new URL("./fixtures.ts", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("../../src", import.meta.url)),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5179,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
