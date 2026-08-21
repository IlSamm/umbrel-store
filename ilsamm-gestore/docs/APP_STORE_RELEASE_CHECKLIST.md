# GestOre App Store release checklist

## Blocking decisions owned by the developer

- [ ] Enroll the legal person or individual in the Apple Developer Program.
- [ ] Choose and reserve a unique App Store name. `GestOre` is already used on the Italian App Store; suggested working name: `GestOre Lavoro`.
- [ ] Confirm the final bundle identifier. Current scaffold proposal: `it.ilsamm.gestore`.
- [ ] Provide a real support email and production HTTPS domain.
- [ ] Decide where the public API and encrypted backups are hosted, including region and processor contracts.
- [ ] Confirm legal controller name/address for the final Privacy Policy.
- [ ] Provide an App Review demo account that contains non-sensitive sample data.

## Code and service

- [x] Separate private self-hosted administration from public user isolation.
- [x] Add in-app account deletion and test the destructive path.
- [x] Keep runtime databases and secrets out of future source commits.
- [x] Add Privacy, Terms and Support pages.
- [ ] Purge the historical SQLite file from the public Git history after explicit approval.
- [ ] Deploy the public backend with `GESTORE_DEPLOYMENT_MODE=public` behind HTTPS.
- [ ] Configure monitoring, encrypted off-site backups, retention and a restore drill.
- [ ] Add production rate limiting at the reverse proxy and a documented incident process.

## Native iOS build

- [x] Generate the Capacitor iOS project with native camera, photo picker, notifications, haptics, files and share sheet.
- [x] Add permission descriptions, privacy manifest, release version and iPhone-only orientation settings.
- [x] Add a release build guard that rejects a missing or non-HTTPS API URL.
- [x] Replace Capacitor placeholder icon and launch screen with opaque GestOre assets.
- [ ] Open the generated iOS project on a Mac with the current Xcode required by Apple.
- [ ] Select the Apple team and verify signing/capabilities.
- [ ] Produce all required App Store screenshots from a real iPhone/TestFlight build.
- [ ] Test camera/photo permission copy, notifications, files, keyboard and safe areas on real iPhones.
- [ ] Validate VoiceOver, Dynamic Type, Reduce Motion, contrast and touch targets.
- [ ] Archive, run Xcode validation and upload to TestFlight.

## App Store Connect

- [ ] Add name, subtitle, description, keywords, support URL and privacy URL.
- [ ] Complete the privacy questionnaire from `docs/APP_PRIVACY_DECLARATION.md`.
- [ ] Complete age rating and encryption/export-compliance questions.
- [ ] Add review notes explaining payroll estimates and the account deletion path.
- [ ] Test with internal TestFlight, then an external beta group before review.

## Review risk

Apple guideline 4.2 rejects simple website wrappers. The submitted binary must demonstrate app-like utility: offline access, native camera/photo selection, notifications, secure authentication, native file export/share and resilient local state. A remote website shown in a WebView is not enough.
