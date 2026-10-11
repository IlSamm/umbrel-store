import {
  money,
  printerName,
  safeUrl,
  compatibility,
  recommend,
  filterOffers,
  mergeSource,
} from "./domain.mjs";
import {
  COST_FIELDS,
  COST_DEFAULTS,
  costEstimate,
  restoreCost,
  costReport,
} from "./cost.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  materials: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  prices:
    '<path d="M20 13 11 22 2 13V3h10l8 10Z"/><circle cx="7" cy="8" r="1.5"/>',
  advisor:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  compare: '<path d="M4 7h16l-4-4M20 17H4l4 4M20 7l-4 4M4 17l4-4"/>',
  cost: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m5 0h1m-7 4h1m5 0h1m-7 4h1m5 0h1"/>',
  alerts:
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  settings:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
  printer: '<path d="M7 9V3h10v6M7 17H3V9h18v8h-4M7 14h10v7H7zM17 11h1"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.materials}</svg>`;
const routes = {
  home: "Panoramica",
  materials: "Materiali",
  prices: "Ricerca prezzi",
  advisor: "Consigliere",
  compare: "Confronta",
  cost: "Calcolo costi",
  alerts: "Alert prezzi",
  settings: "Impostazioni",
};
const storage = {
  get(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value, { quiet = false } = {}) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      if (!quiet) toast("Preferenze disponibili solo per questa sessione.");
      return false;
    }
  },
};
const state = {
  catalog: { materials: [], printers: [], brands: [] },
  catalogReady: false,
  catalogError: "",
  health: null,
  sources: [],
  printer: null,
  route: "home",
  materialQuery: "",
  group: "all",
  compatibleOnly: false,
  market: null,
  marketContext: null,
  marketError: "",
  busy: false,
  search: { material: "PLA", brand: "all", qty: 1 },
  filters: { query: "", store: "", format: "", stock: true, sort: "price" },
  page: 1,
  alerts: [],
  events: [],
  alertsError: "",
  project: "",
  recommendations: [],
  compare: ["pla", "petg"],
  calc: { ...COST_DEFAULTS },
  calcName: "",
  calcSaved: false,
  epoch: 0,
  retrying: new Set(),
  motion: true,
};
let searchController, toastTimer;
let alertsRevision = 0;
const screens = new Map();
let mountedRoute = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function updateMotion() {
  document.documentElement.dataset.motion =
    state.motion && !reducedMotion.matches ? "on" : "off";
  if (document.documentElement.dataset.motion === "off")
    document.getAnimations().forEach((animation) => animation.cancel());
}
function animateSurface(element) {
  if (document.documentElement.dataset.motion === "off") return;
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate(
    [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
}
function invalidateScreens(...names) {
  for (const name of names) {
    const screen = screens.get(name);
    if (screen) screen.dirty = true;
  }
}
const materialById = (id) => state.catalog.materials.find((m) => m.id === id);
const badge = (text, level = "") =>
  `<span class="badge ${esc(level)}">${esc(text)}</span>`;
const button = (text, action, kind = "secondary") =>
  `<button type="button" class="button ${kind}" data-action="${action}">${text}</button>`;
const link = (route, text, kind = "text-link") =>
  `<a class="${kind}" href="#${route}">${text}</a>`;
const header = (eyebrow, title, copy, extra = "") =>
  `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>${extra}</div>`;
const empty = (title, copy, action = "") =>
  `<div class="empty">${icon("search")}<h3>${title}</h3><p>${copy}</p>${action}</div>`;
const options = (items, selected) =>
  items
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`,
    )
    .join("");
const range = (values) =>
  Array.isArray(values) ? `${values.join("–")} °C` : "—";
const date = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};

async function api(path, { body, signal, timeout = 30000 } = {}) {
  const deadline = new AbortController();
  const abort = () => deadline.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) deadline.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(path, {
      signal: deadline.signal,
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || `Richiesta non riuscita (${response.status})`,
      );
    return data;
  } catch (error) {
    if (error.name === "AbortError" && !signal?.aborted)
      throw new Error("Il server impiega troppo tempo. Riprova tra poco.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 4000);
}
function openDialog(title, html) {
  state.historyToken = null;
  $("#dialog-title").textContent = title;
  $("#dialog-content").innerHTML = html;
  if (!$("#detail-dialog").open) $("#detail-dialog").showModal();
  $("#detail-dialog").scrollTop = 0;
  animateSurface($("#detail-dialog"));
}
function closeDialog() {
  $("#detail-dialog").close();
}
function updatePrinter() {
  $("#printer-button").innerHTML =
    `${icon("printer")}<span>${esc(printerName(state.printer))}</span>`;
}
function navigate() {
  const route = location.hash.slice(1);
  if (mountedRoute && screens.has(mountedRoute))
    screens.get(mountedRoute).scroll = window.scrollY;
  state.route = Object.hasOwn(routes, route) ? route : "home";
  $("#page-name").textContent = routes[state.route];
  document.title = `${routes[state.route]} · Filament Finder`;
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === state.route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  closeDialog();
  render({ reuse: true });
  window.scrollTo(0, screens.get(state.route)?.scroll || 0);
  $("#main").focus({ preventScroll: true });
  if (state.catalogReady) animateSurface($("#main").firstElementChild);
}
function render({ reuse = false } = {}) {
  if (!state.catalogReady) {
    $("#main").innerHTML = state.catalogError
      ? empty(
          "Il catalogo non è disponibile.",
          esc(state.catalogError),
          button("Ricarica app", "reload-app", "primary"),
        )
      : '<div class="loading" role="status">Caricamento del laboratorio…</div>';
    return;
  }
  let screen = screens.get(state.route);
  if (!reuse || !screen || screen.dirty) {
    const openDetails = [
      ...(screen?.node.querySelectorAll("details[id][open]") || []),
    ].map((node) => node.id);
    const node = document.createElement("div");
    node.className = "route-view";
    node.dataset.view = state.route;
    node.innerHTML = {
      home: homeView,
      materials: materialsView,
      prices: pricesView,
      advisor: advisorView,
      compare: compareView,
      cost: costView,
      alerts: alertsView,
      settings: settingsView,
    }[state.route]();
    for (const id of openDetails) {
      const detail = node.querySelector(`#${id}`);
      if (detail) detail.open = true;
    }
    screen = { node, scroll: screen?.scroll || 0, dirty: false };
    screens.set(state.route, screen);
  }
  $("#main").replaceChildren(screen.node);
  mountedRoute = state.route;
}

function heroArt() {
  return `<div class="hero-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><img src="/sculpture.svg" width="480" height="420" alt=""><span class="art-tag tag-top"><span class="status-dot"></span> STRATO DOPO STRATO</span><span class="art-tag tag-bottom">Un mondo di possibilità <span>↗</span></span></div>`;
}
function homeView() {
  const featured = ["pla", "petg", "asa"].map(materialById).filter(Boolean);
  return `<div class="home-greeting"><p><span class="status-dot"></span> Il tuo spazio, le tue idee.</p><span>${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long" })}</span></div>
    <section class="hero"><div class="hero-copy"><div class="eyebrow">MAKE SOMETHING GREAT</div><h1>La prossima idea.<br><em>Il materiale giusto.</em></h1><p>Dal primo strato al pezzo finito. Trova il filamento, confronta i prezzi e dai un costo alle tue idee.</p><div class="hero-actions">${link("advisor", `Trova il mio materiale ${icon("arrow")}`, "button primary")}${link("materials", "Esplora il catalogo", "button ghost")}</div><div class="hero-caption"><span class="mini-layers">${icon("materials")}</span> Il tuo laboratorio 3D, tutto qui.</div></div>${heroArt()}</section>
    <div class="quick-grid">${[
      [
        "prices",
        "Confronta i prezzi",
        "La prossima bobina, al prezzo giusto.",
        "mint",
      ],
      [
        "cost",
        "Dai valore alla stampa",
        "Dal costo del lotto al tuo margine.",
        "violet",
      ],
      [
        "compare",
        "Scegli cosa stampare",
        "Due materiali. Tutte le differenze.",
        "peach",
      ],
    ]
      .map(
        ([route, title, copy, tone]) =>
          `<a href="#${route}" class="quick-card ${tone}"><span class="quick-icon">${icon(route)}</span><div><h2>${title}</h2><p>${copy}</p></div><span class="quick-arrow">${icon("arrow")}</span></a>`,
      )
      .join("")}</div>
    <div class="home-bottom"><section><div class="section-heading"><div><div class="eyebrow">MATERIALI DA CONOSCERE</div><h2>Da qui nascono le idee.</h2></div>${link("materials", "Tutti " + icon("arrow"))}</div><div class="materials-grid featured">${featured.map(materialCard).join("")}</div></section><section class="panel setup-card"><div class="setup-icon">${icon("printer")}</div><div class="eyebrow">IL TUO SETUP</div><h2>${state.printer ? esc(printerName(state.printer)) : "Fatto per la tua stampante."}</h2><p>${state.printer ? `${state.printer.nozzleMax} °C ugello · ${state.printer.bedMax} °C piano` : "Seleziona il tuo modello per trovare i materiali compatibili."}</p><button class="button secondary" data-action="printers">${state.printer ? "Cambia stampante" : "Configura il setup"} ${icon("arrow")}</button><div class="setup-count"><strong>${state.catalog.printers.length}</strong> profili disponibili</div></section></div>
    <div class="catalog-strip"><span><strong>${state.catalog.materials.length}</strong> materiali da esplorare</span><span><strong data-source-count>${state.sources.length || "—"}</strong> negozi configurati</span><span>${icon("alerts")} Monitoraggio sul tuo Umbrel</span></div>`;
}
function materialCard(m) {
  const c = compatibility(m, state.printer);
  return `<button type="button" class="material-card" data-material="${esc(m.id)}" data-family="${esc(m.name.split(/[ +/]/)[0])}"><div class="material-top"><span class="material-mark">${esc(m.name.split(/[ +/]/)[0].slice(0, 5))}</span>${badge(state.printer ? (c.level === "ok" ? "Compatibile" : c.level === "blocked" ? "Setup da adattare" : "Da calibrare") : m.ease >= 4 ? "Facile" : m.ease <= 2 ? "Avanzato" : "Intermedio", state.printer ? c.level : "")}</div><h3>${esc(m.name)}</h3><p>${esc(m.short)}</p><div class="material-specs"><span>${range(m.t)} ugello</span><span>·</span><span>${range(m.bed)} piano</span></div></button>`;
}
function selectedMaterials() {
  return state.catalog.materials.filter(
    (m) =>
      (state.group === "all" || m.group.includes(state.group)) &&
      (!state.compatibleOnly ||
        compatibility(m, state.printer).level === "ok") &&
      `${m.name} ${m.short} ${m.uses}`
        .toLowerCase()
        .includes(state.materialQuery.toLowerCase()),
  );
}
function materialsView() {
  return `${header("LA BIBLIOTECA DEI MATERIALI", "Conosci cosa stai stampando.", "Proprietà, impostazioni e limiti: ogni materiale ha il suo posto nel laboratorio.")}
    <div class="catalog-toolbar"><input id="material-search" type="search" aria-label="Cerca materiale" placeholder="Cerca per nome, uso o proprietà…" value="${esc(state.materialQuery)}"><label class="check-label"><input id="compatible-only" type="checkbox" ${state.compatibleOnly ? "checked" : ""} ${state.printer ? "" : "disabled"}>Compatibili con la mia stampante</label></div>
    <div class="filter-chips">${[
      ["all", "Tutti"],
      ["easy", "Facili"],
      ["engineering", "Tecnici"],
      ["flex", "Flessibili"],
      ["outdoor", "Outdoor"],
      ["special", "Speciali"],
      ["support", "Supporti"],
    ]
      .map(
        ([key, label]) =>
          `<button class="chip" data-group="${key}" aria-pressed="${key === state.group}">${label}</button>`,
      )
      .join("")}</div><div id="catalog-results">${catalogResults()}</div>`;
}
function catalogResults() {
  const rows = selectedMaterials();
  return `<p class="catalog-count" role="status">${rows.length} materiali trovati</p>${rows.length ? `<div class="materials-grid">${rows.map(materialCard).join("")}</div>` : empty("Nessun materiale trovato", "Prova un altro termine o rimuovi i filtri.", button("Azzera filtri", "reset-materials"))}`;
}
function showMaterial(id) {
  const m = materialById(id);
  if (!m) return;
  const c = compatibility(m, state.printer);
  openDialog(
    m.name,
    `<p class="detail-intro">${esc(m.short)}</p><div class="note ${c.level === "blocked" ? "warning" : ""}"><strong>${esc(c.label)}</strong>${c.reasons.length ? `<ul>${c.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>
    <div class="detail-specs">${[
      ["Ugello", range(m.t)],
      ["Piano", range(m.bed)],
      ["Densità", m.density || "—"],
      ["Resistenza al calore", m.hdt || "—"],
    ]
      .map(
        ([key, value]) =>
          `<div class="detail-spec"><small>${key}</small><strong>${esc(value)}</strong></div>`,
      )
      .join("")}</div>
    <div class="detail-section"><h3>Profilo del materiale</h3>${[
      ["Facilità", m.ease],
      ["Resistenza", m.strength],
      ["Calore", m.heat],
      ["Dettagli", m.detail],
      ["Flessibilità", m.flex],
    ]
      .map(
        ([key, value]) =>
          `<div class="metric"><span>${key}</span><progress max="5" value="${value}" aria-label="${key}"></progress><span>${value}/5</span></div>`,
      )
      .join("")}</div>
    ${[
      ["Ideale per", m.uses],
      ["Quando evitarlo", m.avoid],
      ["Essiccazione", m.dry],
      ["Ventilazione", m.vent],
      ["Velocità e finitura", [m.speed, m.finish].filter(Boolean).join(" · ")],
    ]
      .map(
        ([key, value]) =>
          `<div class="detail-section"><h3>${key}</h3><p>${esc(value || "Consulta la scheda del produttore.")}</p></div>`,
      )
      .join("")}
    <p class="detail-text">Valori indicativi del catalogo. Verifica il profilo e la scheda tecnica della formulazione acquistata; la compatibilità non certifica la riuscita della stampa.</p><div class="hero-actions"><button class="button primary" data-material-prices="${esc(m.id)}">${icon("prices")} Cerca prezzi</button><button class="button secondary" data-add-compare="${esc(m.id)}">${icon("compare")} Confronta</button></div>`,
  );
}
function showPrinters() {
  openDialog(
    "La tua stampante",
    `<p class="detail-text">Il profilo viene usato per i consigli e le schede materiali. Considera gli eventuali upgrade della tua macchina.</p><input type="search" id="printer-search" aria-label="Cerca stampante" placeholder="Cerca marca o modello…"><div class="printer-list" id="printer-list">${printerRows("")}</div>`,
  );
}
function printerRows(query) {
  return (
    state.catalog.printers
      .filter((p) => printerName(p).toLowerCase().includes(query.toLowerCase()))
      .map(
        (p) =>
          `<button class="printer-option" data-printer="${esc(p.id)}" aria-pressed="${p.id === state.printer?.id}"><strong>${esc(printerName(p))}</strong><small>${esc(p.volume.join(" × "))} mm · ${p.nozzleMax} °C ugello · ${p.bedMax} °C piano · ${p.chamber === "open" ? "Aperta" : p.chamber === "heated" ? "Camera riscaldata" : "Camera chiusa"}</small></button>`,
      )
      .join("") ||
    empty("Nessuna stampante trovata", "Prova a cercare per marca.")
  );
}

function pricesView() {
  return `${header("IL MARKETPLACE DEL LABORATORIO", "Il prezzo giusto, senza confusione.", "Scegli il materiale e confronta prezzi, formati e disponibilità dei negozi.")}
    <form id="search-form" class="panel search-panel"><div class="form-grid"><div class="field"><label for="search-material">Materiale</label><select id="search-material" name="material">${options(
      state.catalog.materials.map((m) => [m.name, m.name]),
      state.search.material,
    )}</select></div><div class="field"><label for="search-brand">Marca</label><select id="search-brand" name="brand">${options([["all", "Tutte le marche"], ...state.catalog.brands.map((b) => [b.name, b.name])], state.search.brand)}</select></div><div class="field"><label for="search-qty">Confezioni</label><input id="search-qty" name="qty" type="number" min="1" max="50" step="1" required value="${state.search.qty}"></div><button class="button primary" type="submit" ${state.busy ? "disabled" : ""}>${icon("search")} ${state.busy ? "Ricerca in corso…" : "Cerca prezzi"}</button></div><p class="search-hint"><span>1 confezione può contenere una bobina o un multipack. Il peso è indicato su ogni offerta.</span><span>Prezzi in EUR</span></p></form>
    <div id="market-content">${marketContent()}</div>`;
}
function marketContent() {
  if (state.busy)
    return `<div class="loading" role="status">Sto interrogando i negozi…<br><small>Le fonti lente non bloccano i risultati disponibili.</small></div><div class="pagination">${button("Annulla ricerca", "cancel-search")}</div>`;
  const error = state.marketError
    ? `<div class="note error" role="alert">${esc(state.marketError)} ${button("Riprova", "search-again")}</div>`
    : "";
  if (!state.market)
    return (
      error ||
      empty(
        "La tua prossima bobina ti aspetta.",
        "Avvia una ricerca per vedere prezzi e disponibilità.",
      )
    );
  return `${error}<div class="filters"><div class="field"><label for="offer-query">Prodotto o colore</label><input id="offer-query" type="search" placeholder="Es. nero, matte…" value="${esc(state.filters.query)}"></div><div class="field"><label for="offer-store">Negozio</label><select id="offer-store">${options([["", "Tutti i negozi"], ...state.market.sources.map((s) => [s.id, s.name])], state.filters.store)}</select></div><div class="field"><label for="offer-format">Formato</label><select id="offer-format">${options(
    [
      ["", "Tutti i formati"],
      ["refill", "Refill"],
      ["spool", "Con bobina"],
    ],
    state.filters.format,
  )}</select></div><div class="field"><label for="offer-sort">Ordina per</label><select id="offer-sort">${options(
    [
      ["price", "Subtotale prodotti"],
      ["kg", "Prezzo prodotto / kg"],
      ["total", "Totale con spedizione"],
    ],
    state.filters.sort,
  )}</select></div><label class="check-label"><input type="checkbox" id="offer-stock" ${state.filters.stock ? "checked" : ""}>Solo disponibili</label></div>
    <div class="market-layout"><div id="offer-results">${offerResults()}</div><aside class="panel source-panel"><h2>Stato dei negozi</h2><p class="source-summary">${state.market.sources.filter((s) => s.ok).length} di ${state.market.sources.length} fonti raggiunte. I dettagli restano disponibili anche in caso di errore.</p><div class="source-list">${state.market.sources.map(sourceCard).join("")}</div></aside></div>`;
}
function offerResults() {
  const rows = filterOffers(
      state.market.offers,
      state.filters,
      state.marketContext.qty,
    ),
    pages = Math.max(1, Math.ceil(rows.length / 24));
  state.page = Math.min(state.page, pages);
  const context = state.marketContext;
  return `<div class="results-heading"><h2>${rows.length} offerte · ${esc(context.material)}</h2><small>${context.qty} confezioni · ${date(state.market.updated_at)}${state.market.cached ? " · dalla cache" : ""}</small></div>
    ${state.filters.sort === "total" ? '<p class="note">Prima le offerte con spedizione nota. Quelle con spedizione da verificare seguono in fondo.</p>' : ""}
    ${
      rows.length
        ? `<div class="offer-list">${rows
            .slice((state.page - 1) * 24, state.page * 24)
            .map((o) => offerCard(o))
            .join("")}</div>`
        : empty(
            "Nessuna offerta con questi filtri.",
            state.market.offers.length
              ? "Rimuovi i filtri o mostra anche i prodotti esauriti."
              : "Controlla lo stato dei negozi e prova un altro materiale.",
            button("Azzera filtri", "reset-offers"),
          )
    }
    ${pages > 1 ? `<div class="pagination"><button class="button secondary" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>Precedente</button><span>${state.page} / ${pages}</span><button class="button secondary" data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""}>Successiva</button></div>` : ""}`;
}
function offerCard(o) {
  const originalIndex = state.market.offers.findIndex((x) => x === o); // Domain returns a copy; use a stable signature + URL pair below.
  const index =
    originalIndex >= 0
      ? originalIndex
      : state.market.offers.findIndex(
          (x) => x.url === o.url && x.variant_signature === o.variant_signature,
        );
  const stock =
    o.available === true
      ? badge("Disponibile", "ok")
      : o.available === false
        ? badge("Esaurito", "error")
        : badge("Disponibilità da verificare", "unknown");
  return `<article class="offer"><div><span class="offer-store">${esc(o.store)}</span><h3>${esc(o.product)}</h3><div class="offer-meta">${esc(
    [o.brand, o.color, o.format, o.variant]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" · "),
  )}<br>${o.weight ? `${o.weight} kg / confezione · ${o.purchasedKg} kg complessivi` : "Peso netto non verificato"} · ${o.unitPerKg ? `${money(o.unitPerKg)}/kg` : "€/kg non disponibile"}</div><div class="offer-actions">${stock}${o.variant_signature ? `<button class="text-link" data-alert-offer="${index}">${icon("alerts")} Crea alert</button><button class="text-link" data-history="${index}">Storico</button>` : ""}</div></div><div class="offer-price"><strong>${money(o.total ?? o.subtotal)}</strong>${Number(o.list_price) > o.price ? `<small>Prezzo confezione precedente: <del>${money(o.list_price)}</del></small>` : ""}<small>${o.total !== null ? `Spedizione ${o.shipping === 0 ? "inclusa" : money(o.shipping)}` : "Subtotale · spedizione da verificare"}<br>${money(o.price)} / confezione</small><a class="button secondary small" href="${esc(o.href)}" target="_blank" rel="noopener noreferrer">Apri negozio ${icon("external")}</a></div></article>`;
}
function sourceCard(s) {
  const pending = state.retrying.has(s.id),
    failed = s.ok === false;
  const error = s.error_message || s.diagnostic_error || s.error || "";
  const label = failed
    ? /timeout|budget|timed out/i.test(error)
      ? "Timeout"
      : "Errore"
    : s.results
      ? `${s.results} offerte`
      : "Nessun risultato";
  return `<div class="source-row"><div class="source-top"><strong>${esc(s.name)}</strong>${badge(pending ? "Riprovo…" : label, failed ? "error" : s.results ? "ok" : "unknown")}</div><details><summary>Dettagli fonte</summary><div class="source-detail">${failed ? `<p>${esc(error)}</p>` : ""}HTTP: ${esc(s.http_status ?? "—")} · ${s.ms ?? s.http_ms ?? "—"} ms<br><code>${esc(s.request_url || s.search_url || "")}</code>${safeUrl(s.search_url) ? `<p><a href="${esc(safeUrl(s.search_url))}" target="_blank" rel="noopener noreferrer">Ricerca nel negozio ${icon("external")}</a></p>` : ""}</div></details>${failed ? `<button class="text-link" data-retry="${esc(s.id)}" ${pending ? "disabled" : ""}>${pending ? "Riprovo…" : "Riprova fonte"}</button>` : ""}</div>`;
}
function readSearch() {
  state.search = {
    material: $("#search-material")?.value || state.search.material,
    brand: $("#search-brand")?.value || state.search.brand,
    qty: Number($("#search-qty")?.value || state.search.qty),
  };
}
async function searchMarket() {
  readSearch();
  if (
    !Number.isInteger(state.search.qty) ||
    state.search.qty < 1 ||
    state.search.qty > 50
  ) {
    toast("Scegli da 1 a 50 confezioni.");
    return;
  }
  searchController?.abort();
  searchController = new AbortController();
  const signal = searchController.signal;
  const epoch = ++state.epoch,
    context = { ...state.search };
  state.busy = true;
  state.marketError = "";
  state.retrying.clear();
  invalidateScreens("prices");
  if (state.route === "prices") render();
  try {
    const data = await api(
      "/api/catalog?" + new URLSearchParams({ ...context, refresh: "1" }),
      { signal },
    );
    if (epoch !== state.epoch) return;
    state.market = data;
    state.marketContext = context;
    state.filters = {
      query: "",
      store: "",
      format: "",
      stock: true,
      sort: "price",
    };
    state.page = 1;
  } catch (error) {
    if (epoch === state.epoch && !signal.aborted)
      state.marketError = error.message;
  } finally {
    if (epoch === state.epoch) {
      state.busy = false;
      invalidateScreens("prices");
      if (state.route === "prices") render();
    }
  }
}
async function retrySource(id) {
  if (state.busy || state.retrying.has(id) || !state.marketContext) return;
  const epoch = state.epoch,
    context = { ...state.marketContext };
  state.retrying.add(id);
  $("#market-content").innerHTML = marketContent();
  try {
    const data = await api(
      "/api/catalog?" +
        new URLSearchParams({ ...context, source: id, refresh: "1" }),
    );
    if (epoch === state.epoch) {
      state.market = mergeSource(state.market, data, id);
      toast("Fonte aggiornata.");
    }
  } catch (error) {
    if (epoch === state.epoch) toast(error.message);
  } finally {
    if (epoch === state.epoch) {
      state.retrying.delete(id);
      invalidateScreens("prices");
      if (state.route === "prices")
        $("#market-content").innerHTML = marketContent();
    }
  }
}

function advisorView() {
  return `${header("DAL PROGETTO AL MATERIALE", "Cosa vuoi realizzare?", "Racconta uso, ambiente e proprietà che contano. Il consiglio considera il profilo della tua stampante.")}
    <div class="advisor-layout"><form id="advisor-form" class="panel"><div class="field"><label for="project">Il tuo progetto</label><textarea id="project" name="project" minlength="4" maxlength="2000" required placeholder="Es. una staffa per il telefono da tenere in auto, resistente al caldo e alle vibrazioni…">${esc(state.project)}</textarea></div><div class="filter-chips">${[
      ["Una statuina dettagliata e facile da verniciare", "Statuina"],
      ["Un pezzo da esterno, resistente al sole e alla pioggia", "Outdoor"],
      ["Una staffa meccanica resistente agli urti", "Meccanica"],
      ["Una cover flessibile ed elastica", "Flessibile"],
    ]
      .map(
        ([value, label]) =>
          `<button class="chip" type="button" data-prompt="${esc(value)}">${label}</button>`,
      )
      .join(
        "",
      )}</div><button class="button primary" type="submit">${icon("advisor")} Trova i materiali</button></form><aside class="advisor-help"><div class="eyebrow">UN CONSIGLIO PIÙ UTILE</div><h3>Parti da come verrà usato.</h3><ul><li>Starà al caldo o all’aperto?</li><li>Deve reggere carichi o flettersi?</li><li>Contano di più estetica o resistenza?</li></ul><p>${state.printer ? `Profilo attivo: <strong>${esc(printerName(state.printer))}</strong>` : "Seleziona una stampante per escludere i materiali che richiedono hardware diverso."}</p><button class="text-link" type="button" data-action="printers">Cambia stampante ${icon("arrow")}</button></aside></div><div id="advisor-results">${advisorResults()}</div>`;
}
function advisorResults() {
  if (!state.recommendations.length) return "";
  return `<div class="section-heading"><div><h2>Le opzioni per il tuo progetto</h2><p>Confronto basato su regole e profili tecnici. Valida sempre il materiale sul tuo pezzo.</p></div></div>${state.recommendations.map((r, i) => `<article class="recommendation"><span class="rank">0${i + 1}</span><div><h3>${esc(r.material.name)}</h3><p>${esc(r.reasons.join(" · "))}</p>${badge(r.check.label, r.check.level)}</div><button class="text-link" data-material="${esc(r.material.id)}">Scheda ${icon("arrow")}</button></article>`).join("")}`;
}
function compareView() {
  const a = materialById(state.compare[0]),
    b = materialById(state.compare[1]);
  const rows = [
    ["Ugello", (m) => range(m.t)],
    ["Piano", (m) => range(m.bed)],
    ["Facilità", (m) => `${m.ease}/5`],
    ["Resistenza", (m) => `${m.strength}/5`],
    ["Calore", (m) => m.hdt || `${m.heat}/5`],
    ["Flessibilità", (m) => `${m.flex}/5`],
    ["Essiccazione", (m) => m.dry],
    ["Ideale per", (m) => m.uses],
    ["Da evitare", (m) => m.avoid],
    ["La tua stampante", (m) => compatibility(m, state.printer).label],
  ];
  return `${header("FIANCO A FIANCO", "Due materiali. Una scelta più chiara.", "Confronta le caratteristiche che contano per il tuo progetto.")}<div class="compare-grid">${[
    0, 1,
  ]
    .map(
      (i) =>
        `<div class="field"><label for="compare-${i}">Materiale ${i === 0 ? "A" : "B"}</label><select id="compare-${i}" data-compare="${i}">${options(
          state.catalog.materials.map((m) => [m.id, m.name]),
          state.compare[i],
        )}</select></div>`,
    )
    .join(
      "",
    )}</div><div class="comparison-wrap"><table><thead><tr><th scope="col">Caratteristica</th><th scope="col">${esc(a.name)}</th><th scope="col">${esc(b.name)}</th></tr></thead><tbody>${rows.map(([label, get]) => `<tr><th scope="row">${label}</th><td>${esc(get(a))}</td><td>${esc(get(b))}</td></tr>`).join("")}</tbody></table></div>`;
}
function costFields(keys) {
  return keys
    .map((key) => {
      const f = COST_FIELDS[key];
      return `<div class="field"><label for="calc-${key}">${f.label}</label><input id="calc-${key}" name="${key}" type="number" inputmode="${f.integer ? "numeric" : "decimal"}" min="${f.min ?? 0}" max="${f.max}" step="${f.integer ? 1 : "any"}" required value="${esc(state.calc[key])}" ${f.hint ? `aria-describedby="hint-${key}"` : ""}>${f.hint ? `<small id="hint-${key}">${f.hint}</small>` : ""}</div>`;
    })
    .join("");
}
function costView() {
  return `${header("DALLO SLICER AL PRODOTTO", "Ogni pezzo ha il suo costo.", "Calcola l’intero lotto, scopri quanto costa un singolo pezzo e costruisci il tuo prezzo di vendita.", button("Vedi riepilogo", "show-cost-summary"))}
  <div class="cost-layout"><form id="cost-form" class="cost-form" novalidate>
    <section class="panel cost-section"><div class="cost-section-heading"><span class="step-number">01</span><div><h2>Il tuo lotto di stampa</h2><p>Pesi e durata sono totali del lotto, come nello slicer.</p></div></div>
      <div class="cost-fields"><div class="field"><label for="calc-name">Nome del prodotto</label><input id="calc-name" name="productName" maxlength="80" type="text" placeholder="Es. supporto sensore" value="${esc(state.calcName)}"></div>${costFields(["units"])}</div>
      <div class="cost-divider"></div><div class="cost-fields">${costFields(["grams", "wasteGrams", "spoolPrice", "spoolGrams", "hours", "minutes", "watts", "energy"])}</div>
      <p class="cost-hint">Inserisci i costi al netto dell’IVA. I valori iniziali sono un esempio: sostituiscili con i tuoi dati.</p>
    </section>
    <details class="panel cost-section" id="cost-machine"><summary><span class="step-number">02</span><span>Macchina e ristampe<small>Ammortamento, ricambi e tentativi falliti</small></span></summary><div class="cost-fields">${costFields(["machinePrice", "machineLife", "maintenance", "failure"])}</div><p class="cost-hint">La quota ristampe ripete filamento, energia e costo macchina. Non aggiunge automaticamente altro lavoro manuale.</p></details>
    <details class="panel cost-section" id="cost-labor"><summary><span class="step-number">03</span><span>Lavoro e costi aggiuntivi<small>Preparazione, finitura e imballaggio</small></span></summary><div class="cost-fields">${costFields(["setupMinutes", "finishMinutes", "labor", "packaging", "extras"])}</div></details>
    <details class="panel cost-section" id="cost-sales" ${state.calc.sell ? "open" : ""}><summary><span class="step-number">04</span><span>Prezzo di vendita<small>Margine, commissioni e IVA opzionale</small></span></summary><label class="check-label" for="calc-sell"><input type="checkbox" id="calc-sell" name="sell" ${state.calc.sell ? "checked" : ""}> Calcola anche il prezzo di vendita</label><fieldset id="cost-sales-fields" ${state.calc.sell ? "" : "disabled"}><legend class="sr-only">Parametri del prezzo di vendita</legend><div class="cost-fields">${costFields(["margin", "feePercent", "feeFixed", "vat"])}</div></fieldset><p class="cost-hint">Il margine è calcolato sul ricavo netto dopo i costi e le commissioni. Il lotto viene venduto come un unico ordine.</p></details>
    <div class="cost-form-actions"><button type="submit" class="button primary">Calcola costo</button><button type="button" class="button secondary" data-action="reset-cost">Ripristina esempio</button></div>
    <p id="cost-error" class="form-error" role="alert"></p><p id="cost-storage" class="cost-hint">${state.calcSaved ? "Ultimo calcolo salvato in questo browser." : "Il calcolo valido viene salvato in questo browser; aggiornamento automatico mentre scrivi."}</p>
  </form><aside id="cost-summary" class="cost-summary" tabindex="-1" aria-label="Riepilogo del costo"><div id="cost-output">${costOutput()}</div></aside></div>`;
}
const decimal = (value) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
function costOutput() {
  let r;
  try {
    r = costEstimate(state.calc);
  } catch (error) {
    return `<section class="panel"><h2>Completa i dati del lotto</h2><p class="note warning">${esc(error.message)}</p><p>I totali ricompariranno quando i valori saranno validi.</p></section>`;
  }
  const zeroCosts = r.breakdown
    .filter((row) => row.value === 0)
    .map((row) => row.label.toLowerCase());
  return `<section class="cost-result"><div class="eyebrow">COSTO PER PEZZO</div><h2 class="cost-product">${esc(state.calcName || "Il tuo prodotto")}</h2><strong data-cost="unit">${money(r.unit)}</strong><p>${r.values.units} ${r.values.units === 1 ? "pezzo" : "pezzi"} nel lotto · ${decimal(r.hours)} ore di stampa</p><dl class="cost-batch-total"><dt>Costo dell’intero lotto</dt><dd data-cost="total">${money(r.total)}</dd></dl></section>
    <section class="panel cost-breakdown"><h2>Da dove arriva il costo</h2><p>Ripartizione dell’intero lotto</p><dl>${r.breakdown.map((row) => `<div><dt>${row.label}</dt><dd data-cost="${row.key}">${money(row.value)}</dd></div>`).join("")}</dl><p class="cost-hint">Consumo previsto: ${decimal(r.expectedKwh)} kWh · Tempo macchina previsto: ${decimal(r.expectedHours)} h${r.values.failure ? ", incluse le ristampe" : ""}.</p>${zeroCosts.length ? `<details class="cost-assumptions"><summary>Voci escluse perché a zero</summary><p>${esc(zeroCosts.join(", "))}. Inserisci un valore per includerle.</p></details>` : ""}</section>
    ${r.sale ? `<section class="panel cost-sale"><div class="eyebrow">IL TUO PREZZO DI VENDITA</div><h2><span data-sale="net-unit">${money(r.sale.netUnit)}</span><small> / pezzo, IVA esclusa</small></h2><p>Obiettivo margine ${decimal(r.values.margin)}% · Prezzo netto unitario arrotondato in eccesso al centesimo.</p><dl><div><dt>Ricavo netto del lotto</dt><dd data-sale="net">${money(r.sale.net)}</dd></div><div><dt>IVA (${decimal(r.values.vat)}%)</dt><dd data-sale="tax">${money(r.sale.tax)}</dd></div><div class="sale-total"><dt>Totale cliente per il lotto</dt><dd data-sale="gross">${money(r.sale.gross)}</dd></div><div><dt>Commissioni del lotto</dt><dd data-sale="fees">${money(r.sale.fees)}</dd></div><div><dt>Utile stimato del lotto</dt><dd data-sale="profit">${money(r.sale.profit)}</dd></div><div><dt>Utile per pezzo</dt><dd>${money(r.sale.profitUnit)}</dd></div><div><dt>Margine effettivo</dt><dd>${decimal(r.sale.actualMargin)}%</dd></div></dl><p class="cost-hint">L’IVA non è utile. Il prezzo deriva dai tuoi costi e dal margine scelto; gli importi mostrati sono arrotondati.</p></section>` : ""}
    <button type="button" class="button secondary cost-export" data-action="export-cost">Scarica riepilogo</button>`;
}
function updateCost({ save = false, focus = false } = {}) {
  const output = $("#cost-output");
  if (!output) return;
  document
    .querySelectorAll("#cost-form [aria-invalid]")
    .forEach((el) => el.removeAttribute("aria-invalid"));
  let valid = false;
  try {
    const result = costEstimate(state.calc);
    valid = true;
    $("#cost-error").textContent = "";
    if (save) {
      const saved = storage.set(
        "ff11_cost",
        {
          version: 1,
          name: state.calcName,
          values: result.values,
        },
        { quiet: true },
      );
      state.calcSaved = saved;
      $("#cost-storage").textContent = saved
        ? "Ultimo calcolo salvato in questo browser."
        : "Calcolo disponibile solo in questa sessione: salvataggio del browser non disponibile.";
    }
  } catch (error) {
    $("#cost-error").textContent = error.message;
    const field = $(`#calc-${error.field}`);
    if (field) {
      field.setAttribute("aria-invalid", "true");
      if (focus) {
        const details = field.closest("details");
        if (details) details.open = true;
        field.focus();
      }
    }
  }
  output.innerHTML = costOutput();
  if (focus && valid) showCostSummary();
}
function showCostSummary() {
  $("#cost-summary").scrollIntoView({ block: "start" });
  $("#cost-summary").focus({ preventScroll: true });
}
function downloadText(filename, contents) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadAlerts() {
  const revision = ++alertsRevision;
  try {
    const data = await api("/api/alerts");
    if (revision !== alertsRevision) return;
    state.alerts = data.alerts;
    state.events = data.events;
    state.alertsError = "";
    invalidateScreens("alerts");
  } catch (error) {
    if (revision === alertsRevision) {
      state.alertsError = error.message;
      invalidateScreens("alerts");
    }
  }
}
function acceptAlertUpdate(data) {
  // An older list request must not undo a write that has just completed.
  alertsRevision++;
  state.alerts = data.alerts;
  state.events = data.events;
  state.alertsError = "";
  invalidateScreens("alerts");
  if (state.route === "alerts") render();
}
function alertsView() {
  return `${header("TIENI D’OCCHIO LE TUE BOBINE", "I prezzi cambiano. Tu resti aggiornato.", "Alert locali su ribassi e ritorni in stock. Il controllo automatico continua mentre Umbrel è acceso.", button("Aggiorna elenco", "reload-alerts"))}
    ${state.alertsError ? `<p class="note error" role="alert">${esc(state.alertsError)}</p>` : ""}
    ${state.alerts.length ? state.alerts.map((a) => `<article class="alert-card"><div><h3>${esc(a.label || a.material)}</h3><p>${a.quantity || 1} confezioni · ${a.config?.drop_enabled ? `Ribassi da ${esc(a.config.drop_pct)}%` : "Monitoraggio variante"}${a.config?.max_final_enabled ? ` · Totale consegnato ≤ ${money(a.config.max_final_value)}` : ""}${a.config?.back_in_stock ? " · Ritorno in stock" : ""}</p>${badge(a.enabled ? "Attivo" : "In pausa", a.enabled ? "ok" : "unknown")}</div><div class="offer-actions"><button class="button secondary small" data-toggle-alert="${esc(a.id)}">${a.enabled ? "Metti in pausa" : "Riattiva"}</button><button class="button danger small" data-delete-alert="${esc(a.id)}">Elimina</button></div></article>`).join("") : empty("Ancora nessun alert.", "Cerca un filamento, poi scegli “Crea alert” sull’offerta da seguire.", link("prices", "Cerca un filamento", "button primary"))}
    <div class="section-heading"><div><h2>Ultimi aggiornamenti</h2><p>Le notifiche vengono conservate sul tuo Umbrel.</p></div>${state.events.some((e) => !e.read) ? button("Segna come letti", "mark-read") : ""}</div><div class="events">${
      state.events.length
        ? state.events
            .slice(0, 30)
            .map(
              (e) =>
                `<article class="event"><strong>${esc(e.title)}</strong>${!e.read ? " " + badge("Nuovo") : ""}<p>${esc(e.message)}</p><small>${date(e.ts || e.created_at)}</small></article>`,
            )
            .join("")
        : '<p class="muted">Nessun evento da mostrare.</p>'
    }</div>`;
}
function showAlert(index) {
  const o = state.market?.offers[index];
  if (!o) return;
  openDialog(
    "Segui questo filamento",
    `<p class="detail-intro">${esc(o.product)} · ${esc(o.color || o.variant || "")}</p><form id="alert-form" data-offer-index="${index}" class="stack"><div class="field"><label for="alert-drop">Avvisami per un ribasso di almeno (%)</label><input id="alert-drop" name="drop" type="number" required min="1" max="100" value="5"></div><div class="field"><label for="alert-target">Prezzo obiettivo totale, spedizione inclusa (€)</label><input id="alert-target" name="target" type="number" min="0.01" max="100000" step=".01" placeholder="Facoltativo"><small>La soglia si applica solo quando la spedizione è nota.</small></div><label class="check-label"><input name="stock" type="checkbox" checked>Avvisami quando torna disponibile</label><p class="detail-text">Il monitoraggio confronta la variante tra negozi per ${state.marketContext.qty} confezioni. Troverai gli eventi nella pagina Alert prezzi.</p><button class="button primary" type="submit">Salva alert</button><p id="alert-error" class="form-error" role="alert"></p></form>`,
  );
}
async function saveAlert(form) {
  const o = state.market.offers[Number(form.dataset.offerIndex)],
    fields = new FormData(form),
    submit = $("button[type=submit]", form);
  const target = fields.get("target"),
    payload = {
      signature: o.variant_signature,
      material: state.marketContext.material,
      brand: state.marketContext.brand,
      quantity: state.marketContext.qty,
      label: [o.product, o.color, o.format]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500),
      enabled: true,
      config: {
        drop_enabled: true,
        drop_pct: Number(fields.get("drop")),
        back_in_stock: fields.get("stock") === "on",
        max_final_enabled: target !== "",
        max_final_value: target === "" ? 0 : Number(target),
      },
    };
  submit.disabled = true;
  try {
    const data = await api("/api/alerts", {
      body: { action: "upsert", alert: payload },
    });
    acceptAlertUpdate(data);
    if (form.isConnected) closeDialog();
    toast("Alert salvato. Lo trovi in Alert prezzi.");
  } catch (error) {
    if (form.isConnected) $("#alert-error", form).textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}
async function alertAction(body) {
  try {
    const data = await api("/api/alerts", { body });
    acceptAlertUpdate(data);
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}
async function showHistory(index) {
  const o = state.market.offers[index];
  if (!o) return;
  const signature = o.variant_signature;
  openDialog(
    "Storico prezzi",
    `<div class="loading" role="status">Caricamento dello storico…</div>`,
  );
  const dialogToken = Symbol();
  state.historyToken = dialogToken;
  try {
    const data = await api(
      "/api/history?" + new URLSearchParams({ signature, limit: "40" }),
    );
    if (state.historyToken !== dialogToken || !$("#detail-dialog").open) return;
    $("#dialog-content").innerHTML =
      `<p class="detail-intro">${esc(o.product)}</p><p class="detail-text">Prezzo minimo della confezione disponibile. I totali consegnati dipendono dalla quantità e dalla spedizione.</p>${
        data.history.length
          ? `<div class="comparison-wrap"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Confezioni</th><th>Totale consegnato</th></tr></thead><tbody>${[
              ...data.history,
            ]
              .reverse()
              .map(
                (h) =>
                  `<tr><td>${date(h.ts)}</td><td>${money(h.best_product_price)}</td><td>${h.quantity}</td><td>${money(h.best_final_total)}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : empty(
              "Lo storico inizia adesso.",
              "Esegui nuove ricerche per registrare le variazioni.",
            )
      }`;
  } catch (error) {
    if (state.historyToken === dialogToken && $("#detail-dialog").open)
      $("#dialog-content").innerHTML =
        `<p class="note error">${esc(error.message)}</p>`;
  }
}
function settingsView() {
  return `${header("IL TUO LABORATORIO", "Impostazioni e strumenti.", "Informazioni sull’app, preferenze del browser e monitoraggio locale.")}<div class="compare-grid"><section class="panel"><h2>Filament Finder</h2><dl class="settings-list">${[
    ["Versione", state.health?.version || "Non disponibile"],
    ["Materiali", state.catalog.materials.length],
    ["Stampanti", state.catalog.printers.length],
    ["Fonti configurate", state.sources.length],
    [
      "Aggiornamento alert",
      state.health
        ? `Ogni ${Math.round(state.health.monitor_interval_seconds / 60)} minuti`
        : "Non disponibile",
    ],
  ]
    .map(([key, value]) => `<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`)
    .join(
      "",
    )}</dl></section><section class="panel"><h2>Il tuo stile</h2><label class="motion-setting" for="motion-enabled"><span><strong>Animazioni dell’interfaccia</strong><small>Transizioni, movimenti e piccoli dettagli. Rispetta anche la preferenza del dispositivo.</small></span><input id="motion-enabled" type="checkbox" role="switch" ${state.motion ? "checked" : ""}></label><h2 class="spaced">I tuoi dati</h2><p>Alert e storico prezzi sono salvati sul tuo Umbrel. La stampante selezionata rimane in questo browser.</p><button class="button secondary" data-action="export-alerts">Esporta alert e notifiche</button><div class="section-heading"><h2>Altri strumenti</h2></div><div class="stack">${link("compare", icon("compare") + " Confronta materiali", "button secondary")}${link("cost", icon("cost") + " Calcola costo stampa", "button secondary")}${link("alerts", icon("alerts") + " Gestisci alert", "button secondary")}</div></section></div><p class="note spaced">Le ricerche dipendono dai siti dei negozi: blocchi, cambi di pagina o dati mancanti vengono segnalati per fonte. Nessun prezzo viene ricavato dai prodotti vicini e un peso sconosciuto non diventa automaticamente 1 kg.</p>`;
}

function showNavigation() {
  openDialog(
    "Tutto il laboratorio",
    `<div class="navigation-grid">${Object.entries(routes)
      .map(
        ([route, label]) =>
          `<a href="#${route}" class="menu-route" ${state.route === route ? 'aria-current="page"' : ""}>${icon(route)}<span>${label}</span>${icon("arrow")}</a>`,
      )
      .join("")}</div>`,
  );
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || target.disabled) return;
  if (target.dataset.material) return showMaterial(target.dataset.material);
  if (target.dataset.printer) {
    state.printer = state.catalog.printers.find(
      (p) => p.id === target.dataset.printer,
    );
    storage.set("ff11_printer", state.printer.id);
    updatePrinter();
    closeDialog();
    if (state.project)
      state.recommendations = recommend(
        state.catalog.materials,
        state.project,
        state.printer,
      );
    invalidateScreens("home", "materials", "advisor", "compare");
    if (["home", "materials", "advisor", "compare"].includes(state.route))
      render();
    return;
  }
  if (target.dataset.materialPrices) {
    state.search.material = materialById(target.dataset.materialPrices).name;
    invalidateScreens("prices");
    closeDialog();
    location.hash = "prices";
    if (state.route === "prices") render();
    return;
  }
  if (target.dataset.addCompare) {
    state.compare = [
      target.dataset.addCompare,
      state.compare[0] === target.dataset.addCompare
        ? "petg"
        : state.compare[0],
    ];
    invalidateScreens("compare");
    closeDialog();
    location.hash = "compare";
    if (state.route === "compare") render();
    return;
  }
  if (target.dataset.group) {
    state.group = target.dataset.group;
    render();
    return;
  }
  if (target.dataset.page) {
    state.page = Number(target.dataset.page);
    $("#offer-results").innerHTML = offerResults();
    $("#offer-results").scrollIntoView({ block: "start" });
    return;
  }
  if (target.dataset.retry) return retrySource(target.dataset.retry);
  if (target.dataset.alertOffer !== undefined)
    return showAlert(Number(target.dataset.alertOffer));
  if (target.dataset.history !== undefined)
    return showHistory(Number(target.dataset.history));
  if (target.dataset.prompt) {
    state.project = target.dataset.prompt;
    $("#project").value = state.project;
    $("#project").focus();
    return;
  }
  if (target.dataset.toggleAlert) {
    const a = state.alerts.find((a) => a.id === target.dataset.toggleAlert);
    target.disabled = true;
    await alertAction({ action: "toggle", id: a.id, enabled: !a.enabled });
    target.disabled = false;
    return;
  }
  if (target.dataset.deleteAlert) {
    const a = state.alerts.find((a) => a.id === target.dataset.deleteAlert);
    openDialog(
      "Eliminare questo alert?",
      `<p>${esc(a.label || a.material)}</p><p class="detail-text">Lo storico prezzi viene conservato.</p><button class="button danger" data-confirm-delete="${esc(a.id)}">Elimina alert</button>`,
    );
    return;
  }
  if (target.dataset.confirmDelete) {
    target.disabled = true;
    const deleted = await alertAction({
      action: "delete",
      id: target.dataset.confirmDelete,
    });
    if (deleted && target.isConnected) closeDialog();
    target.disabled = false;
    return;
  }
  switch (target.dataset.action) {
    case "navigation":
      return showNavigation();
    case "reload-app":
      location.reload();
      return;
    case "show-cost-summary":
      return showCostSummary();
    case "reset-cost":
      openDialog(
        "Ripristinare i dati di esempio?",
        '<p>Il calcolo corrente verrà sostituito. Scarica prima il riepilogo se vuoi conservarlo.</p><button class="button danger" data-action="confirm-reset-cost">Ripristina dati</button>',
      );
      return;
    case "confirm-reset-cost":
      state.calc = { ...COST_DEFAULTS };
      state.calcName = "";
      state.calcSaved = false;
      closeDialog();
      render();
      updateCost({ save: true });
      $("#calc-name").focus();
      return;
    case "export-cost":
      try {
        downloadText(
          "filament-finder-costo-prodotto.txt",
          costReport(state.calcName, state.calc),
        );
      } catch {
        updateCost({ focus: true });
      }
      return;
    case "printers":
      return showPrinters();
    case "reset-materials":
      state.group = "all";
      state.materialQuery = "";
      state.compatibleOnly = false;
      render();
      break;
    case "reset-offers":
      state.filters = {
        query: "",
        store: "",
        format: "",
        stock: false,
        sort: "price",
      };
      state.page = 1;
      $("#market-content").innerHTML = marketContent();
      break;
    case "search-again":
      return searchMarket();
    case "cancel-search":
      searchController?.abort();
      state.epoch++;
      state.busy = false;
      render();
      break;
    case "reload-alerts":
      target.disabled = true;
      await loadAlerts();
      if (state.route === "alerts") render();
      break;
    case "mark-read":
      return alertAction({ action: "mark_read" });
    case "export-alerts": {
      await loadAlerts();
      if (state.alertsError) {
        toast(state.alertsError);
        break;
      }
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                exported_at: new Date().toISOString(),
                alerts: state.alerts,
                events: state.events,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "filament-finder-alerts.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
  }
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "material-search") {
    state.materialQuery = el.value;
    $("#catalog-results").innerHTML = catalogResults();
  }
  if (el.id === "printer-search")
    $("#printer-list").innerHTML = printerRows(el.value);
  if (el.id === "offer-query") {
    state.filters.query = el.value;
    state.page = 1;
    $("#offer-results").innerHTML = offerResults();
  }
  if (el.id === "project") state.project = el.value;
  if (el.id === "search-qty") readSearch();
  if (el.id === "calc-name") {
    state.calcName = el.value.slice(0, 80);
    updateCost({ save: true });
  } else if (el.id.startsWith("calc-") && el.id !== "calc-sell") {
    state.calc[el.name] = el.value;
    updateCost({ save: true });
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.id === "motion-enabled") {
    state.motion = el.checked;
    storage.set("ff12_motion", state.motion);
    updateMotion();
  }
  if (el.id === "compatible-only") {
    state.compatibleOnly = el.checked;
    $("#catalog-results").innerHTML = catalogResults();
  }
  // Number/text fields already update on input. Replacing the output on blur
  // removes its buttons between pointerdown and click, losing the first click.
  if (el.id === "calc-sell") {
    state.calc.sell = el.checked;
    $("#cost-sales-fields").disabled = !el.checked;
    updateCost({ save: true });
  }
  const key = {
    "offer-store": "store",
    "offer-format": "format",
    "offer-sort": "sort",
    "offer-stock": "stock",
  }[el.id];
  if (key) {
    state.filters[key] = key === "stock" ? el.checked : el.value;
    state.page = 1;
    $("#offer-results").innerHTML = offerResults();
  }
  if (el.id === "search-material" || el.id === "search-brand") readSearch();
  if (el.dataset.compare !== undefined) {
    state.compare[Number(el.dataset.compare)] = el.value;
    render();
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "cost-form") {
    updateCost({ save: true, focus: true });
    return;
  }
  if (!form.reportValidity()) return;
  if (form.id === "search-form") return searchMarket();
  if (form.id === "advisor-form") {
    state.project = $("#project").value.trim();
    state.recommendations = recommend(
      state.catalog.materials,
      state.project,
      state.printer,
    );
    $("#advisor-results").innerHTML =
      advisorResults() ||
      empty(
        "Nessun profilo adatto al setup.",
        "Controlla la stampante selezionata e i requisiti del progetto.",
      );
    return;
  }
  if (form.id === "alert-form") return saveAlert(form);
});
$(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("#main").focus();
});
$("#printer-button").addEventListener("click", showPrinters);
$("#close-dialog").addEventListener("click", closeDialog);
$("#detail-dialog").addEventListener("close", () => {
  state.historyToken = null;
});
window.addEventListener("hashchange", navigate);
reducedMotion.addEventListener("change", updateMotion);
// Clicking the current route closes the mobile menu without rebuilding the view.
document.addEventListener("click", (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor?.getAttribute("href") === `#${state.route}`) closeDialog();
});

async function init() {
  state.motion = storage.get("ff12_motion", true) !== false;
  updateMotion();
  history.scrollRestoration = "manual";
  $("#printer-button").disabled = true;
  const restoredCost = restoreCost(storage.get("ff11_cost"));
  state.calc = restoredCost.values;
  state.calcName = restoredCost.name;
  state.calcSaved = restoredCost.saved;
  $("#navigation").innerHTML =
    [
      ["ESPLORA", ["home", "materials", "prices"]],
      ["CREA", ["advisor", "cost", "compare"]],
      ["IL TUO SPAZIO", ["alerts", "settings"]],
    ]
      .map(
        ([group, keys]) =>
          `<div class="nav-group-label">${group}</div>${keys.map((key) => `<a class="nav-link" data-route="${key}" href="#${key}">${icon(key)}<span>${key === "settings" ? "Strumenti" : routes[key]}</span><span class="nav-active-dot"></span></a>`).join("")}`,
      )
      .join("") +
    '<button class="nav-more" data-action="navigation" aria-label="Altre sezioni"><span class="more-dots" aria-hidden="true">•••</span><span>Altro</span></button>';
  try {
    const catalog = await api("/catalog.json");
    if (
      !Array.isArray(catalog?.materials) ||
      !Array.isArray(catalog.printers) ||
      !Array.isArray(catalog.brands) ||
      !["pla", "petg"].every((id) =>
        catalog.materials.some((m) => m?.id === id),
      )
    )
      throw new Error("Il catalogo ricevuto è incompleto. Ricarica l’app.");
    state.catalog = catalog;
    state.catalogReady = true;
    $("#printer-button").disabled = false;
    const saved = storage.get("ff11_printer");
    let legacy = null;
    try {
      legacy = localStorage.getItem("ff10_active_printer");
    } catch {}
    state.printer =
      state.catalog.printers.find(
        (p) => p.id === saved || printerName(p) === legacy,
      ) || null;
    updatePrinter();
    navigate();
    await Promise.allSettled([
      api("/api/health")
        .then((h) => {
          state.health = h;
          $("#server-status").textContent = "Laboratorio online";
          invalidateScreens("settings");
        })
        .catch(() => {
          $("#server-status").textContent = "Server non disponibile";
        }),
      api("/api/sources").then((data) => {
        state.sources = data.sources;
        invalidateScreens("settings");
        const sourceCount = screens
          .get("home")
          ?.node.querySelector("[data-source-count]");
        if (sourceCount) sourceCount.textContent = state.sources.length;
      }),
      loadAlerts(),
    ]);
    if (["settings", "alerts"].includes(state.route)) render();
  } catch (error) {
    state.catalogReady = false;
    state.catalogError = error.message;
    $("#printer-button").disabled = true;
    render();
  }
}
init();
