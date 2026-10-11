import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

const fixture = {
  version: "12.0.0",
  updated_at: "2026-10-10T10:00:00Z",
  quantity: 2,
  material: "PLA",
  sources: [
    {
      id: "bambu",
      name: "Bambu Lab EU",
      ok: true,
      results: 3,
      http_status: 200,
      ms: 250,
      search_url: "https://eu.store.bambulab.com/search?q=PLA",
    },
    {
      id: "sunlu",
      name: "SUNLU Italia",
      ok: false,
      results: 0,
      error_message: "HTTP 503",
      http_status: 503,
      ms: 300,
      search_url: "https://it.store.sunlu.com/search?q=PLA",
    },
  ],
  offers: [
    {
      source_id: "bambu",
      store: "Bambu Lab EU",
      product: "PLA Basic",
      variant: "Black / With Spool / 1kg",
      color: "Black",
      format: "With Spool",
      price: 20,
      weight_kg: 1,
      available: true,
      url: "https://shop.test/black",
      variant_signature: "bambu|pla|black",
    },
    {
      source_id: "bambu",
      store: "Bambu Lab EU",
      product: "PLA Matte",
      variant: "White / Refill / 750g",
      color: "White",
      format: "Refill",
      price: 15,
      weight_kg: 0.75,
      available: true,
      url: "https://shop.test/white",
      variant_signature: "bambu|pla|white",
      shipping_known: true,
      shipping_cost: 5,
    },
    {
      source_id: "bambu",
      store: "Bambu Lab EU",
      product: "PLA Blue",
      variant: "Blue",
      color: "Blue",
      format: "With Spool",
      price: 1,
      available: false,
      url: "https://shop.test/blue",
      variant_signature: "bambu|pla|blue",
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/catalog?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("source") === "sunlu")
      return route.fulfill({
        json: {
          ...fixture,
          sources: [
            { id: "sunlu", name: "SUNLU Italia", ok: true, results: 1 },
          ],
          offers: [
            {
              ...fixture.offers[0],
              source_id: "sunlu",
              store: "SUNLU Italia",
              price: 18,
              url: "https://shop.test/sunlu",
            },
          ],
        },
      });
    return route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "La prossima idea. Il materiale giusto.",
    }),
  ).toBeVisible();
});
const navigate = async (page, route) => {
  await page.goto("/#" + route);
  await expect(page.locator("#page-name")).not.toHaveText("Panoramica");
};

test("navigation preserves cost drafts, expanded sections, scroll and the mounted form without fetching again", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "document" ||
      request.url().endsWith("/catalog.json")
    )
      requests.push(request.url());
  });
  await page.getByRole("link", { name: "Calcolo costi", exact: true }).click();
  await page.locator("#cost-machine summary").click();
  await page
    .getByLabel("Costo della stampante (€)", { exact: true })
    .fill("456");
  await page.getByLabel("Vita utile prevista (ore)", { exact: true }).fill("");
  const form = await page.locator("#cost-form").elementHandle();
  const scroll = await page.evaluate(() => scrollY);
  await page.getByRole("link", { name: "Materiali", exact: true }).click();
  await page.getByRole("searchbox", { name: "Cerca materiale" }).fill("ASA");
  await page.getByRole("link", { name: "Calcolo costi", exact: true }).click();
  await expect(page.locator("#cost-machine")).toHaveAttribute("open", "");
  await expect(
    page.getByLabel("Costo della stampante (€)", { exact: true }),
  ).toHaveValue("456");
  await expect(
    page.getByLabel("Vita utile prevista (ore)", { exact: true }),
  ).toHaveValue("");
  expect(
    await form.evaluate(
      (node) => node === document.querySelector("#cost-form"),
    ),
  ).toBe(true);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.goBack();
  await expect(
    page.getByRole("searchbox", { name: "Cerca materiale" }),
  ).toHaveValue("ASA");
  await page.goForward();
  await expect(page.locator("#cost-machine")).toHaveAttribute("open", "");
  expect(requests).toEqual([]);
});

test("a search finishing in the background updates its cached section", async ({
  page,
}) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.unroute("**/api/catalog?*");
  await page.route("**/api/catalog?*", async (route) => {
    await pending;
    await route.fulfill({ json: fixture });
  });
  await page.getByRole("link", { name: "Ricerca prezzi", exact: true }).click();
  await page.getByRole("button", { name: "Cerca prezzi", exact: true }).click();
  await page.getByRole("link", { name: "Materiali", exact: true }).click();
  const response = page.waitForResponse("**/api/catalog?*");
  release();
  await response;
  await page.getByRole("link", { name: "Ricerca prezzi", exact: true }).click();
  await expect(page.locator(".offer")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Annulla ricerca" }),
  ).toHaveCount(0);
});

test("all sections are reachable and motion preferences persist", async ({
  page,
  isMobile,
}) => {
  if (isMobile) {
    await page.getByRole("button", { name: "Altre sezioni" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Consigliere", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByLabel("Il tuo progetto")).toBeVisible();
    await page.getByRole("button", { name: "Altre sezioni" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Impostazioni", exact: true })
      .click();
  } else {
    await page.getByRole("link", { name: "Strumenti", exact: true }).click();
  }
  await page
    .getByRole("switch", { name: /Animazioni dell’interfaccia/ })
    .uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.reload();
  await expect(
    page.getByRole("switch", { name: /Animazioni dell’interfaccia/ }),
  ).not.toBeChecked();
  await page
    .getByRole("switch", { name: /Animazioni dell’interfaccia/ })
    .check();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Panoramica", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  expect(
    await page
      .locator(".hero-art img")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
});

test("cost export works on the first click immediately after editing", async ({
  page,
}) => {
  await navigate(page, "cost");
  await page.getByLabel("Peso dei pezzi (g)", { exact: true }).fill("200");
  const download = page.waitForEvent("download", { timeout: 5000 });
  await page
    .getByRole("button", { name: "Scarica riepilogo", exact: true })
    .click();
  expect(await readFile(await (await download).path(), "utf8")).toContain(
    "Costo lotto: 4,18",
  );
});

test("skip link focuses the current page without changing route or calculator data", async ({
  page,
}) => {
  await navigate(page, "cost");
  await page.getByLabel("Peso dei pezzi (g)", { exact: true }).fill("200");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#cost$/);
  await expect(page.locator("#main")).toBeFocused();
  await expect(
    page.getByLabel("Peso dei pezzi (g)", { exact: true }),
  ).toHaveValue("200");
});

test("navigation during slow startup waits for the catalog without crashing", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/catalog.json", async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/");
  if (isMobile) await page.goto("/#compare");
  else await page.getByRole("link", { name: "Confronta", exact: true }).click();
  await expect(page.locator("#main")).toContainText(
    "Caricamento del laboratorio",
  );
  release();
  await expect(page.locator("#main select")).toHaveCount(2);
  await expect(page).toHaveURL(/#compare$/);
  expect(errors).toEqual([]);
});

test("catalog failure stays recoverable after navigation", async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/catalog.json", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Catalogo temporaneamente offline" },
    }),
  );
  await page.goto("/");
  await expect(page.locator("#main")).toContainText(
    "Catalogo temporaneamente offline",
  );
  if (isMobile) await page.goto("/#compare");
  else await page.getByRole("link", { name: "Confronta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ricarica app" }),
  ).toBeVisible();
  await page.unroute("**/catalog.json");
  await page.getByRole("button", { name: "Ricarica app" }).click();
  await expect(page.locator("#main select")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("slow alert saves preserve a newly opened dialog and ignore older list responses", async ({
  page,
}) => {
  let releaseList, releaseSave;
  const pendingList = new Promise((resolve) => {
    releaseList = resolve;
  });
  const pendingSave = new Promise((resolve) => {
    releaseSave = resolve;
  });
  const alert = {
    id: "delayed-alert",
    signature: "bambu|pla|black",
    label: "PLA salvato",
    material: "PLA",
    quantity: 2,
    enabled: true,
    config: {},
  };
  await page.route("**/api/alerts", async (route) => {
    if (route.request().method() === "POST") {
      await pendingSave;
      return route.fulfill({ json: { alerts: [alert], events: [] } });
    }
    await pendingList;
    return route.fulfill({ json: { alerts: [], events: [] } });
  });
  await navigate(page, "alerts");
  await page.getByRole("button", { name: "Aggiorna elenco" }).click();
  await search(page);
  await page.getByRole("button", { name: "Crea alert" }).first().click();
  await page.getByRole("button", { name: "Salva alert" }).click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Scegli stampante", exact: true })
    .click();
  releaseSave();
  await expect(page.locator("#toast")).toContainText("Alert salvato");
  await expect(
    page.getByRole("searchbox", { name: "Cerca stampante" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await navigate(page, "alerts");
  await expect(page.locator(".alert-card")).toContainText("PLA salvato");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/alerts") && r.request().method() === "GET",
  );
  releaseList();
  await response;
  await navigate(page, "cost");
  await navigate(page, "alerts");
  await expect(page.locator(".alert-card")).toContainText("PLA salvato");
});
async function search(page) {
  await navigate(page, "prices");
  await page.getByLabel("Confezioni", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Cerca prezzi", exact: true }).click();
  await expect(page.locator(".offer")).toHaveCount(2);
}

test("catalog search, technical sheet, keyboard and printer persistence", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Scegli stampante", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Cerca stampante" })
    .fill("A1 mini");
  await page.getByRole("button", { name: /Bambu Lab A1 mini/ }).click();
  await expect(page.locator("#printer-button")).toContainText("A1 mini");
  await navigate(page, "materials");
  await page.getByRole("searchbox", { name: "Cerca materiale" }).fill("ASA");
  await page.locator('[data-material="asa"]').click();
  await expect(page.getByRole("dialog")).toContainText(
    "Richiede una camera chiusa",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.locator("#printer-button")).toContainText("A1 mini");
  await page
    .getByRole("searchbox", { name: "Cerca materiale" })
    .fill("inesistente");
  await expect(
    page.getByRole("heading", { name: "Nessun materiale trovato" }),
  ).toBeVisible();
});
test("prices retain context, filters work, unavailable offers are excluded and retry merges one source", async ({
  page,
}) => {
  await search(page);
  await expect(
    page.locator(".offer").filter({ hasText: "PLA Basic" }),
  ).toContainText("40,00");
  await expect(
    page.locator(".offer").filter({ hasText: "PLA Basic" }),
  ).toContainText("spedizione da verificare");
  await expect(
    page.locator(".offer").filter({ hasText: "PLA Matte" }),
  ).toContainText("35,00");
  await page.getByLabel("Formato", { exact: true }).selectOption("refill");
  await expect(page.locator(".offer")).toHaveCount(1);
  await page.getByLabel("Formato", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Riprova fonte" }).click();
  await expect(page.locator(".offer")).toHaveCount(3);
  await page.getByRole("link", { name: "Materiali", exact: true }).click();
  await page.getByRole("link", { name: "Ricerca prezzi", exact: true }).click();
  await expect(page.getByLabel("Confezioni", { exact: true })).toHaveValue("2");
  await expect(page.locator(".offer")).toHaveCount(3);
});
test("alert creation, pause, persistence and deletion through real API", async ({
  page,
}) => {
  await search(page);
  await page.getByRole("button", { name: "Crea alert" }).first().click();
  await page.getByRole("button", { name: "Salva alert" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await navigate(page, "alerts");
  await expect(page.locator(".alert-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Metti in pausa" }).click();
  await expect(page.getByRole("button", { name: "Riattiva" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Riattiva" })).toBeVisible();
  await page.getByRole("button", { name: "Elimina", exact: true }).click();
  await page
    .getByRole("button", { name: "Elimina alert", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ancora nessun alert." }),
  ).toBeVisible();
});
test("advisor honors selected printer and cost calculator works", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Scegli stampante", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Cerca stampante" })
    .fill("A1 mini");
  await page.getByRole("button", { name: /Bambu Lab A1 mini/ }).click();
  await navigate(page, "advisor");
  await page
    .getByLabel("Il tuo progetto")
    .fill("Una cover flessibile elastica");
  await page.getByRole("button", { name: "Trova i materiali" }).click();
  await expect(page.locator(".recommendation").first()).toContainText("TPU");
  await navigate(page, "cost");
  await page.getByLabel("Peso dei pezzi (g)").fill("100");
  await page.getByRole("button", { name: "Calcola costo" }).click();
  await expect(page.locator("#cost-output")).toContainText("2,18");
  await page.getByLabel("Peso dei pezzi (g)").fill("");
  await page.getByRole("link", { name: "Materiali", exact: true }).click();
  await page.goto("/#cost");
  await expect(page.locator("#cost-output")).toContainText(
    "Peso dei pezzi (g): inserisci",
  );
});

test("failed alert deletion keeps the confirmation available for retry", async ({
  page,
}) => {
  const alert = {
    id: "retry-delete",
    label: "Alert da eliminare",
    material: "PLA",
    enabled: true,
    config: {},
  };
  let attempts = 0;
  await page.route("**/api/alerts", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { alerts: [alert], events: [] } });
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: { error: "Salvataggio non riuscito" },
        })
      : route.fulfill({ json: { alerts: [], events: [] } });
  });
  await navigate(page, "alerts");
  await page.getByRole("button", { name: "Aggiorna elenco" }).click();
  await page.getByRole("button", { name: "Elimina", exact: true }).click();
  await page
    .getByRole("button", { name: "Elimina alert", exact: true })
    .click();
  await expect(page.locator("#toast")).toContainText(
    "Salvataggio non riuscito",
  );
  await expect(
    page.getByRole("button", { name: "Elimina alert", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Elimina alert", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".alert-card")).toHaveCount(0);
});
test("product cost calculates a complete batch, saves it and exports a readable quote", async ({
  page,
}, testInfo) => {
  await navigate(page, "cost");
  await page
    .getByLabel("Nome del prodotto", { exact: true })
    .fill("Supporto sensore");
  for (const [label, value] of [
    ["Pezzi nel lotto", "4"],
    ["Peso dei pezzi (g)", "360"],
    ["Supporti e spurghi (g)", "40"],
    ["Prezzo confezione (€)", "24"],
    ["Peso netto confezione (g)", "750"],
    ["Durata del lotto (ore)", "3"],
    ["Minuti aggiuntivi", "30"],
    ["Consumo medio (W)", "200"],
    ["Tariffa energia (€/kWh)", "0.25"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.locator("#cost-machine summary").click();
  for (const [label, value] of [
    ["Costo della stampante (€)", "600"],
    ["Manutenzione (€/ora)", "0.1"],
    ["Probabilità di ristampa (%)", "20"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.locator("#cost-labor summary").click();
  for (const [label, value] of [
    ["Preparazione lotto (min)", "30"],
    ["Finitura per pezzo (min)", "5"],
    ["Valore del lavoro (€/ora)", "18"],
    ["Imballaggio per pezzo (€)", "0.6"],
    ["Altri costi del lotto (€)", "2"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator('[data-cost="unit"]')).toContainText("9,23");
  await expect(page.locator('[data-cost="total"]')).toContainText("36,93");
  await page.locator("#cost-sales summary").click();
  await page.getByLabel("Calcola anche il prezzo di vendita").check();
  for (const [label, value] of [
    ["Commissioni variabili (%)", "5"],
    ["Commissione fissa per lotto (€)", "0.35"],
    ["IVA da applicare (%)", "22"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator('[data-sale="net-unit"]')).toContainText("14,59");
  await expect(page.locator('[data-sale="gross"]')).toContainText("71,20");
  await expect(page.locator('[data-sale="profit"]')).toContainText("17,52");
  await page
    .getByRole("button", { name: "Calcola costo", exact: true })
    .click();
  await expect(page.locator("#cost-summary")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect(page.locator(".route-view")).toHaveCSS("opacity", "1");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .locator("#cost-summary")
    .screenshot({ path: testInfo.outputPath("product-cost-summary.png") });
  await page.reload();
  await expect(
    page.getByLabel("Nome del prodotto", { exact: true }),
  ).toHaveValue("Supporto sensore");
  await expect(page.getByLabel("Pezzi nel lotto", { exact: true })).toHaveValue(
    "4",
  );
  await expect(page.locator('[data-cost="total"]')).toContainText("36,93");
  await expect(page.locator('[data-sale="net-unit"]')).toContainText("14,59");
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica riepilogo", exact: true })
    .click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe(
    "filament-finder-costo-prodotto.txt",
  );
  const report = await readFile(await download.path(), "utf8");
  expect(report).toContain("Supporto sensore");
  expect(report).toContain("Costo lotto: 36,93");
  expect(report).toContain("Prezzo netto per pezzo: 14,59");
});

test("invalid product costs hide old totals and can recover, reset and tolerate blocked storage", async ({
  page,
}) => {
  await navigate(page, "cost");
  await page.getByLabel("Peso netto confezione (g)", { exact: true }).fill("0");
  await expect(page.locator('[data-cost="total"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Scarica riepilogo", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Calcola costo", exact: true })
    .click();
  await expect(
    page.getByLabel("Peso netto confezione (g)", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Peso netto confezione (g)", { exact: true })
    .fill("1000");
  await page.locator("#cost-sales summary").click();
  await page.getByLabel("Calcola anche il prezzo di vendita").check();
  await page.getByLabel("Margine desiderato (%)", { exact: true }).fill("90");
  await page
    .getByLabel("Commissioni variabili (%)", { exact: true })
    .fill("10");
  await expect(page.locator("#cost-error")).toContainText("assorbono tutto");
  await expect(page.locator('[data-cost="total"]')).toHaveCount(0);
  await page.getByLabel("Calcola anche il prezzo di vendita").uncheck();
  await expect(page.locator('[data-cost="total"]')).toContainText("2,58");
  await page
    .getByRole("button", { name: "Ripristina esempio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Ripristina dati", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByLabel("Nome del prodotto", { exact: true }),
  ).toBeFocused();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Disabled", "SecurityError");
    };
  });
  await page.reload();
  await page.getByLabel("Peso dei pezzi (g)", { exact: true }).fill("200");
  await expect(page.locator('[data-cost="total"]')).toContainText("4,18");
  await expect(page.locator("#cost-storage")).toContainText(
    "salvataggio del browser non disponibile",
  );
});

test("search failure can be retried and cancelled without stale results", async ({
  page,
}) => {
  await page.unroute("**/api/catalog?*");
  await page.route("**/api/catalog?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Servizio temporaneamente non disponibile" },
    }),
  );
  await navigate(page, "prices");
  await page.getByRole("button", { name: "Cerca prezzi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Servizio temporaneamente non disponibile",
  );
  await page.unroute("**/api/catalog?*");
  let release;
  await page.route("**/api/catalog?*", async (route) => {
    await new Promise((r) => (release = r));
    await route.fulfill({ json: fixture }).catch(() => {});
  });
  await page.getByRole("button", { name: "Riprova", exact: true }).click();
  await page.getByRole("button", { name: "Annulla ricerca" }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "La tua prossima bobina ti aspetta." }),
  ).toBeVisible();
  await expect(page.locator(".offer")).toHaveCount(0);
});
test("responsive pages and basic accessibility have no automated violations", async ({
  page,
}, testInfo) => {
  for (const route of [
    "home",
    "materials",
    "advisor",
    "compare",
    "cost",
    "alerts",
    "settings",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("#page-name")).toHaveText(
      {
        home: "Panoramica",
        materials: "Materiali",
        advisor: "Consigliere",
        compare: "Confronta",
        cost: "Calcolo costi",
        alerts: "Alert prezzi",
        settings: "Impostazioni",
      }[route],
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await expect(page.locator(".route-view")).toHaveCSS("opacity", "1");
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await search(page);
  await expect(page.locator(".route-view")).toHaveCSS("opacity", "1");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("marketplace.png"),
    fullPage: true,
  });
  await page.goto("/");
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
});
test("no uncaught browser errors across navigation and local storage restrictions", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Disabled", "SecurityError");
    };
  });
  await page.goto("/");
  await expect(page.locator(".hero")).toBeVisible();
  for (const route of [
    "prices",
    "materials",
    "advisor",
    "compare",
    "cost",
    "alerts",
    "settings",
  ])
    await page.goto("/#" + route);
  expect(errors).toEqual([]);
});
