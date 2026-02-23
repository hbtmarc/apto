const DB_KEY = "APTO_SIM_DB_V1";
const DB_VERSION = 3;
let memoryDbJsonFallback = "";

function readRawDbText() {
  try {
    const raw = localStorage.getItem(DB_KEY);

    if (typeof raw === "string") {
      memoryDbJsonFallback = raw;
      return raw;
    }
  } catch {
  }

  return memoryDbJsonFallback || null;
}

function writeRawDbText(rawText) {
  const text = String(rawText || "");
  memoryDbJsonFallback = text;

  try {
    localStorage.setItem(DB_KEY, text);
    return true;
  } catch {
    return false;
  }
}

function toValidId(value) {
  const id = Number(value);

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  return id;
}

function toNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return number;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneSeed() {
  const now = new Date().toISOString();

  return {
    dbVersion: DB_VERSION,
    projects: [
      {
        id: 1,
        name: "Projeto Exemplo",
        city: "São Paulo",
        uf: "SP",
        developer: "Construtora Exemplo",
        createdAt: now,
        updatedAt: now
      }
    ],
    simulations: [],
    ui: {
      selectedProjectId: null,
      selectedSimulationId: null
    }
  };
}

function sanitizeProject(input, fallbackId) {
  const safeInput = isObject(input) ? input : {};
  const now = new Date().toISOString();
  const id = toValidId(safeInput.id) || toValidId(fallbackId) || 1;

  return {
    id,
    name: String(safeInput.name || "").trim(),
    city: String(safeInput.city || "").trim(),
    uf: String(safeInput.uf || "").trim().toUpperCase(),
    developer: String(safeInput.developer || "").trim(),
    createdAt: String(safeInput.createdAt || now),
    updatedAt: now
  };
}

function sanitizeSimulation(input, fallbackId, projectIdsSet) {
  const safeInput = isObject(input) ? input : {};
  const now = new Date().toISOString();

  const id = toValidId(safeInput.id) || toValidId(fallbackId);
  const projectId = toValidId(safeInput.projectId);

  if (id === null || projectId === null || !projectIdsSet.has(projectId)) {
    return null;
  }

  const basePrice = toNonNegativeNumber(safeInput.basePrice, 0);
  const toleranceDaysNumber = Number(safeInput.toleranceDays);
  const toleranceDays = Number.isFinite(toleranceDaysNumber)
    ? Math.max(0, Math.floor(toleranceDaysNumber))
    : 0;

  const simulation = {
    id,
    projectId,
    name: String(safeInput.name || "").trim(),
    contractDate: String(safeInput.contractDate || "").trim(),
    deliveryDate: String(safeInput.deliveryDate || "").trim(),
    basePrice,
    toleranceDays,
    cashflows: sanitizeCashflows(safeInput.cashflows),
    builderPayments: sanitizeBuilderPayments(safeInput.builderPayments),
    extrasCosts: sanitizeExtrasCosts(safeInput.extrasCosts),
    protectionChecklist: sanitizeProtectionChecklist(safeInput.protectionChecklist),
    index: sanitizeIndexConfig(safeInput.index),
    financing: sanitizeFinancingConfig(safeInput.financing),
    createdAt: String(safeInput.createdAt || now),
    updatedAt: now
  };

  if (!simulation.name || !simulation.contractDate || !simulation.deliveryDate) {
    return null;
  }

  return simulation;
}

function sanitizeBuilderPayment(input, fallbackId) {
  const safeInput = isObject(input) ? input : {};
  const id = toValidId(safeInput.id) || toValidId(fallbackId);

  if (id === null) {
    return null;
  }

  const typeRaw = String(safeInput.type || "once").trim();
  const type = typeRaw === "monthly" || typeRaw === "balloon" ? typeRaw : "once";

  const amountModeRaw = String(safeInput.amountMode || "fixed").trim().toLowerCase();
  const amountMode = amountModeRaw === "percent" ? "percent" : "fixed";

  const phaseRaw = String(safeInput.phase || "Work").trim();
  const allowedPhases = ["Signal", "Entry", "Work", "Intermediary", "Keys"];
  const phase = allowedPhases.includes(phaseRaw) ? phaseRaw : "Work";

  const amount = toNonNegativeNumber(safeInput.amount, 0);
  const everyMonthsRaw = Number(safeInput.everyMonths);
  const everyMonths = Number.isFinite(everyMonthsRaw)
    ? Math.max(1, Math.floor(everyMonthsRaw))
    : 6;

  const item = {
    id,
    type,
    amountMode,
    amount,
    indexRef: String(safeInput.indexRef || "").trim(),
    phase,
    date: String(safeInput.date || "").trim(),
    startDate: String(safeInput.startDate || "").trim(),
    endDate: String(safeInput.endDate || "").trim(),
    everyMonths
  };

  if (type === "once") {
    item.startDate = "";
    item.endDate = "";
    item.everyMonths = 0;
  }

  if (type === "monthly") {
    item.date = "";
    item.everyMonths = 0;
  }

  if (type === "balloon") {
    item.date = "";
  }

  return item;
}

function sanitizeBuilderPayments(input) {
  const list = Array.isArray(input) ? input : [];
  const output = [];

  for (let index = 0; index < list.length; index += 1) {
    const item = sanitizeBuilderPayment(list[index], index + 1);

    if (!item) {
      continue;
    }

    output.push(item);
  }

  return output;
}

function sanitizeExtraCost(input, fallbackId) {
  const safeInput = isObject(input) ? input : {};
  const id = toValidId(safeInput.id) || toValidId(fallbackId);

  if (id === null) {
    return null;
  }

  const amount = toNonNegativeNumber(safeInput.amount, 0);

  return {
    id,
    label: String(safeInput.label || "").trim(),
    category: String(safeInput.category || "").trim(),
    dueMonth: String(safeInput.dueMonth || "").trim(),
    amount
  };
}

function sanitizeExtrasCosts(input) {
  const list = Array.isArray(input) ? input : [];
  const output = [];

  for (let index = 0; index < list.length; index += 1) {
    const item = sanitizeExtraCost(list[index], index + 1);

    if (!item) {
      continue;
    }

    output.push(item);
  }

  return output;
}

function sanitizeProtectionChecklist(input) {
  const safeInput = isObject(input) ? input : {};

  return {
    quadroResumo: safeInput.quadroResumo === true,
    memorialRegistryChecked: safeInput.memorialRegistryChecked === true,
    brokerageHighlighted: safeInput.brokerageHighlighted === true,
    satiPresent: safeInput.satiPresent === true,
    itbiProvisioned: safeInput.itbiProvisioned === true,
    notes: String(safeInput.notes || "").trim()
  };
}

function sanitizeIndexConfig(input) {
  const safeInput = isObject(input) ? input : {};
  const monthlyRateNumber = Number(safeInput.monthlyRate);

  return {
    enabled: safeInput.enabled === true,
    mode: "manual",
    monthlyRate: Number.isFinite(monthlyRateNumber) ? monthlyRateNumber : 0
  };
}

function sanitizeFinancingConfig(input) {
  const safeInput = isObject(input) ? input : {};
  const monthsNumber = Number(safeInput.months);
  const annualRateNumber = Number(safeInput.annualRate);

  return {
    enabled: safeInput.enabled === true,
    system: safeInput.system === "PRICE" ? "PRICE" : "SAC",
    startDate: String(safeInput.startDate || "").trim(),
    months: Number.isFinite(monthsNumber) ? Math.max(0, Math.floor(monthsNumber)) : 0,
    annualRate: Number.isFinite(annualRateNumber) ? annualRateNumber : 0
  };
}

function sanitizeCashflowItem(input, fallbackId) {
  const safeInput = isObject(input) ? input : {};
  const id = toValidId(safeInput.id) || toValidId(fallbackId);

  if (id === null) {
    return null;
  }

  const typeRaw = String(safeInput.type || "once").trim();
  const type =
    typeRaw === "monthly" || typeRaw === "balloon" || typeRaw === "installments"
      ? typeRaw
      : "once";
  const amount = toNonNegativeNumber(safeInput.amount, 0);
  const everyMonthsRaw = Number(safeInput.everyMonths);
  const installmentCountRaw = Number(safeInput.installmentCount);
  const everyMonths = Number.isFinite(everyMonthsRaw)
    ? Math.max(1, Math.floor(everyMonthsRaw))
    : 6;
  const installmentCount = Number.isFinite(installmentCountRaw)
    ? Math.max(1, Math.floor(installmentCountRaw))
    : 12;

  const item = {
    id,
    type,
    label: String(safeInput.label || "").trim(),
    amount,
    date: String(safeInput.date || "").trim(),
    startDate: String(safeInput.startDate || "").trim(),
    endDate: String(safeInput.endDate || "").trim(),
    everyMonths,
    installmentCount
  };

  if (!item.label) {
    return null;
  }

  if (type === "once") {
    item.startDate = "";
    item.endDate = "";
    item.everyMonths = 0;
    item.installmentCount = 1;
  }

  if (type === "monthly") {
    item.date = "";
    item.everyMonths = 0;
    item.installmentCount = 0;
  }

  if (type === "balloon") {
    item.date = "";
    item.installmentCount = 0;
  }

  if (type === "installments") {
    item.startDate = "";
    item.endDate = "";
    item.everyMonths = Math.max(1, item.everyMonths || 1);
    item.installmentCount = Math.max(1, item.installmentCount || 1);
  }

  return item;
}

function sanitizeCashflows(cashflowsInput) {
  const list = Array.isArray(cashflowsInput) ? cashflowsInput : [];
  const output = [];

  for (let index = 0; index < list.length; index += 1) {
    const item = sanitizeCashflowItem(list[index], index + 1);

    if (!item) {
      continue;
    }

    output.push(item);
  }

  return output;
}

function sanitizeDbShape(rawDb) {
  if (!isObject(rawDb)) {
    return cloneSeed();
  }

  const dbVersionRaw = Number(rawDb.dbVersion);
  const dbVersion = Number.isFinite(dbVersionRaw) && dbVersionRaw > 0 ? Math.floor(dbVersionRaw) : DB_VERSION;

  const projectsRaw = Array.isArray(rawDb.projects) ? rawDb.projects : [];
  const projects = [];

  for (const item of projectsRaw) {
    const id = toValidId(item && item.id);

    if (id === null) {
      continue;
    }

    const project = sanitizeProject(item, id);

    if (!project.name || !project.city || !project.uf || !project.developer) {
      continue;
    }

    projects.push(project);
  }

  const projectIdsSet = new Set(projects.map((item) => item.id));

  const simulationsRaw = Array.isArray(rawDb.simulations) ? rawDb.simulations : [];
  const simulations = [];

  for (const item of simulationsRaw) {
    const id = toValidId(item && item.id);

    if (id === null) {
      continue;
    }

    const simulation = sanitizeSimulation(item, id, projectIdsSet);

    if (!simulation) {
      continue;
    }

    simulations.push(simulation);
  }

  const uiRaw = isObject(rawDb.ui) ? rawDb.ui : {};
  let selectedProjectId = toValidId(uiRaw.selectedProjectId);
  let selectedSimulationId = toValidId(uiRaw.selectedSimulationId);

  if (selectedProjectId !== null) {
    const hasProject = projectIdsSet.has(selectedProjectId);

    if (!hasProject) {
      selectedProjectId = null;
    }
  }

  if (selectedSimulationId !== null) {
    const selectedSim = simulations.find((item) => item.id === selectedSimulationId) || null;

    if (!selectedSim) {
      selectedSimulationId = null;
    } else if (selectedProjectId === null || selectedSim.projectId !== selectedProjectId) {
      selectedSimulationId = null;
    }
  }

  return {
    dbVersion,
    projects,
    simulations,
    ui: {
      selectedProjectId,
      selectedSimulationId
    }
  };
}

function migrateDb(rawDb) {
  if (!isObject(rawDb)) {
    return cloneSeed();
  }

  const inputVersionRaw = Number(rawDb.dbVersion);
  const inputVersion =
    Number.isFinite(inputVersionRaw) && inputVersionRaw > 0 ? Math.floor(inputVersionRaw) : 0;

  if (inputVersion >= DB_VERSION) {
    const normalized = sanitizeDbShape(rawDb);
    return { ...normalized, dbVersion: DB_VERSION };
  }

  const uiFromRoot = {
    selectedProjectId: toValidId(rawDb.selectedProjectId),
    selectedSimulationId: toValidId(rawDb.selectedSimulationId)
  };

  const merged = {
    ...rawDb,
    dbVersion: DB_VERSION,
    ui: {
      ...(isObject(rawDb.ui) ? rawDb.ui : {}),
      selectedProjectId:
        toValidId(isObject(rawDb.ui) ? rawDb.ui.selectedProjectId : null) ??
        uiFromRoot.selectedProjectId,
      selectedSimulationId:
        toValidId(isObject(rawDb.ui) ? rawDb.ui.selectedSimulationId : null) ??
        uiFromRoot.selectedSimulationId
    }
  };

  return sanitizeDbShape(merged);
}

function parseDbJson(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return migrateDb(parsed);
  } catch {
    return cloneSeed();
  }
}

function validateImportCandidateObject(candidate) {
  const errors = [];
  const warnings = [];

  if (!isObject(candidate)) {
    errors.push("Raiz do JSON deve ser um objeto.");
    return { ok: false, errors, warnings, preview: null, sanitizedDb: null };
  }

  const versionRaw = Number(candidate.dbVersion);

  if (!Number.isFinite(versionRaw) || versionRaw <= 0) {
    errors.push("Campo dbVersion ausente ou inválido.");
  }

  if (!Array.isArray(candidate.projects)) {
    errors.push("Campo projects deve ser um array.");
  }

  if (!Array.isArray(candidate.simulations)) {
    errors.push("Campo simulations deve ser um array.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, preview: null, sanitizedDb: null };
  }

  const version = Math.floor(versionRaw);

  if (version < DB_VERSION) {
    warnings.push(`dbVersion ${version} será migrada para ${DB_VERSION}.`);
  }

  if (version > DB_VERSION) {
    warnings.push(
      `dbVersion ${version} é superior à atual (${DB_VERSION}); dados serão normalizados para compatibilidade.`
    );
  }

  const sanitizedDb = migrateDb(candidate);
  const preview = {
    inputVersion: version,
    targetVersion: DB_VERSION,
    projectsCount: Array.isArray(sanitizedDb.projects) ? sanitizedDb.projects.length : 0,
    simulationsCount: Array.isArray(sanitizedDb.simulations) ? sanitizedDb.simulations.length : 0,
    selectedProjectId: toValidId(sanitizedDb.ui && sanitizedDb.ui.selectedProjectId),
    selectedSimulationId: toValidId(sanitizedDb.ui && sanitizedDb.ui.selectedSimulationId)
  };

  return {
    ok: true,
    errors,
    warnings,
    preview,
    sanitizedDb
  };
}

export function getCurrentDbVersion() {
  return DB_VERSION;
}

export function validateImportJson(rawJsonText) {
  const rawText = String(rawJsonText || "").trim();

  if (!rawText) {
    return {
      ok: false,
      errors: ["Informe JSON para importar."],
      warnings: [],
      preview: null,
      sanitizedDb: null
    };
  }

  try {
    const parsed = JSON.parse(rawText);
    return validateImportCandidateObject(parsed);
  } catch {
    return {
      ok: false,
      errors: ["JSON inválido."],
      warnings: [],
      preview: null,
      sanitizedDb: null
    };
  }
}

function nextProjectId(projects) {
  let maxId = 0;

  for (const project of projects) {
    const id = toValidId(project.id);

    if (id !== null && id > maxId) {
      maxId = id;
    }
  }

  return maxId + 1;
}

function nextSimulationId(simulations) {
  let maxId = 0;

  for (const simulation of simulations) {
    const id = toValidId(simulation.id);

    if (id !== null && id > maxId) {
      maxId = id;
    }
  }

  return maxId + 1;
}

export function ensureDb() {
  const raw = readRawDbText();

  if (!raw) {
    const seed = cloneSeed();
    writeRawDbText(JSON.stringify(seed));
    return seed;
  }

  const db = parseDbJson(raw);

  writeRawDbText(JSON.stringify(db));
  return db;
}

export function getDb() {
  return ensureDb();
}

export function writeDb(nextDb) {
  const safeDb = sanitizeDbShape(nextDb);

  safeDb.dbVersion = DB_VERSION;

  writeRawDbText(JSON.stringify(safeDb));
  return safeDb;
}

export function setupStorage() {
  return ensureDb();
}

export function listProjects() {
  const db = getDb();
  return db.projects;
}

export function upsertProject(projectInput) {
  const db = getDb();
  const input = isObject(projectInput) ? projectInput : {};
  const inputId = toValidId(input.id);

  if (inputId !== null) {
    const index = db.projects.findIndex((item) => toValidId(item.id) === inputId);

    if (index >= 0) {
      const updated = sanitizeProject({ ...db.projects[index], ...input, id: inputId }, inputId);
      db.projects[index] = updated;
      writeDb(db);
      return updated;
    }
  }

  const createdId = nextProjectId(db.projects);
  const created = sanitizeProject({ ...input, id: createdId }, createdId);
  db.projects.push(created);
  writeDb(db);
  return created;
}

export function deleteProject(projectId) {
  const id = toValidId(projectId);

  if (id === null) {
    return false;
  }

  const db = getDb();
  const before = db.projects.length;

  db.projects = db.projects.filter((item) => toValidId(item.id) !== id);
  db.simulations = db.simulations.filter((item) => toValidId(item.projectId) !== id);

  if (db.projects.length === before) {
    return false;
  }

  if (toValidId(db.ui.selectedProjectId) === id) {
    db.ui.selectedProjectId = null;
  }

  const selectedSimulationId = toValidId(db.ui.selectedSimulationId);

  if (selectedSimulationId !== null) {
    const selectedExists = db.simulations.some((item) => toValidId(item.id) === selectedSimulationId);

    if (!selectedExists) {
      db.ui.selectedSimulationId = null;
    }
  }

  writeDb(db);
  return true;
}

export function listSimulationsByProject(projectId) {
  const id = toValidId(projectId);

  if (id === null) {
    return [];
  }

  const db = getDb();
  return db.simulations.filter((item) => toValidId(item.projectId) === id);
}

export function upsertSimulation(simulationInput) {
  const db = getDb();
  const input = isObject(simulationInput) ? simulationInput : {};
  const inputId = toValidId(input.id);
  const projectIdsSet = new Set(
    db.projects.map((item) => toValidId(item.id)).filter((item) => item !== null)
  );

  if (inputId !== null) {
    const index = db.simulations.findIndex((item) => toValidId(item.id) === inputId);

    if (index >= 0) {
      const merged = { ...db.simulations[index], ...input, id: inputId };
      const updated = sanitizeSimulation(merged, inputId, projectIdsSet);

      if (!updated) {
        return null;
      }

      db.simulations[index] = updated;
      writeDb(db);
      return updated;
    }
  }

  const createdId = nextSimulationId(db.simulations);
  const created = sanitizeSimulation({ ...input, id: createdId }, createdId, projectIdsSet);

  if (!created) {
    return null;
  }

  db.simulations.push(created);
  writeDb(db);
  return created;
}

export function deleteSimulation(simId) {
  const id = toValidId(simId);

  if (id === null) {
    return false;
  }

  const db = getDb();
  const before = db.simulations.length;

  db.simulations = db.simulations.filter((item) => toValidId(item.id) !== id);

  if (db.simulations.length === before) {
    return false;
  }

  if (toValidId(db.ui.selectedSimulationId) === id) {
    db.ui.selectedSimulationId = null;
  }

  writeDb(db);
  return true;
}

export function getSelectedProjectId() {
  const db = getDb();
  return toValidId(db.ui.selectedProjectId);
}

export function setSelectedProjectId(projectId) {
  const db = getDb();
  db.ui.selectedProjectId = toValidId(projectId);
  writeDb(db);
  return db.ui.selectedProjectId;
}

export function getSelectedSimulationId() {
  const db = getDb();
  return toValidId(db.ui.selectedSimulationId);
}

export function setSelectedSimulationId(simId) {
  const db = getDb();
  db.ui.selectedSimulationId = toValidId(simId);
  writeDb(db);
  return db.ui.selectedSimulationId;
}
