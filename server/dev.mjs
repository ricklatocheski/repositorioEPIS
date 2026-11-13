import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Readable } from "node:stream";
import { createRepository } from "./repository.mjs";
import { createHandler } from "./api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPath = process.env.LOCAL_DATA_DIR || path.join(root, ".local-data");
await mkdir(localPath, { recursive: true });
const database = new PGlite(localPath);
await database.waitReady;
const migration = await readFile(
  path.join(root, "netlify/database/migrations/0001_create_epi_database.sql"),
  "utf8",
);
const { rows } = await database.query(
  "SELECT to_regclass('public.epi_state') AS name",
);
if (!rows[0].name) await database.exec(migration);
const handler = createHandler(() => createRepository(database));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const request = new Request("http://" + req.headers.host + req.url, {
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: Readable.toWeb(req), duplex: "half" }
          : {}),
      });
      const result = await handler(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const relative = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const publicRoot = path.join(root, "public");
    const file = path.resolve(publicRoot, "." + relative);
    if (!file.startsWith(publicRoot + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Arquivo não encontrado.");
  }
});
const port = Number(process.env.PORT || 8888);
server.listen(port, "127.0.0.1", () =>
  console.log(
    "Controle de EPIs: http://localhost:" +
      port +
      " (PostgreSQL local via PGlite)",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await database.close();
      process.exit(0);
    }),
  );
