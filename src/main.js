import "./style.css";
import { createWorld } from "./world.js";
import { GameAudio } from "./audio.js";
import { Cinematics } from "./cinematics.js";
import { Leaderboard, raceTime } from "./leaderboard.js";
import {
  createLevel,
  CELL,
  HOME_NUMBER,
  nearestDoor,
  moveWithCollision,
  doorCoordinates,
  lineOfSight,
} from "./level.js";
import { createMonster, noticeHiding, updateMonster } from "./monster.js";
const $ = (id) => document.getElementById(id),
  audio = new GameAudio();
const leaderboard = new Leaderboard();
let world;
try {
  world = await createWorld($("game"));
} catch (error) {
  $("fatal").hidden = false;
  $("fatal-detail").textContent =
    "Проверь, что браузер поддерживает WebGL 2 и файлы игры доступны. " +
    error.message;
  throw error;
}
let level = createLevel(78413),
  monster = createMonster(level);
const settings = {
  volume: 60,
  sensitivity: 80,
  vhs: true,
  bobbing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  peaceful: false,
};
try {
  const saved = JSON.parse(localStorage.getItem("khodynka-settings") || "{}");
  for (const k of Object.keys(settings))
    if (typeof saved[k] === typeof settings[k]) settings[k] = saved[k];
} catch {}
settings.volume = Math.max(0, Math.min(100, settings.volume));
settings.sensitivity = Math.max(20, Math.min(180, settings.sensitivity));
const state = {
  screen: "menu",
  player: { ...level.start },
  pitch: 0,
  elapsed: 0,
  stamina: 100,
  exhausted: false,
  running: false,
  flashlight: true,
  threat: 0,
  hiddenDoor: null,
  peek: false,
  peekYaw: 0,
  peekPitch: 0,
  doorCloseAt: 0,
  voiceAt: 22,
  subtitleUntil: 0,
  stepAt: 0,
  monsterStepAt: 0,
  heartbeatAt: 0,
  hadLock: false,
  scareTime: 0,
  opened: new Set(),
  lastChaseLine: -30,
  monsterVisible: false,
  alarm: false,
  hideEventAt: Infinity,
};
let menuMusicEnabled = true;
const cinematic = new Cinematics({
  onComplete: (kind) => (kind === "intro" ? start() : showResult(true)),
  onMode: (mode) => audio.setMode(mode),
  volume: () => settings.volume / 100,
});
function beginIntro() {
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  clearInput();
  state.screen = "intro";
  $("menu").hidden = true;
  $("hud").hidden = true;
  $("scare").hidden = true;
  document.body.classList.remove("hidden-room", "peeking");
  document.exitPointerLock?.();
  audio.init();
  cinematic.begin("intro");
}
function updateMusicButton() {
  const ready = audio.context?.state === "running";
  $("menu-sound").textContent = !ready
    ? "♫ Нажми, чтобы включить звук"
    : menuMusicEnabled
      ? "♫ Музыка: вкл."
      : "♫ Музыка: выкл.";
  $("menu-sound").setAttribute(
    "aria-pressed",
    String(ready && menuMusicEnabled),
  );
}
function unlockMenuAudio(e) {
  if (e.target.closest?.("#menu-sound") || state.screen !== "menu") return;
  audio.init();
  audio.setMode(menuMusicEnabled ? "menu" : "silent");
  updateMusicButton();
}
window.addEventListener("pointerdown", unlockMenuAudio, { capture: true });
window.addEventListener("keydown", unlockMenuAudio, { capture: true });
$("menu-sound").onclick = () => {
  if (audio.context?.state !== "running") menuMusicEnabled = true;
  else menuMusicEnabled = !menuMusicEnabled;
  audio.init();
  audio.setMode(menuMusicEnabled ? "menu" : "silent");
  updateMusicButton();
};
const menuMotion = { x: 0, y: 0, targetX: 0, targetY: 0 };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
$("menu").addEventListener("pointermove", (e) => {
  if (reducedMotion.matches || e.pointerType === "touch") return;
  menuMotion.targetX = (e.clientX / innerWidth - 0.5) * 2;
  menuMotion.targetY = (e.clientY / innerHeight - 0.5) * 2;
});
$("menu").addEventListener("pointerleave", () => {
  menuMotion.targetX = menuMotion.targetY = 0;
});
const keys = new Set();
let lastTime = performance.now(),
  uiTimer = 0,
  dragging = false,
  lastTouch = null,
  quipIndex = 0;
const quips = [
  "Сорок седьмая. Я же точно живу в сорок седьмой.",
  "Чат, у нас всегда был такой длинный коридор?",
  "Я не заблудился. Просто подъезд поменялся.",
  "Лишь бы ключ подошёл. Лишь бы ключ подошёл.",
  "Кто опять оставил свет в подъезде на всю ночь?",
];
function applySettings() {
  for (const [k, v] of Object.entries(settings)) {
    if (typeof v === "boolean") $(k).checked = v;
    else $(k).value = v;
  }
  $("volume-value").textContent = settings.volume + "%";
  $("sensitivity-value").textContent = (settings.sensitivity / 80).toFixed(1);
  $("grain").hidden = !settings.vhs;
  audio.setVolume(settings.volume / 100);
  $("intro-video").volume = settings.volume / 100;
  try {
    localStorage.setItem("khodynka-settings", JSON.stringify(settings));
  } catch {}
}
applySettings();
for (const k of Object.keys(settings))
  $(k).addEventListener("input", (e) => {
    settings[k] =
      typeof settings[k] === "boolean"
        ? e.target.checked
        : Number(e.target.value);
    applySettings();
    if (k === "peaceful" && settings.peaceful) leaderboard.disqualify();
  });
function dialog(id) {
  $(id).showModal();
  $(id).querySelector("button,input")?.focus();
}
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => $(b.dataset.close).close();
$("settings-open").onclick = () => dialog("settings");
$("help-open").onclick = () => dialog("help");
$("leaderboard-open").onclick = () => {
  dialog("leaderboard");
  leaderboard.refresh();
};
$("pause-settings").onclick = () => dialog("settings");
$("voice-files").onchange = async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  e.target.disabled = true;
  $("voice-status").textContent = "Загрузка реплик…";
  try {
    const result = await audio.loadVoices(files);
    $("voice-status").textContent =
      `Загружено реплик: ${audio.voices.length}.` +
      (result.failed.length
        ? " Не прочитаны: " + result.failed.join(", ")
        : "");
    $("voice-clear").hidden = !audio.voices.length;
  } catch (error) {
    $("voice-status").textContent = error.message;
  } finally {
    e.target.disabled = false;
    e.target.value = "";
  }
};
$("voice-clear").onclick = () => {
  audio.clearVoices();
  $("voice-status").textContent = "Реплики удалены.";
  $("voice-clear").hidden = true;
};
function say(text, duration = 5) {
  $("subtitle").textContent = text;
  $("subtitle").classList.add("visible");
  state.subtitleUntil = state.elapsed + duration;
}
function clearInput() {
  keys.clear();
  dragging = false;
  lastTouch = null;
  state.running = false;
}
function reset(seed) {
  level = createLevel(seed);
  monster = createMonster(level);
  world.rebuild(level);
  Object.assign(state, {
    player: { ...level.start },
    pitch: 0,
    elapsed: 0,
    runSeconds: 0,
    stamina: 100,
    exhausted: false,
    running: false,
    flashlight: true,
    threat: 0,
    hiddenDoor: null,
    peek: false,
    peekYaw: 0,
    peekPitch: 0,
    doorCloseAt: 0,
    voiceAt: 22,
    subtitleUntil: 0,
    stepAt: 0,
    monsterStepAt: 0,
    heartbeatAt: 0,
    hadLock: false,
    scareTime: 0,
    opened: new Set(),
    lastChaseLine: -30,
    monsterVisible: false,
    alarm: false,
    hideEventAt: Infinity,
  });
  clearInput();
  quipIndex = 0;
  $("scare").hidden = true;
  $("danger").style.opacity = 0;
  $("hide-info").hidden = true;
  $("interaction").hidden = true;
  $("subtitle").classList.remove("visible");
  $("tutorial").classList.remove("faded");
  document.body.classList.remove("hidden-room", "peeking");
}
function requestLook() {
  if (matchMedia("(pointer:coarse)").matches) return;
  try {
    $("game")
      .requestPointerLock?.()
      ?.catch(() => {
        if (state.screen === "playing" && !state.hiddenDoor)
          say("Для обзора зажми мышь. Стрелки тоже работают.", 4);
      });
  } catch {}
}
function start(seed = Date.now()) {
  cinematic.stop();
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  reset(seed);
  leaderboard.begin(settings.peaceful);
  state.screen = "playing";
  $("menu").hidden = true;
  $("hud").hidden = false;
  audio.init();
  audio.nextEventAt = 0;
  audio.nextBreathAt = 0;
  audio.setMode("game");
  say("Моя квартира — 47. Просто нужно дойти домой.", 6);
  requestLook();
  updatePlayer(0);
  updateHud();
}
function pause() {
  if (state.screen !== "playing") return;
  state.screen = "paused";
  clearInput();
  audio.setMode("pause");
  document.exitPointerLock?.();
  dialog("pause");
}
function resume() {
  if (state.screen !== "paused") return;
  $("pause").close();
  state.screen = "playing";
  audio.setMode("game");
  requestLook();
}
function toMenu() {
  audio.stopScare();
  cinematic.stop();
  state.screen = "menu";
  clearInput();
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  document.exitPointerLock?.();
  audio.setMode(menuMusicEnabled ? "menu" : "silent");
  $("scare").hidden = true;
  $("hud").hidden = true;
  $("menu").hidden = false;
  $("danger").style.opacity = 0;
  document.body.classList.remove("hidden-room", "peeking");
  $("start").focus();
}
$("start").onclick = beginIntro;
$("restart").onclick = beginIntro;
$("resume").onclick = resume;
$("pause-button").onclick = pause;
$("to-menu").onclick = toMenu;
$("result-menu").onclick = toMenu;
$("pause").addEventListener("cancel", (e) => {
  e.preventDefault();
  if (!$("settings").open) resume();
});
$("result").addEventListener("cancel", (e) => {
  e.preventDefault();
  toMenu();
});
function showResult(won) {
  $("scare").hidden = true;
  state.screen = won ? "won" : "lost";
  audio.setMode("silent");
  $("result-eyebrow").textContent = won ? "КВАРТИРА 47" : "ОН НАШЁЛ ТЕБЯ";
  $("result-title").textContent = won ? "Ты дома." : "Не успел.";
  $("result-description").textContent = won
    ? "Квартира 47 найдена."
    : "В следующий раз спрячься за дверью. И посмотри в глазок, прежде чем выйти.";
  $("result-stats").textContent =
    `${raceTime(state.runSeconds)} · ${state.opened.size} коридоров открыто`;
  $("record-status").textContent = won ? leaderboard.run?.status || "" : "";
  $("restart").textContent = won ? "Ещё одна ночь" : "Попробовать снова";
  dialog("result");
}
function finish(won) {
  if (state.screen !== "playing") return;
  clearInput();
  audio.stopVoice();
  document.exitPointerLock?.();
  $("interaction").hidden = true;
  document.body.classList.remove("hidden-room", "peeking");
  if (won) {
    if (settings.peaceful) leaderboard.disqualify();
    leaderboard.finish(state.runSeconds);
    state.screen = "ending";
    $("hud").hidden = true;
    cinematic.begin("ending");
  } else {
    state.screen = "caught";
    state.scareTime = 0;
    audio.caught();
    $("scare").hidden = false;
  }
}
function doorSound(open = true, volume = 1, pan = 0) {
  audio.door(open, volume, pan);
}
function interact() {
  if (state.screen !== "playing") return;
  if (state.hiddenDoor) {
    audio.stopVoice();
    state.hideEventAt = Infinity;
    const d = state.hiddenDoor;
    state.player = { x: d.cx, z: d.cz, yaw: Math.atan2(-d.nx, -d.nz) };
    state.hiddenDoor = null;
    state.peek = false;
    state.pitch = 0;
    d.open = false;
    document.body.classList.remove("hidden-room", "peeking");
    $("hide-info").hidden = true;
    state.voiceAt = Math.max(state.voiceAt, state.elapsed + 10);
    doorSound(false);
    updatePlayer(0);
    updateHud();
    return;
  }
  const d = nearestDoor(level, state.player);
  if (!d) return;
  if (d.kind === "passage") {
    if (d.open && Math.abs(doorCoordinates(d, state.player).normal) < 0.65) {
      say("Отойди от двери, чтобы закрыть её.", 2);
      return;
    }
    d.open = !d.open;
    if (d.open) state.opened.add(d.id);
    doorSound(d.open);
    updateHud();
    return;
  }
  if (d.home) {
    finish(true);
    return;
  }
  if (
    !settings.peaceful &&
    monster.ambushDoor?.id === d.id &&
    ["lurking", "emerging", "entering"].includes(monster.state)
  ) {
    d.open = true;
    state.player.x = d.roomX;
    state.player.z = d.roomZ;
    finish(false);
    return;
  }
  if (d.locked) {
    say("Заперто. Нужно другое укрытие.", 2);
    audio.tone(180, 0.08, 0.12, "triangle", 80);
    return;
  }
  noticeHiding(level, monster, d, state.player);
  state.hiddenDoor = d;
  state.peek = false;
  state.peekYaw = state.peekPitch = 0;
  state.player.x = d.roomX;
  state.player.z = d.roomZ;
  state.running = false;
  clearInput();
  d.open = true;
  state.doorCloseAt = state.elapsed + 0.45;
  audio.stopVoice();
  state.hideEventAt = state.elapsed + 1.1;
  $("subtitle").classList.remove("visible");
  state.subtitleUntil = 0;
  document.body.classList.add("hidden-room");
  $("hide-info").hidden = false;
  doorSound();
  updatePlayer(0);
  updateHud();
}
function togglePeek() {
  if (
    state.screen !== "playing" ||
    !state.hiddenDoor ||
    state.elapsed < state.doorCloseAt
  )
    return;
  state.peek = !state.peek;
  state.peekYaw = state.peekPitch = 0;
  document.body.classList.toggle("peeking", state.peek);
  updatePlayer(0);
  updateHud();
}
function toggleLight() {
  if (state.screen !== "playing" || state.hiddenDoor) return;
  state.flashlight = !state.flashlight;
  audio.tone(650, 0.035, 0.03);
}
$("peek-button").onclick = togglePeek;
$("leave-button").onclick = interact;
$("touch-use").onclick = interact;
$("touch-light").onclick = toggleLight;
function look(dx, dy) {
  if (state.screen !== "playing") return;
  const scale = (0.002 * settings.sensitivity) / 80;
  if (state.hiddenDoor) {
    state.peekYaw = Math.max(-0.4, Math.min(0.4, state.peekYaw - dx * scale));
    state.peekPitch = Math.max(
      -0.17,
      Math.min(0.17, state.peekPitch - dy * scale),
    );
  } else {
    state.player.yaw -= dx * scale;
    state.pitch = Math.max(-1.15, Math.min(1.15, state.pitch - dy * scale));
  }
}
window.addEventListener("keydown", (e) => {
  if (state.screen !== "playing") return;
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Space",
      "Tab",
    ].includes(e.code)
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyE") interact();
  if (e.code === "KeyQ") togglePeek();
  if (e.code === "KeyF") toggleLight();
  if (e.code === "Escape") {
    e.preventDefault();
    pause();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === $("game");
  if (!locked && state.hadLock && state.screen === "playing") pause();
  state.hadLock = locked;
});
window.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === $("game") || dragging)
    look(e.movementX, e.movementY);
});
$("game").addEventListener("pointerdown", (e) => {
  if (state.screen !== "playing") return;
  if (e.pointerType === "touch") {
    if (e.clientX > innerWidth * 0.4) {
      lastTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
      $("game").setPointerCapture(e.pointerId);
    }
  } else dragging = true;
});
$("game").addEventListener("pointermove", (e) => {
  if (lastTouch?.id === e.pointerId) {
    look((e.clientX - lastTouch.x) * 2.2, (e.clientY - lastTouch.y) * 2.2);
    lastTouch.x = e.clientX;
    lastTouch.y = e.clientY;
  }
});
window.addEventListener("pointerup", () => {
  dragging = false;
  lastTouch = null;
});
window.addEventListener("pointercancel", clearInput);
for (const b of document.querySelectorAll("[data-key]")) {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(event, () => keys.delete(b.dataset.key));
}
window.addEventListener("blur", pause);
window.addEventListener("blur", () => cinematic.suspend());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pause();
    cinematic.suspend();
  }
});
window.addEventListener("resize", world.resize);
function updatePlayer(dt) {
  if (state.hiddenDoor) {
    state.stamina = Math.min(100, state.stamina + 18 * dt);
    const d = state.hiddenDoor;
    const turn =
      (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
    state.peekYaw = Math.max(-0.4, Math.min(0.4, state.peekYaw + turn * dt));
    world.camera.position.set(
      state.peek ? d.x + d.nx * 0.19 : d.roomX,
      1.59,
      state.peek ? d.z + d.nz * 0.19 : d.roomZ,
    );
    world.camera.rotation.set(
      state.peekPitch,
      Math.atan2(-d.nx, -d.nz) + state.peekYaw,
      0,
      "YXZ",
    );
    world.camera.fov = state.peek ? 110 : 68;
    world.camera.updateProjectionMatrix();
    return;
  }
  const forward =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0),
    side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0),
    moving = !!(forward || side);
  state.player.yaw +=
    ((keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0)) *
    dt *
    1.65;
  if (state.stamina <= 0) state.exhausted = true;
  if (state.stamina > 25) state.exhausted = false;
  state.running =
    moving &&
    (keys.has("ShiftLeft") || keys.has("ShiftRight")) &&
    !state.exhausted &&
    state.stamina > 0;
  state.stamina = Math.max(
    0,
    Math.min(100, state.stamina + (state.running ? -22 : 13) * dt),
  );
  if (moving) {
    const speed =
        ((state.running ? 4.7 : 2.65) * dt) /
        Math.max(1, Math.hypot(forward, side)),
      s = Math.sin(state.player.yaw),
      c = Math.cos(state.player.yaw),
      x = state.player.x,
      z = state.player.z;
    moveWithCollision(
      level,
      state.player,
      (-s * forward + c * side) * speed,
      (-c * forward - s * side) * speed,
    );
    if (
      Math.hypot(state.player.x - x, state.player.z - z) > 0.001 &&
      state.elapsed > state.stepAt
    ) {
      audio.step(state.running);
      state.stepAt = state.elapsed + (state.running ? 0.3 : 0.49);
    }
  }
  const bob =
    settings.bobbing && moving
      ? Math.sin(state.elapsed * (state.running ? 15 : 10)) *
        (state.running ? 0.031 : 0.016)
      : 0;
  world.camera.position.set(state.player.x, 1.61 + bob, state.player.z);
  world.camera.rotation.set(state.pitch, state.player.yaw, 0, "YXZ");
  world.camera.fov +=
    ((state.running ? 74 : 70) - world.camera.fov) * (1 - Math.exp(-dt * 7));
  world.camera.updateProjectionMatrix();
}
function updateHud() {
  $("run-timer").textContent = raceTime(state.runSeconds || 0);
  $("stamina-bar").style.width = state.stamina + "%";
  $("stamina-bar").style.background = state.exhausted ? "#c49170" : "#c0c89f";
  $("danger").style.opacity = state.hiddenDoor ? 0 : state.threat * 0.45;
  $("tutorial").classList.toggle("faded", state.elapsed > 14);
  $("hide-info").hidden = !state.hiddenDoor;
  if (state.hiddenDoor) {
    $("hide-state").textContent = state.peek
      ? "Не выходи, пока он рядом"
      : "Ты в укрытии";
    $("peek-button").querySelector("span").textContent = state.peek
      ? "Отойти от глазка"
      : "Смотреть в глазок";
    $("interaction").hidden = true;
    return;
  }
  const door = nearestDoor(level, state.player);
  $("interaction").hidden = !door;
  if (door)
    $("interaction").querySelector("span").textContent =
      door.kind === "passage"
        ? door.open
          ? "Закрыть дверь"
          : "Открыть дверь"
        : door.home
          ? "47 · Открыть свою квартиру"
          : door.locked
            ? `${door.number} · Заперто`
            : `${door.number} · Спрятаться`;
}
function formatTime(v) {
  return `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(v % 60)
    .toString()
    .padStart(2, "0")}`;
}
function updateEnemy(dt) {
  const before = { x: monster.x, z: monster.z };
  const result = updateMonster(level, monster, state.player, dt, {
    elapsed: state.elapsed,
    hidden: !!state.hiddenDoor,
    hiddenDoor: state.hiddenDoor,
    running: state.running,
    peaceful: settings.peaceful,
    onDoor: (d) => {
      const distance = Math.hypot(d.x - state.player.x, d.z - state.player.z);
      if (distance < 18)
        doorSound(d.open, (1 - distance / 18) * (state.hiddenDoor ? 0.45 : 1));
    },
    onKnock: () => audio.tone(87, 0.14, 0.27, "triangle", 35),
    onChase: () => {
      if (state.elapsed - state.lastChaseLine > 18) {
        state.lastChaseLine = state.elapsed;
        say("Чат… я не один. Нужно спрятаться.", 3);
      }
    },
  });
  state.threat = result.threat;
  const camera = world.camera,
    dx = monster.x - camera.position.x,
    dz = monster.z - camera.position.z,
    dist = Math.hypot(dx, dz);
  const visible =
    (!state.hiddenDoor || state.peek) &&
    !["dormant", "lurking"].includes(monster.state) &&
    !settings.peaceful &&
    dist < 22 &&
    (-Math.sin(camera.rotation.y) * dx - Math.cos(camera.rotation.y) * dz) /
      Math.max(0.01, dist) >
      0.35 &&
    lineOfSight(level, camera.position, monster);
  if (visible && !state.monsterVisible)
    audio.playEvent(
      Math.random() < 0.5 ? "shot" : "back-off",
      state.elapsed,
      0.5,
    );
  state.monsterVisible = visible;
  state.alarm =
    !state.hiddenDoor && monster.state === "chase" && (visible || state.alarm);
  if (result.caught) {
    finish(false);
    return;
  }
  if (
    monster.state !== "dormant" &&
    monster.distance < 13 &&
    Math.hypot(monster.x - before.x, monster.z - before.z) > 0.001 &&
    state.elapsed > state.monsterStepAt
  ) {
    audio.tone(
      64,
      0.15,
      Math.max(0.01, (1 - monster.distance / 13) * 0.2),
      "triangle",
      27,
    );
    state.monsterStepAt =
      state.elapsed + (monster.state === "chase" ? 0.34 : 0.62);
  }
}
function tick(now) {
  requestAnimationFrame(tick);
  const realDt = Math.max(0, (now - lastTime) / 1000);
  const dt = Math.min(realDt, 0.05);
  lastTime = now;
  cinematic.update(dt);
  const relative =
    Math.atan2(
      monster.x - world.camera.position.x,
      monster.z - world.camera.position.z,
    ) - world.camera.rotation.y;
  audio.update(state.elapsed, {
    distance: monster.distance,
    pan: Math.sin(relative),
    hidden: !!state.hiddenDoor,
    lampDistance: Math.min(
      ...level.edges.flatMap((edge) => {
        const n = level.nodes[edge.from];
        return [1, 3, 5, 7].map((j) =>
          Math.hypot(
            state.player.x - (n.x + edge.dx * j) * CELL,
            state.player.z - (n.z + edge.dz * j) * CELL,
          ),
        );
      }),
    ),
    monsterActive: !settings.peaceful && monster.state !== "dormant",
  });
  if (["intro", "ending"].includes(state.screen)) return;
  if (state.screen === "menu") {
    const smoothing = 1 - Math.exp(-dt * 5);
    menuMotion.x +=
      ((reducedMotion.matches ? 0 : menuMotion.targetX) - menuMotion.x) *
      smoothing;
    menuMotion.y +=
      ((reducedMotion.matches ? 0 : menuMotion.targetY) - menuMotion.y) *
      smoothing;
    $("menu").style.setProperty("--parallax-x", menuMotion.x * -22 + "px");
    $("menu").style.setProperty("--parallax-y", menuMotion.y * -14 + "px");
    return;
  }
  if (state.screen === "caught") {
    state.scareTime += dt;
    if (state.scareTime > 0.85) showResult(false);
    return;
  }
  if (state.screen === "playing") {
    state.runSeconds += realDt;
    if (settings.peaceful) leaderboard.disqualify();
    state.elapsed += dt;
    if (state.hiddenDoor?.open && state.elapsed >= state.doorCloseAt) {
      state.hiddenDoor.open = false;
      doorSound(false);
    }
    updatePlayer(dt);
    updateEnemy(dt);
    if (state.screen === "playing") {
      if (state.hiddenDoor && state.elapsed >= state.hideEventAt) {
        state.hideEventAt = Infinity;
        audio.playEvent("behind-door", state.elapsed, 0.4);
      }
      if (state.elapsed >= state.voiceAt) {
        if (!state.hiddenDoor) {
          if (!audio.playVoice()) say(quips[quipIndex++ % quips.length]);
        }
        state.voiceAt = state.elapsed + 20 + Math.random() * 15;
      }
      if (state.elapsed > state.subtitleUntil)
        $("subtitle").classList.remove("visible");
      if (
        (state.hiddenDoor || state.threat > 0.1) &&
        state.elapsed > state.heartbeatAt
      ) {
        const fear = Math.max(state.hiddenDoor ? 0.35 : 0, state.threat);
        audio.heartbeat(fear);
        state.heartbeatAt = state.elapsed + 1.1 - fear * 0.4;
      }
      uiTimer -= dt;
      if (uiTimer <= 0) {
        uiTimer = 0.08;
        updateHud();
      }
    }
  }
  world.update(state.screen === "playing" ? dt : 0, state.elapsed, monster, {
    hidden: !!state.hiddenDoor,
    peek: state.peek,
    flashlightOn: state.flashlight,
    peaceful: settings.peaceful,
    alert: state.alarm,
  });
  world.render(state.peek);
}
world.rebuild(level);
audio.init();
audio.setMode("menu");
if (audio.context) audio.context.onstatechange = updateMusicButton;
updateMusicButton();
$("start").disabled = false;
$("loading").textContent = "";
requestAnimationFrame(tick);
if (import.meta.env.DEV)
  window.__game = {
    state,
    world,
    settings,
    audio,
    get level() {
      return level;
    },
    get monster() {
      return monster;
    },
    start,
    interact,
    togglePeek,
    pause,
    resume,
    toMenu,
    updateEnemy,
    updatePlayer,
    updateHud,
    cinematic,
    leaderboard,
    beginIntro,
  };
