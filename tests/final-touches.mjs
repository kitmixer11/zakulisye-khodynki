import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch({ channel: "chrome", headless: true }),
  p = await b.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto("http://127.0.0.1:5173/");
  await p.waitForFunction(() => !!window.__game);
  await p.locator("#menu-sound").click();
  await p.waitForFunction(
    () => window.__game.audio.context?.state === "running",
  );
  await p.evaluate(() => window.__game.audio.loadingPromise);
  const audio = await p.evaluate(() => {
    const a = window.__game.audio;
    return {
      mode: a.mode,
      clips: Object.fromEntries(
        Object.entries(a.bundled).map(([key, b]) => [key, b.duration]),
      ),
    };
  });
  assert.equal(audio.mode, "menu");
  assert.equal(Object.keys(audio.clips).length, 3);
  console.log("Audio decoded", audio);
  await p.locator("#start").click();
  assert.equal(await p.evaluate(() => window.__game.state.screen), "intro");
  await p.waitForTimeout(1100);
  await p.screenshot({ path: "output/playwright/story-intro.png" });
  assert.ok(
    (await p.locator("#story-text").textContent()).includes("изрядно навеселе"),
  );
  await p.locator("#story-next").click();
  assert.ok(
    (await p.locator("#story-text").textContent()).includes("чужие шаги"),
  );
  await p.locator("#story-next").click();
  assert.ok(
    (await p.locator("#story-text").textContent()).includes(
      "Закулисье Ходынки",
    ),
  );
  await p.locator("#story-next").click();
  await p.waitForFunction(
    () => document.getElementById("intro-video").readyState >= 2,
  );
  if (await p.locator("#video-play").isVisible())
    await p.locator("#video-play").click();
  await p.waitForFunction(
    () => document.getElementById("intro-video").currentTime > 0.2,
  );
  const video = await p.locator("#intro-video").evaluate((v) => ({
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
    paused: v.paused,
  }));
  assert.ok(!video.paused);
  console.log("Video playback", video);
  await p.locator("#intro-video").evaluate((v) => {
    v.currentTime = 8;
  });
  await p.waitForFunction(
    () =>
      document.getElementById("intro-video").currentTime >= 8 &&
      !document.getElementById("intro-video").seeking,
  );
  await p.screenshot({ path: "output/playwright/story-video.png" });
  await p.evaluate(() => {
    const v = document.getElementById("intro-video");
    v.currentTime = v.duration - 0.25;
  });
  await p.waitForFunction(() => window.__game.state.screen === "playing");
  assert.ok(await p.evaluate(() => window.__game.state.elapsed < 2));
  assert.equal(await p.evaluate(() => window.__game.audio.mode), "game");
  const events = await p.evaluate(() => {
    const a = window.__game.audio;
    a.stopVoice();
    a.nextEventAt = 0;
    const first = a.playEvent("behind-door", 100, 1);
    const overlap = a.playEvent("shot", 100, 1);
    a.stopVoice();
    const cooldown = a.playEvent("back-off", 101, 1);
    a.nextEventAt = 0;
    const second = a.playEvent("shot", 130, 1);
    a.stopVoice();
    return { first, overlap, cooldown, second };
  });
  assert.deepEqual(events, {
    first: true,
    overlap: false,
    cooldown: false,
    second: true,
  });
  await p.evaluate(() => {
    const g = window.__game,
      e = g.level.edges[0];
    g.state.player = { ...g.level.start };
    g.state.elapsed = 40;
    g.state.screen = "playing";
    g.settings.peaceful = false;
    Object.assign(g.monster, {
      state: "chase",
      x: g.state.player.x + e.dx * 8,
      z: g.state.player.z + e.dz * 8,
      memory: 6,
    });
    g.updatePlayer(0);
    g.updateEnemy(0.02);
  });
  await p.waitForFunction(() => window.__game.state.alarm);
  await p.waitForTimeout(650);
  assert.ok(
    await p.evaluate(
      () =>
        window.__game.world.scene.children.find((o) => o.isHemisphereLight)
          .color.r >
        window.__game.world.scene.children.find((o) => o.isHemisphereLight)
          .color.g *
          2,
    ),
  );
  await p.screenshot({ path: "output/playwright/red-chase.png" });
  await p.evaluate(() => {
    const g = window.__game,
      d = g.level.apartments[1];
    Object.assign(g.monster, {
      state: "lurking",
      ambushDoor: d,
      x: d.cx,
      z: d.cz,
    });
    g.state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(d.nx, d.nz) };
    g.interact();
  });
  assert.equal(await p.evaluate(() => window.__game.state.screen), "caught");
  assert.ok(
    await p.evaluate(() => {
      const a = window.__game.audio;
      return (
        a.scareSource?.buffer === a.samples.screamer &&
        a.samples.screamer.duration > 9
      );
    }),
  );
  await p.waitForFunction(() => window.__game.state.screen === "lost");
  assert.ok(
    await p.evaluate(() => !!window.__game.audio.scareSource),
    "result screen must not cut off the clip",
  );
  await p.evaluate(() => {
    const g = window.__game;
    g.start(17);
    if (g.audio.scareSource) throw Error("screamer leaked into new run");
    g.settings.peaceful = true;
    const d = g.level.home;
    g.state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(d.nx, d.nz) };
    g.interact();
  });
  assert.equal(await p.evaluate(() => window.__game.state.screen), "ending");
  await p.waitForTimeout(1100);
  await p.screenshot({ path: "output/playwright/story-ending.png" });
  assert.ok((await p.locator("#story-text").textContent()).includes("логова"));
  await p.locator("#story-next").click();
  assert.ok(
    (await p.locator("#story-text").textContent()).includes(
      "Но сначала — полежать.",
    ),
  );
  await p.locator("#story-next").click();
  assert.equal(await p.evaluate(() => window.__game.state.screen), "won");
  assert.deepEqual(errors, []);
  console.log(
    "PASS approved story, fades, actual MP4 playback/end-to-game, bundled MP3, event cooldown/overlap, red lights, apartment ambush death, approved ending",
  );
} finally {
  await b.close();
}
