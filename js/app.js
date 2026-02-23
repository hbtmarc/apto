import {
  renderSection,
  renderProjectsSection,
  renderSimulationsSection,
  renderEditorSection,
  renderEmptyResults,
  renderComputedResults,
  renderExportJsonText,
  renderImportStatus,
  renderImportPreview,
  renderRequireProjectMessage,
  renderRequireSimulationMessage
} from "./render.js";
import {
  setupStorage,
  getDb,
  writeDb,
  listProjects,
  upsertProject,
  deleteProject,
  getSelectedProjectId,
  setSelectedProjectId,
  listSimulationsByProject,
  upsertSimulation,
  deleteSimulation,
  getSelectedSimulationId,
  setSelectedSimulationId,
  validateImportJson
} from "./storage.js";
import { computeSimulationResults } from "./calc.js";
import { buildRiskFlags } from "./risks.js";

const state = {
  editingProjectId: null,
  editingSimulationId: null,
  editingCashflowId: null,
  editingBuilderPaymentId: null,
  editingExtrasCostId: null,
  lastResultsBySimId: {},
  pendingImportDb: null,
  appState: {
    selectedProjectId: null,
    selectedSimId: null
  }
};

const BCB_SERIES = {
  selic: {
    code: 432,
    url: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"
  },
  ipca: {
    code: 433,
    url: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json"
  }
};

const MARKET_REFERENCES_BY_FIELD_ID = {
  "project-name": "Use o mesmo nome do material de venda e do contrato para evitar divergência documental.",
  "project-city": "Cidade conforme endereço do empreendimento na proposta.",
  "project-uf": "UF com 2 letras conforme padrão oficial (ex.: SP, RJ).",
  "project-developer": "Razão social/nome da incorporadora no contrato.",
  "simulation-name": "Nomeie para comparar cenários (ex.: Base, Estresse de prazo, Juros alto).",
  "simulation-contract-date": "Data de início da simulação (assinatura ou data-base da proposta).",
  "simulation-delivery-date": "Data prometida para entrega das chaves, antes da tolerância.",
  "simulation-base-price": "Valor principal do imóvel sem ITBI/cartório/mudança, usado como base dos percentuais.",
  "simulation-tolerance-days": "Referência legal prática: até 180 dias corridos quando pactuado (Lei 4.591/1964, art. 43-A).",
  "index-enabled": "Ative apenas se houver correção monetária prevista no contrato.",
  "index-monthly-rate": "Use o índice contratual do período. Referência macro recente: IPCA 0,33% a.m. (jan/2026, BCB SGS 433).",
  "financing-enabled": "Habilite se haverá financiamento bancário na etapa pós-obra.",
  "financing-system": "SAC (parcela decrescente) ou PRICE (parcela mais estável).",
  "financing-start-date": "Mês da 1ª parcela de financiamento.",
  "financing-months": "Prazo total financiado em meses (mercado: 120-420 meses).",
  "financing-annual-rate": "Taxa nominal anual da proposta do banco. Referência macro: Selic 15,00% a.a. (BCB SGS 432, último dado consultado).",
  "cashflow-type": "Tipo de recorrência do pagamento previsto na proposta.",
  "cashflow-label": "Nome claro do evento (ex.: Entrada, Intermediária 1, Reforço de chaves).",
  "cashflow-amount": "Valor nominal do item em reais.",
  "cashflow-date": "Data de vencimento para item único ou da 1ª parcela no tipo parcelado.",
  "cashflow-start-date": "Data de início para recorrência mensal/balão.",
  "cashflow-end-date": "Data final para recorrência mensal/balão.",
  "cashflow-every-months": "Intervalo em meses para cobranças tipo balão/parcelado.",
  "cashflow-installment-count": "Quantidade total de parcelas para dividir o valor total do item.",
  "builder-payment-type": "Estrutura comum de pagamento direto à construtora.",
  "builder-payment-phase": "Fase contratual: sinal, entrada, obra, intermediária ou chaves.",
  "builder-payment-amount-mode": "Fixo em R$ ou percentual do preço base.",
  "builder-payment-amount": "Valor do pagamento conforme proposta comercial.",
  "builder-payment-index-ref": "Índice de correção associado ao item (ex.: INCC).",
  "builder-payment-date": "Data exata para pagamento único.",
  "builder-payment-start-date": "Início da vigência para pagamento recorrente.",
  "builder-payment-end-date": "Fim da vigência para pagamento recorrente.",
  "builder-payment-every-months": "Periodicidade em meses para pagamento balão.",
  "extras-cost-label": "Nome do custo acessório (ex.: ITBI, Registro, Escritura, Mudança, Reserva condomínio).",
  "extras-cost-category": "Classifique para facilitar leitura no resultado (impostos, cartório, serviços, mudança etc.).",
  "extras-cost-due-month": "Mês estimado de desembolso do custo.",
  "extras-cost-amount": "Valor estimado atual; revise com orçamento/cotação real antes da assinatura.",
  "check-quadro-resumo": "Checklist do art. 35-A: quadro-resumo revisado.",
  "check-memorial-registry": "Memorial de incorporação e matrícula conferidos no cartório competente.",
  "check-brokerage-highlighted": "Corretagem explicitada e destacada em contrato.",
  "check-sati-present": "Registro de SATI para revisão jurídica.",
  "check-itbi-provisioned": "Reserva financeira para ITBI no planejamento.",
  "checklist-notes": "Observações de diligência para decisão final.",
  "results-timeline-category-filter": "Filtro analítico para leitura por categoria de custo.",
  "results-export-text": "Backup integral do banco local em JSON.",
  "results-import-text": "Cole JSON de backup para validação e restauração."
};

function parseBrDateToIso(brDate) {
  if (!brDate || typeof brDate !== "string") {
    return null;
  }

  const parts = brDate.split("/");

  if (parts.length !== 3) {
    return null;
  }

  const [day, month, year] = parts;
  const dayNum = Number(day);
  const monthNum = Number(month);
  const yearNum = Number(year);

  if (
    !Number.isFinite(dayNum) ||
    !Number.isFinite(monthNum) ||
    !Number.isFinite(yearNum) ||
    dayNum <= 0 ||
    monthNum <= 0 ||
    monthNum > 12
  ) {
    return null;
  }

  return `${String(yearNum).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

function formatDateForPtBr(brDate) {
  const iso = parseBrDateToIso(brDate);

  if (!iso) {
    return "data indisponível";
  }

  const date = new Date(`${iso}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "data indisponível";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatMonthYearFromBrDate(brDate) {
  const iso = parseBrDateToIso(brDate);

  if (!iso) {
    return "mês indisponível";
  }

  const date = new Date(`${iso}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "mês indisponível";
  }

  return date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric"
  });
}

function formatPercentPtBr(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return "-";
  }

  return `${num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function getFieldById(id) {
  const element = document.getElementById(id);

  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return element;
}

function updateFaqMarketReferences(marketData) {
  if (!marketData) {
    return false;
  }

  const selicValue = getFieldById("market-ref-selic-value");
  const selicDate = getFieldById("market-ref-selic-date");
  const ipcaValue = getFieldById("market-ref-ipca-value");
  const ipcaDate = getFieldById("market-ref-ipca-date");
  const updatedAt = getFieldById("market-ref-updated-at");

  if (selicValue) {
    selicValue.textContent = `${formatPercentPtBr(marketData.selic?.value)} a.a.`;
  }

  if (selicDate) {
    selicDate.textContent = `(${formatDateForPtBr(marketData.selic?.date)})`;
  }

  if (ipcaValue) {
    ipcaValue.textContent = `${formatPercentPtBr(marketData.ipca?.value)} no mês`;
  }

  if (ipcaDate) {
    ipcaDate.textContent = `(${formatMonthYearFromBrDate(marketData.ipca?.date)})`;
  }

  if (updatedAt) {
    updatedAt.textContent = new Date().toLocaleDateString("pt-BR");
  }

  return true;
}

function updateMarketReferenceTextsWithCurrentData(marketData) {
  if (!marketData) {
    return false;
  }

  const selicText = `${formatPercentPtBr(marketData.selic?.value)} a.a. (${formatDateForPtBr(marketData.selic?.date)})`;
  const ipcaText = `${formatPercentPtBr(marketData.ipca?.value)} a.m. (${formatMonthYearFromBrDate(marketData.ipca?.date)})`;

  MARKET_REFERENCES_BY_FIELD_ID["index-monthly-rate"] =
    `Use o índice contratual do período. Referência macro recente: IPCA ${ipcaText} (BCB SGS ${BCB_SERIES.ipca.code}).`;

  MARKET_REFERENCES_BY_FIELD_ID["financing-annual-rate"] =
    `Taxa nominal anual da proposta do banco. Referência macro: Selic ${selicText} (BCB SGS ${BCB_SERIES.selic.code}).`;

  return true;
}

async function fetchBcbLastValue(seriesUrl) {
  try {
    const response = await fetch(seriesUrl, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const first = data[0] || {};
    const value = Number(first.valor);
    const date = String(first.data || "").trim();

    if (!Number.isFinite(value) || !date) {
      return null;
    }

    return { value, date };
  } catch (_error) {
    return null;
  }
}

async function refreshMarketReferencesFromBcb() {
  const [selic, ipca] = await Promise.all([
    fetchBcbLastValue(BCB_SERIES.selic.url),
    fetchBcbLastValue(BCB_SERIES.ipca.url)
  ]);

  if (!selic || !ipca) {
    return false;
  }

  const marketData = { selic, ipca };
  updateFaqMarketReferences(marketData);
  updateMarketReferenceTextsWithCurrentData(marketData);
  applyMarketReferences();
  return true;
}

function resolveMarketReferenceText(field) {
  if (!field || !(field instanceof HTMLElement)) {
    return "";
  }

  const fieldId = String(field.id || "").trim();

  if (fieldId && MARKET_REFERENCES_BY_FIELD_ID[fieldId]) {
    return MARKET_REFERENCES_BY_FIELD_ID[fieldId];
  }

  const dataReference = String(field.getAttribute("data-market-ref") || "").trim();

  if (dataReference) {
    return dataReference;
  }

  const title = String(field.getAttribute("title") || "").trim();

  if (title) {
    return title;
  }

  return "Preencha conforme proposta comercial, contrato e documentos oficiais do negócio.";
}

function applyMarketReferences() {
  const fields = document.querySelectorAll("form input, form select, form textarea");

  for (const field of fields) {
    if (!(field instanceof HTMLElement)) {
      continue;
    }

    if (field.tagName === "INPUT") {
      const inputType = String(field.getAttribute("type") || "text").toLowerCase();

      if (inputType === "hidden") {
        continue;
      }
    }

    const container = field.closest("p") || field.parentElement;

    if (!container) {
      continue;
    }

    const existing = container.querySelector('[data-market-ref-text="true"]');

    if (existing) {
      existing.remove();
    }

    const refText = resolveMarketReferenceText(field);
    const helper = document.createElement("small");
    helper.setAttribute("data-market-ref-text", "true");
    helper.className = "market-ref";
    helper.textContent = `Ref. mercado: ${refText}`;
    container.appendChild(helper);
  }

  return true;
}

function toValidIdOrNull(value) {
  const id = Number(value);

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  return id;
}

function normalizeRoute(route) {
  if (route === "sims") {
    return "simulations";
  }

  return route;
}

function getRouteFromHash() {
  const rawHash = window.location.hash || "#projects";
  const route = normalizeRoute(rawHash.replace("#", ""));

  if (
    route === "projects" ||
    route === "simulations" ||
    route === "editor" ||
    route === "results" ||
    route === "faq"
  ) {
    return route;
  }

  return "projects";
}

function syncAppStateFromStorage() {
  state.appState.selectedProjectId = toValidIdOrNull(getSelectedProjectId());
  state.appState.selectedSimId = toValidIdOrNull(getSelectedSimulationId());

  let changed = false;
  const selectedProjectId = state.appState.selectedProjectId;
  const selectedSimId = state.appState.selectedSimId;

  if (selectedProjectId !== null) {
    const hasProject = listProjects().some((item) => toValidIdOrNull(item.id) === selectedProjectId);

    if (!hasProject) {
      state.appState.selectedProjectId = null;
      state.appState.selectedSimId = null;
      changed = true;
    }
  }

  if (state.appState.selectedProjectId === null && selectedSimId !== null) {
    state.appState.selectedSimId = null;
    changed = true;
  }

  if (state.appState.selectedProjectId !== null && state.appState.selectedSimId !== null) {
    const sims = listSimulationsByProject(state.appState.selectedProjectId);
    const hasSim = sims.some((item) => toValidIdOrNull(item.id) === state.appState.selectedSimId);

    if (!hasSim) {
      state.appState.selectedSimId = null;
      changed = true;
    }
  }

  if (changed) {
    setSelectedProjectId(state.appState.selectedProjectId);
    setSelectedSimulationId(state.appState.selectedSimId);
  }

  return true;
}

function updateAppSelection(projectId, simId) {
  if (projectId !== undefined) {
    state.appState.selectedProjectId = toValidIdOrNull(projectId);
  }

  if (simId !== undefined) {
    state.appState.selectedSimId = toValidIdOrNull(simId);
  }

  if (state.appState.selectedProjectId === null) {
    state.appState.selectedSimId = null;
  }

  if (state.appState.selectedProjectId !== null && state.appState.selectedSimId !== null) {
    const sims = listSimulationsByProject(state.appState.selectedProjectId);
    const hasSim = sims.some((item) => toValidIdOrNull(item.id) === state.appState.selectedSimId);

    if (!hasSim) {
      state.appState.selectedSimId = null;
    }
  }

  setSelectedProjectId(state.appState.selectedProjectId);
  setSelectedSimulationId(state.appState.selectedSimId);
  return true;
}

function getProjectFormElements() {
  return {
    form: document.getElementById("project-form"),
    idInput: document.getElementById("project-id"),
    nameInput: document.getElementById("project-name"),
    cityInput: document.getElementById("project-city"),
    ufInput: document.getElementById("project-uf"),
    developerInput: document.getElementById("project-developer")
  };
}

function getSimulationFormElements() {
  return {
    form: document.getElementById("simulation-form"),
    idInput: document.getElementById("simulation-id"),
    nameInput: document.getElementById("simulation-name"),
    contractDateInput: document.getElementById("simulation-contract-date"),
    deliveryDateInput: document.getElementById("simulation-delivery-date"),
    basePriceInput: document.getElementById("simulation-base-price"),
    toleranceDaysInput: document.getElementById("simulation-tolerance-days")
  };
}

function getCashflowFormElements() {
  return {
    form: document.getElementById("cashflow-form"),
    idInput: document.getElementById("cashflow-id"),
    typeInput: document.getElementById("cashflow-type"),
    labelInput: document.getElementById("cashflow-label"),
    amountInput: document.getElementById("cashflow-amount"),
    dateInput: document.getElementById("cashflow-date"),
    startDateInput: document.getElementById("cashflow-start-date"),
    endDateInput: document.getElementById("cashflow-end-date"),
    everyMonthsInput: document.getElementById("cashflow-every-months"),
    installmentCountInput: document.getElementById("cashflow-installment-count"),
    fieldOnceDate: document.getElementById("field-once-date"),
    fieldRangeStart: document.getElementById("field-range-start"),
    fieldRangeEnd: document.getElementById("field-range-end"),
    fieldEveryMonths: document.getElementById("field-every-months"),
    fieldInstallmentCount: document.getElementById("field-installment-count")
  };
}

function getEditorConfigFormElements() {
  return {
    form: document.getElementById("simulation-config-form"),
    indexEnabledInput: document.getElementById("index-enabled"),
    indexMonthlyRateInput: document.getElementById("index-monthly-rate"),
    financingEnabledInput: document.getElementById("financing-enabled"),
    financingSystemInput: document.getElementById("financing-system"),
    financingStartDateInput: document.getElementById("financing-start-date"),
    financingMonthsInput: document.getElementById("financing-months"),
    financingAnnualRateInput: document.getElementById("financing-annual-rate")
  };
}

function getBuilderPaymentFormElements() {
  return {
    form: document.getElementById("builder-payment-form"),
    idInput: document.getElementById("builder-payment-id"),
    typeInput: document.getElementById("builder-payment-type"),
    phaseInput: document.getElementById("builder-payment-phase"),
    amountModeInput: document.getElementById("builder-payment-amount-mode"),
    amountInput: document.getElementById("builder-payment-amount"),
    indexRefInput: document.getElementById("builder-payment-index-ref"),
    dateInput: document.getElementById("builder-payment-date"),
    startDateInput: document.getElementById("builder-payment-start-date"),
    endDateInput: document.getElementById("builder-payment-end-date"),
    everyMonthsInput: document.getElementById("builder-payment-every-months"),
    fieldOnceDate: document.getElementById("builder-field-once-date"),
    fieldRangeStart: document.getElementById("builder-field-range-start"),
    fieldRangeEnd: document.getElementById("builder-field-range-end"),
    fieldEveryMonths: document.getElementById("builder-field-every-months")
  };
}

function getExtrasCostFormElements() {
  return {
    form: document.getElementById("extras-cost-form"),
    idInput: document.getElementById("extras-cost-id"),
    labelInput: document.getElementById("extras-cost-label"),
    categoryInput: document.getElementById("extras-cost-category"),
    dueMonthInput: document.getElementById("extras-cost-due-month"),
    amountInput: document.getElementById("extras-cost-amount")
  };
}

function getProtectionChecklistFormElements() {
  return {
    form: document.getElementById("protection-checklist-form"),
    quadroResumoInput: document.getElementById("check-quadro-resumo"),
    memorialRegistryInput: document.getElementById("check-memorial-registry"),
    brokerageInput: document.getElementById("check-brokerage-highlighted"),
    satiInput: document.getElementById("check-sati-present"),
    itbiInput: document.getElementById("check-itbi-provisioned"),
    notesInput: document.getElementById("checklist-notes")
  };
}

function renderProjects() {
  const projects = listProjects();
  const selectedProjectId = state.appState.selectedProjectId;
  renderProjectsSection(projects, selectedProjectId);
  return true;
}

function getSelectedProject() {
  const selectedProjectId = state.appState.selectedProjectId;

  if (selectedProjectId === null) {
    return null;
  }

  const projects = listProjects();
  return projects.find((item) => toValidIdOrNull(item.id) === selectedProjectId) || null;
}

function getSelectedSimulationContext() {
  const project = getSelectedProject();

  if (!project) {
    return null;
  }

  const selectedSimulationId = state.appState.selectedSimId;

  if (selectedSimulationId === null) {
    return null;
  }

  const simulation = listSimulationsByProject(project.id).find(
    (item) => toValidIdOrNull(item.id) === selectedSimulationId
  );

  if (!simulation) {
    return null;
  }

  return { project, simulation };
}

function renderSimulations() {
  const project = getSelectedProject();

  if (!project) {
    renderSimulationsSection({ project: null, sims: [], selectedSimId: null });
    return false;
  }

  const sims = listSimulationsByProject(project.id);
  const selectedSimId = state.appState.selectedSimId;
  renderSimulationsSection({ project, sims, selectedSimId });
  return true;
}

function renderEditor() {
  const context = getSelectedSimulationContext();

  if (!context) {
    renderEditorSection({
      project: null,
      simulation: null,
      cashflows: [],
      builderPayments: [],
      extrasCosts: [],
      protectionChecklist: {}
    });
    return false;
  }

  const cashflows = Array.isArray(context.simulation.cashflows) ? context.simulation.cashflows : [];
  const builderPayments = Array.isArray(context.simulation.builderPayments)
    ? context.simulation.builderPayments
    : [];
  const extrasCosts = Array.isArray(context.simulation.extrasCosts)
    ? context.simulation.extrasCosts
    : [];
  const protectionChecklist =
    context.simulation.protectionChecklist && typeof context.simulation.protectionChecklist === "object"
      ? context.simulation.protectionChecklist
      : {};

  renderEditorSection({
    project: context.project,
    simulation: context.simulation,
    cashflows,
    builderPayments,
    extrasCosts,
    protectionChecklist
  });

  fillEditorConfigForm(context.simulation);
  return true;
}

function getResultsElements() {
  return {
    recalcButton: document.getElementById("btn-recalculate"),
    timelineCategoryFilter: document.getElementById("results-timeline-category-filter"),
    exportText: document.getElementById("results-export-text"),
    importText: document.getElementById("results-import-text"),
    copyButton: document.getElementById("results-copy-btn"),
    downloadButton: document.getElementById("results-download-btn"),
    previewImportButton: document.getElementById("results-import-preview-btn"),
    applyImportButton: document.getElementById("results-import-apply-btn")
  };
}

function renderResultsExportText() {
  const db = getDb();
  const text = JSON.stringify(db, null, 2);
  renderExportJsonText(text);
  return text;
}

function getCurrentCachedResults() {
  const context = getSelectedSimulationContext();

  if (!context) {
    return null;
  }

  const simId = toValidIdOrNull(context.simulation.id);

  if (simId === null) {
    return null;
  }

  return state.lastResultsBySimId[simId] || null;
}

function recalculateSelectedResults() {
  const context = getSelectedSimulationContext();

  if (!context) {
    renderEmptyResults("Selecione uma simulação para visualizar resultados.");
    return null;
  }

  const project = context.project;
  const simulation = context.simulation;
  const results = computeSimulationResults(simulation);
  const risks = buildRiskFlags(project, simulation);

  state.lastResultsBySimId[simulation.id] = {
    project,
    simulation,
    results,
    risks
  };

  renderComputedResults(state.lastResultsBySimId[simulation.id]);
  renderResultsExportText();
  return state.lastResultsBySimId[simulation.id];
}

function renderResults() {
  const context = getSelectedSimulationContext();

  if (!context) {
    renderEmptyResults("Selecione uma simulação para visualizar resultados.");
    renderResultsExportText();
    return false;
  }

  const simId = toValidIdOrNull(context.simulation.id);

  if (simId !== null && state.lastResultsBySimId[simId]) {
    renderComputedResults(state.lastResultsBySimId[simId]);
    renderResultsExportText();
    return true;
  }

  recalculateSelectedResults();
  return true;
}

function applyEditorConfigVisibility() {
  const {
    indexEnabledInput,
    financingEnabledInput,
    financingSystemInput,
    financingStartDateInput,
    financingMonthsInput,
    financingAnnualRateInput
  } = getEditorConfigFormElements();

  const indexEnabled = indexEnabledInput ? indexEnabledInput.checked : false;
  const financingEnabled = financingEnabledInput ? financingEnabledInput.checked : false;

  if (financingSystemInput) {
    financingSystemInput.disabled = !financingEnabled;
  }

  if (financingStartDateInput) {
    financingStartDateInput.disabled = !financingEnabled;
  }

  if (financingMonthsInput) {
    financingMonthsInput.disabled = !financingEnabled;
  }

  if (financingAnnualRateInput) {
    financingAnnualRateInput.disabled = !financingEnabled;
  }

  return true;
}

function fillEditorConfigForm(simulation) {
  const {
    indexEnabledInput,
    indexMonthlyRateInput,
    financingEnabledInput,
    financingSystemInput,
    financingStartDateInput,
    financingMonthsInput,
    financingAnnualRateInput
  } = getEditorConfigFormElements();

  const indexConfig = simulation && simulation.index ? simulation.index : {};
  const financingConfig = simulation && simulation.financing ? simulation.financing : {};

  if (indexEnabledInput) {
    indexEnabledInput.checked = indexConfig.enabled === true;
  }

  if (indexMonthlyRateInput) {
    const value = Number(indexConfig.monthlyRate);
    indexMonthlyRateInput.value = Number.isFinite(value) ? String(value) : "0";
  }

  if (financingEnabledInput) {
    financingEnabledInput.checked = financingConfig.enabled === true;
  }

  if (financingSystemInput) {
    financingSystemInput.value = financingConfig.system === "PRICE" ? "PRICE" : "SAC";
  }

  if (financingStartDateInput) {
    financingStartDateInput.value = String(financingConfig.startDate || "");
  }

  if (financingMonthsInput) {
    const value = Number(financingConfig.months);
    financingMonthsInput.value = Number.isFinite(value) ? String(value) : "0";
  }

  if (financingAnnualRateInput) {
    const value = Number(financingConfig.annualRate);
    financingAnnualRateInput.value = Number.isFinite(value) ? String(value) : "0";
  }

  applyEditorConfigVisibility();
  return true;
}

function clearProjectForm() {
  const { form, idInput, nameInput, cityInput, ufInput, developerInput } = getProjectFormElements();

  state.editingProjectId = null;

  if (idInput) idInput.value = "";
  if (nameInput) nameInput.value = "";
  if (cityInput) cityInput.value = "";
  if (ufInput) ufInput.value = "";
  if (developerInput) developerInput.value = "";

  if (form) {
    form.reset();
  }

  return true;
}

function clearSimulationForm() {
  const {
    form,
    idInput,
    nameInput,
    contractDateInput,
    deliveryDateInput,
    basePriceInput,
    toleranceDaysInput
  } = getSimulationFormElements();

  state.editingSimulationId = null;

  if (idInput) idInput.value = "";
  if (nameInput) nameInput.value = "";
  if (contractDateInput) contractDateInput.value = "";
  if (deliveryDateInput) deliveryDateInput.value = "";
  if (basePriceInput) basePriceInput.value = "";
  if (toleranceDaysInput) toleranceDaysInput.value = "";

  if (form) {
    form.reset();
  }

  return true;
}

function applyCashflowTypeVisibility(typeValue) {
  const {
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput,
    installmentCountInput,
    fieldOnceDate,
    fieldRangeStart,
    fieldRangeEnd,
    fieldEveryMonths,
    fieldInstallmentCount
  } = getCashflowFormElements();

  const type =
    typeValue === "monthly" || typeValue === "balloon" || typeValue === "installments"
      ? typeValue
      : "once";

  if (fieldOnceDate) fieldOnceDate.hidden = !(type === "once" || type === "installments");
  if (fieldRangeStart) fieldRangeStart.hidden = !(type === "monthly" || type === "balloon");
  if (fieldRangeEnd) fieldRangeEnd.hidden = !(type === "monthly" || type === "balloon");
  if (fieldEveryMonths) fieldEveryMonths.hidden = !(type === "balloon" || type === "installments");
  if (fieldInstallmentCount) fieldInstallmentCount.hidden = type !== "installments";

  if (dateInput) dateInput.required = type === "once" || type === "installments";
  if (startDateInput) startDateInput.required = type === "monthly" || type === "balloon";
  if (endDateInput) endDateInput.required = type === "monthly" || type === "balloon";
  if (everyMonthsInput) {
    everyMonthsInput.required = type === "balloon" || type === "installments";

    if (!everyMonthsInput.value) {
      everyMonthsInput.value = type === "installments" ? "1" : "6";
    }
  }

  if (installmentCountInput) {
    installmentCountInput.required = type === "installments";

    if (!installmentCountInput.value) {
      installmentCountInput.value = "12";
    }
  }

  return true;
}

function applyBuilderPaymentTypeVisibility(typeValue) {
  const {
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput,
    fieldOnceDate,
    fieldRangeStart,
    fieldRangeEnd,
    fieldEveryMonths
  } = getBuilderPaymentFormElements();

  const type = typeValue === "monthly" || typeValue === "balloon" ? typeValue : "once";

  if (fieldOnceDate) fieldOnceDate.hidden = type !== "once";
  if (fieldRangeStart) fieldRangeStart.hidden = type === "once";
  if (fieldRangeEnd) fieldRangeEnd.hidden = type === "once";
  if (fieldEveryMonths) fieldEveryMonths.hidden = type !== "balloon";

  if (dateInput) dateInput.required = type === "once";
  if (startDateInput) startDateInput.required = type !== "once";
  if (endDateInput) endDateInput.required = type !== "once";

  if (everyMonthsInput) {
    everyMonthsInput.required = type === "balloon";

    if (!everyMonthsInput.value) {
      everyMonthsInput.value = "6";
    }
  }

  return true;
}

function clearCashflowForm() {
  const {
    form,
    idInput,
    typeInput,
    labelInput,
    amountInput,
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput,
    installmentCountInput
  } = getCashflowFormElements();

  state.editingCashflowId = null;

  if (idInput) idInput.value = "";
  if (typeInput) typeInput.value = "once";
  if (labelInput) labelInput.value = "";
  if (amountInput) amountInput.value = "";
  if (dateInput) dateInput.value = "";
  if (startDateInput) startDateInput.value = "";
  if (endDateInput) endDateInput.value = "";
  if (everyMonthsInput) everyMonthsInput.value = "6";
  if (installmentCountInput) installmentCountInput.value = "12";

  if (form) {
    form.reset();
  }

  applyCashflowTypeVisibility("once");
  return true;
}

function clearBuilderPaymentForm() {
  const {
    form,
    idInput,
    typeInput,
    phaseInput,
    amountModeInput,
    amountInput,
    indexRefInput,
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput
  } = getBuilderPaymentFormElements();

  state.editingBuilderPaymentId = null;

  if (idInput) idInput.value = "";
  if (typeInput) typeInput.value = "once";
  if (phaseInput) phaseInput.value = "Work";
  if (amountModeInput) amountModeInput.value = "fixed";
  if (amountInput) amountInput.value = "";
  if (indexRefInput) indexRefInput.value = "";
  if (dateInput) dateInput.value = "";
  if (startDateInput) startDateInput.value = "";
  if (endDateInput) endDateInput.value = "";
  if (everyMonthsInput) everyMonthsInput.value = "6";

  if (form) {
    form.reset();
  }

  applyBuilderPaymentTypeVisibility("once");
  return true;
}

function clearExtrasCostForm() {
  const { form, idInput, labelInput, categoryInput, dueMonthInput, amountInput } =
    getExtrasCostFormElements();

  state.editingExtrasCostId = null;

  if (idInput) idInput.value = "";
  if (labelInput) labelInput.value = "";
  if (categoryInput) categoryInput.value = "";
  if (dueMonthInput) dueMonthInput.value = "";
  if (amountInput) amountInput.value = "";

  if (form) {
    form.reset();
  }

  return true;
}

function loadBuilderPaymentToForm(paymentId) {
  const id = toValidIdOrNull(paymentId);
  const context = getSelectedSimulationContext();

  if (id === null || !context) {
    return false;
  }

  const list = Array.isArray(context.simulation.builderPayments) ? context.simulation.builderPayments : [];
  const item = list.find((row) => toValidIdOrNull(row.id) === id);

  if (!item) {
    return false;
  }

  const {
    idInput,
    typeInput,
    phaseInput,
    amountModeInput,
    amountInput,
    indexRefInput,
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput
  } = getBuilderPaymentFormElements();

  state.editingBuilderPaymentId = id;

  if (idInput) idInput.value = String(id);
  if (typeInput) typeInput.value = String(item.type || "once");
  if (phaseInput) phaseInput.value = String(item.phase || "Work");
  if (amountModeInput) amountModeInput.value = String(item.amountMode || "fixed");
  if (amountInput) amountInput.value = String(item.amount ?? "");
  if (indexRefInput) indexRefInput.value = String(item.indexRef || "");
  if (dateInput) dateInput.value = String(item.date || "");
  if (startDateInput) startDateInput.value = String(item.startDate || "");
  if (endDateInput) endDateInput.value = String(item.endDate || "");
  if (everyMonthsInput) everyMonthsInput.value = String(item.everyMonths || 6);

  applyBuilderPaymentTypeVisibility(String(item.type || "once"));
  return true;
}

function loadExtrasCostToForm(costId) {
  const id = toValidIdOrNull(costId);
  const context = getSelectedSimulationContext();

  if (id === null || !context) {
    return false;
  }

  const list = Array.isArray(context.simulation.extrasCosts) ? context.simulation.extrasCosts : [];
  const item = list.find((row) => toValidIdOrNull(row.id) === id);

  if (!item) {
    return false;
  }

  const { idInput, labelInput, categoryInput, dueMonthInput, amountInput } =
    getExtrasCostFormElements();

  state.editingExtrasCostId = id;

  if (idInput) idInput.value = String(id);
  if (labelInput) labelInput.value = String(item.label || "");
  if (categoryInput) categoryInput.value = String(item.category || "");
  if (dueMonthInput) dueMonthInput.value = String(item.dueMonth || "");
  if (amountInput) amountInput.value = String(item.amount ?? "");

  return true;
}

function submitEditorConfigForm(event) {
  event.preventDefault();

  const {
    form,
    indexEnabledInput,
    indexMonthlyRateInput,
    financingEnabledInput,
    financingSystemInput,
    financingStartDateInput,
    financingMonthsInput,
    financingAnnualRateInput
  } = getEditorConfigFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const context = getSelectedSimulationContext();

  if (!context) {
    return false;
  }

  const indexMonthlyRateNumber = Number(indexMonthlyRateInput ? indexMonthlyRateInput.value : "");
  const financingMonthsNumber = Number(financingMonthsInput ? financingMonthsInput.value : "");
  const financingAnnualRateNumber = Number(
    financingAnnualRateInput ? financingAnnualRateInput.value : ""
  );

  const updatedSimulation = {
    ...context.simulation,
    index: {
      enabled: indexEnabledInput ? indexEnabledInput.checked : false,
      mode: "manual",
      monthlyRate: Number.isFinite(indexMonthlyRateNumber) ? indexMonthlyRateNumber : 0
    },
    financing: {
      enabled: financingEnabledInput ? financingEnabledInput.checked : false,
      system:
        financingSystemInput && financingSystemInput.value === "PRICE" ? "PRICE" : "SAC",
      startDate: financingStartDateInput ? String(financingStartDateInput.value || "") : "",
      months: Number.isFinite(financingMonthsNumber) ? financingMonthsNumber : 0,
      annualRate: Number.isFinite(financingAnnualRateNumber) ? financingAnnualRateNumber : 0
    }
  };

  upsertSimulation(updatedSimulation);
  renderEditor();
  return true;
}

function loadProjectToForm(projectId) {
  const id = toValidIdOrNull(projectId);

  if (id === null) {
    return false;
  }

  const project = listProjects().find((item) => toValidIdOrNull(item.id) === id);

  if (!project) {
    return false;
  }

  const { idInput, nameInput, cityInput, ufInput, developerInput } = getProjectFormElements();

  state.editingProjectId = id;

  if (idInput) idInput.value = String(id);
  if (nameInput) nameInput.value = String(project.name || "");
  if (cityInput) cityInput.value = String(project.city || "");
  if (ufInput) ufInput.value = String(project.uf || "");
  if (developerInput) developerInput.value = String(project.developer || "");

  return true;
}

function loadSimulationToForm(simId) {
  const id = toValidIdOrNull(simId);
  const project = getSelectedProject();

  if (id === null || !project) {
    return false;
  }

  const sim = listSimulationsByProject(project.id).find((item) => toValidIdOrNull(item.id) === id);

  if (!sim) {
    return false;
  }

  const {
    idInput,
    nameInput,
    contractDateInput,
    deliveryDateInput,
    basePriceInput,
    toleranceDaysInput
  } = getSimulationFormElements();

  state.editingSimulationId = id;

  if (idInput) idInput.value = String(id);
  if (nameInput) nameInput.value = String(sim.name || "");
  if (contractDateInput) contractDateInput.value = String(sim.contractDate || "");
  if (deliveryDateInput) deliveryDateInput.value = String(sim.deliveryDate || "");
  if (basePriceInput) basePriceInput.value = String(sim.basePrice ?? "");
  if (toleranceDaysInput) toleranceDaysInput.value = String(sim.toleranceDays ?? 0);

  return true;
}

function loadCashflowToForm(cashflowId) {
  const id = toValidIdOrNull(cashflowId);
  const context = getSelectedSimulationContext();

  if (id === null || !context) {
    return false;
  }

  const cashflows = Array.isArray(context.simulation.cashflows) ? context.simulation.cashflows : [];
  const item = cashflows.find((row) => toValidIdOrNull(row.id) === id);

  if (!item) {
    return false;
  }

  const {
    idInput,
    typeInput,
    labelInput,
    amountInput,
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput,
    installmentCountInput
  } = getCashflowFormElements();

  state.editingCashflowId = id;

  if (idInput) idInput.value = String(id);
  if (typeInput) typeInput.value = String(item.type || "once");
  if (labelInput) labelInput.value = String(item.label || "");
  if (amountInput) amountInput.value = String(item.amount ?? "");
  if (dateInput) dateInput.value = String(item.date || "");
  if (startDateInput) startDateInput.value = String(item.startDate || "");
  if (endDateInput) endDateInput.value = String(item.endDate || "");
  if (everyMonthsInput) everyMonthsInput.value = String(item.everyMonths || 6);
  if (installmentCountInput) installmentCountInput.value = String(item.installmentCount || 12);

  applyCashflowTypeVisibility(String(item.type || "once"));
  return true;
}

function submitProjectForm(event) {
  event.preventDefault();

  const { form, idInput, nameInput, cityInput, ufInput, developerInput } = getProjectFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const idFromHidden = toValidIdOrNull(idInput ? idInput.value : null);
  const id = idFromHidden !== null ? idFromHidden : state.editingProjectId;

  upsertProject({
    id,
    name: nameInput ? nameInput.value : "",
    city: cityInput ? cityInput.value : "",
    uf: ufInput ? ufInput.value : "",
    developer: developerInput ? developerInput.value : ""
  });

  clearProjectForm();
  renderProjects();
  return true;
}

function submitSimulationForm(event) {
  event.preventDefault();

  const {
    form,
    idInput,
    nameInput,
    contractDateInput,
    deliveryDateInput,
    basePriceInput,
    toleranceDaysInput
  } = getSimulationFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const project = getSelectedProject();

  if (!project) {
    return false;
  }

  const idFromHidden = toValidIdOrNull(idInput ? idInput.value : null);
  const id = idFromHidden !== null ? idFromHidden : state.editingSimulationId;

  const basePriceNumber = Number(basePriceInput ? basePriceInput.value : 0);
  const toleranceDaysNumber = Number(toleranceDaysInput ? toleranceDaysInput.value : 0);

  upsertSimulation({
    id,
    projectId: project.id,
    name: nameInput ? nameInput.value : "",
    contractDate: contractDateInput ? contractDateInput.value : "",
    deliveryDate: deliveryDateInput ? deliveryDateInput.value : "",
    basePrice: Number.isFinite(basePriceNumber) ? basePriceNumber : 0,
    toleranceDays: Number.isFinite(toleranceDaysNumber) ? toleranceDaysNumber : 0
  });

  clearSimulationForm();
  renderSimulations();
  return true;
}

function submitCashflowForm(event) {
  event.preventDefault();

  const {
    form,
    idInput,
    typeInput,
    labelInput,
    amountInput,
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput,
    installmentCountInput
  } = getCashflowFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const context = getSelectedSimulationContext();

  if (!context) {
    return false;
  }

  const sim = context.simulation;
  const currentCashflows = Array.isArray(sim.cashflows) ? sim.cashflows : [];

  const type = typeInput ? typeInput.value : "once";
  const amountNumber = Number(amountInput ? amountInput.value : 0);
  const everyMonthsNumber = Number(everyMonthsInput ? everyMonthsInput.value : 6);
  const installmentCountNumber = Number(installmentCountInput ? installmentCountInput.value : 12);
  const idFromHidden = toValidIdOrNull(idInput ? idInput.value : null);
  const editId = idFromHidden !== null ? idFromHidden : state.editingCashflowId;

  const nextItem = {
    id: editId,
    type,
    label: labelInput ? labelInput.value : "",
    amount: Number.isFinite(amountNumber) ? amountNumber : 0,
    date: dateInput ? dateInput.value : "",
    startDate: startDateInput ? startDateInput.value : "",
    endDate: endDateInput ? endDateInput.value : "",
    everyMonths: Number.isFinite(everyMonthsNumber) ? everyMonthsNumber : 6,
    installmentCount: Number.isFinite(installmentCountNumber) ? installmentCountNumber : 12
  };

  if (nextItem.type === "once") {
    nextItem.startDate = "";
    nextItem.endDate = "";
    nextItem.everyMonths = 0;
    nextItem.installmentCount = 1;
  }

  if (nextItem.type === "monthly") {
    nextItem.date = "";
    nextItem.everyMonths = 0;
    nextItem.installmentCount = 0;
  }

  if (nextItem.type === "balloon") {
    nextItem.date = "";
    nextItem.installmentCount = 0;
  }

  if (nextItem.type === "installments") {
    nextItem.startDate = "";
    nextItem.endDate = "";
    nextItem.everyMonths = Math.max(1, Math.floor(nextItem.everyMonths || 1));
    nextItem.installmentCount = Math.max(1, Math.floor(nextItem.installmentCount || 1));
  }

  const items = [];

  for (const item of currentCashflows) {
    const currentId = toValidIdOrNull(item.id);

    if (editId !== null && currentId === editId) {
      continue;
    }

    items.push(item);
  }

  if (editId === null) {
    let maxId = 0;

    for (const item of currentCashflows) {
      const currentId = toValidIdOrNull(item.id);

      if (currentId !== null && currentId > maxId) {
        maxId = currentId;
      }
    }

    nextItem.id = maxId + 1;
  }

  items.push(nextItem);

  upsertSimulation({
    ...sim,
    cashflows: items
  });

  clearCashflowForm();
  renderEditor();
  return true;
}

function submitBuilderPaymentForm(event) {
  event.preventDefault();

  const {
    form,
    idInput,
    typeInput,
    phaseInput,
    amountModeInput,
    amountInput,
    indexRefInput,
    dateInput,
    startDateInput,
    endDateInput,
    everyMonthsInput
  } = getBuilderPaymentFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const context = getSelectedSimulationContext();

  if (!context) {
    return false;
  }

  const sim = context.simulation;
  const currentItems = Array.isArray(sim.builderPayments) ? sim.builderPayments : [];

  const amountNumber = Number(amountInput ? amountInput.value : 0);
  const everyMonthsNumber = Number(everyMonthsInput ? everyMonthsInput.value : 6);
  const idFromHidden = toValidIdOrNull(idInput ? idInput.value : null);
  const editId = idFromHidden !== null ? idFromHidden : state.editingBuilderPaymentId;

  const nextItem = {
    id: editId,
    type: typeInput ? typeInput.value : "once",
    phase: phaseInput ? phaseInput.value : "Work",
    amountMode: amountModeInput ? amountModeInput.value : "fixed",
    amount: Number.isFinite(amountNumber) ? amountNumber : 0,
    indexRef: indexRefInput ? indexRefInput.value : "",
    date: dateInput ? dateInput.value : "",
    startDate: startDateInput ? startDateInput.value : "",
    endDate: endDateInput ? endDateInput.value : "",
    everyMonths: Number.isFinite(everyMonthsNumber) ? everyMonthsNumber : 6
  };

  if (nextItem.type === "once") {
    nextItem.startDate = "";
    nextItem.endDate = "";
    nextItem.everyMonths = 0;
  }

  if (nextItem.type === "monthly") {
    nextItem.date = "";
    nextItem.everyMonths = 0;
  }

  if (nextItem.type === "balloon") {
    nextItem.date = "";
  }

  const items = [];

  for (const item of currentItems) {
    const currentId = toValidIdOrNull(item.id);

    if (editId !== null && currentId === editId) {
      continue;
    }

    items.push(item);
  }

  if (editId === null) {
    let maxId = 0;

    for (const item of currentItems) {
      const currentId = toValidIdOrNull(item.id);

      if (currentId !== null && currentId > maxId) {
        maxId = currentId;
      }
    }

    nextItem.id = maxId + 1;
  }

  items.push(nextItem);

  upsertSimulation({
    ...sim,
    builderPayments: items
  });

  clearBuilderPaymentForm();
  renderEditor();
  return true;
}

function submitExtrasCostForm(event) {
  event.preventDefault();

  const { form, idInput, labelInput, categoryInput, dueMonthInput, amountInput } =
    getExtrasCostFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const context = getSelectedSimulationContext();

  if (!context) {
    return false;
  }

  const sim = context.simulation;
  const currentItems = Array.isArray(sim.extrasCosts) ? sim.extrasCosts : [];

  const amountNumber = Number(amountInput ? amountInput.value : 0);
  const idFromHidden = toValidIdOrNull(idInput ? idInput.value : null);
  const editId = idFromHidden !== null ? idFromHidden : state.editingExtrasCostId;

  const nextItem = {
    id: editId,
    label: labelInput ? labelInput.value : "",
    category: categoryInput ? categoryInput.value : "",
    dueMonth: dueMonthInput ? dueMonthInput.value : "",
    amount: Number.isFinite(amountNumber) ? amountNumber : 0
  };

  const items = [];

  for (const item of currentItems) {
    const currentId = toValidIdOrNull(item.id);

    if (editId !== null && currentId === editId) {
      continue;
    }

    items.push(item);
  }

  if (editId === null) {
    let maxId = 0;

    for (const item of currentItems) {
      const currentId = toValidIdOrNull(item.id);

      if (currentId !== null && currentId > maxId) {
        maxId = currentId;
      }
    }

    nextItem.id = maxId + 1;
  }

  items.push(nextItem);

  upsertSimulation({
    ...sim,
    extrasCosts: items
  });

  clearExtrasCostForm();
  renderEditor();
  return true;
}

function submitProtectionChecklistForm(event) {
  event.preventDefault();

  const {
    form,
    quadroResumoInput,
    memorialRegistryInput,
    brokerageInput,
    satiInput,
    itbiInput,
    notesInput
  } = getProtectionChecklistFormElements();

  if (!form || !form.reportValidity()) {
    return false;
  }

  const context = getSelectedSimulationContext();

  if (!context) {
    return false;
  }

  upsertSimulation({
    ...context.simulation,
    protectionChecklist: {
      quadroResumo: quadroResumoInput ? quadroResumoInput.checked : false,
      memorialRegistryChecked: memorialRegistryInput ? memorialRegistryInput.checked : false,
      brokerageHighlighted: brokerageInput ? brokerageInput.checked : false,
      satiPresent: satiInput ? satiInput.checked : false,
      itbiProvisioned: itbiInput ? itbiInput.checked : false,
      notes: notesInput ? notesInput.value : ""
    }
  });

  renderEditor();
  return true;
}

function handleProjectListClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("button[data-action][data-id]");

  if (!button) {
    return false;
  }

  const action = String(button.dataset.action || "");
  const projectId = toValidIdOrNull(button.dataset.id);

  if (projectId === null) {
    return false;
  }

  if (action === "select") {
    updateAppSelection(projectId, null);
    renderProjects();
    navigate("#simulations");
    return true;
  }

  if (action === "edit") {
    return loadProjectToForm(projectId);
  }

  if (action === "delete") {
    const confirmed = window.confirm("Deseja excluir este projeto?");

    if (!confirmed) {
      return false;
    }

    const deleted = deleteProject(projectId);
    syncAppStateFromStorage();
    clearProjectForm();
    renderProjects();
    renderSimulations();
    return deleted;
  }

  return false;
}

function handleSimulationListClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("button[data-action][data-id]");

  if (!button) {
    return false;
  }

  const action = String(button.dataset.action || "");
  const simId = toValidIdOrNull(button.dataset.id);

  if (simId === null) {
    return false;
  }

  if (action === "select") {
    updateAppSelection(undefined, simId);
    renderSimulations();
    navigate("#editor");
    return true;
  }

  if (action === "edit") {
    return loadSimulationToForm(simId);
  }

  if (action === "delete") {
    const confirmed = window.confirm("Deseja excluir esta simulação?");

    if (!confirmed) {
      return false;
    }

    const deleted = deleteSimulation(simId);
    syncAppStateFromStorage();

    clearSimulationForm();
    renderSimulations();
    return deleted;
  }

  return false;
}

function handleCashflowListClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("button[data-action][data-id]");

  if (!button) {
    return false;
  }

  const action = String(button.dataset.action || "");
  const cashflowId = toValidIdOrNull(button.dataset.id);

  if (cashflowId === null) {
    return false;
  }

  if (action === "edit") {
    return loadCashflowToForm(cashflowId);
  }

  if (action === "delete") {
    const confirmed = window.confirm("Deseja excluir este item de fluxo?");

    if (!confirmed) {
      return false;
    }

    const context = getSelectedSimulationContext();

    if (!context) {
      return false;
    }

    const sim = context.simulation;
    const currentCashflows = Array.isArray(sim.cashflows) ? sim.cashflows : [];
    const nextCashflows = currentCashflows.filter((item) => toValidIdOrNull(item.id) !== cashflowId);

    upsertSimulation({
      ...sim,
      cashflows: nextCashflows
    });

    if (state.editingCashflowId === cashflowId) {
      clearCashflowForm();
    }

    renderEditor();
    return true;
  }

  return false;
}

function handleBuilderPaymentsListClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("button[data-action][data-id]");

  if (!button) {
    return false;
  }

  const action = String(button.dataset.action || "");
  const paymentId = toValidIdOrNull(button.dataset.id);

  if (paymentId === null) {
    return false;
  }

  if (action === "edit-builder-payment") {
    return loadBuilderPaymentToForm(paymentId);
  }

  if (action === "delete-builder-payment") {
    const confirmed = window.confirm("Deseja excluir este pagamento da construtora?");

    if (!confirmed) {
      return false;
    }

    const context = getSelectedSimulationContext();

    if (!context) {
      return false;
    }

    const sim = context.simulation;
    const list = Array.isArray(sim.builderPayments) ? sim.builderPayments : [];
    const nextList = list.filter((item) => toValidIdOrNull(item.id) !== paymentId);

    upsertSimulation({
      ...sim,
      builderPayments: nextList
    });

    if (state.editingBuilderPaymentId === paymentId) {
      clearBuilderPaymentForm();
    }

    renderEditor();
    return true;
  }

  return false;
}

function handleExtrasCostsListClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const button = target.closest("button[data-action][data-id]");

  if (!button) {
    return false;
  }

  const action = String(button.dataset.action || "");
  const costId = toValidIdOrNull(button.dataset.id);

  if (costId === null) {
    return false;
  }

  if (action === "edit-extras-cost") {
    return loadExtrasCostToForm(costId);
  }

  if (action === "delete-extras-cost") {
    const confirmed = window.confirm("Deseja excluir este custo extra?");

    if (!confirmed) {
      return false;
    }

    const context = getSelectedSimulationContext();

    if (!context) {
      return false;
    }

    const sim = context.simulation;
    const list = Array.isArray(sim.extrasCosts) ? sim.extrasCosts : [];
    const nextList = list.filter((item) => toValidIdOrNull(item.id) !== costId);

    upsertSimulation({
      ...sim,
      extrasCosts: nextList
    });

    if (state.editingExtrasCostId === costId) {
      clearExtrasCostForm();
    }

    renderEditor();
    return true;
  }

  return false;
}

function handleResultsRecalculateClick() {
  const result = recalculateSelectedResults();

  if (!result) {
    renderImportStatus("", false);
    return false;
  }

  renderImportStatus("Recalculado com sucesso.", false);
  return true;
}

function handleResultsCopyClick() {
  const { exportText } = getResultsElements();

  if (!exportText) {
    return false;
  }

  const text = exportText.value || renderResultsExportText();

  if (!text) {
    return false;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    renderImportStatus("JSON copiado.", false);
    return true;
  }

  exportText.select();
  document.execCommand("copy");
  renderImportStatus("JSON copiado.", false);
  return true;
}

function handleResultsDownloadClick() {
  const text = renderResultsExportText();

  if (!text) {
    return false;
  }

  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replaceAll(":", "-");

  link.href = url;
  link.download = `apto-db-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  renderImportStatus("Arquivo JSON gerado para download.", false);
  return true;
}

function handleResultsImportPreviewClick() {
  const { importText, applyImportButton } = getResultsElements();

  if (!importText) {
    return false;
  }

  const raw = String(importText.value || "").trim();
  const validation = validateImportJson(raw);

  if (!validation.ok) {
    state.pendingImportDb = null;
    if (applyImportButton) {
      applyImportButton.disabled = true;
    }
    renderImportPreview(validation);
    renderImportStatus(validation.errors.join(" "), true);
    return false;
  }

  state.pendingImportDb = validation.sanitizedDb;

  if (applyImportButton) {
    applyImportButton.disabled = false;
  }

  renderImportPreview(validation);
  renderImportStatus("Pré-visualização pronta. Clique em 'Aplicar importação'.", false);
  return true;
}

function handleResultsImportApplyClick() {
  const { applyImportButton } = getResultsElements();

  if (!state.pendingImportDb) {
    renderImportStatus("Valide o JSON antes de aplicar a importação.", true);
    return false;
  }

  writeDb(state.pendingImportDb);
  syncAppStateFromStorage();
  state.lastResultsBySimId = {};
  state.pendingImportDb = null;

  if (applyImportButton) {
    applyImportButton.disabled = true;
  }

  clearProjectForm();
  clearSimulationForm();
  clearCashflowForm();
  clearBuilderPaymentForm();
  clearExtrasCostForm();

  renderProjects();
  renderSimulations();
  renderEditor();
  renderResults();

  renderImportPreview(null);
  renderImportStatus("Importação concluída.", false);
  return true;
}

function bindProjectEvents() {
  const { form } = getProjectFormElements();
  const clearButton = document.getElementById("project-clear");
  const listContainer = document.getElementById("projects-list");

  if (form) {
    form.addEventListener("submit", submitProjectForm);
  }

  if (clearButton) {
    clearButton.addEventListener("click", clearProjectForm);
  }

  if (listContainer) {
    listContainer.addEventListener("click", handleProjectListClick);
  }

  return true;
}

function bindSimulationEvents() {
  const { form } = getSimulationFormElements();
  const clearButton = document.getElementById("simulation-clear");
  const listContainer = document.getElementById("simulations-list");

  if (form) {
    form.addEventListener("submit", submitSimulationForm);
  }

  if (clearButton) {
    clearButton.addEventListener("click", clearSimulationForm);
  }

  if (listContainer) {
    listContainer.addEventListener("click", handleSimulationListClick);
  }

  return true;
}

function bindEditorEvents() {
  const { form, typeInput } = getCashflowFormElements();
  const { form: builderForm, typeInput: builderTypeInput } = getBuilderPaymentFormElements();
  const { form: extrasForm } = getExtrasCostFormElements();
  const { form: checklistForm } = getProtectionChecklistFormElements();
  const configForm = document.getElementById("simulation-config-form");
  const indexEnabled = document.getElementById("index-enabled");
  const financingEnabled = document.getElementById("financing-enabled");
  const clearButton = document.getElementById("cashflow-clear");
  const builderClearButton = document.getElementById("builder-payment-clear");
  const extrasClearButton = document.getElementById("extras-cost-clear");
  const listContainer = document.getElementById("cashflows-list");
  const builderListContainer = document.getElementById("builder-payments-list");
  const extrasListContainer = document.getElementById("extras-costs-list");

  if (configForm) {
    configForm.addEventListener("submit", submitEditorConfigForm);
  }

  if (indexEnabled) {
    indexEnabled.addEventListener("change", applyEditorConfigVisibility);
  }

  if (financingEnabled) {
    financingEnabled.addEventListener("change", applyEditorConfigVisibility);
  }

  if (form) {
    form.addEventListener("submit", submitCashflowForm);
  }

  if (builderForm) {
    builderForm.addEventListener("submit", submitBuilderPaymentForm);
  }

  if (extrasForm) {
    extrasForm.addEventListener("submit", submitExtrasCostForm);
  }

  if (checklistForm) {
    checklistForm.addEventListener("submit", submitProtectionChecklistForm);
  }

  if (typeInput) {
    typeInput.addEventListener("change", () => {
      applyCashflowTypeVisibility(typeInput.value);
    });
  }

  if (builderTypeInput) {
    builderTypeInput.addEventListener("change", () => {
      applyBuilderPaymentTypeVisibility(builderTypeInput.value);
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", clearCashflowForm);
  }

  if (builderClearButton) {
    builderClearButton.addEventListener("click", clearBuilderPaymentForm);
  }

  if (extrasClearButton) {
    extrasClearButton.addEventListener("click", clearExtrasCostForm);
  }

  if (listContainer) {
    listContainer.addEventListener("click", handleCashflowListClick);
  }

  if (builderListContainer) {
    builderListContainer.addEventListener("click", handleBuilderPaymentsListClick);
  }

  if (extrasListContainer) {
    extrasListContainer.addEventListener("click", handleExtrasCostsListClick);
  }

  applyCashflowTypeVisibility("once");
  applyBuilderPaymentTypeVisibility("once");
  applyEditorConfigVisibility();
  return true;
}

function bindResultsEvents() {
  const {
    recalcButton,
    timelineCategoryFilter,
    copyButton,
    downloadButton,
    previewImportButton,
    applyImportButton
  } = getResultsElements();

  if (recalcButton) {
    recalcButton.addEventListener("click", handleResultsRecalculateClick);
  }

  if (copyButton) {
    copyButton.addEventListener("click", handleResultsCopyClick);
  }

  if (downloadButton) {
    downloadButton.addEventListener("click", handleResultsDownloadClick);
  }

  if (previewImportButton) {
    previewImportButton.addEventListener("click", handleResultsImportPreviewClick);
  }

  if (applyImportButton) {
    applyImportButton.addEventListener("click", handleResultsImportApplyClick);
  }

  if (timelineCategoryFilter) {
    timelineCategoryFilter.addEventListener("change", () => {
      const cached = getCurrentCachedResults();

      if (cached) {
        renderComputedResults(cached);
      }
    });
  }

  return true;
}

function clearRouteGuard(containerId) {
  const container = document.getElementById(containerId);

  if (!container) {
    return false;
  }

  const guard = container.querySelector('[data-route-guard="true"]');

  if (guard) {
    guard.remove();
  }

  return true;
}

function hasSelectedProject() {
  return state.appState.selectedProjectId !== null;
}

function hasSelectedSimulation() {
  return state.appState.selectedSimId !== null;
}

function normalizeHash(hash) {
  const raw = String(hash || "").trim();

  if (!raw) {
    return "#projects";
  }

  if (raw.startsWith("#")) {
    return raw;
  }

  return `#${raw}`;
}

function navigate(hash) {
  const normalizedHash = normalizeHash(hash);
  const requestedRoute = normalizeRoute(normalizedHash.replace("#", ""));
  const route =
    requestedRoute === "projects" ||
    requestedRoute === "simulations" ||
    requestedRoute === "editor" ||
    requestedRoute === "results" ||
    requestedRoute === "faq"
      ? requestedRoute
      : "projects";

  const canonicalHash = `#${route}`;

  if (window.location.hash !== canonicalHash) {
    window.location.hash = canonicalHash;
  }

  syncAppStateFromStorage();
  clearRouteGuard("simulations");
  clearRouteGuard("editor");
  clearRouteGuard("results");

  if (route === "simulations" && !hasSelectedProject()) {
    renderSection(route);
    renderRequireProjectMessage(document.getElementById("simulations"));
    renderSimulationsSection({ project: null, sims: [], selectedSimId: null });
    return route;
  }

  if ((route === "editor" || route === "results") && !hasSelectedSimulation()) {
    renderSection(route);
    renderRequireSimulationMessage(document.getElementById(route));

    if (route === "editor") {
      renderEditorSection({
        project: null,
        simulation: null,
        cashflows: [],
        builderPayments: [],
        extrasCosts: [],
        protectionChecklist: {}
      });
    }

    if (route === "results") {
      renderEmptyResults("Selecione uma simulação para visualizar resultados.");
      renderResultsExportText();
    }

    return route;
  }

  renderSection(route);

  if (route === "projects") {
    renderProjects();
  }

  if (route === "simulations") {
    renderSimulations();
  }

  if (route === "editor") {
    renderEditor();
  }

  if (route === "results") {
    renderResults();
  }

  return route;
}

function startApp() {
  setupStorage();
  syncAppStateFromStorage();
  applyMarketReferences();
  refreshMarketReferencesFromBcb();
  bindProjectEvents();
  bindSimulationEvents();
  bindEditorEvents();
  bindResultsEvents();
  renderProjects();
  renderSimulations();
  renderEditor();
  renderResultsExportText();

  if (!window.location.hash) {
    window.location.hash = "#projects";
  }

  navigate(window.location.hash || "#projects");
  window.addEventListener("hashchange", () => navigate(window.location.hash || "#projects"));
  return true;
}

startApp();
