import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed at the domain root (username.github.io), so base stays "/".
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    // The corpus index is fetched at runtime from /corpus, never bundled.
    assetsInlineLimit: 2048,
  },
});
