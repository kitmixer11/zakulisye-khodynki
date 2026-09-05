export const CELL = 2.6;
export const SIZE = 25;
export const HOME_NUMBER = 47;
export const DIRECTIONS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];
export const toCell = (v) => Math.floor(v / CELL + 0.5);
export function randomSource(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function createLevel(seed = Date.now()) {
  const random = randomSource(seed),
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(1));
  const nodes = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    x: 3 + (i % 3) * 9,
    z: 3 + Math.floor(i / 3) * 9,
  }));
  const edges = [],
    visited = new Set([0]),
    stack = [0];
  // A seeded spanning tree: random turns, persistent connections, no disconnected destination.
  while (stack.length) {
    const current = stack.at(-1),
      n = nodes[current];
    const next = nodes.filter(
      (v) =>
        !visited.has(v.id) && Math.abs(n.x - v.x) + Math.abs(n.z - v.z) === 9,
    );
    if (!next.length) {
      stack.pop();
      continue;
    }
    const target = next[Math.floor(random() * next.length)];
    edges.push({ from: current, to: target.id });
    visited.add(target.id);
    stack.push(target.id);
  }
  const doors = [],
    apartments = [];
  let number = 21;
  edges.forEach((edge, ei) => {
    const a = nodes[edge.from],
      b = nodes[edge.to],
      dx = Math.sign(b.x - a.x),
      dz = Math.sign(b.z - a.z);
    Object.assign(edge, { dx, dz, id: ei });
    for (let j = 0; j <= 9; j++) grid[a.z + dz * j][a.x + dx * j] = 0;
    const gate = {
      id: `gate-${ei}`,
      kind: "passage",
      x: (a.x + dx * 8.45) * CELL,
      z: (a.z + dz * 8.45) * CELL,
      nx: -dx,
      nz: -dz,
      width: 1.4,
      open: false,
      angle: 0,
      edge: ei,
    };
    doors.push(gate);
    for (const [j, side] of [
      [2, -1],
      [4, 1],
      [6, -1],
    ]) {
      const nx = -dz * side,
        nz = dx * side,
        cx = (a.x + dx * j) * CELL,
        cz = (a.z + dz * j) * CELL;
      if (number === HOME_NUMBER) number++;
      const apartment = {
        id: `apt-${ei}-${j}`,
        kind: "apartment",
        number: number++,
        x: cx + (nx * CELL) / 2,
        z: cz + (nz * CELL) / 2,
        nx: -nx,
        nz: -nz,
        cx,
        cz,
        roomX: cx + nx * CELL,
        roomZ: cz + nz * CELL,
        width: 1.02,
        open: false,
        angle: 0,
        home: false,
        edge: ei,
      };
      apartments.push(apartment);
    }
  });
  const level = {
    seed,
    grid,
    nodes,
    edges,
    doors,
    apartments,
    start: { x: nodes[0].x * CELL, z: nodes[0].z * CELL, yaw: 0 },
  };
  const first = edges[0];
  level.start.yaw = Math.atan2(-first.dx, -first.dz);
  const far = [...apartments].sort(
    (a, b) =>
      findPath(level, level.start, { x: b.cx, z: b.cz }).length -
      findPath(level, level.start, { x: a.cx, z: a.cz }).length,
  )[0];
  // Persistent scarcity by graph depth, including branches: 3 → 2 → 1 shelters.
  for (const edge of edges) {
    const group = apartments.filter((d) => d.edge === edge.id);
    const n = nodes[edge.from];
    edge.depth = Math.floor(
      findPath(level, level.start, { x: n.x * CELL, z: n.z * CELL }).length / 9,
    );
    const count = Math.max(1, 3 - Math.floor((edge.depth + 1) / 2));
    group.forEach((d, i) => {
      d.locked = i >= count;
    });
  }
  far.locked = false;
  far.home = true;
  far.number = HOME_NUMBER;
  level.home = far;
  // Dormant placeholder only; first activation chooses a safe position relative to the player.
  level.monsterStart = { x: far.cx, z: far.cz };
  return level;
}
export function isWall(level, x, z) {
  return level.grid[z]?.[x] !== 0;
}
export function doorCoordinates(door, p) {
  const dx = p.x - door.x,
    dz = p.z - door.z;
  return {
    normal: dx * door.nx + dz * door.nz,
    side: dx * door.nz - dz * door.nx,
  };
}
export function canStand(
  level,
  x,
  z,
  radius = 0.22,
  { ignoreDoors = false } = {},
) {
  for (let iz = toCell(z - radius); iz <= toCell(z + radius); iz++)
    for (let ix = toCell(x - radius); ix <= toCell(x + radius); ix++)
      if (isWall(level, ix, iz)) return false;
  if (!ignoreDoors)
    for (const door of level.doors) {
      const p = doorCoordinates(door, { x, z });
      if (
        Math.abs(p.normal) < radius + 0.1 &&
        Math.abs(p.side) < CELL / 2 + radius &&
        (!door.open || Math.abs(p.side) > door.width / 2 - radius)
      )
        return false;
    }
  return true;
}
export function moveWithCollision(level, p, dx, dz, radius = 0.22, options) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.09));
  for (let i = 0; i < steps; i++) {
    if (canStand(level, p.x + dx / steps, p.z, radius, options))
      p.x += dx / steps;
    if (canStand(level, p.x, p.z + dz / steps, radius, options))
      p.z += dz / steps;
  }
}
export function lineOfSight(level, a, b, { ignoreDoors = false } = {}) {
  const dist = Math.hypot(b.x - a.x, b.z - a.z),
    steps = Math.ceil(dist / 0.18);
  for (let i = 1; i <= steps; i++) {
    const p = {
      x: a.x + ((b.x - a.x) * i) / steps,
      z: a.z + ((b.z - a.z) * i) / steps,
    };
    if (isWall(level, toCell(p.x), toCell(p.z))) return false;
    if (
      !ignoreDoors &&
      level.doors.some((d) => {
        const c = doorCoordinates(d, p);
        return (
          !d.open && Math.abs(c.normal) < 0.13 && Math.abs(c.side) < CELL / 2
        );
      })
    )
      return false;
  }
  return true;
}
export function findPath(level, from, to) {
  const sx = toCell(from.x),
    sz = toCell(from.z),
    tx = toCell(to.x),
    tz = toCell(to.z);
  if (isWall(level, sx, sz) || isWall(level, tx, tz)) return [];
  const start = sz * SIZE + sx,
    target = tz * SIZE + tx,
    queue = [start],
    parents = new Map([[start, -1]]);
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    if (key === target) break;
    const x = key % SIZE,
      z = Math.floor(key / SIZE);
    for (const { x: dx, z: dz } of DIRECTIONS) {
      const nx = x + dx,
        nz = z + dz,
        nk = nz * SIZE + nx;
      if (!isWall(level, nx, nz) && !parents.has(nk)) {
        parents.set(nk, key);
        queue.push(nk);
      }
    }
  }
  if (!parents.has(target)) return [];
  const path = [];
  for (let k = target; k !== start; k = parents.get(k))
    path.push({ x: (k % SIZE) * CELL, z: Math.floor(k / SIZE) * CELL });
  return path.reverse();
}
export function nearestDoor(level, p) {
  const forward = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  return (
    [...level.doors, ...level.apartments]
      .filter((d) => {
        const dx = d.x - p.x,
          dz = d.z - p.z,
          dist = Math.hypot(dx, dz);
        if (dist > 2.05) return false;
        if (dist > 0.35 && (dx * forward.x + dz * forward.z) / dist < 0.3)
          return false;
        if (d.kind === "apartment" && doorCoordinates(d, p).normal < 0)
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )[0] || null
  );
}
export function spriteView(heading, monster, camera, angry = false) {
  const angle =
    Math.atan2(camera.x - monster.x, camera.z - monster.z) - heading;
  const dot = Math.cos(angle);
  if (dot > 0.52) return { frame: angry ? "angry" : "front", flip: false };
  if (dot < -0.52) return { frame: "back", flip: false };
  return { frame: "side", flip: Math.sin(angle) < 0 };
}
