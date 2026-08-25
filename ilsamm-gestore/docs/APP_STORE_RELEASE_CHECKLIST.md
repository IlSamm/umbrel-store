# GestOre App Store release checklist

## Decisioni bloccanti del proprietario

- [ ] Iscrivere la persona fisica o giuridica all'Apple Developer Program.
- [ ] Riservare il nome App Store. Nome di lavoro: `GestOre Lavoro`.
- [ ] Confermare il bundle identifier `it.ilsamm.gestore`.
- [ ] Inserire nome/indirizzo del titolare e un contatto privacy privato reale.
- [ ] Pubblicare Privacy e Supporto su URL HTTPS raggiungibili senza login.
- [ ] Completare stato trader DSA per la distribuzione nell'Unione Europea.

## Codice App Store

- [x] Build iPhone local-first senza login o API obbligatoria.
- [x] Salvataggio immediato di giornate, impostazioni e cedolini sul dispositivo.
- [x] Foto cedolini persistenti nell'archivio privato nativo.
- [x] Backup completo esportabile e ripristinabile dall'utente.
- [x] Nessuna funzione segreta o etichetta ambigua non documentata.
- [x] Privacy manifest senza raccolta o tracking per la build locale.
- [x] Fotocamera, foto, notifiche, file, condivisione e feedback aptico nativi.
- [x] Accessibilita base: lingua italiana, focus visibile, Reduce Motion e stato di avvio annunciabile.
- [x] La distribuzione Docker/Umbrel continua a usare il database self-hosted senza essere alterata dalla modalita iOS.

## Verifica su Mac

- [ ] Usare Xcode 26 o successivo e compilare con iOS 26 SDK o successivo.
- [ ] Selezionare Team, certificati e profilo di firma.
- [ ] Verificare bundle id, versione e build in Release.
- [ ] Eseguire `npm ci`, `npm run ios:sync:release`, quindi aprire il progetto Xcode.
- [ ] Provare il piano in `docs/TESTFLIGHT_TEST_PLAN.md` su almeno un iPhone reale.
- [ ] Eseguire VoiceOver, Dynamic Type, Reduce Motion, contrasto e target tattili.
- [ ] Creare screenshot App Store da build reale senza dati personali.
- [ ] Archiviare, validare e caricare su TestFlight.

## App Store Connect

- [ ] Inserire metadati da `docs/APP_STORE_METADATA_IT.md`.
- [ ] Compilare App Privacy usando `docs/APP_PRIVACY_DECLARATION.md`.
- [ ] Compilare classificazione eta, accessibilita, crittografia/export compliance e contenuti.
- [ ] Inserire le note da `docs/APP_REVIEW_NOTES_IT.md`.
- [ ] Eseguire beta interna e almeno un ciclo di beta esterna.

## Rischio review

La guideline 4.2 puo respingere wrapper web troppo semplici. GestOre deve dimostrare l'utilita nativa gia implementata: archivio offline, fotocamera e photo picker, notifiche locali, file e share sheet, feedback aptico, backup e ripristino resilienti.
