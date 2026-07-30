import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    colorScheme: "dark",
    locale: "zh-CN",
    // Reduced motion is the accessibility-safe baseline. Rotation is opt-in;
    // the rotation-specific test opts back in via page.emulateMedia.
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    command: "VITE_USE_FIXTURES=true npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/dashboard",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
