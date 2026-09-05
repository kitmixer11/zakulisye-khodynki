import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLeaderboard } from "../server/leaderboard.js";
import { raceTime } from "../src/leaderboard.js";
test("ranking persists best times across players and server restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "khodynka-test-")),
    file = join(dir, "scores.json");
  let now = 1000;
  try {
    const board = createLeaderboard({ file, now: () => now });
    const first = board.begin({
      playerId: "aaaaaaaa-aaaaaaaa",
      nickname: "Илья",
    });
    now += 30000;
    assert.equal(board.finish({ ...first, timeMs: 30000 }).improved, true);
    const second = board.begin({
      playerId: "bbbbbbbb-bbbbbbbb",
      nickname: "Друг",
    });
    now += 20000;
    board.finish({ ...second, timeMs: 20000 });
    const slower = board.begin({
      playerId: "aaaaaaaa-aaaaaaaa",
      nickname: "Илья",
    });
    now += 40000;
    assert.equal(board.finish({ ...slower, timeMs: 40000 }).improved, false);
    assert.deepEqual(
      createLeaderboard({ file })
        .list()
        .map((r) => [r.nickname, r.timeMs]),
      [
        ["Друг", 20000],
        ["Илья", 30000],
      ],
    );
    assert.throws(() => board.finish({ ...second, timeMs: 20000 }));
  } finally {
    rmSync(file, { force: true });
    rmdirSync(dir);
  }
});
test("invalid times, names and unstarted runs are rejected", () => {
  let now = 0;
  const b = createLeaderboard({ now: () => now });
  assert.throws(() =>
    b.begin({ playerId: "aaaaaaaa-aaaaaaaa", nickname: " " }),
  );
  const run = b.begin({ playerId: "aaaaaaaa-aaaaaaaa", nickname: "Игрок" });
  assert.throws(() => b.finish({ ...run, timeMs: 30000 }));
  now = 40000;
  assert.throws(() => b.finish({ ...run, timeMs: -1 }));
  assert.throws(() => b.finish({ ...run, timeMs: NaN }));
  assert.equal(b.finish({ ...run, timeMs: 30000 }).improved, true);
  assert.equal(raceTime(65.12), "01:05.12");
});
