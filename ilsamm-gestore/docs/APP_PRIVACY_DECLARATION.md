# App Store privacy declaration

This file is the source of truth for the App Store Connect privacy answers. Review it again whenever storage, SDKs, analytics, advertising, login, or payroll features change.

## Collection answer

- Does this app or its third-party partners collect data? **Yes** for the public hosted service.
- Is data used for tracking? **No**.
- Is data used for third-party advertising or developer advertising? **No**.
- Are analytics SDKs present? **No** in the current codebase.
- Primary purpose for every declared type: **App Functionality**.
- Data is generally linked to the user's account because it is stored in a per-user database.

## Data types to declare

| Apple data type | What GestOre stores | Linked | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info - Name | Optional profile name entered by the user | Yes | No | App Functionality |
| Health - Health | Days explicitly recorded as illness | Yes | No | App Functionality |
| Financial Info - Other Financial Info | Salary, payslip amounts, hourly rates, tax estimate settings | Yes | No | App Functionality |
| Location - Coarse Location | Region and municipality entered for payroll tax estimates | Yes | No | App Functionality |
| User Content - Photos or Videos | Payslip photographs selected by the user | Yes | No | App Functionality |
| User Content - Other User Content | Work days, hours, vacation, leave, notes and report content | Yes | No | App Functionality |
| Identifiers - User ID | Username and internal account ID | Yes | No | App Functionality |
| Identifiers - Device ID | Push subscription endpoint and session/device label | Yes | No | App Functionality |
| Diagnostics - Other Diagnostic Data | Limited sync, database and security status used for support | Yes | No | App Functionality |

## Not collected by the current app

- Email address and phone number.
- Exact GPS location.
- Contacts, microphone recordings and browsing history.
- Payment card or bank account information.
- Advertising identifiers and advertising data.
- Cross-app or cross-site tracking data.

## Required App Store Connect URLs

- Privacy Policy URL: `https://YOUR-PRODUCTION-DOMAIN/legal/privacy.html`
- User Privacy Choices URL: the same privacy page is acceptable initially because it points to export and in-app deletion controls.
- Support URL: `https://YOUR-PRODUCTION-DOMAIN/legal/support.html`

Do not submit placeholder or `.invalid` URLs. They must be publicly reachable over HTTPS before review.

## Account deletion

The in-app path is Profile > Account and backup > Delete permanently. It asks for the current password and exact username, then removes the user record, sessions, passkeys, push subscriptions, database, payslip assets and versioned backups.
