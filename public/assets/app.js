let db = {
  stock: [],
  loans: [],
  registries: { transportadoras: [], motoristas: [], veiculos: [] },
  settings: { unit: "Controle de EPIs", operator: "" },
};
const $ = (id) => document.getElementById(id),
  fmt = (x) => (x ? new Date(x).toLocaleString("pt-BR") : "—"),
  safe = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
function tab(id) {
  document
    .querySelectorAll("section")
    .forEach((x) => x.classList.toggle("active", x.id === id));
  render();
}
function status(l) {
  return l.returned + l.lost >= l.quantidade
    ? l.lost
      ? "Encerrado com baixa"
      : "Devolvido"
    : "Pendente";
}
function outstanding(nome) {
  return db.loans
    .filter((x) => x.epi === nome)
    .reduce((n, x) => n + x.quantidade - x.returned - x.lost, 0);
}
function lost(nome) {
  return db.loans.filter((x) => x.epi === nome).reduce((n, x) => n + x.lost, 0);
}
function available(s) {
  return s.inicial + s.entradas - s.baixas - lost(s.nome) - outstanding(s.nome);
}
function stockRegistered(stock) {
  const suggestion = [
    "Colete refletivo",
    "Capacete",
    "Óculos de proteção",
    "Protetor auricular",
    "Calçado de segurança",
    "Outros",
  ].includes(stock.nome);
  return (
    stock.cadastrado === true ||
    stock.inicial > 0 ||
    stock.entradas > 0 ||
    stock.baixas > 0 ||
    db.loans.some((loan) => loan.epi === stock.nome) ||
    (stock.cadastrado === undefined && !suggestion)
  );
}
function stockPhysicalTotal(stock) {
  return stock.inicial + stock.entradas - stock.baixas - lost(stock.nome);
}
function inventorySnapshot(selected = "") {
  const all = db.stock.filter(stockRegistered),
    selectedStocks = all.filter(
      (stock) => !selected || stock.nome === selected,
    );
  const active = selectedStocks.filter((stock) => !stock.arquivado),
    inactive = selectedStocks.filter((stock) => stock.arquivado);
  const free = active.reduce((sum, stock) => sum + available(stock), 0),
    inUse = selectedStocks.reduce(
      (sum, stock) => sum + outstanding(stock.nome),
      0,
    ),
    inactiveFree = inactive.reduce((sum, stock) => sum + available(stock), 0);
  return {
    all,
    active,
    free,
    inUse,
    inactiveFree,
    total: free + inUse + inactiveFree,
    pending: db.loans.filter(
      (loan) =>
        status(loan) === "Pendente" && (!selected || loan.epi === selected),
    ),
  };
}

function rows(a) {
  return (
    "<table><thead><tr>" +
    a[0].map((x) => "<th>" + x + "</th>").join("") +
    "</tr></thead><tbody>" +
    a
      .slice(1)
      .map(
        (row) =>
          "<tr>" + row.map((x) => "<td>" + x + "</td>").join("") + "</tr>",
      )
      .join("") +
    "</tbody></table>"
  );
}
function render() {
  let pending = db.loans.filter((x) => status(x) === "Pendente");
  let av = db.stock
    .filter((s) => !s.arquivado)
    .reduce((a, s) => a + available(s), 0);
  $("cards").innerHTML = [
    ["EPIs disponíveis", av],
    [
      "Unidades emprestadas",
      db.stock.reduce((a, s) => a + outstanding(s.nome), 0),
    ],
    [
      "Empréstimos pendentes",
      new Set(pending.map((l) => l.grupo || l.id)).size,
    ],
    ["Perdidos / danificados", db.loans.reduce((a, l) => a + l.lost, 0)],
    [
      "Tipos com estoque baixo",
      db.stock.filter((s) => !s.arquivado && available(s) <= s.minimo).length,
    ],
  ]
    .map(
      (x) =>
        '<div class="card"><span>' + x[0] + "</span><b>" + x[1] + "</b></div>",
    )
    .join("");
  let table = (ls) =>
    rows([
      [
        "ID",
        "Data",
        "Motorista",
        "Transportadora",
        "Placa",
        "EPI",
        "Qtd.",
        "Devolvido",
        "Baixado",
        "Situação",
        "Responsável",
        "Ação",
      ],
      ...ls.map((l) => [
        safe(l.id),
        fmt(l.quando),
        safe(l.motorista),
        safe(l.transportadora),
        safe(l.placa),
        safe(l.epi),
        l.quantidade,
        l.returned,
        l.lost,
        '<span class="tag ' +
          (status(l) === "Pendente" ? "" : "ok") +
          '">' +
          status(l) +
          "</span>",
        safe(l.responsavel),
        status(l) === "Pendente"
          ? '<button onclick="abrirDevolucao(' +
            l.id +
            ')">Devolver itens</button><button class="secondary loss-action" onclick="abrirPerda(' +
            l.id +
            ')">Registrar perda</button>'
          : "—",
      ]),
    ]);
  $("recentes").innerHTML = pending.length
    ? table(pending.slice(-10).reverse())
    : '<p class="muted">Nenhuma pendência.</p>';
  let q = $("busca").value.toLowerCase(),
    f = $("filtro").value;
  let filtered = db.loans
    .filter(
      (l) =>
        (!f || status(l) === f) &&
        [l.motorista, l.transportadora, l.placa, l.epi, String(l.id)]
          .join(" ")
          .toLowerCase()
          .includes(q),
    )
    .reverse();
  $("tabela").innerHTML = filtered.length
    ? table(filtered)
    : '<p class="muted">Nenhum registro encontrado.</p>';
  atualizarOpcoesItens();
  atualizarEpisRelatorio();
  renderReport();
  $("estoqueTabela").innerHTML = rows([
    ["EPI", "Disponível", "Ações"],
    ...db.stock
      .filter((s) => !s.arquivado && stockRegistered(s))
      .map((s) => [
        safe(s.nome),
        '<strong class="available-count">' +
          available(s) +
          "<small> unidades</small></strong>",
        '<div class="group-actions"><button class="secondary" onclick="abrirEditar(' +
          db.stock.indexOf(s) +
          ')">Editar</button><button class="danger" onclick="excluirEpi(' +
          db.stock.indexOf(s) +
          ')">Excluir</button></div>',
      ]),
  ]);
  if (!db.stock.some((s) => !s.arquivado && stockRegistered(s)))
    $("estoqueTabela").innerHTML =
      '<div class="empty-state"><strong>Nenhum EPI cadastrado.</strong>Informe o nome e a quantidade total para começar.</div>';
  $("stockNames").innerHTML = db.stock
    .filter((s) => !s.arquivado)
    .map((s) => '<option value="' + safe(s.nome) + '"></option>')
    .join("");
  $("estoqueArquivados").innerHTML = db.stock.some((s) => s.arquivado)
    ? rows([
        ["EPI", "Em aberto", "Ação"],
        ...db.stock
          .filter((s) => s.arquivado)
          .map((s) => [
            safe(s.nome),
            outstanding(s.nome),
            '<button class="secondary" onclick="reativarEpi(' +
              db.stock.indexOf(s) +
              ')">Reativar</button>',
          ]),
      ])
    : '<p class="muted">Nenhum EPI arquivado.</p>';
}
function atualizarEpisRelatorio() {
  let sel = $("relEpi"),
    old = sel.value;
  sel.innerHTML =
    '<option value="">Todos os EPIs</option>' +
    db.stock
      .map(
        (s) =>
          '<option value="' + safe(s.nome) + '">' + safe(s.nome) + "</option>",
      )
      .join("");
  sel.value = old;
}
function relDados() {
  let a = $("relInicio").value,
    b = $("relFim").value;
  let filters = [
    ["motorista", "relMotorista"],
    ["transportadora", "relTransportadora"],
    ["placa", "relPlaca"],
  ];
  if (a && b && a > b) return null;
  return db.loans
    .filter((l) => {
      let dia = String(l.quando || "").slice(0, 10);
      return (
        (!a || dia >= a) &&
        (!b || dia <= b) &&
        filters.every(([k, id]) =>
          String(l[k] || "")
            .toLocaleLowerCase("pt-BR")
            .includes($(id).value.trim().toLocaleLowerCase("pt-BR")),
        ) &&
        (!$("relEpi").value || l.epi === $("relEpi").value)
      );
    })
    .sort(
      (x, y) => String(x.quando).localeCompare(String(y.quando)) || x.id - y.id,
    );
}
const relHeader = [
  "ID",
  "Data e hora",
  "Motorista",
  "Transportadora",
  "Placa",
  "EPI",
  "Qtd. emprestada",
  "Devolvida",
  "Perdida / danificada",
  "Pendente",
  "Situação",
  "Funcionário da balança",
  "Histórico das devoluções",
  "Observações",
];
function relLinhas() {
  let data = relDados();
  return data === null
    ? null
    : data.map((l) => [
        l.id,
        fmt(l.quando),
        l.motorista,
        l.transportadora,
        l.placa,
        l.epi,
        l.quantidade,
        l.returned,
        l.lost,
        l.quantidade - l.returned - l.lost,
        status(l),
        l.responsavel,
        (l.returns || [])
          .map(
            (r) =>
              fmt(r.quando) +
              " | devolvidos: " +
              r.q +
              " | baixados: " +
              r.lostq +
              " | responsável: " +
              r.who +
              (r.occurrenceId ? " | ocorrência: " + r.occurrenceId : "") +
              (r.obs ? " | " + r.obs : ""),
          )
          .join(" / "),
        l.obs || "",
      ]);
}
function renderReport() {
  let linhas = relLinhas();
  if (linhas === null) {
    $("relAviso").textContent =
      "A data inicial não pode ser posterior à data final.";
    $("relResumo").innerHTML = "";
    $("relTabela").innerHTML = "";
    return;
  }
  $("relAviso").textContent = linhas.length
    ? "Relatório com " +
      linhas.length +
      " item(ns) de empréstimo. Cada tipo de EPI aparece em uma linha."
    : "Nenhum empréstimo encontrado para os filtros selecionados.";
  let total = linhas.reduce((a, l) => a + Number(l[6]), 0),
    pend = linhas.reduce((a, l) => a + Number(l[9]), 0),
    devol = linhas.reduce((a, l) => a + Number(l[7]), 0),
    perdas = linhas.reduce((a, l) => a + Number(l[8]), 0);
  $("relResumo").innerHTML = [
    ["Registros", linhas.length],
    ["Unidades emprestadas", total],
    ["Devolvidas", devol],
    ["Em aberto", pend],
    ["Perdidas / danificadas", perdas],
  ]
    .map(
      ([k, v]) =>
        '<div class="card"><span>' + k + "</span><b>" + v + "</b></div>",
    )
    .join("");
  $("relTabela").innerHTML = linhas.length
    ? rows([relHeader.map(safe), ...linhas.map((r) => r.map((v) => safe(v)))])
    : "";
}
function clearReport() {
  setReportMonth();
  ["relMotorista", "relTransportadora", "relPlaca", "relEpi"].forEach(
    (id) => ($(id).value = ""),
  );
  renderReport();
}
function relCheck() {
  let linhas = relLinhas();
  if (linhas === null) {
    alert("Corrija o período: a data inicial está depois da final.");
    return null;
  }
  return linhas;
}
function relFilename(ext) {
  return (
    "relatorio_epis_" +
    ($("relInicio").value || "inicio") +
    "_a_" +
    ($("relFim").value || "fim") +
    "." +
    ext
  );
}
function csvReport() {
  let linhas = relCheck();
  if (!linhas) return;
  let data = [relHeader, ...linhas]
    .map((row) =>
      row.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";"),
    )
    .join("\r\n");
  download(relFilename("csv"), "\ufeff" + data, "text/csv;charset=utf-8");
}
function excelReport() {
  let linhas = relCheck();
  if (!linhas) return;
  let esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  let xml =
    '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Empréstimos"><Table>' +
    [relHeader, ...linhas]
      .map(
        (row, i) =>
          "<Row>" +
          row
            .map(
              (v, j) =>
                '<Cell><Data ss:Type="' +
                (i > 0 && [0, 6, 7, 8, 9].includes(j) ? "Number" : "String") +
                '">' +
                esc(v) +
                "</Data></Cell>",
            )
            .join("") +
          "</Row>",
      )
      .join("") +
    "</Table></Worksheet></Workbook>";
  download(
    relFilename("xls"),
    "\ufeff" + xml,
    "application/vnd.ms-excel;charset=utf-8",
  );
}
function printReport() {
  let linhas = relCheck();
  if (!linhas) return;
  let t = rows([relHeader.map(safe), ...linhas.map((r) => r.map(safe))]);
  let date = $("relInicio").value + " a " + $("relFim").value;
  let w = window.open("", "_blank");
  if (!w) {
    alert(
      "O navegador bloqueou a janela de impressão. Permita pop-ups para este arquivo.",
    );
    return;
  }
  w.document.write(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de EPIs</title><link rel="stylesheet" href="/assets/report.css"></head><body><h1>Controle de EPIs — Relatório de empréstimos</h1><p>Período: ' +
      safe(date) +
      " | Registros: " +
      linhas.length +
      "</p>" +
      t +
      "<p>Gerado em " +
      safe(new Date().toLocaleString("pt-BR")) +
      "</p></body></html>",
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
function localNow() {
  let d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
$("quando").value = localNow();
let itemSeq = 0;
function adicionarItem() {
  let wrap = document.createElement("div");
  wrap.className = "epi-row";
  wrap.dataset.item = ++itemSeq;
  wrap.innerHTML =
    '<label>EPI *<select class="item-epi" required></select></label><label>Quantidade *<input class="item-qtd" type="number" min="1" step="1" value="1" required></label><button type="button" class="danger" onclick="removerItem(this)">Remover</button>';
  $("itensEmprestimo").appendChild(wrap);
  atualizarOpcoesItens();
}
function removerItem(btn) {
  if (document.querySelectorAll(".epi-row").length === 1)
    return alert("Mantenha ao menos um EPI no empréstimo.");
  btn.closest(".epi-row").remove();
}
function atualizarOpcoesItens() {
  document.querySelectorAll(".item-epi").forEach((sel) => {
    let old = sel.value;
    sel.innerHTML =
      '<option value="">Selecione um EPI</option>' +
      db.stock
        .filter((s) => !s.arquivado && stockRegistered(s))
        .map(
          (s) =>
            '<option value="' +
            safe(s.nome) +
            '"' +
            (s.nome === old ? " selected" : "") +
            ">" +
            safe(s.nome) +
            " (" +
            available(s) +
            " disponíveis)</option>",
        )
        .join("");
  });
}
adicionarItem();
$("loanForm").onsubmit = async (e) => {
  e.preventDefault();
  let v = Object.fromEntries(new FormData(e.target));
  let items = [...document.querySelectorAll(".epi-row")].map((r) => ({
    epi: r.querySelector(".item-epi").value,
    quantidade: Number(r.querySelector(".item-qtd").value),
  }));
  let grouped = new Map();
  for (let item of items) {
    let s = db.stock.find((x) => x.nome === item.epi);
    if (
      !s ||
      s.arquivado ||
      !Number.isInteger(item.quantidade) ||
      item.quantidade < 1
    )
      return alert(
        "Selecione um EPI e informe uma quantidade inteira positiva em cada linha.",
      );
    grouped.set(item.epi, (grouped.get(item.epi) || 0) + item.quantidade);
  }
  for (let [nome, q] of grouped) {
    let s = db.stock.find((x) => x.nome === nome);
    if (q > available(s))
      return alert(
        "Estoque insuficiente de " +
          nome +
          ". Solicitado: " +
          q +
          "; disponível: " +
          available(s),
      );
  }
  if (!items.length) return alert("Inclua ao menos um EPI.");
  let id = Math.max(0, ...db.loans.map((x) => x.id)) + 1;
  let group = "AT-" + Date.now() + "-" + id;
  let novos = items.map((item, i) => ({
    ...v,
    ...item,
    id: id + i,
    grupo: group,
    placa: v.placa.toUpperCase().trim(),
    returned: 0,
    lost: 0,
    returns: [],
  }));
  const beforeLoan = JSON.stringify(db);
  db.loans.push(...novos);
  ensureRegistry();
  const driver = db.registries.motoristas.find(
    (r) => r.id === novos[0].driverId,
  );
  if (driver && v.whatsapp) driver.whatsapp = v.whatsapp;
  if (!(await save())) {
    db = JSON.parse(beforeLoan);
    render();
    return;
  }
  e.target.reset();
  $("itensEmprestimo").innerHTML = "";
  adicionarItem();
  $("quando").value = localNow();
  alert("Empréstimo registrado com " + items.length + " item(ns).");
  tab("registros");
};

let grupoDevolucao = [];
function abrirDevolucao(id) {
  let alvo = db.loans.find((l) => l.id === id);
  if (!alvo) return;
  grupoDevolucao = db.loans
    .filter(
      (l) =>
        (alvo.grupo ? l.grupo === alvo.grupo : l.id === id) &&
        status(l) === "Pendente",
    )
    .map((l) => l.id);
  if (!grupoDevolucao.length)
    return alert("Este empréstimo não possui itens pendentes.");
  $("resumoDevolucao").textContent =
    "Motorista: " +
    alvo.motorista +
    " | Transportadora: " +
    alvo.transportadora +
    " | Placa: " +
    alvo.placa;
  $("listaDevolucao").innerHTML = grupoDevolucao
    .map((id) => {
      let l = db.loans.find((x) => x.id === id),
        pend = l.quantidade - l.returned - l.lost;
      return (
        '<div class="return-item" data-id="' +
        l.id +
        '"><div><b>' +
        safe(l.epi) +
        '</b><p class="muted">Emprestado: ' +
        l.quantidade +
        " | Já devolvido: " +
        l.returned +
        " | Em aberto: <b>" +
        pend +
        '</b></p></div><label>Devolvidos<input class="ret-q" type="number" min="0" max="' +
        pend +
        '" step="1" value="' +
        pend +
        '" required></label><input class="ret-lost" type="hidden" value="0" style="display:none"><div class="small">Restante: <strong class="ret-pend">0</strong></div></div>'
      );
    })
    .join("");
  $("dataDevolucao").value = localNow();
  $("obsDevolucao").value = "";
  $("modalDevolucao").classList.add("open");
  $("recebedor").focus();
  atualizarSaldosDevolucao();
}
function atualizarSaldosDevolucao() {
  document.querySelectorAll(".return-item").forEach((row) => {
    let l = db.loans.find((x) => x.id === Number(row.dataset.id)),
      p = l.quantidade - l.returned - l.lost,
      q = Number(row.querySelector(".ret-q").value),
      lostq = Number(row.querySelector(".ret-lost").value),
      rest = p - q - lostq;
    row.querySelector(".ret-pend").textContent = Number.isInteger(rest)
      ? rest
      : "—";
    row.querySelector(".ret-pend").style.color = rest < 0 ? "#b43b3b" : "";
  });
}
$("listaDevolucao").addEventListener("input", atualizarSaldosDevolucao);
function fecharDevolucao() {
  $("modalDevolucao").classList.remove("open");
  grupoDevolucao = [];
}
$("formDevolucao").onsubmit = async (e) => {
  e.preventDefault();
  let who = $("recebedor").value.trim(),
    quando = $("dataDevolucao").value,
    obs = $("obsDevolucao").value.trim();
  if (!who || !quando) return alert("Informe o responsável e a data.");
  let mudancas = [];
  for (let row of document.querySelectorAll(".return-item")) {
    let l = db.loans.find((x) => x.id === Number(row.dataset.id)),
      pend = l.quantidade - l.returned - l.lost,
      q = Number(row.querySelector(".ret-q").value),
      lostq = Number(row.querySelector(".ret-lost").value);
    if (
      !Number.isInteger(q) ||
      !Number.isInteger(lostq) ||
      q < 0 ||
      lostq < 0 ||
      q + lostq > pend
    )
      return alert(
        "Quantidade inválida para " + l.epi + ". Máximo em aberto: " + pend,
      );
    if (lostq)
      return alert(
        "Para registrar perda, use a opção Registrar perda no empréstimo.",
      );
    if (q + lostq) mudancas.push({ l, q, lostq });
  }
  if (!mudancas.length)
    return alert("Informe ao menos uma unidade devolvida ou baixada.");
  let snapshot = JSON.stringify(db);
  for (let { l, q, lostq } of mudancas) {
    l.returned += q;
    l.lost += lostq;
    l.returns.push({
      quando: new Date(quando).toISOString(),
      q,
      lostq,
      who,
      obs,
    });
  }
  if (!(await save())) {
    db = JSON.parse(snapshot);
    render();
    return;
  }
  fecharDevolucao();
  alert(
    "Devolução registrada: " +
      mudancas.length +
      " tipo(s) de EPI atualizado(s).",
  );
};
async function excluirEpi(i) {
  const s = db.stock[i];
  if (!s) return;
  const vinculado = db.loans.some((l) => l.epi === s.nome);
  if (vinculado) {
    if (
      !confirm(
        'O EPI "' +
          s.nome +
          '" possui empréstimos registrados.\n\nAo excluir, ele será removido dos novos empréstimos e do estoque ativo, mas o histórico e os relatórios continuarão preservados. Poderá ser reativado.\n\nConfirmar exclusão do cadastro ativo?',
      )
    )
      return;
    const antes = JSON.stringify(db);
    s.arquivado = true;
    if (!(await save())) {
      db = JSON.parse(antes);
      render();
      return;
    }
    alert(
      "EPI excluído da lista ativa e arquivado com segurança. Histórico preservado.",
    );
    return;
  }
  if (
    !confirm(
      'Excluir definitivamente o EPI "' +
        s.nome +
        '"? Esta operação não poderá ser desfeita.',
    )
  )
    return;
  const antes = JSON.stringify(db);
  db.stock.splice(i, 1);
  if (!(await save())) {
    db = JSON.parse(antes);
    render();
    return;
  }
  alert("Cadastro excluído com sucesso.");
}
async function reativarEpi(i) {
  let s = db.stock[i];
  if (!s || !s.arquivado) return;
  let antes = JSON.stringify(db);
  s.arquivado = false;
  if (!(await save())) {
    db = JSON.parse(antes);
    render();
    return;
  }
  alert("EPI reativado e disponível para novos empréstimos.");
}
let editIndex = -1;
function abrirEditar(i) {
  let s = db.stock[i];
  if (!s) return;
  editIndex = i;
  $("editNome").value = s.nome;
  $("editAvailable").value = stockPhysicalTotal(s);
  $("modalEditar").classList.add("open");
  $("editNome").focus();
}
function fecharEditar() {
  $("modalEditar").classList.remove("open");
  editIndex = -1;
}
function setStockTotal(stock, desired) {
  const inUse = outstanding(stock.nome);
  if (desired < inUse)
    throw Error(
      "Há " +
        inUse +
        " unidade(s) deste EPI com motoristas. O total não pode ser menor que isso. Para perda confirmada, use Registrar perda.",
    );
  const difference = desired - stockPhysicalTotal(stock);
  stock.cadastrado = true;
  if (difference > 0) stock.entradas += difference;
  else if (difference < 0) stock.baixas -= difference;
}
$("formEditar").onsubmit = async (e) => {
  e.preventDefault();
  const stock = db.stock[editIndex];
  if (!stock) return;
  const name = $("editNome").value.trim(),
    quantity = Number($("editAvailable").value);
  if (!name || !Number.isSafeInteger(quantity) || quantity < 0)
    return alert("Informe o nome e uma quantidade total válida.");
  if (
    db.stock.some(
      (s, i) => i !== editIndex && normalize(s.nome) === normalize(name),
    )
  )
    return alert("Já existe outro EPI com esse nome.");
  const before = JSON.stringify(db),
    oldName = stock.nome;
  stock.nome = name;
  db.loans.forEach((l) => {
    if (l.epi === oldName) l.epi = name;
  });
  try {
    setStockTotal(stock, quantity);
  } catch (error) {
    db = JSON.parse(before);
    return alert(error.message);
  }
  if (!(await save())) {
    db = JSON.parse(before);
    render();
    return;
  }
  fecharEditar();
  alert("EPI atualizado. Os empréstimos permanecem registrados.");
};
$("stockForm").onsubmit = async (e) => {
  e.preventDefault();
  const name = e.target.elements.nome.value.trim(),
    quantity = Number(e.target.elements.qtd.value);
  if (!name || !Number.isSafeInteger(quantity) || quantity < 0)
    return alert("Informe o EPI e a quantidade total existente.");
  const before = JSON.stringify(db);
  let stock = db.stock.find((s) => normalize(s.nome) === normalize(name));
  if (stock?.arquivado)
    return alert(
      "Este EPI está inativo. Reative-o na lista de EPIs inativos antes de atualizar.",
    );
  if (!stock) {
    stock = {
      nome: name,
      inicial: quantity,
      entradas: 0,
      baixas: 0,
      minimo: 2,
      cadastrado: true,
    };
    db.stock.push(stock);
  } else {
    try {
      setStockTotal(stock, quantity);
    } catch (error) {
      db = JSON.parse(before);
      return alert(error.message);
    }
  }
  if (!(await save())) {
    db = JSON.parse(before);
    render();
    return;
  }
  e.target.reset();
  alert(
    "Quantidade total atualizada. O disponível foi calculado automaticamente.",
  );
};
$("stockForm").elements.nome.addEventListener("input", (e) => {
  const stock = db.stock.find(
    (s) => !s.arquivado && normalize(s.nome) === normalize(e.target.value),
  );
  if (stock) $("stockForm").elements.qtd.value = stockPhysicalTotal(stock);
});

function download(name, data, type) {
  let a = document.createElement("a"),
    u = URL.createObjectURL(new Blob([data], { type }));
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const normalize = (x) =>
  String(x || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
const plate = (x) =>
  String(x || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
const registryTypes = ["transportadoras", "motoristas", "veiculos"];
const registryLabels = {
  transportadoras: "Transportadora",
  motoristas: "Motorista",
  veiculos: "Veículo",
};
let registryType = "transportadoras",
  registryEdit = null,
  toastTimer;
function toast(message) {
  $("toast").textContent = message;
  $("toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").style.display = "none"), 4500);
}
function ensureRegistry() {
  db.registries ||= {};
  db.settings ||= { unit: "Controle de EPIs", operator: "" };
  for (const type of registryTypes) db.registries[type] ||= [];
  for (const l of db.loans) {
    const carrier =
      db.registries.transportadoras.find((r) => r.id === l.carrierId) ||
      upsertRegistry("transportadoras", l.transportadora);
    const driver =
      db.registries.motoristas.find((r) => r.id === l.driverId) ||
      upsertRegistry("motoristas", l.motorista, carrier?.id);
    const vehicle =
      db.registries.veiculos.find((r) => r.id === l.vehicleId) ||
      upsertRegistry("veiculos", l.placa, carrier?.id);
    l.carrierId = carrier?.id;
    l.driverId = driver?.id;
    l.vehicleId = vehicle?.id;
  }
}
function upsertRegistry(type, name, carrierId) {
  name =
    type === "veiculos"
      ? plate(name)
      : String(name || "")
          .trim()
          .replace(/\s+/g, " ");
  if (!name) return null;
  let record = db.registries[type].find(
    (r) => normalize(r.name) === normalize(name),
  );
  if (!record) {
    record = {
      id: crypto.randomUUID(),
      name,
      active: true,
      carrierId: carrierId || "",
      notes: "",
    };
    db.registries[type].push(record);
  }
  return record;
}
ensureRegistry();
// Keep names from older backups compatible, including nonstandard legacy plates.
const lineIcons = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  plus: "M12 5v14 M5 12h14",
  loans: "M4 7h15 M15 3l4 4-4 4 M20 17H5 M9 13l-4 4 4 4",
  box: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 3 M18 18A8 8 0 0 1 5 15",
  search: "M21 21l-5-5 M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  clock: "M12 8v5l3 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  alert: "M12 3L2 21h20z M12 9v5 M12 17v1",
};
function uiIcon(name) {
  return (
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
    (lineIcons[name] || lineIcons.box) +
    '"/></svg>'
  );
}
function showPending() {
  $("filtro").value = "Pendente";
  $("busca").value = "";
  tab("registros");
}
function renderDashboard() {
  const filter = $("overviewEpi"),
    previous = filter.value,
    registered = db.stock.filter(stockRegistered);
  filter.innerHTML =
    '<option value="">Todos os EPIs</option>' +
    registered
      .map(
        (s) =>
          '<option value="' +
          safe(s.nome) +
          '">' +
          safe(s.nome) +
          (s.arquivado ? " (inativo)" : "") +
          "</option>",
      )
      .join("");
  filter.value = registered.some((s) => s.nome === previous) ? previous : "";
  const snapshot = inventorySnapshot(filter.value),
    stocks = snapshot.active,
    pending = snapshot.pending,
    av = snapshot.free,
    out = snapshot.inUse;
  const groups = new Map();
  for (const l of pending) {
    const key = l.grupo || String(l.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const stats = [
    [
      "EPIs disponíveis",
      av,
      filter.value ? filter.value : "Soma dos EPIs cadastrados",
      "box",
    ],
    [
      "Unidades em circulação",
      out,
      "Equipamentos aguardando devolução",
      "loans",
    ],
    [
      "Empréstimos em aberto",
      groups.size,
      "Empréstimos com itens pendentes",
      "clock",
    ],
    [
      "Tipos de EPI cadastrados",
      stocks.length,
      "Equipamentos cadastrados no estoque",
      "alert",
    ],
  ];
  $("cards").innerHTML = stats
    .map(
      ([label, value, desc, icon], i) =>
        '<div class="card ' +
        (i === 0 ? "primary-stat" : "") +
        '"><div class="stat-label"><span>' +
        label +
        "</span>" +
        uiIcon(icon) +
        "</div><b>" +
        String(value).padStart(2, "0") +
        "</b><small>" +
        desc +
        "</small></div>",
    )
    .join("");
  $("stockTypesCount").textContent = stocks.length + " tipos cadastrados";
  $("stockOverview").innerHTML = stocks.length
    ? stocks
        .map((s) => {
          const av = available(s),
            total = s.inicial + s.entradas - s.baixas - lost(s.nome),
            percentage =
              total > 0 ? Math.max(0, Math.min(100, (av / total) * 100)) : 0;
          return (
            '<div class="availability-row"><div><strong>' +
            safe(s.nome) +
            "</strong><small>" +
            (total === 0
              ? "Sem unidades disponíveis"
              : av === 0
                ? "Sem unidades disponíveis"
                : outstanding(s.nome) + " em circulação") +
            '</small></div><span class="stock-quantity">' +
            av +
            '<small>disponíveis</small></span><div class="stock-track ' +
            (av === 0 ? "low" : "") +
            '"><i style="width:' +
            percentage +
            '%"></i></div></div>'
          );
        })
        .join("")
    : '<div class="empty-state"><strong>Nenhum equipamento cadastrado.</strong>Cadastre os EPIs para acompanhar a disponibilidade.</div>';
  const total = snapshot.total,
    first = total ? (av / total) * 100 : 0,
    second = total ? ((av + out) / total) * 100 : 0;
  $("loanDistribution").innerHTML =
    '<div class="donut-wrap"><div class="donut" role="img" aria-label="' +
    av +
    " disponíveis e " +
    out +
    ' com motoristas" style="background:' +
    (total
      ? "conic-gradient(#b7c7a2 0 " +
        first +
        "%,#7d8d68 " +
        first +
        "% " +
        second +
        "%,#d0c2aa " +
        second +
        "% 100%)"
      : "#edf0e7") +
    '"><div><strong>' +
    String(total).padStart(2, "0") +
    '</strong><small>EPIs existentes agora</small></div></div></div><div class="distribution-legend">' +
    [
      ["Disponíveis", av, "returned"],
      ["Com motoristas", out, "circulating"],
      ...(snapshot.inactiveFree
        ? [["Inativos", snapshot.inactiveFree, "loss"]]
        : []),
    ]
      .map(
        ([label, number, color]) =>
          '<div><span><i class="' +
          color +
          '"></i>' +
          label +
          "</span><strong>" +
          number +
          "</strong></div>",
      )
      .join("") +
    '</div><p class="panel-note">Empréstimos antigos não são somados novamente ao estoque.</p>';
  const recent = [...groups.values()].reverse().slice(0, 5);
  $("recentes").innerHTML = recent.length
    ? rows([
        [
          "Motorista / transportadora",
          "Veículo",
          "Entrega",
          "Pendência",
          "Ação",
        ],
        ...recent.map((items) => {
          const l = items[0],
            n = items.reduce(
              (sum, x) => sum + x.quantidade - x.returned - x.lost,
              0,
            );
          return [
            '<div class="person-cell"><span class="avatar">' +
              safe(
                l.motorista
                  .split(/\s+/)
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join(""),
              ) +
              "</span><div><strong>" +
              safe(l.motorista) +
              "</strong><small>" +
              safe(l.transportadora) +
              "</small></div></div>",
            '<span class="plate-cell">' + safe(l.placa) + "</span>",
            safe(fmt(l.quando)),
            '<span class="tag">' + n + " un. em aberto</span>",
            '<button class="secondary" onclick="abrirDevolucao(' +
              l.id +
              ')">Devolver itens</button><button class="secondary loss-action" onclick="abrirPerda(' +
              l.id +
              ')">Registrar perda</button>',
          ];
        }),
      ])
    : '<div class="empty-state">' +
      uiIcon("shield") +
      "<strong>Nenhuma devolução pendente.</strong>Os próximos empréstimos aparecerão aqui.</div>";
  $("recentCount").textContent = recent.length
    ? "Exibindo " +
      recent.length +
      " de " +
      groups.size +
      " empréstimos em aberto"
    : "Todos os empréstimos estão em dia.";
}
const originalRender = render;
render = function () {
  originalRender();
  renderRegistry();
  renderRegistryOptions();
  if (!$("tabela").querySelector("table"))
    $("tabela").innerHTML =
      '<div class="empty-state"><strong>Nenhum empréstimo encontrado.</strong>Registre um empréstimo ou ajuste os filtros.</div>';
  renderDashboard();
  renderLossHistory();
};

const originalTab = tab;
tab = function (id) {
  if (id === "emprestar") {
    openLoanWizard();
    return;
  }
  if (!document.querySelector("section#" + id)) return;
  closeLoanWizard();
  originalTab(id);
  $("breadcrumbCurrent").textContent =
    {
      painel: "Visão geral",
      emprestar: "Novo empréstimo",
      registros: "Empréstimos e devoluções",
      estoque: "Estoque de EPIs",
      cadastros: "Cadastros",
      relatorios: "Relatórios",
    }[id] || "Visão geral";
  document.querySelectorAll("[data-tab]").forEach((b) => {
    if (b.dataset.tab === id) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "instant" });
};
function renderRegistryOptions() {
  for (const [type, id] of [
    ["transportadoras", "dlTransportadoras"],
    ["motoristas", "dlMotoristas"],
    ["veiculos", "dlVeiculos"],
  ])
    $(id).innerHTML = db.registries[type]
      .filter((r) => r.active)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((r) => '<option value="' + safe(r.name) + '"></option>')
      .join("");
}
function normalizeWhatsapp(value) {
  const text = String(value || "").trim();
  let digits = text.replace(/\D/g, "");
  if (!digits) return "";
  if (!text.startsWith("+") && (digits.length === 10 || digits.length === 11))
    digits = "55" + digits;
  return digits;
}
function validWhatsapp(value) {
  return /^[1-9][0-9]{7,14}$/.test(value);
}
function formatWhatsapp(value) {
  const digits = String(value || "");
  if (!digits) return "";
  if (/^55[0-9]{10,11}$/.test(digits)) {
    const national = digits.slice(2);
    return (
      "(" +
      national.slice(0, 2) +
      ") " +
      national.slice(2, -4) +
      "-" +
      national.slice(-4)
    );
  }
  return "+" + digits;
}
function whatsappLink(value) {
  if (!value || !validWhatsapp(value)) return "—";
  return (
    '<a class="whatsapp-link" href="https://wa.me/' +
    value +
    '" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp do motorista ' +
    safe(formatWhatsapp(value)) +
    '">' +
    safe(formatWhatsapp(value)) +
    " ↗</a>"
  );
}

function registryTab(type) {
  registryType = type;
  $("registrySearch").value = "";
  renderRegistry();
}
function linked(type, r) {
  const key = {
    transportadoras: "transportadora",
    motoristas: "motorista",
    veiculos: "placa",
  }[type];
  const idKey = {
    transportadoras: "carrierId",
    motoristas: "driverId",
    veiculos: "vehicleId",
  }[type];
  return (
    db.loans.some(
      (l) =>
        l[idKey] === r.id ||
        normalize(type === "veiculos" ? plate(l[key]) : l[key]) ===
          normalize(r.name),
    ) ||
    (type === "transportadoras" &&
      ["motoristas", "veiculos"].some((t) =>
        db.registries[t].some((x) => x.carrierId === r.id),
      ))
  );
}
function renderRegistry() {
  document
    .querySelectorAll("[data-registry]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.registry === registryType),
      ),
    );
  const query = normalize($("registrySearch").value);
  const records = db.registries[registryType]
    .filter(
      (r) =>
        ($("showInactive").checked || r.active) &&
        normalize(r.name).includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  $("registryTable").innerHTML = records.length
    ? rows([
        [
          "Nome / placa",
          "Transportadora",
          ...(registryType === "motoristas" ? ["WhatsApp"] : []),
          "Observações",
          "Situação",
          "Ações",
        ],
        ...records.map((r) => [
          safe(r.name),
          safe(
            db.registries.transportadoras.find((c) => c.id === r.carrierId)
              ?.name || "—",
          ),
          ...(registryType === "motoristas" ? [whatsappLink(r.whatsapp)] : []),
          safe(r.notes || "—"),
          '<span class="tag ' +
            (r.active ? "ok" : "") +
            '">' +
            (r.active ? "Ativo" : "Inativo") +
            "</span>",
          '<div class="group-actions"><button class="secondary" onclick="openRegistry(\'' +
            r.id +
            '\')">Editar</button><button class="secondary" onclick="toggleRegistry(\'' +
            r.id +
            "')\">" +
            (r.active ? "Inativar" : "Reativar") +
            "</button>" +
            (!linked(registryType, r)
              ? '<button class="danger" onclick="deleteRegistry(\'' +
                r.id +
                "')\">Excluir</button>"
              : "") +
            "</div>",
        ]),
      ])
    : '<div class="empty-state"><strong>Nenhum cadastro encontrado.</strong>Use “Novo cadastro” ou cadastre durante o empréstimo.</div>';
}
function openRegistry(id) {
  registryEdit = id || null;
  const r = db.registries[registryType].find((x) => x.id === id);
  $("registryTitle").textContent =
    (r ? "Editar " : "Cadastrar ") + registryLabels[registryType].toLowerCase();
  $("registryNameLabel").firstChild.textContent =
    registryType === "veiculos" ? "Placa *" : "Nome *";
  $("registryName").value = r?.name || "";
  $("registryName").maxLength = registryType === "veiculos" ? 8 : 100;
  $("registryName").pattern =
    registryType === "veiculos"
      ? "[A-Za-z]{3}-?[0-9][A-Za-z0-9][0-9]{2}"
      : ".*\\S.*";
  $("registryCarrierLabel").hidden = registryType === "transportadoras";
  $("registryCarrier").innerHTML =
    '<option value="">Sem vínculo</option>' +
    db.registries.transportadoras
      .filter((c) => c.active || c.id === r?.carrierId)
      .map(
        (c) =>
          '<option value="' +
          safe(c.id) +
          '">' +
          safe(c.name) +
          (c.active ? "" : " (inativa)") +
          "</option>",
      )
      .join("");
  $("registryCarrier").value = r?.carrierId || "";
  $("registryNotes").value = r?.notes || "";
  $("registryWhatsappLabel").hidden = registryType !== "motoristas";
  $("registryWhatsapp").value = formatWhatsapp(r?.whatsapp || "");
  $("registryModal").classList.add("open");
  $("registryName").focus();
}
function closeRegistry() {
  $("registryModal").classList.remove("open");
  registryEdit = null;
  document.querySelector('[data-registry="' + registryType + '"]').focus();
}
async function mutate(action) {
  const before = JSON.stringify(db);
  action();
  if (!(await save())) {
    db = JSON.parse(before);
    render();
    return false;
  }
  return true;
}
$("registryForm").onsubmit = async (e) => {
  e.preventDefault();
  const name =
    registryType === "veiculos"
      ? plate($("registryName").value)
      : $("registryName").value.trim().replace(/\s+/g, " ");
  if (!name) return;
  const whatsapp =
    registryType === "motoristas"
      ? normalizeWhatsapp($("registryWhatsapp").value)
      : "";
  if (
    registryType === "motoristas" &&
    $("registryWhatsapp").value.trim() &&
    !validWhatsapp(whatsapp)
  )
    return alert("Informe um WhatsApp válido com DDD ou código internacional.");
  const duplicate = db.registries[registryType].find(
    (r) => r.id !== registryEdit && normalize(r.name) === normalize(name),
  );
  if (duplicate)
    return alert("Este cadastro já existe. Verifique também os inativos.");
  if (
    await mutate(() => {
      let r = db.registries[registryType].find((x) => x.id === registryEdit);
      if (!r) r = upsertRegistry(registryType, name);
      r.name = name;
      r.carrierId =
        registryType === "transportadoras" ? "" : $("registryCarrier").value;
      r.notes = $("registryNotes").value.trim();
      if (registryType === "motoristas") r.whatsapp = whatsapp;
    })
  ) {
    closeRegistry();
    toast("Cadastro salvo. O histórico anterior permanece preservado.");
  }
};
async function toggleRegistry(id) {
  const r = db.registries[registryType].find((x) => x.id === id);
  if (!r) return;
  if (await mutate(() => (r.active = !r.active)))
    toast(
      r.active
        ? "Cadastro reativado."
        : "Cadastro inativado. Histórico preservado.",
    );
}
async function deleteRegistry(id) {
  const r = db.registries[registryType].find((x) => x.id === id);
  if (!r || linked(registryType, r)) return;
  if (!confirm("Excluir o cadastro “" + r.name + "”?")) return;
  if (
    await mutate(
      () =>
        (db.registries[registryType] = db.registries[registryType].filter(
          (x) => x.id !== id,
        )),
    )
  )
    toast("Cadastro excluído.");
}
// Existing names stay as historical snapshots; IDs connect new loans to reusable records.
const originalLoanSubmit = $("loanForm").onsubmit;
$("loanForm").onsubmit = async (e) => {
  const f = e.target;
  for (const name of ["motorista", "transportadora", "responsavel"])
    f.elements[name].value = f.elements[name].value.trim().replace(/\s+/g, " ");
  f.elements.placa.value = plate(f.elements.placa.value);
  for (const name of ["motorista", "transportadora", "responsavel"])
    if (!f.elements[name].value) {
      e.preventDefault();
      return alert("Preencha os campos obrigatórios.");
    }
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(f.elements.placa.value)) {
    e.preventDefault();
    return alert("Informe uma placa válida: ABC1234 ou ABC1D23.");
  }
  for (const [type, key] of [
    ["motoristas", "motorista"],
    ["transportadoras", "transportadora"],
    ["veiculos", "placa"],
  ]) {
    const r = db.registries[type].find(
      (r) => normalize(r.name) === normalize(f.elements[key].value),
    );
    if (r && !r.active) {
      e.preventDefault();
      return alert(
        "O cadastro “" +
          r.name +
          "” está inativo. Reative-o em Cadastros antes de emprestar.",
      );
    }
  }
  const loanWhatsapp = normalizeWhatsapp(f.elements.whatsapp.value);
  if (f.elements.whatsapp.value.trim() && !validWhatsapp(loanWhatsapp)) {
    e.preventDefault();
    return alert("Informe um WhatsApp válido com DDD ou código internacional.");
  }
  f.elements.whatsapp.value = loanWhatsapp;
  await originalLoanSubmit(e);
};

for (const [field, type] of [
  ["motorista", "motoristas"],
  ["placa", "veiculos"],
])
  $("loanForm").elements[field].addEventListener("change", (e) => {
    const key = field === "placa" ? plate(e.target.value) : e.target.value;
    const r = db.registries[type].find(
      (r) => r.active && normalize(r.name) === normalize(key),
    );
    const c = db.registries.transportadoras.find(
      (c) => c.id === r?.carrierId && c.active,
    );
    if (c) $("loanForm").elements.transportadora.value = c.name;
    if (field === "motorista")
      $("loanForm").elements.whatsapp.value = formatWhatsapp(r?.whatsapp || "");
  });
function setReportMonth() {
  const d = new Date(),
    y = d.getFullYear(),
    m = d.getMonth();
  const localDate = (x) =>
    x.getFullYear() +
    "-" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(x.getDate()).padStart(2, "0");
  $("relInicio").value = localDate(new Date(y, m, 1));
  $("relFim").value = localDate(new Date(y, m + 1, 0));
}
setReportMonth();
function validateBackup(data) {
  const int = (x) => Number.isSafeInteger(x) && x >= 0;
  if (!data || !Array.isArray(data.stock) || !Array.isArray(data.loans))
    throw Error("Estrutura inválida");
  const names = new Set(),
    ids = new Set();
  for (const s of data.stock) {
    if (
      typeof s.nome !== "string" ||
      !s.nome.trim() ||
      names.has(normalize(s.nome)) ||
      !["inicial", "entradas", "baixas", "minimo"].every((k) => int(s[k])) ||
      (s.arquivado !== undefined && typeof s.arquivado !== "boolean")
    )
      throw Error("Estoque inválido ou duplicado");
    names.add(normalize(s.nome));
  }
  for (const l of data.loans) {
    if (
      !int(l.id) ||
      ids.has(l.id) ||
      !data.stock.some((s) => s.nome === l.epi) ||
      !int(l.quantidade) ||
      l.quantidade < 1 ||
      !int(l.returned) ||
      !int(l.lost) ||
      l.returned + l.lost > l.quantidade ||
      !Array.isArray(l.returns) ||
      !["motorista", "transportadora", "placa", "responsavel", "quando"].every(
        (k) => typeof l[k] === "string",
      ) ||
      !Number.isFinite(new Date(l.quando).getTime())
    )
      throw Error("Empréstimo inválido");
    ids.add(l.id);
    for (const r of l.returns)
      if (
        !int(r.q) ||
        !int(r.lostq) ||
        typeof r.who !== "string" ||
        !Number.isFinite(new Date(r.quando).getTime())
      )
        throw Error("Devolução inválida");
    if (
      l.returns.reduce((n, r) => n + r.q, 0) !== l.returned ||
      l.returns.reduce((n, r) => n + r.lostq, 0) !== l.lost
    )
      throw Error("Saldo das devoluções inconsistente");
  }
  if (data.registries !== undefined) {
    if (!data.registries || typeof data.registries !== "object")
      throw Error("Cadastros inválidos");
    const allIds = new Set();
    for (const type of registryTypes) {
      if (!Array.isArray(data.registries[type]))
        throw Error("Cadastros inválidos");
      const unique = new Set();
      for (const r of data.registries[type]) {
        if (
          !r ||
          typeof r.id !== "string" ||
          !/^[a-zA-Z0-9-]+$/.test(r.id) ||
          allIds.has(r.id) ||
          typeof r.name !== "string" ||
          !r.name.trim() ||
          typeof r.active !== "boolean" ||
          unique.has(normalize(r.name)) ||
          (r.notes !== undefined && typeof r.notes !== "string") ||
          (r.carrierId !== undefined && typeof r.carrierId !== "string")
        )
          throw Error("Cadastro inválido ou duplicado");
        unique.add(normalize(r.name));
        allIds.add(r.id);
      }
    }
    for (const type of ["motoristas", "veiculos"])
      for (const r of data.registries[type])
        if (
          r.carrierId &&
          !data.registries.transportadoras.some((c) => c.id === r.carrierId)
        )
          throw Error("Vínculo de transportadora inválido");
  }
  if (data.registries)
    for (const r of data.registries.motoristas || [])
      if (
        r.whatsapp !== undefined &&
        (typeof r.whatsapp !== "string" ||
          (r.whatsapp && !validWhatsapp(r.whatsapp)))
      )
        throw Error("WhatsApp inválido no cadastro");
  if (
    data.settings !== undefined &&
    (!data.settings ||
      typeof data.settings.unit !== "string" ||
      typeof data.settings.operator !== "string")
  )
    throw Error("Preferências inválidas");
  return data;
}
// Keep keyboard focus inside visible dialogs and return it to the originating action.
let modalOrigin = null;
new MutationObserver((changes) => {
  for (const c of changes) {
    const modal = c.target;
    if (
      modal.classList.contains("open") &&
      !String(c.oldValue || "")
        .split(" ")
        .includes("open")
    ) {
      if (!modal.contains(document.activeElement))
        modalOrigin = document.activeElement;
      const first = modal.querySelector("input,select,button");
      first?.focus();
    } else if (
      !modal.classList.contains("open") &&
      String(c.oldValue || "")
        .split(" ")
        .includes("open")
    ) {
      modalOrigin?.focus();
    }
  }
}).observe(document.body, {
  subtree: true,
  attributes: true,
  attributeOldValue: true,
  attributeFilter: ["class"],
});
document.addEventListener("keydown", (e) => {
  const modal = document.querySelector(".modal-overlay.open");
  if (!modal) return;
  if (e.key === "Escape") {
    if (modal.id === "loanWizard") closeLoanWizard();
    else if (modal.id === "modalPerda") fecharPerda();
    else if (modal.id === "modalRelatoPerda") fecharRelatoPerda();
    else if (modal.id === "registryModal") closeRegistry();
    else if (modal.id === "modalEditar") fecharEditar();
    else fecharDevolucao();
  }
  if (e.key === "Tab") {
    const els = [...modal.querySelectorAll("input,select,button")].filter(
      (el) => !el.disabled && el.getClientRects().length,
    );
    const first = els[0],
      last = els.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
let revision = null,
  sharedReady = false,
  isSaving = false,
  needsRefresh = false,
  nextOperation = "update";
let refreshing = false,
  stateGeneration = 0,
  deferredShared = null;
function lockUI(locked) {
  const loanOpen = $("loanWizard").classList.contains("open");
  document
    .querySelectorAll("main,.sidebar,.topbar")
    .forEach((el) => (el.inert = locked || loanOpen));
  document
    .querySelectorAll(".modal-overlay")
    .forEach((el) => (el.inert = locked));
}
function syncStatus(message, bad = false) {
  $("syncError").hidden = !bad;
  if (bad) $("syncErrorMessage").textContent = message;
}
async function apiRequest(method, body) {
  const options = {
    method,
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  };
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch("/api/state", options);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Não foi possível acessar os registros. Tente novamente em instantes.",
    );
  }
  if (!response.ok) {
    const error = new Error(
      result.error || "Falha na comunicação com o banco.",
    );
    error.status = response.status;
    throw error;
  }
  return result;
}
function applyShared(data) {
  const firstConnection = !sharedReady;
  validateBackup(data.state);
  db = data.state;
  ensureRegistry();
  revision = data.revision;
  stateGeneration++;
  needsRefresh = false;
  sharedReady = true;
  deferredShared = null;
  render();
  $("networkGate").hidden = true;
  syncStatus("");
  if (firstConnection) openLoanWizard();
}
function flushDeferred() {
  if (
    !deferredShared ||
    isSaving ||
    document.querySelector(".modal-overlay.open:not(#loanWizard)")
  )
    return;
  if (deferredShared.revision > revision) applyShared(deferredShared);
  else deferredShared = null;
}
async function refreshShared(automatic = false) {
  if (isSaving || refreshing) return;
  refreshing = true;
  const generation = stateGeneration;
  if (!automatic) lockUI(true);
  $("gateRetry").hidden = true;
  try {
    const data = await apiRequest("GET");
    // A response started before a local save must never replace that save.
    if (isSaving || stateGeneration !== generation) return;
    if (automatic && sharedReady && data.revision === revision) {
      needsRefresh = false;
      syncStatus("");
      return;
    }
    if (
      automatic &&
      document.querySelector(".modal-overlay.open:not(#loanWizard)")
    ) {
      deferredShared = data;
      return;
    }
    applyShared(data);
  } catch (error) {
    if (!sharedReady) {
      $("networkGate").hidden = false;
      $("gateTitle").textContent = "Não foi possível conectar";
      $("gateMessage").textContent = error.message;
      $("gateRetry").hidden = false;
    } else
      syncStatus(
        "Não foi possível atualizar os registros. A conexão será tentada novamente automaticamente.",
        true,
      );
  } finally {
    refreshing = false;
    if (!automatic) lockUI(!sharedReady);
  }
}
async function save() {
  if (!sharedReady || needsRefresh || isSaving) {
    alert("Aguarde a atualização dos registros antes de salvar.");
    setTimeout(() => refreshShared(), 0);
    return false;
  }
  ensureRegistry();
  isSaving = true;
  stateGeneration++;
  document.body.dataset.saving = "true";
  $("networkProgress").hidden = false;
  lockUI(true);
  const payload = {
    revision,
    state: structuredClone(db),
    requestId: crypto.randomUUID(),
    operation: nextOperation,
  };
  nextOperation = "update";
  try {
    let result;
    try {
      result = await apiRequest("PUT", payload);
    } catch (error) {
      if (error.status) throw error;
      result = await apiRequest("PUT", payload);
    }
    revision = result.revision;
    render();
    syncStatus("");
    return true;
  } catch (error) {
    needsRefresh = true;
    syncStatus(
      "A alteração não foi confirmada. Os registros serão atualizados para você conferir e tentar novamente.",
      true,
    );
    alert(
      error.message +
        "\n\nOs registros serão atualizados automaticamente. Confira os dados antes de tentar novamente.",
    );
    // Allow the caller to roll back its draft before applying authoritative data.
    setTimeout(() => {
      if (error.status === 409) {
        document
          .querySelectorAll(".modal-overlay.open")
          .forEach((el) => el.classList.remove("open"));
      }
      refreshShared();
    }, 0);
    return false;
  } finally {
    isSaving = false;
    stateGeneration++;
    document.body.dataset.saving = "false";
    $("networkProgress").hidden = true;
    lockUI(false);
    setTimeout(flushDeferred, 0);
  }
}
for (const event of ["click", "submit"])
  document.addEventListener(
    event,
    (e) => {
      if (isSaving) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
// Poll automatically without changing the fields the operator is filling.
setInterval(() => {
  if (sharedReady && !isSaving && !document.hidden) refreshShared(true);
}, 5000);
for (const modal of document.querySelectorAll(".modal-overlay"))
  new MutationObserver(() => setTimeout(flushDeferred, 0)).observe(modal, {
    attributes: true,
    attributeFilter: ["class"],
  });
window.addEventListener("online", () => refreshShared(true));
window.addEventListener("offline", () =>
  syncStatus(
    "Sem conexão. Os registros serão atualizados automaticamente quando a rede voltar.",
    true,
  ),
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshShared(true);
});
window.addEventListener("beforeunload", (e) => {
  if (isSaving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function maskWhatsAppInput(input) {
  const raw = input.value;
  let digits = raw.replace(/\D/g, "");
  let cursorDigits = raw
    .slice(0, input.selectionStart ?? raw.length)
    .replace(/\D/g, "").length;
  // Preserve explicitly international numbers; Brazilian entries use DDD + number.
  if (raw.trim().startsWith("+") && !digits.startsWith("55")) {
    input.value = "+" + digits.slice(0, 15);
    return;
  }
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
    cursorDigits = Math.max(0, cursorDigits - 2);
  }
  digits = digits.slice(0, 11);
  let display = "";
  if (digits.length) display = "(" + digits.slice(0, 2);
  if (digits.length >= 2) display += ")";
  if (digits.length > 2) {
    const number = digits.slice(2),
      split = number.length === 8 ? 4 : 5;
    display +=
      " " +
      number.slice(0, split) +
      (number.length > split ? "-" + number.slice(split) : "");
  }
  input.value = display;
  let seen = 0,
    position = display.length;
  for (let i = 0; i < display.length; i++)
    if (/\d/.test(display[i]) && ++seen === cursorDigits) {
      position = i + 1;
      break;
    }
  input.setSelectionRange(position, position);
}
for (const input of [$("registryWhatsapp"), $("loanForm").elements.whatsapp])
  input.addEventListener("input", () => maskWhatsAppInput(input));

let lossDraftId = null,
  lossOrigin = null,
  lossDetailsOrigin = null;
function abrirPerda(id) {
  const loan = db.loans.find((l) => l.id === id);
  if (!loan) return;
  const items = db.loans.filter(
    (l) =>
      (loan.grupo ? l.grupo === loan.grupo : l.id === id) &&
      status(l) === "Pendente",
  );
  if (!items.length) return alert("Este empréstimo não tem itens pendentes.");
  lossOrigin = document.activeElement;
  $("lossForm").reset();
  $("lossDate").value = localNow();
  lossDraftId = "PERDA-" + Date.now() + "-" + crypto.randomUUID().slice(0, 8);
  $("lossLoanSummary").textContent =
    loan.motorista + " · " + loan.transportadora + " · " + loan.placa;
  $("lossItems").innerHTML = items
    .map((l) => {
      const pending = l.quantidade - l.returned - l.lost;
      return (
        '<div class="loss-item" data-loan="' +
        l.id +
        '"><div><strong>' +
        safe(l.epi) +
        "</strong><small>" +
        pending +
        ' unidade(s) ainda não devolvida(s)</small></div><label>Quantidade perdida<input class="loss-quantity" type="number" min="0" max="' +
        pending +
        '" step="1" value="' +
        (l.id === id ? 1 : 0) +
        '" required></label></div>'
      );
    })
    .join("");
  $("modalPerda").classList.add("open");
  $("lossReporter").focus();
}
function fecharPerda() {
  if (!isSaving) {
    $("modalPerda").classList.remove("open");
    lossDraftId = null;
    setTimeout(() => {
      if (lossOrigin?.isConnected) lossOrigin.focus();
      else document.querySelector('[data-tab="registros"]').focus();
    }, 0);
  }
}
$("lossForm").onsubmit = async (e) => {
  e.preventDefault();
  const who = $("lossReporter").value.trim(),
    date = $("lossDate").value,
    obs = $("lossReason").value.trim();
  if (!lossDraftId) return alert("Abra novamente o registro de perda.");
  if (
    db.loans.some((loan) =>
      loan.returns.some((event) => event.occurrenceId === lossDraftId),
    )
  ) {
    fecharPerda();
    toast("Esta perda já foi registrada. Confira o relato no histórico.");
    return;
  }
  if (!who || !date || obs.length < 10)
    return alert(
      "Informe o responsável da portaria, a data e um relato com pelo menos 10 caracteres.",
    );
  const changes = [];
  for (const row of $("lossItems").querySelectorAll(".loss-item")) {
    const loan = db.loans.find((l) => l.id === Number(row.dataset.loan)),
      quantity = Number(row.querySelector(".loss-quantity").value);
    if (
      !loan ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > loan.quantidade - loan.returned - loan.lost
    )
      return alert(
        "Confira a quantidade perdida. Ela não pode ultrapassar o que está pendente.",
      );
    if (quantity) changes.push({ loan, quantity });
  }
  if (!changes.length) return alert("Informe ao menos uma unidade perdida.");
  const before = JSON.stringify(db),
    occurrenceId = lossDraftId;
  for (const { loan, quantity } of changes) {
    loan.lost += quantity;
    loan.returns.push({
      quando: new Date(date).toISOString(),
      q: 0,
      lostq: quantity,
      who,
      obs,
      tipo: "perda",
      occurrenceId,
    });
  }
  if (!(await save())) {
    db = JSON.parse(before);
    render();
    return;
  }
  fecharPerda();
  toast("Perda registrada. O estoque disponível não foi aumentado.");
};
function lossRecords() {
  const records = new Map();
  for (const loan of db.loans)
    for (const [index, event] of (loan.returns || []).entries()) {
      if (!event.lostq) continue;
      const id = event.occurrenceId || "ANTERIOR-" + loan.id + "-" + index;
      if (!records.has(id))
        records.set(id, {
          id,
          legacy: !event.occurrenceId,
          event,
          loan,
          items: [],
        });
      records.get(id).items.push({ epi: loan.epi, quantity: event.lostq });
    }
  return [...records.values()].sort((a, b) =>
    String(b.event.quando).localeCompare(String(a.event.quando)),
  );
}
function renderLossHistory() {
  const records = lossRecords();
  $("lossHistoryCount").textContent = records.length + " registro(s)";
  $("lossHistory").innerHTML = records.length
    ? rows([
        [
          "Data",
          "Motorista / veículo",
          "EPI / quantidade",
          "Responsável",
          "Relato",
        ],
        ...records.map((r) => [
          safe(fmt(r.event.quando)),
          "<strong>" +
            safe(r.loan.motorista) +
            '</strong><small class="loss-cell-note">' +
            safe(r.loan.placa) +
            "</small>",
          r.items
            .map((i) => safe(i.epi) + " · " + i.quantity + " un.")
            .join("<br>"),
          safe(r.event.who),
          '<button class="secondary" onclick="abrirRelatoPerda(\'' +
            r.id +
            "')\">Ver relato</button>",
        ]),
      ])
    : '<div class="empty-state"><strong>Nenhuma perda registrada.</strong>Use “Registrar perda” somente quando a perda do EPI for confirmada.</div>';
}
function abrirRelatoPerda(id) {
  const record = lossRecords().find((r) => r.id === id);
  if (!record) return;
  const { loan, event } = record;
  lossDetailsOrigin = document.activeElement;
  $("lossDetails").innerHTML =
    '<p class="loss-reference">' +
    safe(
      record.legacy ? "Registro anterior sem protocolo de perda" : record.id,
    ) +
    '</p><dl class="loss-detail-grid"><div><dt>Motorista</dt><dd>' +
    safe(loan.motorista) +
    "</dd></div><div><dt>Transportadora / placa</dt><dd>" +
    safe(loan.transportadora) +
    " · " +
    safe(loan.placa) +
    "</dd></div><div><dt>Responsável da portaria</dt><dd>" +
    safe(event.who) +
    "</dd></div><div><dt>Data e horário</dt><dd>" +
    safe(fmt(event.quando)) +
    '</dd></div><div class="wide"><dt>Equipamentos perdidos / danificados</dt><dd>' +
    record.items
      .map((i) => safe(i.epi) + " · " + i.quantity + " unidade(s)")
      .join("<br>") +
    '</dd></div></dl><h3>Relato registrado</h3><p class="loss-narrative">' +
    safe(event.obs || "O registro anterior não contém relato.") +
    "</p>";
  $("modalRelatoPerda").classList.add("open");
  document.querySelector("#modalRelatoPerda button").focus();
}
function fecharRelatoPerda() {
  $("modalRelatoPerda").classList.remove("open");
  setTimeout(() => {
    if (lossDetailsOrigin?.isConnected) lossDetailsOrigin.focus();
    else document.querySelector('[data-tab="registros"]').focus();
  }, 0);
}

let loanOrigin = null;
function openLoanWizard() {
  const modal = $("loanWizard");
  if (modal.classList.contains("open")) return;
  loanOrigin = document.activeElement;
  if (!$("loanForm").elements.responsavel.value)
    $("loanForm").elements.responsavel.value = db.settings.operator || "";
  modal.classList.add("open");
  document.body.classList.add("loan-open");
  lockUI(isSaving);
  setTimeout(() => {
    if (modal.classList.contains("open") && !modal.inert)
      $("loanForm").elements.motorista.focus();
  }, 0);
}
function closeLoanWizard() {
  if (isSaving) return;
  const modal = $("loanWizard");
  if (!modal.classList.contains("open")) return;
  modal.classList.remove("open");
  document.body.classList.remove("loan-open");
  lockUI(false);
  if (loanOrigin && loanOrigin.isConnected && loanOrigin !== document.body)
    loanOrigin.focus();
  else document.querySelector('[data-tab="emprestar"]').focus();
}
$("loanWizard").addEventListener("click", (e) => {
  if (e.target === $("loanWizard")) closeLoanWizard();
});
new MutationObserver(() => {
  const open = $("loanWizard").classList.contains("open");
  document.body.classList.toggle("loan-open", open);
  if (!isSaving) lockUI(false);
}).observe($("loanWizard"), { attributes: true, attributeFilter: ["class"] });

tab("painel");
lockUI(true);
refreshShared();
