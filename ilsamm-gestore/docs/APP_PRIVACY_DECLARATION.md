# App Store privacy declaration

This file is the source of truth for App Store Connect. Review it whenever storage, SDKs, analytics, advertising or networking changes.

## App Store iPhone build

- Does this app or its third-party partners collect data? **No**.
- Is data used for tracking? **No**.
- Are analytics or advertising SDKs present? **No**.
- Does the binary require an account or a remote API? **No**.

The App Store build uses `GESTORE_IOS_MODE=local`. Work entries, settings and payslip metadata stay in the private application container. Payslip photos are written to the private `Library/NoCloud` directory. GestOre does not receive these values.

The user may explicitly create a portable backup or share a PDF through the native iOS share sheet. Recheck this answer before submission if telemetry, cloud sync, crash reporting or a hosted API is added.

The shipped `PrivacyInfo.xcprivacy` therefore declares no tracking, no tracking domains and no data collected off device.

## Permissions

- Camera: used only after the user chooses to photograph a payslip.
- Photo library: used only after the user chooses images for a payslip.
- Notifications: optional local reminders configured by the user.
- Files/share sheet: used only to export or restore a backup and to export reports.

## Self-hosted web distribution

The Docker/Umbrel distribution is a different deployment mode. It can store account identifiers, work data, salary data, notes, payslip photos, sessions and security logs on the server selected by the administrator. It does not use advertising or cross-service tracking. Its privacy notice must describe the actual host and controller separately; those hosted answers do not apply to the local-only App Store binary.

## Public URLs required before submission

- Privacy Policy URL: a public HTTPS copy of `app/frontend/legal/privacy.html`.
- Support URL: a public HTTPS support page or the public GestOre issue tracker.
- User Privacy Choices URL: the privacy page may be used because it explains local deletion and backup controls.

Do not submit placeholder URLs. The legal controller name and a private contact channel must be completed by the developer before review.

## Deletion and portability

The App Store build has no server account to delete. The user can delete individual content, export or restore a complete backup from Profile > Data and backup, and remove all remaining local data by deleting the app from iPhone.
