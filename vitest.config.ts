import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    resolveSnapshotPath: (testPath, snapExtension) => {
      const relative = path.relative(path.join(__dirname, "src"), testPath);
      const base = relative.replace(/\.test\.ts$/, "");
      return path.join(__dirname, "src", `${base}${snapExtension}`);
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
