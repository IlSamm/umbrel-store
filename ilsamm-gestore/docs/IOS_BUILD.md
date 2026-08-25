# Build iOS e TestFlight

## Requisiti

- macOS con Xcode 26 o successivo e iOS 26 SDK o successivo;
- Node.js 22 o successivo;
- iscrizione Apple Developer e record App Store Connect;
- URL pubblici HTTPS per Privacy e Supporto.

## Build App Store locale

La build di default non usa un server e conserva i dati sul dispositivo:

```bash
npm ci
npm run ios:sync:release
npm run ios:open
```

`tools/build-ios.mjs` scrive `mode: "local"` e nessun URL API. La compilazione fallisce se viene fornito per errore un endpoint insieme alla modalita locale.

## Build hosted opzionale

Questa variante e riservata a sviluppo o distribuzioni private e non e quella prevista per l'App Store:

```bash
GESTORE_IOS_MODE=hosted GESTORE_API_BASE_URL=https://api.example.com npm run ios:sync:release
```

Una release hosted richiede sempre HTTPS.

## Xcode

1. Aprire `ios/App/App.xcodeproj`.
2. Selezionare il Team e confermare `it.ilsamm.gestore`.
3. Confermare versione `1.8.17`, build `1817`, iPhone e orientamento verticale.
4. Eseguire il piano `docs/TESTFLIGHT_TEST_PLAN.md` su un iPhone reale.
5. Usare Product > Archive, validare l'archivio e caricarlo su TestFlight.

Non inviare ad Apple URL legali provvisori, dati personali negli screenshot o una build hosted non documentata.
