import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["extension/test/**/*.test.js"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});
