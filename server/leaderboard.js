import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export function createLeaderboard({ file, now = Date.now } = {}) {
  let records = [];
  if (file) {
    try {
      records = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(records)) throw Error("Invalid leaderboard");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  const tickets = new Map();
  const publicRecord = ({ nickname, timeMs, date }) => ({
    nickname,
    timeMs,
    date,
  });
  const list = () =>
    records
      .slice()
      .sort((a, b) => a.timeMs - b.timeMs || a.date.localeCompare(b.date))
      .slice(0, 50)
      .map(publicRecord);
  return {
    list,
    begin({ playerId, nickname }) {
      if (
        typeof playerId !== "string" ||
        !/^[a-zA-Z0-9-]{16,64}$/.test(playerId)
      )
        throw Error("Некорректный игрок");
      if (typeof nickname !== "string") throw Error("Введите ник");
      nickname = nickname.trim().replace(/\s+/g, " ");
      if (
        !nickname ||
        [...nickname].length > 20 ||
        /[\u0000-\u001f\u007f]/.test(nickname)
      )
        throw Error("Ник: от 1 до 20 символов");
      for (const [id, t] of tickets)
        if (now() - t.started > 24 * 3600 * 1000 || t.playerId === playerId)
          tickets.delete(id);
      if (tickets.size >= 10000) throw Error("Сервер занят");
      const token = randomUUID();
      tickets.set(token, { playerId, nickname, started: now() });
      return { token };
    },
    finish({ token, timeMs }) {
      const run = tickets.get(token);
      if (!run) throw Error("Забег не найден или уже записан");
      if (
        !Number.isSafeInteger(timeMs) ||
        timeMs < 10000 ||
        timeMs > 24 * 3600 * 1000 ||
        timeMs > now() - run.started + 2000
      )
        throw Error("Некорректное время прохождения");
      const previous = records.find((r) => r.playerId === run.playerId);
      const improved = !previous || timeMs < previous.timeMs;
      if (improved) {
        const next = records.filter((r) => r.playerId !== run.playerId);
        next.push({
          playerId: run.playerId,
          nickname: run.nickname,
          timeMs,
          date: new Date(now()).toISOString(),
        });
        next.sort((a, b) => a.timeMs - b.timeMs);
        next.length = Math.min(next.length, 5000);
        if (file) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file + ".tmp", JSON.stringify(next));
          renameSync(file + ".tmp", file);
        }
        records = next;
      }
      tickets.delete(token);
      return { improved, records: list() };
    },
  };
}
