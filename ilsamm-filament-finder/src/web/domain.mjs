export const number = value => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
export const money = value => number(value) === null ? '—' : new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR'}).format(Number(value));
export const printerName = p => p ? `${p.brand} ${p.model}` : 'Scegli stampante';
export const safeUrl = value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username ? u.href : ''; }
  catch { return ''; }
};
export function compatibility(material, printer) {
  if (!printer) return {level: 'unknown', label: 'Seleziona una stampante', reasons: []};
  const reasons = [];
  if (material.minNozzle > printer.nozzleMax) reasons.push(`Richiede un ugello da almeno ${material.minNozzle} °C`);
  if (material.minBed > printer.bedMax) reasons.push(`Richiede un piano da almeno ${material.minBed} °C`);
  if (material.enclosure >= 1 && printer.chamber === 'open') reasons.push('Richiede una camera chiusa');
  if (material.enclosure >= 2 && printer.chamber !== 'heated') reasons.push('Richiede una camera riscaldata');
  if (material.abrasive && !['hardened', 'tungsten'].includes(printer.nozzle)) reasons.push('Richiede un ugello resistente all’abrasione');
  if (reasons.length) return {level: 'blocked', label: 'Richiede modifiche hardware', reasons};
  const caveats = [];
  if ((material.group || []).includes('flex') && !printer.direct) caveats.push('Estrusore Bowden: calibrazione necessaria per i flessibili');
  if (material.t?.[1] > printer.nozzleMax) caveats.push('La stampante copre solo parte dell’intervallo dell’ugello');
  if (material.bed?.[1] > printer.bedMax) caveats.push('La stampante copre solo parte dell’intervallo del piano');
  return {level: caveats.length ? 'caution' : 'ok', label: caveats.length ? 'Da calibrare' : 'Compatibile con il profilo', reasons: caveats};
}
export function recommend(materials, text, printer) {
  const t = text.toLowerCase();
  return materials.map(material => {
    const check = compatibility(material, printer);
    const reasons = [];
    let score = material.ease * 3 + material.detail * 2;
    const prefer = (condition, value, explanation) => { if (condition) { score += value; if (value > 0) reasons.push(explanation); } };
    prefer(/cald|estate|auto|motore|temperatur/.test(t), material.heat * 9 - 25, 'Resistenza al calore');
    prefer(/estern|outdoor|sole|piogg|uv/.test(t), material.uv * 10 - 25, 'Resistenza agli agenti esterni');
    prefer(/caric|staffa|meccanic|urti|ingranagg/.test(t), material.strength * 5 + material.impact * 4, 'Resistenza meccanica e agli urti');
    prefer(/fless|elastic|gomma|cover/.test(t), material.flex >= 4 ? 65 : -65, 'Flessibilità');
    prefer(/statu|decor|miniatur|dettagl|estetic/.test(t), material.detail * 7, 'Definizione dei dettagli');
    prefer(/facil|principiant|prototip/.test(t), material.ease * 6, 'Facilità di stampa');
    if ((material.group || []).includes('support') && !/solubil|supporti di stampa|interfacci/.test(t)) score -= 100;
    return {material, check, score, reasons: reasons.length ? reasons : ['Equilibrio tra facilità e finitura']};
  }).filter(x => x.check.level !== 'blocked').sort((a,b) => b.score - a.score).slice(0, 4);
}
export function offerView(offer, quantity) {
  const price = number(offer.price);
  const weight = number(offer.weight_kg);
  const shipping = offer.shipping_known === true ? number(offer.shipping_cost) : null;
  const subtotal = price === null ? null : Math.round(price * quantity * 100) / 100;
  const total = subtotal !== null && shipping !== null ? Math.round((subtotal + shipping) * 100) / 100 : null;
  return {...offer, price, weight, shipping, subtotal, total, unitPerKg: price !== null && weight > 0 ? price / weight : null,
    purchasedKg: weight > 0 ? weight * quantity : null, href: safeUrl(offer.url)};
}
export function filterOffers(offers, filters, qty) {
  return offers.map(o => offerView(o, qty)).filter(o => o.price > 0 && o.href &&
    (!filters.stock || o.available === true) &&
    (!filters.store || o.source_id === filters.store) &&
    (!filters.format || (filters.format === 'refill' ? /refill|ricarica|senza bobina/i.test(o.format || o.variant) : /spool|bobina/i.test(o.format || o.variant) && !/refill|ricarica|senza bobina/i.test(o.format || o.variant))) &&
    (!filters.query || `${o.product} ${o.variant} ${o.color} ${o.brand}`.toLowerCase().includes(filters.query.toLowerCase()))
  ).sort((a,b) => {
    if (filters.sort === 'kg') return (a.unitPerKg ?? Infinity) - (b.unitPerKg ?? Infinity);
    if (filters.sort === 'total') return (a.total ?? Infinity) - (b.total ?? Infinity);
    return a.subtotal - b.subtotal;
  });
}
export function mergeSource(current, next, sourceId) {
  return {...current, updated_at: next.updated_at,
    offers: [...current.offers.filter(o => o.source_id !== sourceId), ...next.offers.filter(o => o.source_id === sourceId)],
    sources: current.sources.map(s => s.id === sourceId ? next.sources.find(n => n.id === sourceId) || s : s)};
}
export function costEstimate({grams, price, hours, watts, energy}) {
  const values = [grams, price, hours, watts, energy];
  if (values.some(v => number(v) === null || Number(v) < 0)) throw new Error('Inserisci valori numerici non negativi.');
  const material = grams / 1000 * price, electricity = hours * watts / 1000 * energy;
  return {material, electricity, total: material + electricity};
}
