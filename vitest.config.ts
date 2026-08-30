import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/integrations/supabase/client-safe"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
