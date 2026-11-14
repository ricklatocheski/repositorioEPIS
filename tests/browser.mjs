import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { initialState } from "../server/model.mjs";

// Uses the local development server only, never a production site.
const base = "http://localhost:" + (process.env.TEST_PORT || "8888");
const existing = await (await fetch(base + "/api/state")).json();
// Refuse to erase a local database that already contains operational records.
assert.equal(
  existing.state.loans.length,
  0,
  "Use um LOCAL_DATA_DIR vazio para rodar os testes de navegador.",
);
let reset = await fetch(base + "/api/state", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    revision: existing.revision,
    state: initialState(),
    operation: "restore",
    requestId: randomUUID(),
  }),
});
assert.equal(reset.status, 200);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [],
  dialogs = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", async (d) => {
  dialogs.push(d.message());
  await d.accept();
});
const ready = async () => {
  await page.locator("#networkGate").waitFor({ state: "hidden" });
  await page.waitForFunction(() => !isSaving);
  await page.locator("#loanWizard.open").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#loanForm [name=motorista]").isVisible(),
    true,
  );
  assert.equal(await page.locator(".loan-guide").innerText(), "");
  await page
    .getByRole("button", { name: "Fechar novo empréstimo", exact: true })
    .click();
};
const settled = async () => {
  await page.waitForFunction(() => !isSaving);
  assert.equal(await page.evaluate(() => needsRefresh), false, dialogs.at(-1));
};
try {
  await page.goto(base);
  await ready();
  assert.equal(
    await page
      .locator(
        ".sidebar-bottom,.side-label,#unitLabel,#syncStatus,.overview-banner,footer",
      )
      .count(),
    0,
  );
  assert.equal(await page.locator("#syncError").isVisible(), false);
  assert.equal(
    await page
      .locator("[data-tab=backup],[data-tab=ajustes],#backup,#ajustes")
      .count(),
    0,
  );
  assert.equal(await page.evaluate(() => revision), 1 + existing.revision);
  await page.evaluate(() => tab("cadastros"));
  await page
    .getByRole("button", { name: "＋ Novo cadastro", exact: true })
    .click();
  await page.locator("#registryName").fill("Transportes Floresta");
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await settled();
  await page.evaluate(() => registryTab("motoristas"));
  await page
    .getByRole("button", { name: "＋ Novo cadastro", exact: true })
    .click();
  await page.locator("#registryName").fill("Motorista de Teste");
  await page.locator("#registryWhatsapp").fill("42");
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  assert.equal(
    await page
      .locator("#registryModal")
      .evaluate((el) => el.classList.contains("open")),
    true,
  );
  assert.equal(await page.evaluate(() => db.registries.motoristas.length), 0);
  await page.locator("#registryWhatsapp").fill("(49) 99999-1234");
  await page
    .locator("#registryCarrier")
    .selectOption({ label: "Transportes Floresta" });
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await settled();
  assert.equal(
    await page.locator("a.whatsapp-link").getAttribute("href"),
    "https://wa.me/5549999991234",
  );
  await page.evaluate(() => tab("estoque"));
  await page.locator("#stockForm [name=nome]").fill("Capacete");
  await page.locator("#stockForm [name=qtd]").fill("10");
  await page.locator("#stockForm button").click();
  await settled();
  await page.evaluate(() => tab("emprestar"));
  await page.locator("#loanForm [name=motorista]").fill("Motorista de Teste");
  await page.locator("#loanForm [name=motorista]").dispatchEvent("change");
  assert.equal(
    await page.locator("#loanForm [name=whatsapp]").inputValue(),
    "(49) 99999-1234",
  );
  assert.equal(
    await page.locator("#loanForm [name=transportadora]").inputValue(),
    "Transportes Floresta",
  );
  await page.locator("#loanForm [name=placa]").fill("ABC1D23");
  await page.locator("#loanForm [name=responsavel]").fill("Operador de Teste");
  await page.locator(".item-epi").selectOption("Capacete");
  await page.locator(".item-qtd").fill("3");
  await page.locator("#loanForm button[type=submit]").click();
  await settled();
  assert.equal(await page.evaluate(() => db.loans.length), 1);
  await page
    .getByRole("button", { name: "Devolver itens", exact: true })
    .click();
  await page.locator(".ret-q").fill("1");

  await page.locator("#recebedor").fill("Recebedor de Teste");
  await page.locator("#formDevolucao button[type=submit]").click();
  await settled();
  assert.equal(
    await page.evaluate(() =>
      available(db.stock.find((s) => s.nome === "Capacete")),
    ),
    8,
  );
  assert.equal(await page.evaluate(() => outstanding("Capacete")), 2);
  assert.equal(await page.evaluate(() => db.loans[0].lost), 0);
  await page
    .getByRole("button", { name: "Registrar perda", exact: true })
    .click();
  await page.locator("#lossReporter").fill("Porteiro de Teste");
  await page
    .locator("#lossReason")
    .fill("O motorista informou que perdeu um capacete durante a descarga.");
  await page
    .getByRole("button", { name: "Confirmar registro de perda", exact: true })
    .click();
  await settled();
  assert.equal(await page.evaluate(() => outstanding("Capacete")), 1);
  assert.equal(
    await page.evaluate(() =>
      available(db.stock.find((s) => s.nome === "Capacete")),
    ),
    8,
  );
  assert.equal(await page.locator("#lossHistory tbody tr").count(), 1);
  await page.getByRole("button", { name: "Ver relato", exact: true }).click();
  assert.ok(
    (await page.locator("#lossDetails").innerText()).includes(
      "Porteiro de Teste",
    ),
  );
  assert.ok(
    (await page.locator("#lossDetails").innerText()).includes(
      "perdeu um capacete",
    ),
  );
  await page
    .getByRole("button", { name: "Fechar relato", exact: true })
    .click();
  // Changing only the available count must preserve open loans and past returns.
  await page.evaluate(() => {
    tab("estoque");
    abrirEditar(db.stock.findIndex((s) => s.nome === "Capacete"));
  });
  await page.locator("#editAvailable").fill("5");
  await page
    .locator("#formEditar button[type=submit],#formEditar button:not([type])")
    .click();
  await settled();
  assert.equal(
    await page.evaluate(() =>
      available(db.stock.find((s) => s.nome === "Capacete")),
    ),
    5,
  );
  assert.equal(await page.evaluate(() => outstanding("Capacete")), 1);
  await page.locator("#stockForm [name=nome]").fill("Capacete");
  await page.locator("#stockForm [name=qtd]").fill("8");
  await page.locator("#stockForm button").click();
  await settled();
  assert.equal(
    await page.evaluate(() =>
      available(db.stock.find((s) => s.nome === "Capacete")),
    ),
    8,
  );
  assert.equal(await page.evaluate(() => db.loans[0].returned), 1);
  assert.deepEqual(await page.locator("#estoqueTabela th").allTextContents(), [
    "EPI",
    "Disponível",
    "Ações",
  ]);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/stock.png", fullPage: true });
  // Separate context represents another device, with no shared localStorage.
  const context2 = await browser.newContext();
  const other = await context2.newPage();
  await other.goto(base);
  await other.locator("#networkGate").waitFor({ state: "hidden" });
  await other.evaluate(() => tab("emprestar"));
  await other.locator("#loanForm [name=motorista]").fill("Rascunho preservado");
  assert.equal(await other.evaluate(() => db.loans[0].returned), 1);
  // Renaming retains historical text and does not recreate the old registry name.
  await page.evaluate(() => {
    tab("cadastros");
    registryTab("motoristas");
    openRegistry(db.registries.motoristas[0].id);
  });
  await page.locator("#registryName").fill("Motorista Renomeado");
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await settled();
  assert.equal(await page.evaluate(() => db.registries.motoristas.length), 1);
  assert.equal(
    await page.evaluate(() => db.loans[0].motorista),
    "Motorista de Teste",
  );
  // Polling propagates changes without discarding the other device's draft.
  await other.waitForFunction(
    () => db.registries.motoristas[0].name === "Motorista Renomeado",
    {},
    { timeout: 12000 },
  );
  assert.equal(
    await other.locator("#loanForm [name=motorista]").inputValue(),
    "Rascunho preservado",
  );
  // Force a stale revision and verify recovery without a manual refresh.
  other.on("dialog", (d) => d.accept());
  await other.evaluate(() => {
    revision -= 1;
    tab("cadastros");
    registryTab("transportadoras");
    openRegistry(db.registries.transportadoras[0].id);
    $("registryNotes").value = "Conflito";
  });
  await other
    .locator(
      "#registryForm button[type=submit],#registryForm button:not([type])",
    )
    .click();
  await other.waitForFunction(() => !isSaving);
  assert.notEqual(
    (await (await fetch(base + "/api/state")).json()).state.registries
      .transportadoras[0].notes,
    "Conflito",
  );
  await other.waitForFunction(() => !needsRefresh && !refreshing);
  assert.equal(
    await other.evaluate(() => db.registries.motoristas[0].name),
    "Motorista Renomeado",
  );
  await page.evaluate(async () => {
    registryTab("motoristas");
    await toggleRegistry(db.registries.motoristas[0].id);
  });
  await settled();
  assert.equal(
    await page.evaluate(() => db.registries.motoristas[0].active),
    false,
  );
  await page.reload();
  await ready();
  assert.equal(
    await page.evaluate(() => db.registries.motoristas[0].active),
    false,
  );
  await page.evaluate(() => {
    tab("relatorios");
    clearReport();
    document.getElementById("relInicio").value = "";
    document.getElementById("relFim").value = "";
    renderReport();
  });
  assert.deepEqual(await page.locator('#relResumo b').allTextContents(),['1','3','1','1','1']);
  assert.equal(await page.evaluate(()=>relHeader.includes('Atendimento')),false);
  assert.equal(await page.evaluate(()=>relLinhas()[0].length),14);
  const exportEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const csvDownload=await exportEvent;
  assert.ok(csvDownload.suggestedFilename().endsWith(".csv"));
  const csvText=await readFile(await csvDownload.path(),'utf8');
  assert.equal(csvText.includes('Atendimento'),false);
  assert.equal(csvText.includes(await page.evaluate(()=>db.loans[0].grupo)),false);
  const excelEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar Excel (.xls)',exact:true}).click();
  const excelDownload=await excelEvent;const excelText=await readFile(await excelDownload.path(),'utf8');
  assert.deepEqual([...excelText.matchAll(/ss:Type="Number">([^<]+)/g)].map(m=>Number(m[1])),[1,3,1,1,1]);
  const popupEvent = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Imprimir / Salvar PDF", exact: true })
    .click();
  const report = await popupEvent;
  await report.waitForLoadState();
  assert.ok(await report.locator('link[href="/assets/report.css"]').count());
  await report.close();
  // Network failure must not claim success or keep a changed local setting.
  await context.setOffline(true);
  await page.evaluate(() => {
    tab("cadastros");
    registryTab("transportadoras");
    openRegistry(db.registries.transportadoras[0].id);
  });
  await page.locator("#registryNotes").fill("Offline não salva");
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await page.waitForFunction(() => !isSaving);
  assert.equal(await page.evaluate(() => needsRefresh), true);
  assert.notEqual(
    await page.evaluate(() => db.registries.transportadoras[0].notes),
    "Offline não salva",
  );
  await context.setOffline(false);
  await page.waitForFunction(
    () => !needsRefresh && !refreshing,
    {},
    { timeout: 12000 },
  );
  await page.evaluate(() => closeRegistry());
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tabName of [
    "painel",
    "emprestar",
    "cadastros",
    "estoque",
    "registros",
    "relatorios",
  ]) {
    await page.evaluate((id) => tab(id), tabName);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Overflow em " + tabName,
    );
  }
  assert.deepEqual(errors, []);
  await mkdir("test-results", { recursive: true });
  await page.evaluate(() => {
    $("toast").style.display = "none";
  });
  await page.evaluate(() => tab("painel"));
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  console.log(
    "PASS: interface + API + banco, dois dispositivos, conflito, perda de conexão, abertura automática, perda com relato, histórico, CSV e telas móveis.",
  );
  await context2.close();
} finally {
  await browser.close();
  const current = await (await fetch(base + "/api/state")).json();
  await fetch(base + "/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision: current.revision,
      state: initialState(),
      operation: "restore",
      requestId: randomUUID(),
    }),
  });
}
