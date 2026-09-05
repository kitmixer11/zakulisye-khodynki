import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("output/playwright", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForFunction(() => !!window.__game);
  await page.screenshot({ path: "output/playwright/khodynka-menu.png" });
  assert.equal(await page.title(), "Закулисье Ходынки");
  assert.equal(await page.locator("#menu nav button").count(), 4);
  await page.getByRole("button", { name: "Управление", exact: true }).click();
  assert.ok(
    await page
      .getByRole("heading", { name: "Как добраться домой" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Понятно" }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Без монстра").check();
  await page.locator("summary").click();
  const samples = 22050,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / 22050) * 440 * Math.PI * 2) * 1000),
      44 + i * 2,
    );
  await page.locator("#voice-files").setInputFiles({
    name: "test-voice.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await page.waitForFunction(() =>
    document
      .getElementById("voice-status")
      .textContent.includes("Загружено реплик: 1"),
  );
  await page.getByRole("button", { name: "Готово" }).click();
  await page.getByRole("button", { name: "Новая игра", exact: true }).click();
  await page.getByRole("button", { name: "Пропустить вступление" }).click();
  await page.waitForFunction(() => window.__game.state.screen === "playing");
  const before = await page.evaluate(() => ({ ...window.__game.state.player }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(550);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => window.__game.state.player);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5);
  await page.screenshot({ path: "output/playwright/khodynka-corridor.png" });
  await page.keyboard.press("KeyF");
  assert.equal(
    await page.evaluate(() => window.__game.state.flashlight),
    false,
  );
  await page.keyboard.press("KeyF");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__game.state.screen === "paused");
  const paused = await page.evaluate(() => window.__game.state.elapsed);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__game.state.elapsed), paused);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.evaluate(() => {
    const g = window.__game,
      d = g.level.apartments[0];
    g.state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(d.nx, d.nz) };
    g.updatePlayer(0);
    g.updateHud();
  });
  await page.keyboard.press("KeyE");
  assert.ok(await page.evaluate(() => !!window.__game.state.hiddenDoor));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "output/playwright/khodynka-hide.png" });
  await page.keyboard.press("KeyQ");
  assert.equal(await page.evaluate(() => window.__game.state.peek), true);
  await page.evaluate(() => {
    const g = window.__game,
      d = g.state.hiddenDoor;
    g.settings.peaceful = false;
    Object.assign(g.monster, {
      x: d.cx,
      z: d.cz,
      heading: Math.atan2(d.x - d.cx, d.z - d.cz),
      state: "patrol",
      distance: 2,
    });
    g.state.screen = "paused";
    g.updatePlayer(0);
  });
  await page.screenshot({ path: "output/playwright/khodynka-peephole.png" });
  assert.ok(await page.evaluate(() => window.__game.world.monsterMesh.visible));
  await page.evaluate(() => {
    const g = window.__game;
    g.settings.peaceful = true;
    g.state.screen = "playing";
  });
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyE");
  assert.equal(await page.evaluate(() => window.__game.state.hiddenDoor), null);
  const route = await page.evaluate(async () => {
    const L = await import("/src/level.js"),
      g = window.__game,
      home = g.level.home,
      path = L.findPath(g.level, g.state.player, { x: home.cx, z: home.cz });
    let steps = 0;
    for (const point of path) {
      let guard = 0;
      while (
        Math.hypot(point.x - g.state.player.x, point.z - g.state.player.z) >
        0.03
      ) {
        if (++guard > 350) throw Error("Stuck on route");
        const dx = point.x - g.state.player.x,
          dz = point.z - g.state.player.z,
          dist = Math.hypot(dx, dz);
        g.state.player.yaw = Math.atan2(-dx, -dz);
        const door = L.nearestDoor(g.level, g.state.player);
        if (door?.kind === "passage" && !door.open) g.interact();
        L.moveWithCollision(
          g.level,
          g.state.player,
          (dx / dist) * Math.min(0.06, dist),
          (dz / dist) * Math.min(0.06, dist),
        );
        steps++;
      }
    }
    g.state.player.yaw = Math.atan2(home.nx, home.nz);
    g.interact();
    return { screen: g.state.screen, steps, gates: g.state.opened.size };
  });
  assert.equal(route.screen, "ending");
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  assert.ok(route.gates > 0);
  await page.screenshot({ path: "output/playwright/khodynka-win.png" });
  await page.getByRole("button", { name: "Ещё одна ночь" }).click();
  await page.getByRole("button", { name: "Пропустить вступление" }).click();
  assert.equal(await page.evaluate(() => window.__game.state.opened.size), 0);
  await page.evaluate(() => {
    const g = window.__game;
    g.settings.peaceful = false;
    g.state.elapsed = 35;
    Object.assign(g.monster, {
      x: g.state.player.x,
      z: g.state.player.z,
      state: "chase",
    });
    g.updateEnemy(0.016);
  });
  await page.waitForFunction(() => window.__game.state.screen === "lost");
  assert.ok(await page.getByRole("heading", { name: "Не успел." }).isVisible());
  await page.getByRole("button", { name: "Главное меню", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "output/playwright/khodynka-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS menu, assets, WAV decoding, controls, flashlight, pause, hiding, live peephole, full home route, passage doors, victory, restart, defeat, mobile layout",
    route,
  );
} finally {
  await browser.close();
}
