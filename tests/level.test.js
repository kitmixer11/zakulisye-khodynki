import test from "node:test";
import assert from "node:assert/strict";
import {
  createLevel,
  CELL,
  SIZE,
  isWall,
  findPath,
  canStand,
  moveWithCollision,
  lineOfSight,
  spriteView,
  nearestDoor,
} from "../src/level.js";
import { createMonster, noticeHiding, updateMonster } from "../src/monster.js";

test("50 generated houses have one reachable apartment 47 and connected corridors", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const l = createLevel(seed);
    assert.equal(l.apartments.filter((a) => a.home).length, 1);
    assert.equal(l.apartments.filter((a) => a.number === 47).length, 1);
    assert.equal(l.edges.length, 8);
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++)
        if (
          !isWall(l, x, z) &&
          (x * CELL !== l.start.x || z * CELL !== l.start.z)
        )
          assert.ok(
            findPath(l, l.start, { x: x * CELL, z: z * CELL }).length,
            `seed ${seed}: ${x},${z}`,
          );
    assert.ok(findPath(l, l.start, { x: l.home.cx, z: l.home.cz }).length > 10);
  }
});
test("same seed retains connections; different seeds change the house", () => {
  assert.deepEqual(createLevel(41).edges, createLevel(41).edges);
  assert.notDeepEqual(createLevel(41).edges, createLevel(42).edges);
});
test("closed passage blocks movement and sight, opened passage permits both", () => {
  const l = createLevel(8),
    d = l.doors[0],
    a = { x: d.x + d.nx * 0.8, z: d.z + d.nz * 0.8 },
    b = { x: d.x - d.nx * 0.8, z: d.z - d.nz * 0.8 };
  const p = { ...a };
  assert.equal(lineOfSight(l, a, b), false);
  moveWithCollision(l, p, b.x - a.x, b.z - a.z);
  assert.ok((p.x - d.x) * d.nx + (p.z - d.z) * d.nz > 0);
  d.open = true;
  assert.equal(lineOfSight(l, a, b), true);
  moveWithCollision(l, p, b.x - p.x, b.z - p.z);
  assert.ok(Math.hypot(p.x - b.x, p.z - b.z) < 0.01);
});
test("walls stop a large movement step and apartments cannot be entered through walls", () => {
  const l = createLevel(8),
    a = l.apartments[0],
    p = { x: a.cx, z: a.cz };
  moveWithCollision(l, p, a.roomX - a.cx, a.roomZ - a.cz);
  assert.ok(canStand(l, p.x, p.z));
  assert.ok(Math.hypot(p.x - a.roomX, p.z - a.roomZ) > CELL / 2);
});
test("door interaction requires range and looking toward the door", () => {
  const l = createLevel(8),
    a = l.apartments[0],
    p = { x: a.cx, z: a.cz, yaw: Math.atan2(a.nx, a.nz) };
  assert.equal(nearestDoor(l, p)?.id, a.id);
  p.yaw += Math.PI;
  assert.notEqual(nearestDoor(l, p)?.id, a.id);
});
test("billboard uses front, side, mirrored side, back and attack frames", () => {
  const m = { x: 0, z: 0 };
  assert.equal(spriteView(0, m, { x: 0, z: 5 }).frame, "front");
  assert.equal(spriteView(0, m, { x: 0, z: -5 }).frame, "back");
  assert.equal(spriteView(0, m, { x: 5, z: 0 }).frame, "side");
  assert.notEqual(
    spriteView(0, m, { x: 5, z: 0 }).flip,
    spriteView(0, m, { x: -5, z: 0 }).flip,
  );
  assert.equal(spriteView(0, m, { x: 0, z: 5 }, true).frame, "angry");
});
test("a witnessed hiding spot is investigated, hidden player stays safe, monster leaves", () => {
  const l = createLevel(8),
    d = l.apartments[0],
    p = { x: d.cx, z: d.cz },
    m = createMonster(l);
  Object.assign(m, { x: d.cx, z: d.cz, state: "chase", nextAmbush: Infinity });
  noticeHiding(l, m, d, p);
  assert.equal(m.state, "investigate");
  let knocked = 0;
  for (let i = 0; i < 450; i++) {
    const result = updateMonster(l, m, { x: d.roomX, z: d.roomZ }, 0.02, {
      elapsed: 40,
      hidden: true,
      running: false,
      peaceful: false,
      onKnock: () => knocked++,
    });
    assert.equal(result.caught, false);
  }
  assert.ok(knocked > 0);
  assert.ok(["patrol", "ambushTravel"].includes(m.state));
});
test("monster crosses a closed door without getting stuck and catches visible player", () => {
  const l = createLevel(8),
    d = l.doors[0],
    m = createMonster(l),
    p = { x: d.x - d.nx * 1.8, z: d.z - d.nz * 1.8 };
  Object.assign(m, {
    x: d.x + d.nx * 2,
    z: d.z + d.nz * 2,
    state: "chase",
    memory: 20,
    lastKnown: p,
    pathTimer: 0,
  });
  let caught = false;
  for (let i = 0; i < 600 && !caught; i++)
    caught = updateMonster(l, m, p, 0.02, {
      elapsed: 40,
      hidden: false,
      running: true,
      peaceful: false,
    }).caught;
  assert.ok(d.open);
  assert.ok(caught);
});
