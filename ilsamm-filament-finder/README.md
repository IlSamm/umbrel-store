# Filament Finder 12 — Umbrel

Un laboratorio locale per scegliere filamenti, confrontare materiali e prezzi,
calcolare costi e seguire varianti con alert. Interfaccia scura in italiano,
utilizzabile da desktop, telefono e tastiera, senza CDN, font esterni o dipendenze
frontend a runtime. La grafica 3D e il marchio sono asset SVG locali.

## Interfaccia e navigazione (12.0)

Tema scuro con accenti lavanda, pannelli arrotondati e una home organizzata per attività.
La barra mobile mette catalogo, prezzi e calcolatore a portata di mano; “Altre sezioni”
apre tutte le destinazioni. Transizioni, hover e grafica animata rispettano la preferenza
“Riduci movimento” del sistema e si disattivano anche da Impostazioni.

Le otto sezioni conservano il proprio DOM durante la sessione: tornando a una schermata
si ritrovano bozze, filtri, pannelli aperti e scorrimento, senza nuove richieste del catalogo.
I cambiamenti condivisi, come una nuova stampante o una ricerca terminata in background,
invalidano solo le viste interessate. Ricaricando il browser restano il calcolo valido,
la stampante e le preferenze salvate; bozze non valide e scorrimento sono solo di sessione.

## Sorgenti e avvio locale

La versione 12 parte direttamente dai file leggibili in `src/`. `src/server.py`
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

## Calcolo del costo prodotto (11.1)

Pesi e durata dello slicer descrivono **l'intero lotto**. Il numero di pezzi divide
il costo finale; non moltiplica nuovamente filamento e ore. Il prezzo della
confezione e il suo peso netto permettono di usare anche bobine da 750 g e multipack.
Supporti e spurghi si aggiungono solo se non sono già compresi nel peso inserito.

- Materiale = (grammi pezzi + scarti) × prezzo confezione / grammi confezione.
- Energia = ore del lotto × watt medi / 1000 × tariffa kWh.
- Macchina = ore × (costo stampante / vita utile in ore + manutenzione oraria).
- Con probabilità di ristampa `p`, il costo di stampa atteso è diviso per `1 − p`.
  È una stima prudente: ogni fallimento consuma un tentativo completo. Si ripetono
  materiale, energia e macchina; lavoro e imballaggio non vengono duplicati.
- Lavoro = (minuti preparazione lotto + minuti finitura × pezzi) / 60 × tariffa.
  Imballaggio è per pezzo; altri costi, come inserti o spedizione, sono per lotto.

Il prezzo di vendita è opzionale. Gli importi di costo vanno inseriti al netto IVA.
Un lotto equivale a un ordine e la commissione percentuale si applica al totale
cliente, inclusa l'IVA configurata. Con costo `C`, commissione fissa `F`, margine
`m`, commissione percentuale `f` e aliquota `v`, il prezzo netto del lotto prima
dell'arrotondamento è `(C + F) / (1 − m − f × (1 + v))`. Le percentuali nella
formula sono frazioni. Un denominatore non positivo viene rifiutato. Il prezzo
netto unitario è arrotondato in eccesso al centesimo per conservare il margine.
È una simulazione dei valori inseriti, non una raccomandazione di prezzo o aliquota.

I risultati si aggiornano durante la modifica; dati non validi nascondono i totali
precedenti. L'ultimo calcolo valido si salva nel browser (`ff11_cost`), non sul volume
Umbrel. Il riepilogo TXT include dati, ripartizione dei costi e ipotesi. I valori a
zero sono esplicitamente esclusi; i valori iniziali sono un esempio modificabile.

## Dati persistenti e aggiornamenti

### Correzioni 12.0.1

- I link interni sono gestiti dal router con History API: mantengono URL e parametri
  correnti anche se il contenitore imposta un URL base diverso, senza ricaricare il documento.
  Avanti/Indietro e collegamenti diretti continuano a funzionare.
- La pagina resta visibile durante i cambi di sezione. Le viste gia visitate tornano
  immediatamente, senza una nuova animazione di ingresso.
- Le risposte non valide degli alert producono un errore locale recuperabile e non
  riportano il catalogo allo stato iniziale. I metadati del server aggiornano solo
  la diagnostica, conservando controlli, stato e focus nelle impostazioni.

### Correzioni 11.1.1

- Il riepilogo costi si scarica al primo clic anche subito dopo la modifica di un campo.
- La navigazione durante un caricamento lento o fallito mantiene uno stato recuperabile;
  il collegamento da tastiera “Vai al contenuto” conserva la pagina corrente.
- Alert della stessa variante con quantita o filtri diversi rimangono separati, anche
  nello storico usato per rilevare variazioni. Cambiare il contesto azzera la vecchia base.
- Le risposte lente non ripristinano un elenco precedente al salvataggio e non chiudono
  una nuova finestra. Una cancellazione fallita lascia disponibile il pulsante per riprovare.

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
dell'immagine 12.0.1, aggiorna il community store e l'app da Umbrel. Per tornare
alla 12.0.0 usa l'immagine `ghcr.io/ilsamm/filament-finder:12.0.0` e lo stesso mount;
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
