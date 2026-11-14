import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialState } from "../server/model.mjs";
const base = "http://localhost:" + (process.env.TEST_PORT || "8888");
const get = async () => (await fetch(base + "/api/state")).json();
const put = async (state, revision) =>
  fetch(base + "/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state,
      revision,
      operation: "restore",
      requestId: randomUUID(),
    }),
  });
const original = await get();
assert.equal(original.state.loans.length, 0, "Use uma base local vazia.");
assert.equal((await put(initialState(), original.revision)).status, 200);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [],
  messages = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", async (dialog) => {
  messages.push(dialog.message());
  await dialog.accept();
});
const settled = async () => {
  await page.waitForFunction(() => !isSaving);
  assert.equal(await page.evaluate(() => needsRefresh), false, messages.at(-1));
};
async function setStock(name, quantity) {
  await page.evaluate(() => tab("estoque"));
  await page.locator("#stockForm [name=nome]").fill(name);
  await page.locator("#stockForm [name=qtd]").fill(String(quantity));
  await page.locator("#stockForm button").click();
  await settled();
}
async function fillLoan(quantity, name = "Motorista de teste") {
  await page.evaluate(() => tab("emprestar"));
  await page.locator("#loanForm [name=motorista]").fill(name);
  await page
    .locator("#loanForm [name=transportadora]")
    .fill("Transportadora de teste");
  await page.locator("#loanForm [name=placa]").fill("ABC1D23");
  await page.locator("#loanForm [name=responsavel]").fill("Operador de teste");
  await page.locator(".item-epi").selectOption("Colete refletivo");
  await page.locator(".item-qtd").fill(String(quantity));
  await page.locator("#loanForm button[type=submit]").click();
  await settled();
}
try {
  await page.goto(base);
  await page.locator("#networkGate").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Fechar novo empréstimo", exact: true })
    .click();
  assert.deepEqual(await page.locator("#cards b").allTextContents(), [
    "00",
    "00",
    "00",
    "00",
  ]);
  assert.equal(
    await page.locator("#stockTypesCount").innerText(),
    "0 tipos cadastrados",
  );
  await setStock("Colete refletivo", 2);
  await fillLoan(3);
  assert.equal(await page.evaluate(() => db.loans.length), 0);
  assert.ok(messages.at(-1).includes("insuficiente"));
  await page.locator(".item-qtd").fill("2");
  await page.locator("#loanForm button[type=submit]").click();
  await settled();
  assert.equal(await page.evaluate(() => available(db.stock[0])), 0);
  assert.equal(await page.evaluate(() => outstanding("Colete refletivo")), 2);
  await setStock("Colete refletivo", 2);
  assert.equal(await page.evaluate(() => stockPhysicalTotal(db.stock[0])), 2);
  assert.equal(await page.evaluate(() => available(db.stock[0])), 0);
  await setStock("Colete refletivo", 1);
  assert.equal(await page.evaluate(() => stockPhysicalTotal(db.stock[0])), 2);
  assert.ok(messages.at(-1).includes("não pode ser menor"));
  await setStock("Capacete", 1);
  await page.evaluate(() => tab("painel"));
  assert.equal(await page.locator("#cards b").first().innerText(), "01");
  await page.locator("#overviewEpi").selectOption("Colete refletivo");
  assert.deepEqual(await page.locator("#cards b").allTextContents(), [
    "00",
    "02",
    "01",
    "01",
  ]);
  assert.equal(await page.locator(".donut strong").innerText(), "02");
  await page.evaluate(() => tab("registros"));
  await page
    .getByRole("button", { name: "Devolver itens", exact: true })
    .click();
  await page.locator(".ret-q").fill("1");
  await page.locator("#recebedor").fill("Recebedor de teste");
  await page.locator("#formDevolucao button[type=submit]").click();
  await settled();
  await fillLoan(1, "Outro motorista de teste");
  assert.equal(
    await page.evaluate(() => db.loans.reduce((n, l) => n + l.quantidade, 0)),
    3,
  );
  await setStock("Colete refletivo", 2);
  await page.evaluate(() => tab("painel"));
  await page.locator("#overviewEpi").selectOption("Colete refletivo");
  assert.deepEqual(await page.locator("#cards b").allTextContents(), [
    "00",
    "02",
    "02",
    "01",
  ]);
  assert.equal(await page.locator(".donut strong").innerText(), "02");
  assert.equal(
    await page.evaluate(() => inventorySnapshot("Colete refletivo").total),
    2,
  );
  await page.screenshot({
    path: "test-results/inventory-current.png",
    fullPage: true,
  });
  await page.locator("#overviewEpi").selectOption("Capacete");
  assert.deepEqual(await page.locator("#cards b").allTextContents(), [
    "01",
    "00",
    "00",
    "01",
  ]);
  await page.reload();
  await page.locator("#networkGate").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Fechar novo empréstimo", exact: true })
    .click();
  await page.locator("#overviewEpi").selectOption("Colete refletivo");
  assert.equal(await page.locator("#cards b").first().innerText(), "00");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 2 coletes, 2 em uso, 0 disponível; terceiro bloqueado; recadastro sem somar; histórico de 3 saídas mantém 2 unidades; filtro e persistência.",
  );
} finally {
  await browser.close();
  const current = await get();
  await put(initialState(), current.revision);
}
