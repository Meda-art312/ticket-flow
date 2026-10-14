import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: "artifacts/test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
    ["json", { outputFile: "artifacts/playwright-results.json" }],
  ],
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    permissions: ["clipboard-read", "clipboard-write"],
    baseURL: process.env.BASE_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
});
