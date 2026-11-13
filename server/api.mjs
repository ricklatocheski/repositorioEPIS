import { HttpError } from "./model.mjs";
const MAX_BODY = 3 * 1024 * 1024;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function readBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY)
    throw new HttpError(413, "Backup excede o limite de 3 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Corpo da requisição ausente.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new HttpError(413, "Backup excede o limite de 3 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}
export function createHandler(getRepository) {
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, "/api");
      if (!["/api/state", "/api/health"].includes(path))
        return json({ error: "Rota não encontrada." }, 404);
      if (request.method === "GET") {
        const repo = await getRepository();
        const data = await repo.read();
        return path === "/api/health"
          ? json({ ok: true, storage: "postgresql", revision: data.revision })
          : json(data);
      }
      if (request.method !== "PUT" || path !== "/api/state")
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, PUT", "Cache-Control": "no-store" },
        });
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new HttpError(403, "Origem não permitida.");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw new HttpError(403, "Origem não permitida.");
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new HttpError(415, "Envie application/json.");
      const body = await readBody(request);
      if (
        !body ||
        !Number.isInteger(body.revision) ||
        body.revision < 0 ||
        body.revision >= 2147483647 ||
        typeof body.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          body.requestId,
        ) ||
        !["update", "restore"].includes(body.operation ?? "update")
      )
        throw new HttpError(400, "Revisão ou identificação inválida.");
      const repo = await getRepository();
      return json(await repo.write(body));
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error("Falha na API de EPIs:", error.code || error.name);
      return json(
        {
          error:
            "Não foi possível acessar o banco. Verifique a ativação do Netlify Database e as migrações.",
        },
        503,
      );
    }
  };
}
