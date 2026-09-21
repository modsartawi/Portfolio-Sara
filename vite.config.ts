import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Plain client-side SPA. No Cloudflare / vinext / workerd — the browser fetches the
// published Google-Sheet CSV at runtime (see lib/sheet.ts + app/page.tsx).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  server: { host: "0.0.0.0", port: 5173 },
  build: { outDir: "dist" },
});
