import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "@playwright/test";

const inspectorUi = resolve(dirname(new URL(import.meta.url).pathname), "..");
const port = 4174;
const url = `http://127.0.0.1:${port}/dashboard`;
async function ready() { for (let i = 0; i < 60; i += 1) { try { if ((await fetch(url)).ok) return; } catch { /* booting */ } await wait(250); } throw new Error("inspector-ui smoke server did not start"); }
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], { cwd: inspectorUi, stdio: "ignore", env: { ...process.env, VITE_USE_FIXTURES: "true" } });
try {
  await ready();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const externalRequests = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:")) externalRequests.push(request.url()); });
  await page.goto(url);
  if (await page.getByRole("button", { name: "知识工作台" }).count()) throw new Error("legacy mode still visible");
  await page.getByRole("button", { name: "查询与搜索" }).click();
  await page.getByTestId("query-shell").waitFor();
  await page.getByRole("textbox").fill("当前知识库最需要关注什么？");
  await page.getByRole("textbox").press("Enter");
  await page.getByText("Fixture response").waitFor();
  await page.getByRole("button", { name: "知识宇宙" }).click();
  await page.locator(".universe-explorer").waitFor();
  if (await page.locator("[data-filter]").count()) throw new Error("legacy universe filters still visible");
  if (await page.getByRole("button", { name: "Overview" }).count()) throw new Error("legacy Overview control still visible");
  await page.getByRole("switch", { name: "Layer layout" }).waitFor();
  if (externalRequests.length) throw new Error(`unexpected external requests: ${externalRequests.join(", ")}`);
  await browser.close();
  console.log("inspector-ui smoke passed: two modes, fixture query, fixture universe, no external requests");
} finally { server.kill("SIGTERM"); }
