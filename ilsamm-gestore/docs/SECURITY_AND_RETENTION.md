# Security and data retention

## Deployment modes

- `private`: intended for the existing self-hosted Umbrel installation. The first account is the owner and can manage local profiles.
- `public`: intended for a hosted multi-user service. Every account has the user role and cross-account administration is disabled.

Never run a public customer-facing service in `private` mode.

## Current controls

- Passwords and recovery codes are salted and derived with PBKDF2-HMAC-SHA256.
- Session tokens are random and stored as hashes; web cookies are HttpOnly and SameSite.
- Each account has its own SQLite database and payslip asset directory.
- Account deletion removes account credentials, sessions, passkeys, push data, database files and backups.
- Authentication endpoints have application-level attempt throttling.
- Source control ignores databases, environment files and generated artifacts.

## Production requirements

- Terminate only modern TLS at a maintained reverse proxy.
- Encrypt disks and off-site backups, protect secrets outside the repository and rotate them.
- Set retention for server logs and backups; document exceptions required by law.
- Monitor availability, authentication abuse, disk usage, backup success and restore health.
- Restrict operational database access to named administrators with individual credentials and audit logs.
- Test account deletion, export and disaster recovery before every public release.
