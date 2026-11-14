import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createRepository } from "../server/repository.mjs";
import { createHandler } from "../server/api.mjs";
import { initialState } from "../server/model.mjs";
let database, repository, handler;
before(async () => {
  database = new PGlite();
  await database.exec(
    await readFile(
      new URL(
        "../netlify/database/migrations/0001_create_epi_database.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  repository = createRepository(database);
  handler = createHandler(() => repository);
  await repository.read();
});
after(async () => {
  await database.close();
});
const request = (method, body, headers = {}) =>
  new Request("https://epis.example/api/state", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
async function commit(state, extra = {}) {
  const { revision } = await repository.read();
  return repository.write({
    revision,
    state,
    requestId: randomUUID(),
    ...extra,
  });
}
function stockAndLoan() {
  const s = initialState();
  s.stock[0].inicial = 10;
  for (const [type, name] of [
    ["transportadoras", "Transportadora A"],
    ["motoristas", "Motorista A"],
    ["veiculos", "ABC1D23"],
  ])
    s.registries[type].push({
      id: randomUUID(),
      name,
      active: true,
      carrierId: "",
      notes: "",
    });
  const carrierId = s.registries.transportadoras[0].id;
  s.registries.motoristas[0].carrierId = carrierId;
  s.registries.veiculos[0].carrierId = carrierId;
  s.loans.push({
    id: 1,
    grupo: "AT-123",
    epi: s.stock[0].nome,
    quantidade: 3,
    returned: 0,
    lost: 0,
    returns: [],
    motorista: "Motorista A",
    transportadora: "Transportadora A",
    placa: "ABC1D23",
    responsavel: "Operador",
    quando: "2026-11-13T10:00",
    obs: "",
    carrierId,
    driverId: s.registries.motoristas[0].id,
    vehicleId: s.registries.veiculos[0].id,
  });
  return s;
}
test("GET inicializa o banco e fornece revisão e estado", async () => {
  const r = await handler(request("GET"));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.revision, 0);
  assert.equal(body.state.stock.length, 6);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("grava empréstimo e devolução parcial com perda na mesma transação", async () => {
  const state = stockAndLoan();
  await commit(state);
  const l = state.loans[0];
  l.returned = 1;
  l.lost = 1;
  l.returns.push({
    q: 1,
    lostq: 1,
    who: "Recebedor",
    quando: "2026-11-13T11:00:00Z",
    obs: "Motorista informou a perda de uma unidade.",
    tipo: "perda",
    occurrenceId: "PERDA-TESTE-1",
  });
  await commit(state);
  const stored = await repository.read();
  assert.equal(stored.state.loans[0].returned, 1);
  assert.equal(
    stored.state.loans[0].quantidade -
      stored.state.loans[0].returned -
      stored.state.loans[0].lost,
    1,
  );
  const audit = await database.query(
    "SELECT count(*)::integer AS n FROM epi_audit",
  );
  assert.equal(audit.rows[0].n, 2);
});
test("saldo negativo e devolução excessiva são recusados sem alterar o banco", async () => {
  const before = await repository.read();
  const invalid = structuredClone(before.state);
  invalid.stock[0].inicial = 0;
  await assert.rejects(() => commit(invalid), /Estoque insuficiente/);
  const invalidReturn = structuredClone(before.state);
  invalidReturn.loans[0].returned = 4;
  await assert.rejects(() => commit(invalidReturn), /inconsistentes/);
  assert.equal((await repository.read()).revision, before.revision);
});
test("duas gravações com a mesma revisão não perdem atualizações", async () => {
  const old = await repository.read();
  const a = structuredClone(old.state),
    b = structuredClone(old.state);
  a.settings.unit = "Unidade A";
  b.settings.unit = "Unidade B";
  const results = await Promise.allSettled([
    repository.write({
      revision: old.revision,
      state: a,
      requestId: randomUUID(),
    }),
    repository.write({
      revision: old.revision,
      state: b,
      requestId: randomUUID(),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
  assert.equal((await repository.read()).state.settings.unit, "Unidade A");
});
test("repetição após perda da resposta é idempotente", async () => {
  const old = await repository.read();
  const body = {
    revision: old.revision,
    state: old.state,
    requestId: randomUUID(),
  };
  const first = await repository.write(body),
    second = await repository.write(body);
  assert.equal(first.revision, second.revision);
  assert.equal(second.replayed, true);
  assert.equal((await repository.read()).revision, first.revision);
});
test("não aceita novo empréstimo em cadastro inativo", async () => {
  const before = await repository.read();
  const state = structuredClone(before.state);
  state.registries.motoristas[0].active = false;
  state.loans.push({
    ...state.loans[0],
    id: 2,
    grupo: "AT-456",
    quantidade: 1,
    returned: 0,
    lost: 0,
    returns: [],
  });
  await assert.rejects(() => commit(state), /inativo/);
  assert.equal((await repository.read()).revision, before.revision);
});
test("valida origem, tipo de conteúdo, JSON, método e revisão", async () => {
  assert.equal(
    (await handler(request("PUT", {}, { Origin: "https://outro.example" })))
      .status,
    403,
  );
  assert.equal(
    (await handler(request("PUT", {}, { "Content-Type": "text/plain" })))
      .status,
    415,
  );
  assert.equal((await handler(request("PUT", "{"))).status, 400);
  assert.equal((await handler(request("PUT", { revision: -1 }))).status, 400);
  assert.equal((await handler(request("POST", {}))).status, 405);
  const current = await repository.read();
  const result = await handler(
    request("PUT", {
      revision: 0,
      state: current.state,
      requestId: randomUUID(),
    }),
  );
  assert.equal(result.status, 409);
});
test("histórico não pode ser apagado por alteração comum, restauração é explícita", async () => {
  const state = initialState();
  await assert.rejects(() => commit(state), /não podem ser excluídos/);
  await commit(state, { operation: "restore" });
  assert.equal((await repository.read()).state.loans.length, 0);
});
test("identificadores e vínculos malformados são recusados", async () => {
  const state = initialState();
  state.registries.motoristas.push({
    id: "x');alert(1)",
    name: "Invasão",
    active: true,
  });
  await assert.rejects(() => commit(state), /Cadastro inválido/);
  const linked = initialState();
  linked.registries.motoristas.push({
    id: randomUUID(),
    name: "Motorista",
    active: true,
    carrierId: randomUUID(),
  });
  await assert.rejects(() => commit(linked), /não existe/);
});
test("falha no log de auditoria reverte a gravação do estado", async () => {
  const before = await repository.read();
  await database.exec(
    "ALTER TABLE epi_audit ADD CONSTRAINT fail_test CHECK (revision < 0) NOT VALID",
  );
  const state = structuredClone(before.state);
  state.settings.unit = "Não deve salvar";
  await assert.rejects(() => commit(state));
  await database.exec("ALTER TABLE epi_audit DROP CONSTRAINT fail_test");
  assert.equal((await repository.read()).revision, before.revision);
  assert.notEqual(
    (await repository.read()).state.settings.unit,
    "Não deve salvar",
  );
});
test("indisponibilidade do banco retorna mensagem útil e 503", async () => {
  const fail = createHandler(() => {
    throw Error("database down");
  });
  const result = await fail(request("GET"));
  assert.equal(result.status, 503);
  assert.ok((await result.json()).error.includes("Netlify Database"));
});
test("WhatsApp opcional é persistido e valores inválidos são rejeitados", async () => {
  const state = initialState();
  state.registries.motoristas.push({
    id: randomUUID(),
    name: "Motorista com WhatsApp",
    active: true,
    whatsapp: "5549999991234",
  });
  await commit(state);
  assert.equal(
    (await repository.read()).state.registries.motoristas[0].whatsapp,
    "5549999991234",
  );
  const invalid = structuredClone(state);
  invalid.registries.motoristas[0].whatsapp = "javascript:alert(1)";
  await assert.rejects(() => commit(invalid), /WhatsApp inválido/);
});
test("perda exige relato da portaria e não devolve unidades ao estoque", async () => {
  const state = stockAndLoan();
  await commit(state, { operation: "restore" });
  const invalid = structuredClone(state);
  invalid.loans[0].lost = 1;
  invalid.loans[0].returns.push({
    q: 0,
    lostq: 1,
    who: "Portaria de teste",
    quando: "2026-11-14T10:00:00Z",
    obs: "",
  });
  await assert.rejects(() => commit(invalid), /relato da portaria/);
  const valid = structuredClone(invalid);
  Object.assign(valid.loans[0].returns[0], {
    tipo: "perda",
    occurrenceId: "PERDA-TESTE-2",
    obs: "Motorista informou que perdeu um colete durante a descarga.",
  });
  await commit(valid);
  const saved = (await repository.read()).state;
  const stock = saved.stock[0],
    loan = saved.loans[0];
  assert.equal(
    stock.inicial +
      stock.entradas -
      stock.baixas -
      loan.quantidade +
      loan.returned,
    7,
  );
  assert.equal(loan.quantidade - loan.returned - loan.lost, 2);
  assert.equal(loan.returns[0].who, "Portaria de teste");
  const changed = structuredClone(saved);
  changed.loans[0].returns[0].obs =
    "Relato histórico substituído indevidamente";
  await assert.rejects(() => commit(changed), /não pode ser alterado/);
});
test("perda de todos os itens encerra a pendência, sem repor o estoque", async () => {
  const state = stockAndLoan();
  await commit(state, { operation: "restore" });
  state.loans[0].lost = 3;
  state.loans[0].returns.push({
    q: 0,
    lostq: 3,
    who: "Portaria de teste",
    quando: "2026-11-14T11:00:00Z",
    obs: "O motorista confirmou a perda de todos os coletes emprestados.",
    tipo: "perda",
    occurrenceId: "PERDA-TESTE-3",
  });
  await commit(state);
  const saved = (await repository.read()).state;
  assert.equal(
    saved.loans[0].quantidade - saved.loans[0].returned - saved.loans[0].lost,
    0,
  );
  assert.equal(
    saved.stock[0].inicial +
      saved.stock[0].entradas -
      saved.stock[0].baixas -
      saved.loans[0].quantidade +
      saved.loans[0].returned,
    7,
  );
  const invalid = structuredClone(saved);
  invalid.loans[0].returned = 1;
  invalid.loans[0].returns.push({
    q: 1,
    lostq: 0,
    who: "Recebedor",
    quando: "2026-11-14T12:00:00Z",
    obs: "",
  });
  await assert.rejects(() => commit(invalid), /inconsistentes/);
});
