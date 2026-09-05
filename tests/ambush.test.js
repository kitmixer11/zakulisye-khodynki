import test from "node:test";
import assert from "node:assert/strict";
import { createLevel } from "../src/level.js";
import { createMonster, updateMonster } from "../src/monster.js";

test("monster physically arrives at an apartment, lurks, and emerges when approached", () => {
  const l = createLevel(9),
    d = l.apartments[4],
    m = createMonster(l);
  Object.assign(m, { state: "ambushTravel", ambushDoor: d, x: d.cx, z: d.cz });
  const options = {
    elapsed: 45,
    hidden: true,
    hiddenDoor: l.apartments[0],
    peaceful: false,
    running: false,
  };
  updateMonster(l, m, l.start, 0.02, options);
  assert.equal(m.state, "entering");
  for (let i = 0; i < 45; i++) updateMonster(l, m, l.start, 0.02, options);
  assert.equal(m.state, "lurking");
  assert.equal(d.open, false);
  const player = { x: d.cx + d.nz * 3, z: d.cz - d.nx * 3 };
  updateMonster(l, m, player, 0.02, { ...options, hidden: false });
  assert.equal(m.state, "emerging");
  assert.ok(d.open);
  for (let i = 0; i < 60; i++)
    updateMonster(l, m, player, 0.02, { ...options, hidden: false });
  assert.equal(m.state, "chase");
  assert.equal(m.ambushDoor, null);
  assert.equal(d.open, false);
});
test("ambush never selects apartment 47 or current shelter, peaceful mode clears it", () => {
  for (let seed = 1; seed < 30; seed++) {
    const l = createLevel(seed),
      m = createMonster(l),
      shelter = l.apartments[0];
    Object.assign(m, { state: "patrol", nextAmbush: 0, lastContact: 0 });
    updateMonster(l, m, { x: shelter.roomX, z: shelter.roomZ }, 0.02, {
      elapsed: 60,
      hidden: true,
      hiddenDoor: shelter,
      peaceful: false,
      running: false,
    });
    if (m.ambushDoor) {
      assert.equal(m.ambushDoor.home, false);
      assert.notEqual(m.ambushDoor.id, shelter.id);
    }
    updateMonster(l, m, l.start, 0.02, { elapsed: 61, peaceful: true });
    assert.equal(m.state, "dormant");
    assert.equal(m.ambushDoor, null);
  }
});
test("local patrol chooses a reachable target even while player is inside an apartment", () => {
  const l = createLevel(27),
    m = createMonster(l),
    d = l.apartments[0];
  Object.assign(m, { state: "patrol", nextAmbush: 1000, lastContact: 50 });
  updateMonster(l, m, { x: d.roomX, z: d.roomZ }, 0.02, {
    elapsed: 51,
    hidden: true,
    hiddenDoor: d,
    peaceful: false,
    running: false,
  });
  assert.ok(m.patrolTarget);
  assert.ok(m.path.length > 0);
});
