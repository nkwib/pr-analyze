import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/index.ts", "src/cli.ts"],
      thresholds: {
        lines: 70,
        statements: 70,
        branches: 65,
        functions: 70,
      },
    },
  },
});
