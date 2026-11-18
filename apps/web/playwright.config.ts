import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
});
