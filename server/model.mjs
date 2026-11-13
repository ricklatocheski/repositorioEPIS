export const registryTypes = ["transportadoras", "motoristas", "veiculos"];
export const normalize = (x) =>
  String(x ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
export function initialState() {
  return {
    stock: [
      "Colete refletivo",
      "Capacete",
      "Óculos de proteção",
      "Protetor auricular",
      "Calçado de segurança",
      "Outros",
    ].map((nome) => ({ nome, inicial: 0, entradas: 0, baixas: 0, minimo: 2 })),
    loans: [],
    registries: { transportadoras: [], motoristas: [], veiculos: [] },
    settings: { unit: "Controle de EPIs", operator: "" },
  };
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function check(ok, message) {
  if (!ok) throw new HttpError(422, message);
}
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 100000000;
const text = (v, max = 100, required = true) =>
  typeof v === "string" &&
  v.length <= max &&
  (!required || v.trim().length > 0);
const validDate = (v) =>
  text(v, 40) &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
const identifier = (v) =>
  typeof v === "string" && /^[A-Za-z0-9-]{1,100}$/.test(v);
export function validateState(state) {
  check(
    object(state) && Array.isArray(state.stock) && Array.isArray(state.loans),
    "Estrutura de dados inválida.",
  );
  check(
    state.stock.length <= 500 && state.loans.length <= 15000,
    "O limite desta versão foi atingido. Exporte um backup e contate a manutenção.",
  );
  const names = new Set(),
    stockByName = new Map(),
    balances = new Map();
  for (const s of state.stock) {
    check(
      object(s) && text(s.nome, 90) && !names.has(normalize(s.nome)),
      "Nome de EPI inválido ou duplicado.",
    );
    check(
      ["inicial", "entradas", "baixas", "minimo"].every((k) => integer(s[k])),
      "As quantidades de estoque devem ser inteiras e não negativas.",
    );
    check(
      s.arquivado === undefined || typeof s.arquivado === "boolean",
      "Situação do EPI inválida.",
    );
    names.add(normalize(s.nome));
    stockByName.set(s.nome, s);
    balances.set(s.nome, s.inicial + s.entradas - s.baixas);
  }
  const loanIds = new Set();
  for (const l of state.loans) {
    check(
      object(l) && integer(l.id) && l.id > 0 && !loanIds.has(l.id),
      "Identificador de empréstimo inválido ou repetido.",
    );
    loanIds.add(l.id);
    check(
      text(l.epi, 90) && stockByName.has(l.epi),
      "O empréstimo referencia um EPI inexistente.",
    );
    check(
      ["motorista", "transportadora", "responsavel"].every((k) => text(l[k])) &&
        text(l.placa, 10) &&
        validDate(l.quando),
      "Preencha os dados do empréstimo corretamente.",
    );
    check(l.grupo === undefined || identifier(l.grupo), "Protocolo inválido.");
    check(
      l.obs === undefined || text(l.obs, 400, false),
      "Observação muito longa.",
    );
    check(
      integer(l.quantidade) &&
        l.quantidade > 0 &&
        integer(l.returned) &&
        integer(l.lost) &&
        l.returned + l.lost <= l.quantidade,
      "Quantidades do empréstimo inconsistentes.",
    );
    check(
      Array.isArray(l.returns) && l.returns.length <= 15000,
      "Histórico de devoluções inválido.",
    );
    let returned = 0,
      lost = 0;
    for (const r of l.returns) {
      check(
        object(r) &&
          integer(r.q) &&
          integer(r.lostq) &&
          r.q + r.lostq > 0 &&
          text(r.who) &&
          validDate(r.quando) &&
          (r.obs === undefined || text(r.obs, 400, false)),
        "Devolução inválida.",
      );
      returned += r.q;
      lost += r.lostq;
    }
    check(
      returned === l.returned && lost === l.lost,
      "O histórico das devoluções não corresponde ao saldo.",
    );
    balances.set(l.epi, balances.get(l.epi) - l.quantidade + l.returned);
  }
  for (const [name, balance] of balances)
    check(balance >= 0, "Estoque insuficiente ou inconsistente: " + name + ".");
  check(
    object(state.registries) && object(state.settings),
    "Cadastros ou preferências ausentes.",
  );
  check(
    text(state.settings.unit, 80) && text(state.settings.operator, 100, false),
    "Preferências inválidas.",
  );
  const allIds = new Set(),
    byType = {};
  for (const type of registryTypes) {
    const list = state.registries[type];
    check(
      Array.isArray(list) && list.length <= 15000,
      "Lista de cadastros inválida.",
    );
    const unique = new Set();
    byType[type] = new Map();
    for (const r of list) {
      check(
        object(r) &&
          identifier(r.id) &&
          !allIds.has(r.id) &&
          text(r.name) &&
          !unique.has(normalize(r.name)) &&
          typeof r.active === "boolean",
        "Cadastro inválido ou duplicado.",
      );
      check(
        (r.notes === undefined || text(r.notes, 250, false)) &&
          (r.carrierId === undefined ||
            r.carrierId === "" ||
            identifier(r.carrierId)),
        "Vínculo ou observação inválida.",
      );
      check(
        r.whatsapp === undefined ||
          r.whatsapp === "" ||
          (typeof r.whatsapp === "string" &&
            /^[1-9][0-9]{7,14}$/.test(r.whatsapp)),
        "WhatsApp inválido. Informe o código do país e DDD.",
      );
      allIds.add(r.id);
      unique.add(normalize(r.name));
      byType[type].set(r.id, r);
    }
  }
  for (const type of ["motoristas", "veiculos"])
    for (const r of state.registries[type])
      check(
        !r.carrierId || byType.transportadoras.has(r.carrierId),
        "Transportadora vinculada não existe.",
      );
  for (const l of state.loans)
    for (const [type, key] of [
      ["transportadoras", "carrierId"],
      ["motoristas", "driverId"],
      ["veiculos", "vehicleId"],
    ])
      check(
        !l[key] || (identifier(l[key]) && byType[type].has(l[key])),
        "Cadastro vinculado ao histórico não existe.",
      );
  return state;
}
export function validateTransition(previous, next, operation) {
  // An explicit backup restore is allowed to replace historical records.
  if (operation === "restore") return;
  const nextLoans = new Map(next.loans.map((l) => [l.id, l]));
  for (const old of previous.loans) {
    const l = nextLoans.get(old.id);
    check(!!l, "Empréstimos históricos não podem ser excluídos.");
    check(
      l.returned >= old.returned && l.lost >= old.lost,
      "Devoluções já registradas não podem ser removidas.",
    );
  }
  const previousIds = new Set(previous.loans.map((l) => l.id));
  for (const l of next.loans.filter((l) => !previousIds.has(l.id))) {
    const s = next.stock.find((s) => s.nome === l.epi);
    check(s && !s.arquivado, "O EPI está inativo.");
    check(
      l.returned === 0 && l.lost === 0 && l.returns.length === 0,
      "Novos empréstimos devem iniciar sem devoluções.",
    );
    for (const [type, key] of [
      ["transportadoras", "carrierId"],
      ["motoristas", "driverId"],
      ["veiculos", "vehicleId"],
    ])
      check(
        next.registries[type].find((r) => r.id === l[key])?.active,
        "Cadastro inexistente ou inativo.",
      );
  }
}
