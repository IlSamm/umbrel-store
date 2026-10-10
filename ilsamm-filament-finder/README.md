# Filament Finder 11 — Umbrel

Un laboratorio locale per scegliere filamenti, confrontare materiali e prezzi,
calcolare costi e seguire varianti con alert. Interfaccia scura in italiano,
utilizzabile da desktop, telefono e tastiera, senza CDN, font esterni o dipendenze
frontend a runtime. La grafica della bobina è un asset SVG locale.

## Sorgenti e avvio locale

La versione 11 parte direttamente dai file leggibili in `src/`. `src/server.py`
mantiene connettori e persistenza; `catalog_tools.py` contiene i parser testabili.
Il frontend è in `src/web/`, con un solo controller e funzioni di dominio isolate.
Le directory `ui-v*`, `bundle/` e i vecchi patcher sono archivio della versione 10:
non vengono caricati né eseguiti dalla nuova immagine.

Richiede Python 3.12+; il server non richiede pacchetti pip.

```sh
python src/server.py
```

Apri `http://localhost:8765`. Per un percorso dati separato configura
`FILAMENT_FINDER_DATA_DIR`. Su Umbrel l'accesso passa dall'app proxy autenticato;
il server standalone non include un login proprio.

## Ricerca e prezzi

- La quantità indica **confezioni**, non chilogrammi. Ogni risultato distingue
  prezzo della confezione, peso netto, €/kg, subtotale e spedizione.
- Non vengono inventati pesi mancanti né usati i grammi lordi di spedizione.
- Il totale consegnato esiste solo quando la spedizione è nota. Gli articoli
  esauriti o di disponibilità ignota non sono inclusi nel filtro “Solo disponibili”.
- Gli store Shopify vengono controllati per valuta EUR. I negozi generici usano
  Product/Offer JSON-LD sulla pagina del prodotto: il prezzo di una scheda vicina
  o un AggregateOffer “a partire da” non diventa il prezzo di una variante.
- Sconti di carrello, coupon e promozioni generiche non vengono applicati
  automaticamente. Un prezzo barrato è mostrato solo quando arriva insieme al
  prezzo della stessa variante. Verifica sempre condizioni e totale nel negozio.
- Il retry interroga una sola fonte, mantenendo materiale, marca e quantità della
  ricerca. Le risposte obsolete non sovrascrivono ricerche più recenti.
- La ricerca restituisce risultati parziali entro il budget configurato. I worker
  di rete e la cache sono limitati; le richieste in eccesso ricevono HTTP 429.

I siti esterni possono cambiare, limitare le richieste o non esporre prezzi EUR.
Stato, URL, durata e motivo dell'errore sono consultabili accanto ai risultati,
con un link per proseguire nel negozio. Non sono promessi risultati per tutte
le undici fonti o per ogni materiale.

## Compatibilità e consigli

Il catalogo conserva 67 materiali e 43 profili stampante. Il consigliere usa
temperature minime, camera e resistenza all'abrasione dell'ugello per escludere
profili incompatibili. Sono indicazioni del catalogo, non misure o certificazioni:
controlla la scheda tecnica del filamento e gli upgrade della tua macchina.

## Dati persistenti e aggiornamenti

Il mount Umbrel resta `${APP_DATA_DIR}/data:/data`; `alerts.json`, `history.json`
e `alert_events.json` restano compatibili con la versione 10.7. Non vengono
cancellati o migrati distruttivamente. I file JSON danneggiati producono un errore
anziché essere sovrascritti con dati vuoti. Il server pubblica solo `web/`, mai
codice Python o file persistenti.

La preferenza stampante precedente viene recuperata da `ff10_active_printer`
quando corrisponde a un nome completo, poi salvata tramite ID. Alert e notifiche
si esportano da Strumenti; lo storico si consulta da ogni offerta.
Alcuni alert creati con pesi o varianti erroneamente dedotti dalla versione 10
potrebbero non corrispondere alle nuove offerte verificate: controllali e ricreali
dal prodotto corretto, conservando il vecchio storico.

Prima dell'aggiornamento crea un backup del volume dati. Dopo la pubblicazione
dell'immagine 11.0.0, aggiorna il community store e l'app da Umbrel. Per tornare
alla 10.7 usa l'immagine `ghcr.io/ilsamm/filament-finder:10.7.0` e lo stesso mount;
conserva il backup prima di qualsiasi ripristino.

## Verifiche

```sh
npm ci
npm test
npm run test:backend
npx playwright install chromium firefox webkit
npm run test:browser
python tests/live_bambu.py
```

I test browser usano un server reale con dati temporanei, risposte marketplace
deterministiche e API alert reali; non modificano i dati personali né dipendono
dai negozi. Coprono Chromium, Firefox, WebKit e viewport mobile, inclusi controlli
automatici axe. Non equivalgono a un test su ogni dispositivo o con screen reader.
`live_bambu.py` verifica separatamente varianti, prezzi e disponibilità reali di
PLA Basic, PLA Matte e PETG HF: “esaurito” è un esito valido, mai trasformato in stock.

La CI esegue test e audit, avvia l'immagine, verifica persistenza dopo il riavvio
e costruisce AMD64/ARM64. Pubblica su GHCR **solo da master**, dopo i controlli;
le pull request costruiscono e testano senza pubblicare immagini.

Fonti tecniche: [Shopify Product API](https://shopify.dev/docs/api/ajax/reference/product),
[specifiche app Umbrel](https://github.com/getumbrel/umbrel-apps#readme).
