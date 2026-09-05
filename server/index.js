import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { createLeaderboard } from "./leaderboard.js";
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const board = createLeaderboard({
  file: resolve(process.env.LEADERBOARD_FILE || "data/leaderboard-v1.json"),
});
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
};
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "GET" && url.pathname === "/api/leaderboard")
        return json(res, 200, { records: board.list() });
      if (
        req.method !== "POST" ||
        !["/api/runs", "/api/runs/finish"].includes(url.pathname)
      )
        return json(res, 404, { error: "Не найдено" });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return json(res, 403, { error: "Недопустимый источник" });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2048)
          return json(res, 413, { error: "Слишком большой запрос" });
      }
      const payload = JSON.parse(body);
      return json(
        res,
        200,
        url.pathname === "/api/runs"
          ? board.begin(payload)
          : board.finish(payload),
      );
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    const info = await stat(path);
    if (!info.isFile()) {
      res.writeHead(404);
      return res.end();
    }
    const headers = {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control":
        extname(path) === ".html" ? "no-cache" : "public, max-age=3600",
    };
    let start = 0,
      end = info.size - 1,
      status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) {
        res.writeHead(416);
        return res.end();
      }
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), end) : end;
      if (start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        return res.end();
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(path, { start, end });
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    json(res, e.code === "ENOENT" ? 404 : 400, {
      error: e.code === "ENOENT" ? "Не найдено" : e.message,
    });
  }
}).listen(
  Number(process.env.PORT || 4180),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "Game + leaderboard: http://127.0.0.1:" + (process.env.PORT || 4180),
    ),
);
