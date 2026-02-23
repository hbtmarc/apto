function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = toNumber(value, fallback);
  return parsed >= 0 ? parsed : fallback;
}

function toPositiveInt(value, fallback = 0) {
  const parsed = Math.floor(toNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
}

function safeMoney(value) {
  return Number(toNonNegativeNumber(value, 0).toFixed(2));
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

function monthIndexToKey(monthIndex) {
  const safeIndex = Math.floor(toNumber(monthIndex, 0));
  const year = Math.floor(safeIndex / 12);
  const month = (safeIndex % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function addDaysToDateString(dateValue, daysToAdd) {
  const text = String(dateValue || "").trim();

  if (!text || text.length < 10) {
    return null;
  }

  const date = new Date(`${text.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const safeDays = Math.max(0, Math.floor(toNumber(daysToAdd, 0)));
  date.setDate(date.getDate() + safeDays);

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonths(yyyyMm, n) {
  const startIndex = toMonthIndex(String(yyyyMm || ""));

  if (startIndex === null) {
    return "";
  }

  const offset = Math.floor(toNumber(n, 0));
  return monthIndexToKey(startIndex + offset);
}

export function monthKeysBetween(startDate, endDate) {
  const startMonth =
    typeof startDate === "string" && startDate.length >= 10
      ? toMonthKeyFromDateString(startDate)
      : String(startDate || "");
  const endMonth =
    typeof endDate === "string" && endDate.length >= 10
      ? toMonthKeyFromDateString(endDate)
      : String(endDate || "");

  const startIndex = toMonthIndex(startMonth);
  const endIndex = toMonthIndex(endMonth);

  if (startIndex === null || endIndex === null || endIndex < startIndex) {
    return [];
  }

  const output = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    output.push(monthIndexToKey(index));
  }

  return output;
}

export function annualToMonthlyRate(annualRatePercent) {
  const annualPercent = toNumber(annualRatePercent, 0);
  const annualDecimal = annualPercent / 100;

  if (!Number.isFinite(annualDecimal) || annualDecimal <= -1) {
    return 0;
  }

  const monthlyRate = Math.pow(1 + annualDecimal, 1 / 12) - 1;
  return Number.isFinite(monthlyRate) ? monthlyRate : 0;
}

export function scheduleSAC(principalInput, annualRatePercentInput, monthsInput) {
  const principal = Math.max(0, toNumber(principalInput, 0));
  const annualRatePercent = Math.max(0, toNumber(annualRatePercentInput, 0));
  const months = toPositiveInt(monthsInput, 0);
  const monthlyRate = annualToMonthlyRate(annualRatePercent);

  if (principal <= 0 || months <= 0) {
    return [];
  }

  const amortConst = principal / months;
  let balance = principal;
  const output = [];

  for (let monthNumber = 1; monthNumber <= months; monthNumber += 1) {
    const interest = balance * monthlyRate;
    let amort = amortConst;

    if (monthNumber === months) {
      amort = balance;
    }

    const installment = amort + interest;
    balance = balance - amort;

    if (Math.abs(balance) < 0.000001) {
      balance = 0;
    }

    output.push({
      yyyyMm: "",
      installment: safeMoney(installment),
      interest: safeMoney(interest),
      amort: safeMoney(amort),
      balance: safeMoney(balance)
    });
  }

  return output;
}

export function schedulePRICE(principalInput, annualRatePercentInput, monthsInput) {
  const principal = Math.max(0, toNumber(principalInput, 0));
  const annualRatePercent = Math.max(0, toNumber(annualRatePercentInput, 0));
  const months = toPositiveInt(monthsInput, 0);
  const monthlyRate = annualToMonthlyRate(annualRatePercent);

  if (principal <= 0 || months <= 0) {
    return [];
  }

  let fixedInstallment = 0;

  if (monthlyRate === 0) {
    fixedInstallment = principal / months;
  } else {
    const denominator = 1 - Math.pow(1 + monthlyRate, -months);
    fixedInstallment = denominator === 0 ? principal / months : (principal * monthlyRate) / denominator;
  }

  if (!Number.isFinite(fixedInstallment)) {
    fixedInstallment = principal / months;
  }

  let balance = principal;
  const output = [];

  for (let monthNumber = 1; monthNumber <= months; monthNumber += 1) {
    const interest = balance * monthlyRate;
    let amort = fixedInstallment - interest;
    let installment = fixedInstallment;

    if (monthNumber === months) {
      amort = balance;
      installment = amort + interest;
    }

    balance = balance - amort;

    if (Math.abs(balance) < 0.000001) {
      balance = 0;
    }

    output.push({
      yyyyMm: "",
      installment: safeMoney(installment),
      interest: safeMoney(interest),
      amort: safeMoney(amort),
      balance: safeMoney(balance)
    });
  }

  return output;
}

function emptyTimelineRow(yyyyMm) {
  return {
    yyyyMm,
    nominal: 0,
    factor: 1,
    corrected: 0,
    financingInstallment: 0,
    totalOut: 0,
    categories: {
      builderNominal: 0,
      builderCorrected: 0,
      legacyCashflowNominal: 0,
      legacyCashflowCorrected: 0,
      constructionInterest: 0,
      financingInstallment: 0
    }
  };
}

function resolveIndexSeriesMap(sim) {
  if (!sim || typeof sim !== "object") {
    return {};
  }

  const fromTopLevel = sim.indexSeries;

  if (fromTopLevel && typeof fromTopLevel === "object" && !Array.isArray(fromTopLevel)) {
    return fromTopLevel;
  }

  const indexConfig = sim.index && typeof sim.index === "object" ? sim.index : {};
  const fromIndexConfig = indexConfig.series;

  if (fromIndexConfig && typeof fromIndexConfig === "object" && !Array.isArray(fromIndexConfig)) {
    return fromIndexConfig;
  }

  return {};
}

function resolveRatePercentFromSeries(seriesByMonth, monthKey) {
  if (!seriesByMonth || typeof seriesByMonth !== "object") {
    return null;
  }

  const value = seriesByMonth[monthKey];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRatePercentForMonth(sim, indexRef, monthKey) {
  const indexConfig = sim.index && typeof sim.index === "object" ? sim.index : {};
  const defaultRate = indexConfig.enabled === true ? toNumber(indexConfig.monthlyRate, 0) : 0;

  if (!indexRef) {
    return 0;
  }

  const seriesMap = resolveIndexSeriesMap(sim);
  const byRef = seriesMap[indexRef];

  if (byRef && typeof byRef === "object" && !Array.isArray(byRef)) {
    const direct = resolveRatePercentFromSeries(byRef, monthKey);

    if (direct !== null) {
      return direct;
    }
  }

  return defaultRate;
}

function compoundFactorFromStartToMonth(sim, indexRef, startMonth, targetMonth) {
  if (!indexRef) {
    return 1;
  }

  const monthList = monthKeysBetween(startMonth, targetMonth);

  if (monthList.length === 0) {
    return 1;
  }

  let factor = 1;

  for (const monthKey of monthList) {
    const ratePercent = getRatePercentForMonth(sim, indexRef, monthKey);
    const monthlyRate = ratePercent / 100;

    if (!Number.isFinite(monthlyRate)) {
      continue;
    }

    factor *= 1 + monthlyRate;

    if (!Number.isFinite(factor) || factor <= 0) {
      factor = 1;
    }
  }

  return factor;
}

function addAmountToRow(row, categoryNominalKey, categoryCorrectedKey, nominalAmount, correctedAmount) {
  row.categories[categoryNominalKey] = safeMoney(toNumber(row.categories[categoryNominalKey], 0) + nominalAmount);
  row.categories[categoryCorrectedKey] = safeMoney(
    toNumber(row.categories[categoryCorrectedKey], 0) + correctedAmount
  );
}

function addBuilderPaymentToTimeline(rowsByKey, sim, startMonth, item, monthKey, amount) {
  const row = rowsByKey[monthKey];

  if (!row) {
    return;
  }

  const indexRef = String(item && item.indexRef ? item.indexRef : "").trim();
  const factor = compoundFactorFromStartToMonth(sim, indexRef, startMonth, monthKey);
  const corrected = safeMoney(amount * factor);

  addAmountToRow(row, "builderNominal", "builderCorrected", amount, corrected);
}

function resolveBuilderPaymentAmount(item, basePrice) {
  const mode = String(item && item.amountMode ? item.amountMode : "fixed").trim().toLowerCase();
  const rawAmount = Math.max(0, toNumber(item && item.amount, 0));

  if (mode === "percent") {
    return safeMoney(Math.max(0, toNumber(basePrice, 0)) * (rawAmount / 100));
  }

  return safeMoney(rawAmount);
}

function applyBuilderPayments(rowsByKey, months, sim, startMonth) {
  const builderPayments = Array.isArray(sim.builderPayments) ? sim.builderPayments : [];
  const basePrice = Math.max(0, toNumber(sim.basePrice, 0));

  for (const item of builderPayments) {
    const type = String(item && item.type ? item.type : "once").trim();
    const amount = resolveBuilderPaymentAmount(item, basePrice);

    if (amount <= 0) {
      continue;
    }

    if (type === "once") {
      const monthKey = toMonthKeyFromDateString(item.date);

      if (!monthKey || !rowsByKey[monthKey]) {
        continue;
      }

      addBuilderPaymentToTimeline(rowsByKey, sim, startMonth, item, monthKey, amount);
      continue;
    }

    if (type === "monthly") {
      const start = toMonthKeyFromDateString(item.startDate);
      const end = toMonthKeyFromDateString(item.endDate);

      if (!start || !end) {
        continue;
      }

      const range = monthKeysBetween(start, end);

      for (const monthKey of range) {
        if (!rowsByKey[monthKey]) {
          continue;
        }

        addBuilderPaymentToTimeline(rowsByKey, sim, startMonth, item, monthKey, amount);
      }

      continue;
    }

    if (type === "balloon") {
      const start = toMonthKeyFromDateString(item.startDate);
      const end = toMonthKeyFromDateString(item.endDate);
      const everyMonths = Math.max(1, toPositiveInt(item.everyMonths, 6));
      const startIndex = toMonthIndex(start);
      const endIndex = toMonthIndex(end);

      if (startIndex === null || endIndex === null || endIndex < startIndex) {
        continue;
      }

      for (let index = startIndex; index <= endIndex; index += everyMonths) {
        const monthKey = monthIndexToKey(index);

        if (!rowsByKey[monthKey]) {
          continue;
        }

        addBuilderPaymentToTimeline(rowsByKey, sim, startMonth, item, monthKey, amount);
      }
    }
  }

  return months;
}

function applyLegacyCashflows(rowsByKey, months, sim) {
  const cashflows = Array.isArray(sim.cashflows) ? sim.cashflows : [];
  const indexConfig = sim.index && typeof sim.index === "object" ? sim.index : {};
  const useLegacyIndex = indexConfig.enabled === true;
  const legacyRate = toNumber(indexConfig.monthlyRate, 0) / 100;

  let rollingFactor = 1;
  const monthFactors = {};

  for (const monthKey of months) {
    if (useLegacyIndex) {
      rollingFactor *= 1 + legacyRate;

      if (!Number.isFinite(rollingFactor) || rollingFactor <= 0) {
        rollingFactor = 1;
      }
    } else {
      rollingFactor = 1;
    }

    monthFactors[monthKey] = rollingFactor;
  }

  function addLegacy(monthKey, amount) {
    const row = rowsByKey[monthKey];

    if (!row) {
      return;
    }

    const nominal = safeMoney(amount);
    const factor = Number(toNumber(monthFactors[monthKey], 1).toFixed(8));
    const corrected = safeMoney(nominal * factor);

    addAmountToRow(row, "legacyCashflowNominal", "legacyCashflowCorrected", nominal, corrected);
  }

  for (const item of cashflows) {
    const type = String(item && item.type ? item.type : "once").trim();
    const amount = Math.max(0, toNumber(item && item.amount, 0));

    if (amount <= 0) {
      continue;
    }

    if (type === "once") {
      const month = toMonthKeyFromDateString(item.date);

      if (month && rowsByKey[month]) {
        addLegacy(month, amount);
      }

      continue;
    }

    if (type === "monthly") {
      const start = toMonthKeyFromDateString(item.startDate);
      const end = toMonthKeyFromDateString(item.endDate);

      if (!start || !end) {
        continue;
      }

      for (const month of monthKeysBetween(start, end)) {
        if (rowsByKey[month]) {
          addLegacy(month, amount);
        }
      }

      continue;
    }

    if (type === "balloon") {
      const start = toMonthKeyFromDateString(item.startDate);
      const end = toMonthKeyFromDateString(item.endDate);
      const everyMonths = Math.max(1, toPositiveInt(item.everyMonths, 6));
      const startIndex = toMonthIndex(start);
      const endIndex = toMonthIndex(end);

      if (startIndex === null || endIndex === null || endIndex < startIndex) {
        continue;
      }

      for (let index = startIndex; index <= endIndex; index += everyMonths) {
        const month = monthIndexToKey(index);

        if (rowsByKey[month]) {
          addLegacy(month, amount);
        }
      }

      continue;
    }

    if (type === "installments") {
      const firstMonth = toMonthKeyFromDateString(item.date);
      const firstIndex = toMonthIndex(firstMonth);
      const installmentCount = Math.max(1, toPositiveInt(item.installmentCount, 1));
      const everyMonths = Math.max(1, toPositiveInt(item.everyMonths, 1));

      if (firstIndex === null) {
        continue;
      }

      const installmentBase = safeMoney(amount / installmentCount);
      let allocated = 0;

      for (let parcel = 0; parcel < installmentCount; parcel += 1) {
        const month = monthIndexToKey(firstIndex + parcel * everyMonths);
        const parcelAmount =
          parcel === installmentCount - 1 ? safeMoney(amount - allocated) : installmentBase;

        allocated = safeMoney(allocated + parcelAmount);

        if (rowsByKey[month]) {
          addLegacy(month, parcelAmount);
        }
      }
    }
  }
}

function applyConstructionInterest(rowsByKey, months, sim, constructionEndMonth) {
  const config =
    sim.constructionInterest && typeof sim.constructionInterest === "object"
      ? sim.constructionInterest
      : {};

  if (config.enabled !== true) {
    return {
      monthlyRatePercent: 0,
      principal: 0,
      disbursementPercentMonthly: 0,
      total: 0
    };
  }

  const principal = Math.max(0, toNumber(config.constructionPrincipal, toNumber(sim.basePrice, 0)));
  const monthlyRatePercent = Math.max(0, toNumber(config.monthlyRate, 0));
  const monthlyRate = monthlyRatePercent / 100;
  const defaultDisbursementPercent = Math.max(0, toNumber(config.disbursementPercentMonthly, 0));
  const byMonth =
    config.disbursementByMonth && typeof config.disbursementByMonth === "object"
      ? config.disbursementByMonth
      : {};

  if (principal <= 0 || monthlyRate <= 0) {
    return {
      monthlyRatePercent,
      principal,
      disbursementPercentMonthly: defaultDisbursementPercent,
      total: 0
    };
  }

  const endIndex = toMonthIndex(constructionEndMonth);
  let total = 0;

  for (const monthKey of months) {
    const monthIndex = toMonthIndex(monthKey);

    if (monthIndex === null) {
      continue;
    }

    if (endIndex !== null && monthIndex > endIndex) {
      continue;
    }

    const monthDisbursementPercentRaw = toNumber(byMonth[monthKey], defaultDisbursementPercent);
    const monthDisbursementPercent = Math.max(0, monthDisbursementPercentRaw);

    if (monthDisbursementPercent <= 0) {
      continue;
    }

    const monthDisbursed = principal * (monthDisbursementPercent / 100);
    const monthInterest = safeMoney(monthDisbursed * monthlyRate);

    if (monthInterest <= 0) {
      continue;
    }

    const row = rowsByKey[monthKey];

    if (!row) {
      continue;
    }

    row.categories.constructionInterest = safeMoney(
      toNumber(row.categories.constructionInterest, 0) + monthInterest
    );
    total += monthInterest;
  }

  return {
    monthlyRatePercent,
    principal: safeMoney(principal),
    disbursementPercentMonthly: defaultDisbursementPercent,
    total: safeMoney(total)
  };
}

function applyFinancing(rowsByKey, months, sim) {
  const config = sim.financing && typeof sim.financing === "object" ? sim.financing : {};
  const enabled = config.enabled === true;

  if (!enabled) {
    return {
      enabled: false,
      principal: 0,
      months: 0,
      system: "SAC",
      startMonth: null,
      annualRatePercent: 0,
      schedule: []
    };
  }

  const startMonth = toMonthKeyFromDateString(config.startDate);
  const monthsCount = toPositiveInt(config.months, 0);
  const annualRatePercent = Math.max(0, toNumber(config.annualRate, 0));
  const system = config.system === "PRICE" ? "PRICE" : "SAC";

  if (!startMonth || monthsCount <= 0) {
    return {
      enabled: true,
      principal: 0,
      months: monthsCount,
      system,
      startMonth,
      annualRatePercent,
      schedule: []
    };
  }

  let correctedPaidBeforeFinancing = 0;
  const financingStartIndex = toMonthIndex(startMonth);

  for (const monthKey of months) {
    const row = rowsByKey[monthKey];
    const monthIndex = toMonthIndex(monthKey);

    if (!row || monthIndex === null || financingStartIndex === null || monthIndex > financingStartIndex) {
      continue;
    }

    correctedPaidBeforeFinancing +=
      toNumber(row.categories.builderCorrected, 0) + toNumber(row.categories.legacyCashflowCorrected, 0);
  }

  const principal = Math.max(0, toNumber(sim.basePrice, 0) - correctedPaidBeforeFinancing);

  const schedule =
    system === "PRICE"
      ? schedulePRICE(principal, annualRatePercent, monthsCount)
      : scheduleSAC(principal, annualRatePercent, monthsCount);

  for (let index = 0; index < schedule.length; index += 1) {
    const monthKey = addMonths(startMonth, index);
    const row = rowsByKey[monthKey];

    if (!row) {
      continue;
    }

    schedule[index].yyyyMm = monthKey;
    row.categories.financingInstallment = safeMoney(
      toNumber(row.categories.financingInstallment, 0) + toNumber(schedule[index].installment, 0)
    );
  }

  return {
    enabled: true,
    principal: safeMoney(principal),
    months: monthsCount,
    system,
    startMonth,
    annualRatePercent,
    schedule
  };
}

function getMaxCashflowMonthIndex(sim) {
  const cashflows = Array.isArray(sim && sim.cashflows) ? sim.cashflows : [];
  let maxIndex = null;

  for (const item of cashflows) {
    const type = String(item && item.type ? item.type : "once").trim();
    let monthIndex = null;

    if (type === "once") {
      monthIndex = toMonthIndex(toMonthKeyFromDateString(item.date));
    }

    if (type === "monthly" || type === "balloon") {
      monthIndex = toMonthIndex(toMonthKeyFromDateString(item.endDate));
    }

    if (type === "installments") {
      const firstIndex = toMonthIndex(toMonthKeyFromDateString(item.date));
      const installmentCount = Math.max(1, toPositiveInt(item.installmentCount, 1));
      const everyMonths = Math.max(1, toPositiveInt(item.everyMonths, 1));

      if (firstIndex !== null) {
        monthIndex = firstIndex + (installmentCount - 1) * everyMonths;
      }
    }

    if (monthIndex === null) {
      continue;
    }

    if (maxIndex === null || monthIndex > maxIndex) {
      maxIndex = monthIndex;
    }
  }

  return maxIndex;
}

function getMaxBuilderPaymentMonthIndex(sim) {
  const builderPayments = Array.isArray(sim && sim.builderPayments) ? sim.builderPayments : [];
  let maxIndex = null;

  for (const item of builderPayments) {
    const type = String(item && item.type ? item.type : "once").trim();
    let monthIndex = null;

    if (type === "once") {
      monthIndex = toMonthIndex(toMonthKeyFromDateString(item.date));
    }

    if (type === "monthly" || type === "balloon") {
      monthIndex = toMonthIndex(toMonthKeyFromDateString(item.endDate));
    }

    if (monthIndex === null) {
      continue;
    }

    if (maxIndex === null || monthIndex > maxIndex) {
      maxIndex = monthIndex;
    }
  }

  return maxIndex;
}

function determineTimelineBounds(sim) {
  const contractMonth = toMonthKeyFromDateString(sim.contractDate);

  if (!contractMonth) {
    return null;
  }

  const deliveryPlusToleranceDate = addDaysToDateString(sim.deliveryDate, sim.toleranceDays);
  const deliveryPlusToleranceMonth =
    toMonthKeyFromDateString(deliveryPlusToleranceDate) || toMonthKeyFromDateString(sim.deliveryDate) || contractMonth;

  const financing = sim.financing && typeof sim.financing === "object" ? sim.financing : {};
  let financingEndMonth = null;

  if (financing.enabled === true) {
    const financingStart = toMonthKeyFromDateString(financing.startDate);
    const financingMonths = toPositiveInt(financing.months, 0);

    if (financingStart && financingMonths > 0) {
      financingEndMonth = addMonths(financingStart, financingMonths - 1);
    }
  }

  const deliveryIndex = toMonthIndex(deliveryPlusToleranceMonth);
  const financingIndex = toMonthIndex(financingEndMonth);
  const cashflowIndex = getMaxCashflowMonthIndex(sim);
  const builderPaymentsIndex = getMaxBuilderPaymentMonthIndex(sim);

  let endMonth = deliveryPlusToleranceMonth;
  let endIndex = deliveryIndex;

  if (financingIndex !== null && (endIndex === null || financingIndex > endIndex)) {
    endMonth = financingEndMonth;
    endIndex = financingIndex;
  }

  if (cashflowIndex !== null && (endIndex === null || cashflowIndex > endIndex)) {
    endMonth = monthIndexToKey(cashflowIndex);
    endIndex = cashflowIndex;
  }

  if (builderPaymentsIndex !== null && (endIndex === null || builderPaymentsIndex > endIndex)) {
    endMonth = monthIndexToKey(builderPaymentsIndex);
  }

  return {
    startMonth: contractMonth,
    endMonth,
    deliveryPlusToleranceMonth,
    financingEndMonth
  };
}

export function computeSimulationResults(simInput) {
  const sim = simInput && typeof simInput === "object" ? simInput : {};
  const bounds = determineTimelineBounds(sim);

  if (!bounds) {
    return {
      timeline: [],
      totals: {
        nominal: 0,
        corrected: 0,
        financing: 0,
        grandTotal: 0
      },
      meta: {
        startMonth: null,
        endMonth: null,
        deliveryPlusToleranceMonth: null,
        financingEndMonth: null,
        financingPrincipal: 0,
        financingMonths: 0,
        financingSystem: "SAC",
        financingStartMonth: null,
        financingAnnualRate: 0,
        financingSchedule: [],
        constructionInterestTotal: 0,
        monthlyIndexRatePercent: 0
      }
    };
  }

  const months = monthKeysBetween(bounds.startMonth, bounds.endMonth);
  const rowsByKey = {};

  for (const monthKey of months) {
    rowsByKey[monthKey] = emptyTimelineRow(monthKey);
  }

  applyBuilderPayments(rowsByKey, months, sim, bounds.startMonth);
  applyLegacyCashflows(rowsByKey, months, sim);

  const constructionInfo = applyConstructionInterest(
    rowsByKey,
    months,
    sim,
    bounds.deliveryPlusToleranceMonth
  );

  const financingInfo = applyFinancing(rowsByKey, months, sim);

  const timeline = [];
  let totalNominal = 0;
  let totalCorrected = 0;
  let totalFinancing = 0;

  for (const monthKey of months) {
    const row = rowsByKey[monthKey];

    const builderNominal = toNumber(row.categories.builderNominal, 0);
    const builderCorrected = toNumber(row.categories.builderCorrected, 0);
    const legacyNominal = toNumber(row.categories.legacyCashflowNominal, 0);
    const legacyCorrected = toNumber(row.categories.legacyCashflowCorrected, 0);
    const constructionInterest = toNumber(row.categories.constructionInterest, 0);
    const financingInstallment = toNumber(row.categories.financingInstallment, 0);

    row.nominal = safeMoney(builderNominal + legacyNominal + constructionInterest);
    row.corrected = safeMoney(builderCorrected + legacyCorrected + constructionInterest);

    const correctedBaseForFactor = row.nominal > 0 ? row.corrected / row.nominal : 1;
    row.factor = Number((Number.isFinite(correctedBaseForFactor) ? correctedBaseForFactor : 1).toFixed(8));

    row.financingInstallment = safeMoney(financingInstallment);
    row.totalOut = safeMoney(row.corrected + row.financingInstallment);

    row.categories.builderNominal = safeMoney(builderNominal);
    row.categories.builderCorrected = safeMoney(builderCorrected);
    row.categories.legacyCashflowNominal = safeMoney(legacyNominal);
    row.categories.legacyCashflowCorrected = safeMoney(legacyCorrected);
    row.categories.constructionInterest = safeMoney(constructionInterest);
    row.categories.financingInstallment = safeMoney(financingInstallment);

    totalNominal += row.nominal;
    totalCorrected += row.corrected;
    totalFinancing += row.financingInstallment;

    timeline.push(row);
  }

  totalNominal = safeMoney(totalNominal);
  totalCorrected = safeMoney(totalCorrected);
  totalFinancing = safeMoney(totalFinancing);

  const indexConfig = sim.index && typeof sim.index === "object" ? sim.index : {};

  return {
    timeline,
    totals: {
      nominal: totalNominal,
      corrected: totalCorrected,
      financing: totalFinancing,
      grandTotal: safeMoney(totalCorrected + totalFinancing)
    },
    meta: {
      startMonth: bounds.startMonth,
      endMonth: bounds.endMonth,
      deliveryPlusToleranceMonth: bounds.deliveryPlusToleranceMonth,
      financingEndMonth: bounds.financingEndMonth,
      financingPrincipal: safeMoney(financingInfo.principal),
      financingMonths: toPositiveInt(financingInfo.months, 0),
      financingSystem: financingInfo.system || "SAC",
      financingStartMonth: financingInfo.startMonth || null,
      financingAnnualRate: toNumber(financingInfo.annualRatePercent, 0),
      financingSchedule: Array.isArray(financingInfo.schedule) ? financingInfo.schedule : [],
      constructionInterestTotal: safeMoney(constructionInfo.total),
      constructionInterestMonthlyRatePercent: toNumber(constructionInfo.monthlyRatePercent, 0),
      monthlyIndexRatePercent: toNumber(indexConfig.monthlyRate, 0)
    }
  };
}
