# Filament Finder – Price Watch (sperimentale)

Modulo aggiuntivo **non ancora collegato alla UI v8**. Verifica prezzi reali da dati pubblici JSON-LD Product/Offer in EUR, registra lo storico in SQLite e invia un messaggio Telegram quando un prodotto scende sotto la soglia impostata. Nessun prezzo inventato: se il negozio non espone dati verificabili viene registrato `unavailable`.

## Esempio

```bash
export FF_PRICE_DB=/data/price-watch.sqlite3
python tools/price_watch.py add "PETG nero 1kg" "https://negozio.example/prodotto" 14.99
python tools/price_watch.py list
python tools/price_watch.py check
```

Per gli avvisi Telegram, impostare `FF_TELEGRAM_BOT_TOKEN` e `FF_TELEGRAM_CHAT_ID`. Senza queste variabili vengono salvate le osservazioni ma non inviate notifiche. Eseguire `check` ogni 15 minuti tramite scheduler.

**Limiti:** molti siti non pubblicano offerte JSON-LD, usano pagine dinamiche o bloccano l'accesso automatico; il prezzo rilevato potrebbe non includere spedizione, sconti coupon o varianti di colore/peso. I prezzi non sono in streaming in tempo reale: corrispondono all'ultima verifica con timestamp. Prima di integrare URL inseriti dagli utenti in un servizio web occorre implementare protezioni SSRF (DNS/IP privati e redirect), rate limiting e rispetto delle policy dei negozi. Questo script è pensato per URL fidati configurati dall'amministratore.
