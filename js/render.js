export function renderSection(route) {
  const ids = ["projects", "simulations", "editor", "results", "faq"];
  const safeRoute = route === "sims" ? "simulations" : route;

  for (const id of ids) {
    const section = document.getElementById(id);

    if (section) {
      section.hidden = id !== safeRoute;
    }
  }

  const links = document.querySelectorAll(".menu a");

  for (const link of links) {
    const linkRoute = link.getAttribute("data-route");

    if (linkRoute === safeRoute) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  return safeRoute;
}

const contextState = {
  project: null,
  simulation: null
};

function setContextBar(project, simulation) {
  if (project !== undefined) {
    contextState.project = project || null;
  }

  if (simulation !== undefined) {
    contextState.simulation = simulation || null;
  }

  const projectName = document.getElementById("context-project-name");
  const simulationName = document.getElementById("context-simulation-name");

  if (projectName) {
    projectName.textContent = contextState.project
      ? String(contextState.project.name || "Sem nome")
      : "Não selecionado";
  }

  if (simulationName) {
    simulationName.textContent = contextState.simulation
      ? String(contextState.simulation.name || "Sem nome")
      : "Não selecionada";
  }
}

function upsertGuardContainer(container) {
  if (!container) {
    return null;
  }

  let guard = container.querySelector('[data-route-guard="true"]');

  if (!guard) {
    guard = document.createElement("div");
    guard.setAttribute("data-route-guard", "true");
    guard.style.marginBottom = "12px";
    guard.style.padding = "10px";
    guard.style.border = "1px solid #cbd5e1";
    guard.style.borderRadius = "8px";
    guard.style.background = "#f8fafc";
    container.prepend(guard);
  }

  return guard;
}

export function renderRequireProjectMessage(container) {
  const guard = upsertGuardContainer(container);

  if (!guard) {
    return false;
  }

  guard.innerHTML =
    '<strong>Projeto não selecionado.</strong> <a href="#projects">Ir para Projetos</a>';
  return true;
}

export function renderRequireSimulationMessage(container) {
  const guard = upsertGuardContainer(container);

  if (!guard) {
    return false;
  }

  guard.innerHTML =
    '<strong>Simulação não selecionada.</strong> <a href="#simulations">Ir para Simulações</a>';
  return true;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderProjectsSection(projects, selectedProjectId) {
  const container = document.getElementById("projects-list");
  const emptyState = document.getElementById("projects-empty-state");

  if (!container) {
    return false;
  }

  const list = Array.isArray(projects) ? projects : [];
  const selected = list.find((item) => Number(item.id) === Number(selectedProjectId)) || null;

  setContextBar(selected, null);

  if (list.length === 0) {
    if (emptyState) {
      emptyState.hidden = false;
    }
    container.innerHTML = "";
    return true;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  let html = '<table class="projects-table"><thead><tr><th>Nome</th><th>Cidade/UF</th><th>Construtora</th><th>Ações</th></tr></thead><tbody>';

  for (const project of list) {
    const id = Number(project.id);
    const isSelected = id === Number(selectedProjectId);
    const selectedClass = isSelected ? ' class="is-selected" style="background:#dbeafe;"' : "";

    html += `<tr${selectedClass} data-id="${id}">`;
    html += `<td>${escapeHtml(project.name)}</td>`;
    html += `<td>${escapeHtml(project.city)} / ${escapeHtml(project.uf)}</td>`;
    html += `<td>${escapeHtml(project.developer)}</td>`;
    html += "<td>";
    html += `<button type="button" data-action="select" data-id="${id}">Selecionar</button> `;
    html += `<button type="button" data-action="edit" data-id="${id}">Editar</button> `;
    html += `<button type="button" data-action="delete" data-id="${id}">Excluir</button>`;
    html += "</td></tr>";
  }

  html += "</tbody></table>";
  container.innerHTML = html;
  return true;
}

export function renderSimulationsSection(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const project = safePayload.project && typeof safePayload.project === "object" ? safePayload.project : null;
  const sims = Array.isArray(safePayload.sims) ? safePayload.sims : [];
  const selectedSimId = Number(safePayload.selectedSimId);

  const projectInfo = document.getElementById("selected-project-info");
  const emptyState = document.getElementById("simulations-empty-state");
  const emptyText = document.getElementById("simulations-empty-text");
  const emptyCta = document.getElementById("simulations-empty-cta");
  const content = document.getElementById("simulations-content");
  const listContainer = document.getElementById("simulations-list");

  if (!projectInfo || !emptyState || !emptyText || !emptyCta || !content || !listContainer) {
    return false;
  }

  if (!project) {
    projectInfo.textContent = "Projeto selecionado: -";
    setContextBar(null, null);
    emptyText.textContent = "Selecione um projeto para cadastrar simulações.";
    emptyCta.textContent = "Selecionar projeto";
    emptyCta.setAttribute("href", "#projects");
    emptyState.hidden = false;
    content.hidden = true;
    listContainer.innerHTML = "";
    return true;
  }

  const name = escapeHtml(project.name);
  const city = escapeHtml(project.city);
  const uf = escapeHtml(project.uf);

  projectInfo.textContent = `Projeto selecionado: ${name} (${city}/${uf})`;
  setContextBar(project, null);

  if (sims.length === 0) {
    emptyText.textContent = "Nenhuma simulação cadastrada para este projeto.";
    emptyCta.textContent = "Criar simulação";
    emptyCta.setAttribute("href", "#simulations");
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
  }

  content.hidden = false;

  if (sims.length === 0) {
    listContainer.innerHTML = "<p>Nenhuma simulação cadastrada para este projeto.</p>";
    return true;
  }

  let html = '<table class="projects-table"><thead><tr><th>Nome</th><th>Contrato</th><th>Entrega</th><th>Preço base</th><th>Ações</th></tr></thead><tbody>';

  for (const sim of sims) {
    const id = Number(sim.id);
    const isSelected = id === selectedSimId;
    const selectedClass = isSelected ? ' class="is-selected" style="background:#dbeafe;"' : "";

    html += `<tr${selectedClass} data-id="${id}">`;
    html += `<td>${escapeHtml(sim.name)}</td>`;
    html += `<td>${escapeHtml(sim.contractDate)}</td>`;
    html += `<td>${escapeHtml(sim.deliveryDate)}</td>`;
    html += `<td>${formatMoney(sim.basePrice)}</td>`;
    html += "<td>";
    html += `<button type="button" data-action="select" data-id="${id}">Selecionar</button> `;
    html += `<button type="button" data-action="edit" data-id="${id}">Editar</button> `;
    html += `<button type="button" data-action="delete" data-id="${id}">Excluir</button>`;
    html += "</td></tr>";
  }

  const selectedSimulation = sims.find((item) => Number(item.id) === selectedSimId) || null;
  setContextBar(project, selectedSimulation);

  html += "</tbody></table>";
  listContainer.innerHTML = html;
  return true;
}

export function renderEditorSection(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const project = safePayload.project && typeof safePayload.project === "object" ? safePayload.project : null;
  const simulation =
    safePayload.simulation && typeof safePayload.simulation === "object"
      ? safePayload.simulation
      : null;
  const cashflows = Array.isArray(safePayload.cashflows) ? safePayload.cashflows : [];
  const builderPayments = Array.isArray(safePayload.builderPayments) ? safePayload.builderPayments : [];
  const extrasCosts = Array.isArray(safePayload.extrasCosts) ? safePayload.extrasCosts : [];
  const checklist =
    safePayload.protectionChecklist && typeof safePayload.protectionChecklist === "object"
      ? safePayload.protectionChecklist
      : {};

  const info = document.getElementById("editor-selected-info");
  const emptyState = document.getElementById("editor-empty-state");
  const emptyText = document.getElementById("editor-empty-text");
  const emptyCta = document.getElementById("editor-empty-cta");
  const content = document.getElementById("editor-content");
  const listContainer = document.getElementById("cashflows-list");
  const builderList = document.getElementById("builder-payments-list");
  const builderTotal = document.getElementById("builder-payments-total");
  const extrasList = document.getElementById("extras-costs-list");
  const extrasTotal = document.getElementById("extras-costs-total");

  if (
    !info ||
    !emptyState ||
    !emptyText ||
    !emptyCta ||
    !content ||
    !listContainer ||
    !builderList ||
    !builderTotal ||
    !extrasList ||
    !extrasTotal
  ) {
    return false;
  }

  if (!project || !simulation) {
    info.textContent = "Selecionado: -";
    setContextBar(undefined, null);
    emptyText.textContent = "Selecione uma simulação para editar.";
    emptyCta.textContent = "Ir para simulações";
    emptyCta.setAttribute("href", "#simulations");
    emptyState.hidden = false;
    content.hidden = true;
    listContainer.innerHTML = "<p>Nenhum item de fluxo cadastrado.</p>";
    builderList.innerHTML = "<p>Nenhum pagamento cadastrado.</p>";
    builderTotal.textContent = "Total: R$ 0,00";
    extrasList.innerHTML = "<p>Nenhum custo extra cadastrado.</p>";
    extrasTotal.textContent = "Total: R$ 0,00";
    return true;
  }

  info.textContent = `Selecionado: ${project.name} / ${simulation.name}`;
  setContextBar(project, simulation);
  emptyState.hidden = true;
  content.hidden = false;

  if (cashflows.length === 0) {
    listContainer.innerHTML =
      '<div class="empty-state"><p>Nenhum item de fluxo cadastrado.</p><a class="btn-primary-link" href="#editor">Adicionar primeiro item</a></div>';
  } else {
    let html = '<table class="projects-table"><thead><tr><th>Tipo</th><th>Rótulo</th><th>Valor</th><th>Período</th><th>Ações</th></tr></thead><tbody>';

    for (const item of cashflows) {
      const id = Number(item.id);
      const tipo =
        item.type === "monthly"
          ? "Mensal"
          : item.type === "balloon"
            ? "Balão"
            : item.type === "installments"
              ? "Parcelado"
              : "Único";
      let period = "-";

      if (item.type === "once") {
        period = item.date || "-";
      }

      if (item.type === "monthly") {
        period = `${item.startDate || "-"} → ${item.endDate || "-"}`;
      }

      if (item.type === "balloon") {
        period = `${item.startDate || "-"} → ${item.endDate || "-"} / ${item.everyMonths || 6}m`;
      }

      if (item.type === "installments") {
        period = `${item.date || "-"} / ${item.installmentCount || 1}x a cada ${item.everyMonths || 1}m`;
      }

      html += "<tr>";
      html += `<td>${escapeHtml(tipo)}</td>`;
      html += `<td>${escapeHtml(item.label)}</td>`;
      html += `<td>${formatMoney(item.amount)}</td>`;
      html += `<td>${escapeHtml(period)}</td>`;
      html += "<td>";
      html += `<button type="button" data-action="edit" data-id="${id}">Editar</button> `;
      html += `<button type="button" data-action="delete" data-id="${id}">Excluir</button>`;
      html += "</td>";
      html += "</tr>";
    }

    html += "</tbody></table>";
    listContainer.innerHTML = html;
  }

  renderBuilderPaymentsBlock(builderList, builderTotal, builderPayments, Number(simulation.basePrice || 0));
  renderExtrasCostsBlock(extrasList, extrasTotal, extrasCosts);
  fillProtectionChecklist(checklist);

  return true;
}

function getBuilderPaymentEffectiveAmount(item, basePrice) {
  const safeBasePrice = Number(basePrice);
  const safeAmount = Number(item && item.amount);

  if (!Number.isFinite(safeAmount) || safeAmount < 0) {
    return 0;
  }

  if (item && item.amountMode === "percent") {
    const ref = Number.isFinite(safeBasePrice) && safeBasePrice > 0 ? safeBasePrice : 0;
    return ref * (safeAmount / 100);
  }

  return safeAmount;
}

function renderBuilderPaymentsBlock(container, totalElement, items, basePrice) {
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    container.innerHTML = "<p>Nenhum pagamento cadastrado.</p>";
    totalElement.textContent = "Total: R$ 0,00";
    return true;
  }

  let html =
    '<table class="projects-table"><thead><tr><th>Tipo</th><th>Fase</th><th>Modo</th><th>Valor</th><th>Índice</th><th>Período</th><th>Ações</th></tr></thead><tbody>';
  let total = 0;

  const typeLabelByValue = {
    once: "Único",
    monthly: "Mensal",
    balloon: "Balão",
    installments: "Parcelado"
  };

  const phaseLabelByValue = {
    Signal: "Sinal",
    Entry: "Entrada",
    Work: "Obra",
    Intermediary: "Intermediária",
    Keys: "Chaves"
  };

  for (const item of list) {
    const id = Number(item.id);
    const modeText = item.amountMode === "percent" ? "% base" : "Fixo";
    const rawAmount = Number(item.amount || 0);
    const effectiveAmount = getBuilderPaymentEffectiveAmount(item, basePrice);
    total += effectiveAmount;

    let period = "-";

    if (item.type === "once") {
      period = item.date || "-";
    }

    if (item.type === "monthly") {
      period = `${item.startDate || "-"} → ${item.endDate || "-"}`;
    }

    if (item.type === "balloon") {
      period = `${item.startDate || "-"} → ${item.endDate || "-"} / ${item.everyMonths || 6}m`;
    }

    if (item.type === "installments") {
      period = `${item.date || "-"} / ${item.installmentCount || 1}x a cada ${item.everyMonths || 1}m`;
    }

    html += "<tr>";
    html += `<td>${escapeHtml(typeLabelByValue[item.type] || "Único")}</td>`;
    html += `<td>${escapeHtml(phaseLabelByValue[item.phase] || "Obra")}</td>`;
    html += `<td>${escapeHtml(modeText)}</td>`;
    html += `<td>${item.amountMode === "percent" ? `${rawAmount.toFixed(2)}% (${formatMoney(effectiveAmount)})` : formatMoney(rawAmount)}</td>`;
    html += `<td>${escapeHtml(item.indexRef || "-")}</td>`;
    html += `<td>${escapeHtml(period)}</td>`;
    html += "<td>";
    html += `<button type="button" data-action="edit-builder-payment" data-id="${id}">Editar</button> `;
    html += `<button type="button" data-action="delete-builder-payment" data-id="${id}">Excluir</button>`;
    html += "</td>";
    html += "</tr>";
  }

  html += "</tbody></table>";
  container.innerHTML = html;
  totalElement.textContent = `Total: ${formatMoney(total)}`;
  return true;
}

function renderExtrasCostsBlock(container, totalElement, items) {
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    container.innerHTML = "<p>Nenhum custo extra cadastrado.</p>";
    totalElement.textContent = "Total: R$ 0,00";
    return true;
  }

  let html =
    '<table class="projects-table"><thead><tr><th>Nome</th><th>Categoria</th><th>Mês</th><th>Valor</th><th>Ações</th></tr></thead><tbody>';
  let total = 0;

  for (const item of list) {
    const id = Number(item.id);
    const amount = Number(item.amount || 0);
    total += Number.isFinite(amount) ? amount : 0;

    html += "<tr>";
    html += `<td>${escapeHtml(item.label || "-")}</td>`;
    html += `<td>${escapeHtml(item.category || "-")}</td>`;
    html += `<td>${escapeHtml(item.dueMonth || "-")}</td>`;
    html += `<td>${formatMoney(amount)}</td>`;
    html += "<td>";
    html += `<button type="button" data-action="edit-extras-cost" data-id="${id}">Editar</button> `;
    html += `<button type="button" data-action="delete-extras-cost" data-id="${id}">Excluir</button>`;
    html += "</td>";
    html += "</tr>";
  }

  html += "</tbody></table>";
  container.innerHTML = html;
  totalElement.textContent = `Total: ${formatMoney(total)}`;
  return true;
}

function fillProtectionChecklist(checklist) {
  const safe = checklist && typeof checklist === "object" ? checklist : {};

  const quadroResumo = document.getElementById("check-quadro-resumo");
  const memorialRegistry = document.getElementById("check-memorial-registry");
  const brokerageHighlighted = document.getElementById("check-brokerage-highlighted");
  const satiPresent = document.getElementById("check-sati-present");
  const itbiProvisioned = document.getElementById("check-itbi-provisioned");
  const notes = document.getElementById("checklist-notes");

  if (quadroResumo) {
    quadroResumo.checked = safe.quadroResumo === true;
  }

  if (memorialRegistry) {
    memorialRegistry.checked = safe.memorialRegistryChecked === true;
  }

  if (brokerageHighlighted) {
    brokerageHighlighted.checked = safe.brokerageHighlighted === true;
  }

  if (satiPresent) {
    satiPresent.checked = safe.satiPresent === true;
  }

  if (itbiProvisioned) {
    itbiProvisioned.checked = safe.itbiProvisioned === true;
  }

  if (notes) {
    notes.value = String(safe.notes || "");
  }

  return true;
}

function setHtml(id, html) {
  const element = document.getElementById(id);

  if (element) {
    element.innerHTML = html;
    return true;
  }

  return false;
}

function setButtonDisabled(id, disabled) {
  const button = document.getElementById(id);

  if (button) {
    button.disabled = disabled;
    return true;
  }

  return false;
}

function formatMoney(value) {
  const safeNumber = Number(value);

  if (!Number.isFinite(safeNumber)) {
    return "R$ 0,00";
  }

  return safeNumber.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function toMonthKeyFromDateString(dateValue) {
  const text = String(dateValue || "").trim();

  if (!text || text.length < 7) {
    return null;
  }

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function toMonthIndex(yyyyMm) {
  if (typeof yyyyMm !== "string") {
    return null;
  }

  const parts = yyyyMm.split("-");

  if (parts.length !== 2) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return year * 12 + (month - 1);
}

function phaseOccurrences(payment) {
  const type = String(payment && payment.type ? payment.type : "once");

  if (type === "once") {
    return 1;
  }

  const startMonth = toMonthKeyFromDateString(payment && payment.startDate);
  const endMonth = toMonthKeyFromDateString(payment && payment.endDate);
  const startIndex = toMonthIndex(startMonth);
  const endIndex = toMonthIndex(endMonth);

  if (startIndex === null || endIndex === null || endIndex < startIndex) {
    return 0;
  }

  if (type === "monthly") {
    return endIndex - startIndex + 1;
  }

  if (type === "balloon") {
    const step = Math.max(1, Math.floor(Number(payment && payment.everyMonths) || 6));
    return Math.floor((endIndex - startIndex) / step) + 1;
  }

  return 0;
}

function computePhaseTotals(simulation) {
  const phases = {
    Signal: 0,
    Entry: 0,
    Work: 0,
    Intermediary: 0,
    Keys: 0
  };

  const sim = simulation && typeof simulation === "object" ? simulation : {};
  const basePrice = Number(sim.basePrice || 0);
  const payments = Array.isArray(sim.builderPayments) ? sim.builderPayments : [];

  for (const payment of payments) {
    const phase = String(payment && payment.phase ? payment.phase : "Work");

    if (!Object.prototype.hasOwnProperty.call(phases, phase)) {
      continue;
    }

    const amountRaw = Number(payment && payment.amount ? payment.amount : 0);

    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      continue;
    }

    const mode = String(payment && payment.amountMode ? payment.amountMode : "fixed");
    const unitAmount = mode === "percent" ? basePrice * (amountRaw / 100) : amountRaw;
    const occurrences = phaseOccurrences(payment);

    phases[phase] += Number.isFinite(unitAmount) ? Math.max(0, unitAmount) * Math.max(0, occurrences) : 0;
  }

  return phases;
}

function renderCategorySummary(totals, timeline) {
  const rows = Array.isArray(timeline) ? timeline : [];
  let builder = 0;
  let legacy = 0;
  let construction = 0;
  let financing = 0;

  for (const row of rows) {
    const categories = row && typeof row === "object" ? row.categories || {} : {};
    builder += Number(categories.builderCorrected || 0);
    legacy += Number(categories.legacyCashflowCorrected || 0);
    construction += Number(categories.constructionInterest || 0);
    financing += Number(categories.financingInstallment || 0);
  }

  return `
    <dl>
      <div><dt>Construtora (corrigido)</dt><dd>${formatMoney(builder)}</dd></div>
      <div><dt>Fluxo manual (corrigido)</dt><dd>${formatMoney(legacy)}</dd></div>
      <div><dt>Juros de obra</dt><dd>${formatMoney(construction)}</dd></div>
      <div><dt>Financiamento</dt><dd>${formatMoney(financing)}</dd></div>
      <div><dt>Total pago (corrigido)</dt><dd>${formatMoney(totals.corrected)}</dd></div>
      <div><dt>Total geral</dt><dd>${formatMoney(totals.grandTotal)}</dd></div>
    </dl>
  `;
}

function renderPhaseSummary(simulation) {
  const phases = computePhaseTotals(simulation);

  return `
    <dl>
      <div><dt>Sinal</dt><dd>${formatMoney(phases.Signal)}</dd></div>
      <div><dt>Entrada</dt><dd>${formatMoney(phases.Entry)}</dd></div>
      <div><dt>Obra</dt><dd>${formatMoney(phases.Work)}</dd></div>
      <div><dt>Intermediária</dt><dd>${formatMoney(phases.Intermediary)}</dd></div>
      <div><dt>Chaves</dt><dd>${formatMoney(phases.Keys)}</dd></div>
    </dl>
  `;
}

function filterTimelineRowsByCategory(rows, categoryFilter) {
  if (categoryFilter === "all") {
    return rows;
  }

  return rows.filter((item) => {
    const categories = item && typeof item === "object" ? item.categories || {} : {};

    if (categoryFilter === "builder") {
      return Number(categories.builderCorrected || 0) > 0;
    }

    if (categoryFilter === "legacy") {
      return Number(categories.legacyCashflowCorrected || 0) > 0;
    }

    if (categoryFilter === "construction") {
      return Number(categories.constructionInterest || 0) > 0;
    }

    if (categoryFilter === "financing") {
      return Number(categories.financingInstallment || 0) > 0;
    }

    return true;
  });
}

export function renderSimulationOptions(simulations, selectedSimId) {
  const select = document.getElementById("sim-select");

  if (!select) {
    return false;
  }

  const list = Array.isArray(simulations) ? simulations : [];
  select.innerHTML = "";

  if (list.length === 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Sem simulações";
    select.appendChild(emptyOption);
    setButtonDisabled("btn-recalculate", true);
    return false;
  }

  for (const sim of list) {
    const option = document.createElement("option");
    const safeId = Number(sim.id);
    const optionValue = Number.isFinite(safeId) ? String(safeId) : "";
    const simName = String(sim.name || "Simulação");
    const projectName = String(sim.projectName || "Projeto");

    option.value = optionValue;
    option.textContent = `${simName} (${projectName})`;

    if (safeId === Number(selectedSimId)) {
      option.selected = true;
    }

    select.appendChild(option);
  }

  setButtonDisabled("btn-recalculate", false);
  return true;
}

export function renderEmptyResults(message) {
  const safeMessage = String(message || "Sem dados para exibir.");
  const emptyState = document.getElementById("results-empty-state");
  const emptyText = document.getElementById("results-empty-text");
  const emptyCta = document.getElementById("results-empty-cta");
  const content = document.getElementById("results-content");

  if (emptyState) {
    emptyState.hidden = false;
  }

  if (emptyText) {
    emptyText.textContent = safeMessage;
  }

  if (emptyCta) {
    emptyCta.textContent = "Ir para simulações";
    emptyCta.setAttribute("href", "#simulations");
  }

  if (content) {
    content.hidden = true;
  }

  setHtml("results-selected-info", "Selecionado: -");
  setHtml("results-totals", `<p>${safeMessage}</p>`);
  setHtml("results-phase-totals", `<p>${safeMessage}</p>`);
  setHtml("results-timeline", `<p>${safeMessage}</p>`);
  setHtml("results-risks", "<li>Nenhum risco calculado.</li>");
  setHtml("results-import-preview", "");
  setHtml("results-import-status", "");
  return true;
}

export function renderComputedResults(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const project = safePayload.project || {};
  const simulation = safePayload.simulation || {};
  const results = safePayload.results || {};
  const totals = results.totals || {};
  const timeline = Array.isArray(results.timeline) ? results.timeline : [];
  const risks = Array.isArray(safePayload.risks) ? safePayload.risks : [];
  const emptyState = document.getElementById("results-empty-state");
  const content = document.getElementById("results-content");

  if (emptyState) {
    emptyState.hidden = true;
  }

  if (content) {
    content.hidden = false;
  }

  setContextBar(project, simulation);

  setHtml(
    "results-selected-info",
    `Selecionado: ${String(project.name || "-")} / ${String(simulation.name || "-")}`
  );

  setHtml("results-totals", renderCategorySummary(totals, timeline));
  setHtml("results-phase-totals", renderPhaseSummary(simulation));

  const filterElement = document.getElementById("results-timeline-category-filter");
  const categoryFilter = filterElement ? String(filterElement.value || "all") : "all";
  const filteredTimeline = filterTimelineRowsByCategory(timeline, categoryFilter);

  if (filteredTimeline.length === 0) {
    setHtml("results-timeline", "<p>Sem timeline para exibir.</p>");
  } else {
    let rowsHtml = "";

    for (const item of filteredTimeline) {
      const categories = item && typeof item === "object" ? item.categories || {} : {};
      rowsHtml += `
        <tr>
          <td>${String(item.yyyyMm || "-")}</td>
          <td>${formatMoney(categories.builderCorrected)}</td>
          <td>${formatMoney(categories.legacyCashflowCorrected)}</td>
          <td>${formatMoney(categories.constructionInterest)}</td>
          <td>${formatMoney(categories.financingInstallment)}</td>
          <td>${formatMoney(item.nominal)}</td>
          <td>${Number(item.factor || 1).toFixed(6)}</td>
          <td>${formatMoney(item.corrected)}</td>
          <td>${formatMoney(item.totalOut)}</td>
        </tr>
      `;
    }

    const timelineHtml = `
      <table class="timeline-table">
        <thead>
          <tr>
            <th>Ano-Mês</th>
            <th>Construtora</th>
            <th>Fluxo manual</th>
            <th>Juros obra</th>
            <th>Financiamento</th>
            <th>Nominal</th>
            <th>Fator</th>
            <th>Corrigido</th>
            <th>Saída total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    setHtml("results-timeline", timelineHtml);
  }

  if (risks.length === 0) {
    setHtml("results-risks", "<li>Sem riscos sinalizados.</li>");
  } else {
    let risksHtml = "";

    for (const flag of risks) {
      const severity = String(flag.severity || "low");
      risksHtml += `<li class="risk-${severity}"><strong>${escapeHtml(flag.title)}</strong> - ${escapeHtml(flag.detail)}</li>`;
    }

    setHtml("results-risks", risksHtml);
  }

  setHtml("results-import-status", "");

  return true;
}

export function renderExportJsonText(jsonText) {
  const textArea = document.getElementById("results-export-text");

  if (!textArea) {
    return false;
  }

  textArea.value = String(jsonText || "");
  return true;
}

export function renderImportStatus(message, isError) {
  const element = document.getElementById("results-import-status");

  if (!element) {
    return false;
  }

  element.textContent = String(message || "");
  element.style.color = isError ? "#b91c1c" : "#166534";
  return true;
}

export function renderImportPreview(previewPayload) {
  const element = document.getElementById("results-import-preview");

  if (!element) {
    return false;
  }

  if (!previewPayload || typeof previewPayload !== "object") {
    element.innerHTML = "";
    return true;
  }

  const errors = Array.isArray(previewPayload.errors) ? previewPayload.errors : [];
  const warnings = Array.isArray(previewPayload.warnings) ? previewPayload.warnings : [];
  const preview = previewPayload.preview && typeof previewPayload.preview === "object" ? previewPayload.preview : null;

  if (!previewPayload.ok) {
    element.innerHTML = `<p><strong>Importação inválida:</strong> ${escapeHtml(errors.join(" "))}</p>`;
    return true;
  }

  let html = "<div class=\"results-summary\"><dl>";
  html += `<div><dt>dbVersion (origem)</dt><dd>${escapeHtml(String(preview ? preview.inputVersion : "-"))}</dd></div>`;
  html += `<div><dt>dbVersion (destino)</dt><dd>${escapeHtml(String(preview ? preview.targetVersion : "-"))}</dd></div>`;
  html += `<div><dt>Projetos</dt><dd>${escapeHtml(String(preview ? preview.projectsCount : 0))}</dd></div>`;
  html += `<div><dt>Simulações</dt><dd>${escapeHtml(String(preview ? preview.simulationsCount : 0))}</dd></div>`;
  html += "</dl></div>";

  if (warnings.length > 0) {
    html += `<p>${escapeHtml(warnings.join(" "))}</p>`;
  }

  element.innerHTML = html;
  return true;
}
