import test from "node:test";
import assert from "node:assert/strict";
import {
  createLevel,
  findPath,
  lineOfSight,
  moveWithCollision,
} from "../src/level.js";
import { createMonster, updateMonster } from "../src/monster.js";

test("shelters become scarcer with corridor depth; home stays unlocked across 100 seeds", () => {
  for (let seed = 0; seed < 100; seed++) {
    const l = createLevel(seed);
    assert.equal(l.home.locked, false);
    for (const edge of l.edges) {
      const doors = l.apartments.filter((d) => d.edge === edge.id && !d.home);
      const open = doors.filter((d) => !d.locked);
      assert.ok(
        open.length <= Math.max(1, 3 - Math.floor((edge.depth + 1) / 2)),
      );
      if (!l.apartments.some((d) => d.edge === edge.id && d.home))
        assert.ok(open.length >= 1);
    }
    assert.ok(findPath(l, l.start, l.monsterStart).length > 9);
  }
});
test("after the initial grace period the monster still reaches an exposed player within 60 seconds", () => {
  for (let seed = 0; seed < 50; seed++) {
    const l = createLevel(seed),
      m = createMonster(l);
    let caught = false;
    for (let elapsed = 0; elapsed < 60 && !caught; elapsed += 0.05) {
      caught = updateMonster(l, m, l.start, 0.05, {
        elapsed,
        hidden: false,
        running: false,
        peaceful: false,
      }).caught;
    }
    assert.ok(caught, "no encounter for seed " + seed);
  }
});

test("first activation is distant and around a corner even if player rushes the first door", () => {
  for (let seed = 0; seed < 100; seed++) {
    const l = createLevel(seed),
      gate = l.doors[0];
    for (const p of [
      l.start,
      { x: gate.x + gate.nx, z: gate.z + gate.nz },
      { x: gate.x - gate.nx, z: gate.z - gate.nz },
    ]) {
      const m = createMonster(l);
      for (const elapsed of [0, 4, 8, 11.9]) {
        const r = updateMonster(l, m, p, 0, {
          elapsed,
          hidden: false,
          running: true,
          peaceful: false,
        });
        assert.equal(m.state, "dormant");
        assert.equal(r.caught, false);
      }
      updateMonster(l, m, p, 0, {
        elapsed: 12,
        hidden: false,
        running: true,
        peaceful: false,
      });
      assert.ok(Math.hypot(m.x - p.x, m.z - p.z) >= 14);
      assert.equal(lineOfSight(l, p, m, { ignoreDoors: true }), false);
      assert.ok(findPath(l, p, m).length >= 9);
    }
  }
});

// Moving player regression: standing still hid the long encounter delay.
test("a player moving toward home encounters the monster before 20 seconds across 50 seeds", () => {
  for (let seed = 0; seed < 50; seed++) {
    const l = createLevel(seed),
      m = createMonster(l),
      p = { ...l.start };
    const route = findPath(l, p, { x: l.home.cx, z: l.home.cz });
    let seen = false;
    for (let elapsed = 0; elapsed < 20 && route.length; elapsed += 0.05) {
      const next = route[0],
        dx = next.x - p.x,
        dz = next.z - p.z,
        d = Math.hypot(dx, dz);
      for (const gate of l.doors)
        if (Math.hypot(gate.x - p.x, gate.z - p.z) < 2) gate.open = true;
      const step = Math.min(d, 3.5 * 0.05);
      moveWithCollision(l, p, (dx / d) * step || 0, (dz / d) * step || 0);
      if (d < 0.15) route.shift();
      updateMonster(l, m, p, 0.05, {
        elapsed,
        hidden: false,
        running: true,
        peaceful: false,
      });
      if (
        m.state !== "dormant" &&
        Math.hypot(m.x - p.x, m.z - p.z) < 18 &&
        lineOfSight(l, m, p)
      ) {
        seen = true;
        break;
      }
    }
    assert.ok(seen, "late encounter on seed " + seed);
  }
});
