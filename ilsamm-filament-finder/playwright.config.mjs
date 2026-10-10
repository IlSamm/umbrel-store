import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:18766",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "python tests/serve_fixture.py",
    url: "http://127.0.0.1:18766/api/health",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "firefox",
      use: { browserName: "firefox", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "webkit",
      use: { browserName: "webkit", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        browserName: "chromium",
      },
    },
  ],
});
