import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForFunction(() => !!window.__game);
  await page.locator("#menu-sound").click();
  await page.evaluate(() => window.__game.audio.loadingPromise);
  const samples = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.__game.audio.samples).map(([key, b]) => [
        key,
        b.duration,
      ]),
    ),
  );
  assert.equal(Object.keys(samples).length, 14);
  await page.evaluate(() => {
    const a = window.__game.audio;
    window.meter = a.context.createAnalyser();
    window.meter.fftSize = 2048;
    a.master.connect(window.meter);
  });
  const readPeak = () =>
    page.evaluate(async () => {
      let peak = 0;
      const data = new Float32Array(window.meter.fftSize);
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 30));
        window.meter.getFloatTimeDomainData(data);
        for (const v of data) peak = Math.max(peak, Math.abs(v));
      }
      return peak;
    });
  const musicPeak = await readPeak();
  assert.ok(musicPeak > 0.005, "menu audio too quiet: " + musicPeak);
  await page.mouse.move(1350, 100);
  await page.waitForTimeout(600);
  const moved = await page
    .locator(".menu-art")
    .evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(100, 800);
  await page.waitForTimeout(600);
  assert.notEqual(
    await page
      .locator(".menu-art")
      .evaluate((el) => getComputedStyle(el).transform),
    moved,
  );
  await page.screenshot({ path: "output/playwright/menu-parallax.png" });
  await page.evaluate(() => {
    const g = window.__game;
    g.settings.peaceful = true;
    g.start(42);
    g.state.voiceAt = 1000;
  });
  await page.waitForTimeout(1500);
  await page.keyboard.down("KeyW");
  const stepPeak = await readPeak();
  await page.keyboard.up("KeyW");
  assert.ok(stepPeak > 0.03, "walking steps too quiet: " + stepPeak);
  await page.waitForTimeout(1500);
  const idlePeak = await readPeak();
  assert.ok(idlePeak < stepPeak * 0.15, "ambient masks footsteps");
  const doorSounds = await page.evaluate(() => {
    const g = window.__game,
      calls = [],
      original = g.audio.door.bind(g.audio);
    g.audio.door = (open, ...rest) => {
      calls.push(open);
      return original(open, ...rest);
    };
    const d = g.level.doors[0];
    g.state.player = {
      x: d.x + d.nx,
      z: d.z + d.nz,
      yaw: Math.atan2(d.nx, d.nz),
    };
    g.interact();
    g.interact();
    g.audio.door = original;
    return calls;
  });
  assert.deepEqual(doorSounds, [true, false]);
  const locked = await page.evaluate(() => {
    const g = window.__game,
      d = g.level.apartments.find((d) => d.locked);
    g.state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(d.nx, d.nz) };
    g.interact();
    return {
      hidden: !!g.state.hiddenDoor,
      text: document.getElementById("subtitle").textContent,
    };
  });
  assert.equal(locked.hidden, false);
  assert.ok(locked.text.includes("Заперто"));
  await page.evaluate(() => window.__game.toMenu());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(1400, 50);
  await page.waitForTimeout(1200);
  const reduced = await page
    .locator("#menu")
    .evaluate((el) => parseFloat(el.style.getPropertyValue("--parallax-x")));
  assert.ok(Math.abs(reduced) < 0.2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS sample decoding, audible menu and real walking steps, quiet idle, locked apartments, parallax/reduced motion",
    { samples, musicPeak, stepPeak, idlePeak },
  );
} finally {
  await browser.close();
}
