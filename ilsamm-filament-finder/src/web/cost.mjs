// All weights and print times describe the entire successful batch, not one piece.
// Optional costs start at zero so an estimate never silently invents overheads.
export const COST_FIELDS = {
  units: {
    label: "Pezzi nel lotto",
    initial: 1,
    min: 1,
    max: 100000,
    integer: true,
    hint: "Pezzi utilizzabili ottenuti con i dati dello slicer qui sotto.",
  },
  grams: {
    label: "Peso dei pezzi (g)",
    initial: 120,
    max: 10000000,
    hint: "Peso totale del lotto, senza supporti e spurghi.",
  },
  wasteGrams: {
    label: "Supporti e spurghi (g)",
    initial: 0,
    max: 10000000,
    hint: "Aggiungili solo se non sono già inclusi nel peso dei pezzi.",
  },
  spoolPrice: {
    label: "Prezzo confezione (€)",
    initial: 20,
    max: 1000000,
    hint: "Costo pagato per il filamento; puoi includere la sua spedizione.",
  },
  spoolGrams: {
    label: "Peso netto confezione (g)",
    initial: 1000,
    min: 1,
    max: 10000000,
    hint: "Solo filamento, senza il peso della bobina. Anche multipack.",
  },
  hours: {
    label: "Durata del lotto (ore)",
    initial: 5,
    max: 100000,
    integer: true,
  },
  minutes: {
    label: "Minuti aggiuntivi",
    initial: 0,
    max: 59,
    integer: true,
    hint: "Esempio: 2 ore e 30 minuti nei due campi.",
  },
  watts: {
    label: "Consumo medio (W)",
    initial: 120,
    max: 100000,
    hint: "Assorbimento medio misurato, non la potenza massima dell’alimentatore.",
  },
  energy: { label: "Tariffa energia (€/kWh)", initial: 0.3, max: 10000 },
  machinePrice: {
    label: "Costo della stampante (€)",
    initial: 0,
    max: 10000000,
    hint: "Metti 0 per escludere l’ammortamento.",
  },
  machineLife: {
    label: "Vita utile prevista (ore)",
    initial: 3000,
    min: 1,
    max: 1000000,
    hint: "Ore di stampa su cui ripartire il costo della macchina.",
  },
  maintenance: {
    label: "Manutenzione (€/ora)",
    initial: 0,
    max: 10000,
    hint: "Quota per ugelli, piatti e altri ricambi.",
  },
  failure: {
    label: "Probabilità di ristampa (%)",
    initial: 0,
    max: 95,
    hint: "Stima prudente: ogni tentativo fallito consuma un intero lotto.",
  },
  setupMinutes: {
    label: "Preparazione lotto (min)",
    initial: 0,
    max: 1000000,
    hint: "Modellazione, slicing e preparazione: una sola volta per lotto.",
  },
  finishMinutes: {
    label: "Finitura per pezzo (min)",
    initial: 0,
    max: 1000000,
    hint: "Rimozione supporti, pulizia, assemblaggio e controllo.",
  },
  labor: { label: "Valore del lavoro (€/ora)", initial: 20, max: 100000 },
  packaging: { label: "Imballaggio per pezzo (€)", initial: 0, max: 1000000 },
  extras: {
    label: "Altri costi del lotto (€)",
    initial: 0,
    max: 10000000,
    hint: "Inserti, colla, licenza del modello o spedizione al cliente.",
  },
  margin: {
    label: "Margine desiderato (%)",
    initial: 30,
    max: 95,
    sales: true,
    hint: "Utile sul prezzo netto dopo i costi e le commissioni. Non è il ricarico.",
  },
  feePercent: {
    label: "Commissioni variabili (%)",
    initial: 0,
    max: 95,
    sales: true,
    hint: "Applicate al totale pagato dal cliente, inclusa l’eventuale IVA.",
  },
  feeFixed: {
    label: "Commissione fissa per lotto (€)",
    initial: 0,
    max: 1000000,
    sales: true,
    hint: "Un lotto corrisponde a un unico ordine.",
  },
  vat: {
    label: "IVA da applicare (%)",
    initial: 0,
    max: 100,
    sales: true,
    hint: "Inserisci la tua aliquota; 0 per non aggiungerla al prezzo.",
  },
};
export const COST_DEFAULTS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(COST_FIELDS).map(([key, field]) => [key, field.initial]),
  ),
  sell: false,
});
export class CostInputError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}
export function parseCost(input) {
  const values = { sell: input.sell === true };
  for (const [key, field] of Object.entries(COST_FIELDS)) {
    const raw = input[key];
    const value =
      typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < (field.min ?? 0) ||
      value > field.max ||
      (field.integer && !Number.isInteger(value))
    ) {
      if (field.sales && !values.sell) {
        values[key] = field.initial;
        continue;
      }
      throw new CostInputError(
        key,
        `${field.label}: inserisci ${field.integer ? "un numero intero" : "un numero"} tra ${field.min ?? 0} e ${field.max}.`,
      );
    }
    values[key] = value;
  }
  return values;
}
export function costEstimate(input) {
  const v = parseCost(input);
  const hours = v.hours + v.minutes / 60;
  const material = ((v.grams + v.wasteGrams) * v.spoolPrice) / v.spoolGrams;
  const kwh = (hours * v.watts) / 1000;
  const electricity = kwh * v.energy;
  const machineRate = v.machinePrice / v.machineLife + v.maintenance;
  const machine = hours * machineRate;
  const print = material + electricity + machine;
  // Expected full attempts per successful batch = 1 / success probability.
  const attempts = 1 / (1 - v.failure / 100);
  const reprints = print * (attempts - 1);
  const labor = ((v.setupMinutes + v.finishMinutes * v.units) / 60) * v.labor;
  const packaging = v.packaging * v.units;
  const breakdown = [
    {
      key: "material",
      label: "Filamento, supporti e spurghi",
      value: material,
    },
    { key: "electricity", label: "Energia", value: electricity },
    { key: "machine", label: "Ammortamento e manutenzione", value: machine },
    { key: "reprints", label: "Quota per ristampe", value: reprints },
    { key: "labor", label: "Lavoro manuale", value: labor },
    { key: "packaging", label: "Imballaggi", value: packaging },
    { key: "extras", label: "Altri costi", value: v.extras },
  ];
  const total = breakdown.reduce((sum, row) => sum + row.value, 0);
  let sale = null;
  if (v.sell) {
    const feeRate = v.feePercent / 100,
      taxRate = v.vat / 100,
      margin = v.margin / 100;
    const denominator = 1 - margin - feeRate * (1 + taxRate);
    if (denominator <= 0.000001)
      throw new CostInputError(
        "margin",
        "Margine e commissioni assorbono tutto il prezzo netto. Riduci una delle due percentuali.",
      );
    // Quote a whole-cent unit price upwards, preserving the requested margin.
    const rawCents = ((total + v.feeFixed) / denominator / v.units) * 100;
    // Remove floating-point noise at cent boundaries (e.g. 0.07 / 0.7).
    const netUnit = Math.ceil(Number(rawCents.toFixed(8))) / 100;
    const net = netUnit * v.units;
    const tax = net * taxRate;
    const gross = net + tax;
    const fees = gross * feeRate + v.feeFixed;
    const profit = net - total - fees;
    sale = {
      netUnit,
      net,
      tax,
      gross,
      grossUnit: gross / v.units,
      fees,
      profit,
      profitUnit: profit / v.units,
      actualMargin: net > 0 ? (profit / net) * 100 : 0,
    };
  }
  return {
    values: v,
    hours,
    kwh,
    expectedHours: hours * attempts,
    expectedKwh: kwh * attempts,
    machineRate,
    attempts,
    breakdown,
    total,
    unit: total / v.units,
    sale,
  };
}

export function restoreCost(saved) {
  if (!saved || saved.version !== 1 || typeof saved.name !== "string")
    return { values: { ...COST_DEFAULTS }, name: "", saved: false };
  try {
    const result = costEstimate(saved.values);
    return {
      values: result.values,
      name: saved.name.slice(0, 80),
      saved: true,
    };
  } catch {
    return { values: { ...COST_DEFAULTS }, name: "", saved: false };
  }
}

export function costReport(name, input) {
  const r = costEstimate(input);
  const eur = (value) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  const n = (value) =>
    new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(value);
  return [
    "FILAMENT FINDER — STIMA COSTO PRODOTTO",
    name.trim() || "Prodotto senza nome",
    `Lotto: ${r.values.units} pezzi`,
    `Costo per pezzo: ${eur(r.unit)}`,
    `Costo lotto: ${eur(r.total)}`,
    "",
    "RIPARTIZIONE COSTI DEL LOTTO",
    ...r.breakdown.map((row) => `${row.label}: ${eur(row.value)}`),
    "",
    ...(r.sale
      ? [
          "PREZZO DI VENDITA STIMATO",
          `Prezzo netto per pezzo: ${eur(r.sale.netUnit)}`,
          `Ricavo netto lotto: ${eur(r.sale.net)}`,
          `IVA lotto: ${eur(r.sale.tax)}`,
          `Totale cliente lotto: ${eur(r.sale.gross)}`,
          `Commissioni lotto: ${eur(r.sale.fees)}`,
          `Utile stimato lotto: ${eur(r.sale.profit)}`,
          `Margine effettivo: ${n(r.sale.actualMargin)}%`,
          "",
        ]
      : []),
    "DATI INSERITI",
    ...Object.entries(COST_FIELDS)
      .filter(([, field]) => !field.sales || r.values.sell)
      .map(([key, field]) => `${field.label}: ${n(r.values[key])}`),
    "",
    "Pesi e durata si riferiscono all'intero lotto. Costi inseriti al netto dell'IVA.",
    "Le ristampe ripetono filamento, energia e costo macchina; lavoro, imballaggio e altri costi si conteggiano una volta per il lotto riuscito.",
    "Le commissioni percentuali si applicano al totale cliente, inclusa IVA. Un lotto equivale a un ordine.",
    "Gli importi a zero sono esclusi dalla stima. Prezzo calcolato da costi e margine inseriti, non da una valutazione del mercato.",
  ].join("\n");
}
