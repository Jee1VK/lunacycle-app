# LunaCycle — Private Offline-First Cycle, Fertility & Pregnancy PWA

A calm, zero-bloat, 100% private period, ovulation, fertility (TTC), and pregnancy tracker built with React 19, TypeScript, Vite, `Temporal.PlainDate`, IndexedDB, and Web Crypto AES-GCM.

- **100% On-Device Privacy:** Zero accounts, zero analytics, zero third-party network requests.
- **Location-Agnostic Dates:** Powered by `Temporal.PlainDate` so travel and DST never shift a cycle date.
- **Privacy Vault:** Optional 4-digit PIN lock with PBKDF2-SHA256 + AES-GCM at-rest encryption and Disguise Mode ("Daily Notes").
- **Installable Offline PWA:** Add to Home Screen on Android or iOS for full offline use.
- **Data Ownership:** Doctor / OB-GYN printable PDF summary, CSV logs, plain or passphrase-encrypted JSON backup/restore, and one-tap complete erasure.

## Development

```bash
npm install
npm test
npm run dev
npm run build
```
