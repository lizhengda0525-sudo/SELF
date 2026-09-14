import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 40000,
  use: {
    baseURL: "http://127.0.0.1:4182",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/test-server.mjs",
    url: "http://127.0.0.1:4182",
    reuseExistingServer: false,
  },
  reporter: [["list"]],
});
