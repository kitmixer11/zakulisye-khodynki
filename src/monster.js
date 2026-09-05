import {
  CELL,
  findPath,
  lineOfSight,
  moveWithCollision,
  doorCoordinates,
  randomSource,
} from "./level.js";
export function createMonster(level) {
  return {
    ...level.monsterStart,
    heading: 0,
    state: "dormant",
    memory: 0,
    path: [],
    pathTimer: 0,
    patrolIndex: 0,
    investigateDoor: null,
    wait: 0,
    lastKnock: 0,
    frame: "back",
    distance: 100,
    doorDelay: 0,
    random: randomSource(level.seed + 717),
    lastContact: 12,
    nextAmbush: 30,
    ambushDoor: null,
    ambushTime: 0,
    patrolTarget: null,
    patrolRefreshAt: 0,
  };
}
export function noticeHiding(level, m, door, player) {
  if (["dormant", "lurking", "emerging", "entering"].includes(m.state)) return;
  if (
    m.state === "chase" &&
    Math.hypot(m.x - player.x, m.z - player.z) < 16 &&
    lineOfSight(level, m, player)
  ) {
    m.state = "investigate";
    m.investigateDoor = door;
    m.path = [];
    m.pathTimer = 0;
    m.wait = 0;
    m.lastKnock = 0;
  } else {
    m.state = "patrol";
    m.memory = 0;
    m.pathTimer = 0;
    m.patrolIndex++;
    m.patrolTarget = null;
  }
}
export function updateMonster(
  level,
  m,
  player,
  dt,
  { elapsed, hidden, hiddenDoor, running, peaceful, onDoor, onKnock, onChase },
) {
  if (peaceful) {
    if (m.ambushDoor) {
      m.ambushDoor.open = false;
      m.x = m.ambushDoor.cx;
      m.z = m.ambushDoor.cz;
    }
    m.ambushDoor = null;
    m.state = "dormant";
    m.distance = 100;
    return { threat: 0, caught: false };
  }
  if (elapsed < 12) return { threat: 0, caught: false };
  const shelter =
    hiddenDoor ||
    (hidden
      ? [...level.apartments].sort(
          (a, b) =>
            Math.hypot(a.roomX - player.x, a.roomZ - player.z) -
            Math.hypot(b.roomX - player.x, b.roomZ - player.z),
        )[0]
      : null);
  const anchor = shelter ? { x: shelter.cx, z: shelter.cz } : player;
  if (m.state === "dormant") {
    // Never materialize beside the player or immediately behind a closed passage.
    const candidates = level.apartments
      .filter((d) => d.edge !== 0)
      .map((d) => ({
        point: { x: d.cx, z: d.cz },
        path: findPath(level, anchor, { x: d.cx, z: d.cz }),
      }))
      .filter(
        (v) =>
          v.path.length >= 9 &&
          Math.hypot(v.point.x - anchor.x, v.point.z - anchor.z) >= 14 &&
          !lineOfSight(level, anchor, v.point, { ignoreDoors: true }),
      )
      .sort((a, b) => a.path.length - b.path.length);
    if (!candidates.length) return { threat: 0, caught: false };
    Object.assign(m, candidates[0].point, {
      state: "patrol",
      path: [],
      pathTimer: 0,
      patrolTarget: null,
      patrolRefreshAt: 0,
      lastContact: elapsed,
      nextAmbush: elapsed + 18,
    });
  }
  m.distance = Math.hypot(m.x - player.x, m.z - player.z);
  if (m.state === "entering") {
    const d = m.ambushDoor;
    m.ambushTime += dt;
    const t = Math.min(1, m.ambushTime / 0.85);
    m.x = d.cx * (1 - t) + (d.x - d.nx * 0.3) * t;
    m.z = d.cz * (1 - t) + (d.z - d.nz * 0.3) * t;
    m.heading = Math.atan2(-d.nx, -d.nz);
    if (t === 1) {
      m.state = "lurking";
      m.ambushTime = 0;
      d.open = false;
      onDoor?.(d);
    }
    return { threat: 0, caught: false };
  }
  if (m.state === "lurking") {
    m.ambushTime += dt;
    const d = m.ambushDoor;
    const nearby =
      !hidden &&
      Math.hypot(d.cx - player.x, d.cz - player.z) < 4.8 &&
      lineOfSight(level, { x: d.cx, z: d.cz }, player);
    if (nearby || m.ambushTime > 10) {
      m.state = "emerging";
      m.ambushTime = 0;
      d.open = true;
      onDoor?.(d);
      m.x = d.x - d.nx * 0.25;
      m.z = d.z - d.nz * 0.25;
    }
    return { threat: nearby ? 0.35 : 0, caught: false };
  }
  if (m.state === "emerging") {
    const d = m.ambushDoor;
    m.ambushTime += dt;
    const t = Math.min(1, m.ambushTime / 1.15);
    m.x = (d.x - d.nx * 0.25) * (1 - t) + d.cx * t;
    m.z = (d.z - d.nz * 0.25) * (1 - t) + d.cz * t;
    m.heading = Math.atan2(d.nx, d.nz);
    if (t === 1) {
      d.open = false;
      onDoor?.(d);
      m.ambushDoor = null;
      m.state = hidden ? "patrol" : "chase";
      m.memory = 7;
      m.lastKnown = { x: player.x, z: player.z };
      m.path = [];
      m.pathTimer = 0;
      m.lastContact = elapsed;
      if (!hidden) onChase?.();
    }
    return { threat: 0.55, caught: false };
  }
  const sees = !hidden && m.distance < 24 && lineOfSight(level, m, player),
    hears = !hidden && running && m.distance < 30;
  if (sees || hears) {
    m.lastContact = elapsed;
    m.ambushDoor = null;
    if (m.state !== "chase") {
      onChase?.();
      m.pathTimer = 0;
    }
    m.state = "chase";
    m.memory = 14;
    m.lastKnown = { x: player.x, z: player.z };
    m.investigateDoor = null;
  } else if (m.state === "chase") {
    m.memory -= dt;
    if (m.memory <= 0) {
      m.state = "patrol";
      m.patrolTarget = null;
      m.pathTimer = 0;
      m.patrolIndex++;
    }
  }
  if (m.state === "investigate") {
    const d = m.investigateDoor,
      target = { x: d.cx, z: d.cz };
    if (Math.hypot(m.x - target.x, m.z - target.z) < 0.55) {
      m.wait += dt;
      m.heading = Math.atan2(d.x - m.x, d.z - m.z);
      if (m.wait - m.lastKnock > 1.8) {
        m.lastKnock = m.wait;
        onKnock?.();
      }
      if (m.wait > 5.5) {
        m.state = "patrol";
        m.investigateDoor = null;
        m.patrolIndex++;
        m.pathTimer = 0;
        m.lastKnock = 0;
        m.patrolTarget = null;
      }
      return { threat: 0.45, caught: false };
    }
  }
  if (m.state === "patrol" && elapsed >= m.patrolRefreshAt) {
    m.patrolTarget = null;
    m.patrolRefreshAt = elapsed + 1.5;
    m.pathTimer = 0;
  }
  // Remain in the player's neighborhood instead of marching to a distant fixed node.
  if (m.state === "patrol" && !m.patrolTarget) {
    const options = level.apartments
      .filter((d) => !d.home && d !== shelter)
      .map((d) => ({ d, path: findPath(level, anchor, { x: d.cx, z: d.cz }) }))
      .filter((v) => v.path.length >= 2 && v.path.length <= 5);
    const choice = hidden
      ? options[Math.floor(m.random() * options.length)]?.d
      : null;
    m.patrolTarget = choice ? { x: choice.cx, z: choice.cz } : { ...anchor };
  }
  if (
    m.state === "patrol" &&
    elapsed > m.nextAmbush &&
    elapsed - m.lastContact > 8
  ) {
    const options = level.apartments.filter(
      (d) =>
        !d.home &&
        !d.locked &&
        d !== shelter &&
        Math.hypot(d.cx - player.x, d.cz - player.z) > 6 &&
        Math.hypot(d.cx - player.x, d.cz - player.z) < 18 &&
        findPath(level, m, { x: d.cx, z: d.cz }).length <= 6,
    );
    const d = options[Math.floor(m.random() * options.length)];
    if (d) {
      m.ambushDoor = d;
      m.state = "ambushTravel";
      m.path = [];
      m.pathTimer = 0;
    }
    m.nextAmbush = elapsed + 18 + m.random() * 10;
  }
  const target =
    m.state === "chase"
      ? m.lastKnown
      : m.state === "investigate"
        ? { x: m.investigateDoor.cx, z: m.investigateDoor.cz }
        : m.state === "ambushTravel"
          ? { x: m.ambushDoor.cx, z: m.ambushDoor.cz }
          : m.patrolTarget;
  if (
    m.state === "ambushTravel" &&
    Math.hypot(m.x - target.x, m.z - target.z) < 0.3
  ) {
    m.state = "entering";
    m.ambushTime = 0;
    m.ambushDoor.open = true;
    m.path = [];
    onDoor?.(m.ambushDoor);
    return { threat: 0, caught: false };
  }
  m.pathTimer -= dt;
  // Finish each cardinal waypoint before recomputing, preventing corner cutting.
  if (
    m.pathTimer <= 0 &&
    (m.path.length === 0 ||
      Math.hypot(m.x - m.path[0].x, m.z - m.path[0].z) < 0.12)
  ) {
    m.path = findPath(level, m, target);
    m.pathTimer = 0.6;
  }
  if (
    m.state === "patrol" &&
    Math.hypot(m.x - target.x, m.z - target.z) < 0.4
  ) {
    m.patrolIndex++;
    m.patrolTarget = null;
    m.path = [];
    m.pathTimer = 0;
  }
  m.doorDelay = Math.max(0, m.doorDelay - dt);
  if (m.path.length) {
    const next = m.path[0],
      dx = next.x - m.x,
      dz = next.z - m.z,
      dist = Math.hypot(dx, dz);
    if (dist < 0.08) m.path.shift();
    else {
      const gate = level.doors.find((d) => {
        const p = doorCoordinates(d, m);
        return (
          !d.open && Math.abs(p.normal) < 1.6 && Math.abs(p.side) < CELL / 2
        );
      });
      if (gate) {
        gate.open = true;
        m.doorDelay = 0.4;
        onDoor?.(gate);
      }
      if (m.doorDelay === 0) {
        const speed = m.state === "chase" ? 4.2 : 3.5,
          step = Math.min(dist, speed * dt);
        moveWithCollision(
          level,
          m,
          (dx / dist) * step,
          (dz / dist) * step,
          0.23,
        );
        m.heading = Math.atan2(dx, dz);
      }
    }
  }
  const threat =
    m.state === "chase"
      ? Math.max(0, 1 - m.distance / 18)
      : hidden
        ? Math.max(0, 0.5 - m.distance / 12)
        : 0;
  return {
    threat,
    caught: !hidden && m.distance < 0.85 && lineOfSight(level, m, player),
  };
}
