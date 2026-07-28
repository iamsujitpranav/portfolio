import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest runs the React/DOM half of the app. WebGL components (the journey
// scene, HeroCanvas) are deliberately out of scope — jsdom has no GPU — so the
// suite covers the pure logic under src/lib and the plain-DOM components.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the tsconfig `paths` so imports resolve the same way they do in Next.
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@content": path.resolve(__dirname, "content"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // The game tests play real rounds against the AI's 380ms "thinking" delay,
    // so they need more headroom than the 5s default once files run in parallel.
    testTimeout: 20_000,
  },
});
