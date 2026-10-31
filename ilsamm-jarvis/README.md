# Jarvis per Umbrel

Assistente personale in italiano che gira tutto sul tuo Umbrel.

## Cosa fa

- **Casa**: accende e spegne luci e prese, apre e chiude tapparelle e attiva le scene tramite Home Assistant. I comandi semplici («accendi la luce del salotto», «spegni tutte le luci», «alza la tapparella al 50%») funzionano senza internet.
- **Spese e memoria**: «ho speso 12,50 al bar», «quanto ho speso questo mese?», «ricorda che…». Tutto resta salvato su Umbrel.
- **Impegni**: legge i calendari di Home Assistant e aggiunge cose alla lista della spesa.
- **Domande vere**: usa Google Gemini (chiave gratuita) solo quando serve.
- **Voce**: ascolta in locale con Whisper e risponde con la voce Diego. Quando internet non c'è, usa Piper, che gira in locale.
- **Costellazione**: ogni stella è un dato vero (dispositivi, eventi, spese, ricordi) e si accende quando Jarvis lo usa.

## Primo avvio

1. Installa Jarvis dal Community App Store «IlSamm».
2. Aprilo e tocca **⚙ impostazioni**.
3. **Gemini**: crea la chiave gratuita su <https://aistudio.google.com/apikey> e incollala.
4. **Home Assistant**: crea il token in Home Assistant (il tuo nome in basso a sinistra › Sicurezza › Token di accesso a lungo termine › Crea token) e incollalo. Se Home Assistant è installato sullo stesso Umbrel, Jarvis trova l'indirizzo da solo.
5. Tocca **Salva**.

Al primo avvio vengono scaricati i modelli di ascolto e di voce, circa 2 GB, quindi servono alcuni minuti.

## Parlare con Jarvis

- **Dal telefono o dal PC** la pagina è servita in `http://`, quindi il browser non concede il microfono. Tocca 🎙 e usa il microfono della tastiera (dettatura): Jarvis invia la frase da solo appena smetti di parlare.
- **Da un dispositivo vocale** (ESP‑Mosaico) usa l'API dedicata:
  - `POST /api/device/voice?key=CHIAVE` con audio WAV restituisce il testo capito, la risposta e il link all'audio della risposta;
  - `GET /api/device/ask?key=CHIAVE&text=…` restituisce la risposta in testo.

  La chiave si trova in ⚙ impostazioni › Avanzate.

## Servizi

| Servizio | Immagine | A cosa serve |
|---|---|---|
| server | `ghcr.io/ilsamm/jarvis` | pagina, API, memoria, Home Assistant, Gemini |
| whisper | `rhasspy/wyoming-whisper` | ascolto in italiano, locale |
| piper | `rhasspy/wyoming-piper` | voce locale di riserva |

Dati salvati in `${APP_DATA_DIR}/data`: impostazioni, memoria, conversazione e cache delle voci.

## Sviluppo

```
python ilsamm-jarvis/tests/test_server.py
```

Le prove usano Home Assistant, Gemini, Whisper e Piper finti. L'immagine viene costruita e pubblicata su GHCR da `.github/workflows/jarvis-image.yml` a ogni modifica su `master`.
