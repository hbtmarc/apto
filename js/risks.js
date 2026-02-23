function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function toNumber(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

export function setupRisks() {
  return true;
}

export function buildRiskFlags(project, sim) {
  const safeProject = project && typeof project === "object" ? project : {};
  const safeSim = sim && typeof sim === "object" ? sim : {};
  const checklist =
    safeSim.protectionChecklist && typeof safeSim.protectionChecklist === "object"
      ? safeSim.protectionChecklist
      : {};
  const flags = [];

  if (checklist.quadroResumo !== true) {
    flags.push({
      id: "missing-quadro-resumo",
      severity: "high",
      title: "Quadro-resumo ausente",
      detail: "O checklist não confirma quadro-resumo revisado."
    });
  }

  if (checklist.brokerageHighlighted !== true) {
    flags.push({
      id: "brokerage-not-highlighted",
      severity: "medium",
      title: "Corretagem não confirmada/destacada",
      detail: "Não há confirmação de corretagem destacada em contrato."
    });
  }

  if (checklist.satiPresent === true) {
    flags.push({
      id: "sati-present",
      severity: "medium",
      title: "SATI presente",
      detail: "Checklist indica SATI presente; revisar cobrança e base legal."
    });
  }

  if (checklist.itbiProvisioned !== true) {
    flags.push({
      id: "missing-itbi-provision",
      severity: "medium",
      title: "ITBI não provisionado",
      detail: "Não há provisão de ITBI confirmada no checklist."
    });
  }

  if (checklist.memorialRegistryChecked !== true) {
    flags.push({
      id: "missing-memorial-registry-check",
      severity: "high",
      title: "Memorial/matrícula não confirmados",
      detail: "Checklist não confirma validação de memorial e matrícula/cartório."
    });
  }

  const toleranceDaysRaw = hasValue(safeSim.toleranceDays)
    ? safeSim.toleranceDays
    : safeProject.toleranceDays;
  const toleranceDays = toNumber(toleranceDaysRaw);

  if (toleranceDays > 180) {
    flags.push({
      id: "tolerance-days-over-180",
      severity: "low",
      title: "Prazo de tolerância acima de 180 dias",
      detail: "Prazo de tolerância superior a 180 dias."
    });
  }

  return flags;
}
