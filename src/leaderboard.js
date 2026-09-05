export const raceTime = (seconds) => {
  const cs = Math.floor(Math.max(0, seconds) * 100);
  return `${String(Math.floor(cs / 6000)).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const $ = (id) => document.getElementById(id);
async function api(path, body) {
  const response = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error("Сервер рекордов недоступен");
  return response.json();
}
export class Leaderboard {
  constructor() {
    this.playerId = crypto.randomUUID();
    try {
      this.playerId = localStorage.getItem("khodynka-player") || this.playerId;
      localStorage.setItem("khodynka-player", this.playerId);
      $("nickname").value = localStorage.getItem("khodynka-nickname") || "";
    } catch {}
    $("nickname").addEventListener("change", () => {
      try {
        localStorage.setItem("khodynka-nickname", $("nickname").value.trim());
      } catch {}
    });
    $("leaderboard-refresh").onclick = () => this.refresh();
  }
  begin(peaceful) {
    const nickname =
      $("nickname").value.trim() || "Гость-" + this.playerId.slice(0, 4);
    this.run = { eligible: !peaceful, status: "", ticket: null };
    const run = this.run;
    if (!peaceful)
      run.ticket = api("runs", { playerId: this.playerId, nickname })
        .then((r) => r.token)
        .catch(() => null);
  }
  disqualify() {
    if (this.run) this.run.eligible = false;
  }
  async finish(seconds) {
    const run = this.run;
    if (!run) return;
    if (!run.eligible) {
      run.status = "Режим без монстра — вне рейтинга.";
      return;
    }
    run.status = "Сохраняем результат…";
    const token = await run.ticket;
    if (!token) {
      run.status = "Результат не сохранён: сервер рекордов недоступен.";
      this.showStatus(run);
      return;
    }
    try {
      const result = await api("runs/finish", {
        token,
        timeMs: Math.round(seconds * 1000),
      });
      run.status = result.improved
        ? "Новый личный рекорд записан!"
        : "Финиш засчитан. В таблице остался твой лучший результат.";
    } catch {
      run.status = "Не удалось записать результат в рейтинг.";
    }
    this.showStatus(run);
  }
  showStatus(run = this.run) {
    if (run === this.run) $("record-status").textContent = run?.status || "";
  }
  async refresh() {
    const status = $("leaderboard-status"),
      rows = $("leaderboard-rows");
    status.textContent = "Загрузка…";
    rows.replaceChildren();
    try {
      const { records } = await api("leaderboard");
      status.textContent = records.length
        ? "Лучшее время каждого игрока · с монстром"
        : "Пока никто не добрался домой. Стань первым.";
      records.forEach((r, i) => {
        const tr = document.createElement("tr");
        for (const text of [
          String(i + 1),
          r.nickname,
          raceTime(r.timeMs / 1000),
        ]) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        }
        rows.append(tr);
      });
    } catch {
      status.textContent =
        "Сервер рекордов недоступен. Попробуй обновить таблицу.";
    }
  }
}
