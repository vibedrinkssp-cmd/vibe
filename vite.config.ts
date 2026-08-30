import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@/integrations/supabase/client": path.resolve(
        __dirname,
        "./src/integrations/supabase/client-safe"
      ),
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@assets": path.resolve(__dirname, "./src/assets"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    watch: {
      ignored: ['**/.env', '**/.env.*'],
    },
  },
  optimizeDeps: {
    exclude: ['@vladmandic/human'],
  },
}));
