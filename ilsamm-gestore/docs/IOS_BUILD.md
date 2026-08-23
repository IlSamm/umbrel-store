# iOS build and TestFlight

## Requirements

- A Mac with the current Xcode version accepted by App Store Connect.
- Node.js 22 or newer.
- An Apple Developer team and an App Store Connect record.
- A production API available over HTTPS and configured in public deployment mode.

## Prepare the native project

```bash
npm ci
GESTORE_API_BASE_URL=https://api.example.com npm run ios:sync:release
npm run ios:open
```

The release build intentionally fails if `GESTORE_API_BASE_URL` is missing or does not use HTTPS. `npm run ios:configure` also normalizes Swift Package paths generated on Windows and verifies permissions, privacy manifest, version and build number.

## Xcode

1. Open `ios/App/App.xcodeproj`.
2. Select the Apple Developer team and confirm bundle identifier `it.ilsamm.gestore`.
3. Keep the app on iPhone, portrait orientation, version `1.8.4`, build `184`.
4. Test account creation/deletion, camera, gallery, photo zoom, keyboard, notifications, exports and offline/error states on a real iPhone.
5. Use Product > Archive, validate the archive, then upload it to TestFlight.

Do not submit with placeholder legal URLs, a private-mode backend or real personal data in the review account.
