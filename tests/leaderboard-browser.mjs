import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const file = resolve("output/leaderboard-test-" + randomUUID() + ".json");
const server = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, PORT: "4191", LEADERBOARD_FILE: file },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((ok, fail) => {
  server.stdout.once("data", ok);
  server.once("error", fail);
  server.once("exit", (code) => fail(Error("server exited " + code)));
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const first = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    page = await first.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = { ...route.request().headers() };
    delete headers.origin;
    delete headers.host;
    await route.fulfill({
      response: await route.fetch({
        url: "http://127.0.0.1:4191" + url.pathname,
        headers,
      }),
    });
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForFunction(() => !!window.__game);
  await page.locator("#nickname").fill("Суслик");
  await page.locator("#nickname").blur();
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  assert.equal(await page.locator("#nickname").inputValue(), "Суслик");
  await page.locator("#start").click();
  await page.locator("#story-skip").click();
  await page.waitForTimeout(650);
  const before = await page.locator("#run-timer").textContent();
  assert.notEqual(before, "00:00.00");
  await page.evaluate(() => window.__game.pause());
  const paused = await page.evaluate(() => window.__game.state.runSeconds);
  await page.waitForTimeout(1000);
  assert.equal(
    await page.evaluate(() => window.__game.state.runSeconds),
    paused,
  );
  await page.evaluate(() => window.__game.resume());
  await page.waitForTimeout(9800);
  await page.evaluate(() => {
    const g = window.__game,
      d = g.level.home;
    g.state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(d.nx, d.nz) };
    g.interact();
  });
  await page.waitForFunction(() =>
    window.__game.leaderboard.run.status.includes("рекорд записан"),
  );
  const frozen = await page.evaluate(() => window.__game.state.runSeconds);
  await page.waitForTimeout(350);
  assert.equal(
    await page.evaluate(() => window.__game.state.runSeconds),
    frozen,
  );
  await page.evaluate(() => window.__game.toMenu());
  await page.locator("#leaderboard-open").click();
  await page.getByRole("cell", { name: "Суслик", exact: true }).waitFor();
  await page.screenshot({ path: "output/playwright/leaderboard.png" });
  const second = await browser.newContext(),
    other = await second.newPage();
  await other.goto("http://127.0.0.1:4191/");
  await other.locator("#leaderboard-open").click();
  await other.getByRole("cell", { name: "Суслик", exact: true }).waitFor();
  assert.equal(await other.locator("#leaderboard-rows tr").count(), 1);
  const range = await other.request.get(
    "http://127.0.0.1:4191/assets/video/intro.mp4",
    { headers: { Range: "bytes=0-99" } },
  );
  assert.equal(range.status(), 206);
  assert.equal((await range.body()).length, 100);
  await page.evaluate(() => {
    const g = window.__game;
    g.settings.peaceful = true;
    g.start(42);
    g.settings.peaceful = false;
    const d = g.level.home;
    g.state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(d.nx, d.nz) };
    g.interact();
  });
  assert.ok(
    await page.evaluate(() =>
      window.__game.leaderboard.run.status.includes("вне рейтинга"),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS nickname persistence, live timer/pause/final freeze, real API win submission, shared ranking in second browser, peaceful exclusion, MP4 ranges",
  );
} finally {
  await browser.close();
  server.kill();
  await new Promise((r) =>
    server.exitCode !== null ? r() : server.once("exit", r),
  );
  rmSync(file, { force: true });
}
