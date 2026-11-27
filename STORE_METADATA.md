# LunaCycle — App Store & Google Play Store Submission Metadata

> **Bundle ID / Package Name:** `com.lunacycle.app`  
> **Primary Category:** Health & Fitness  
> **Secondary Category (iOS):** Lifestyle / Medical (General Wellness)  
> **Target Android SDK:** API 35 (Android 15) · Min SDK 24 (Android 7.0)  
> **Architecture:** 100% Offline-First Local Signed Bundle (`dist/`), Day-1 `AES-256-GCM` Vault, Optional 128-bit `#hash` E2EE Partner Sync  

---

## 1. Core Store Listing Copy

### App Name (<= 30 Characters)
`LunaCycle: Period & Cycle Log` *(29 chars)*

### iOS Subtitle (<= 30 Characters)
`Private Offline Cycle Tracker` *(29 chars)*

### Google Play Short Description (<= 80 Characters)
`100% private, offline-first period, ovulation, BBT & pregnancy wellness tracker.` *(80 chars)*

### iOS Promotional Text (<= 170 Characters)
`Zero accounts, zero ads, zero trackers. Encrypted on your phone from Day 1 with 256-bit AES-GCM, optional E2EE partner support cues, and 5 Indian languages.` *(156 chars)*

### iOS Search Keywords (<= 100 Characters — Comma-Separated, No Spaces, Zero Competitor Brands)
`period,cycle,ovulation,menstrual,tracker,bbt,pms,pregnancy,calendar,wellness,fertility,pill,private` *(99 chars)*

### Full Description (Google Play & Apple App Store — <= 4,000 Characters)
LunaCycle is a calm, zero-account menstrual cycle, ovulation, Basal Body Temperature (BBT), and pregnancy wellness journal engineered from the ground up for uncompromising personal privacy.

Unlike cloud-first trackers that require an email login or share behavioral telemetry, LunaCycle encrypts your entire wellness vault directly on your device from Day 1 using 256-bit AES-GCM encryption — with zero accounts, zero analytics SDKs, and zero advertisements.

KEY WELLNESS & SELF-TRACKING FEATURES
• Menstrual & Phase Calendar: Log period flow, spotting, cramps, moods, sleep, hydration, and private notes in seconds. View clear projections grounded in published obstetric guidelines.
• Fertility & BBT Charting (Optional): Record morning Basal Body Temperature (with automatic 3-over-6 biphasic coverline plotting), cervical mucus observations, and urinary LH strip results — or pause fertility estimates entirely with one tap.
• Pregnancy Trimester Companion: Track gestational weeks, trimesters, and prenatal checkup notes using standard 280-day LMP dating.
• Daily Pill Pack Reminder: Personal 21-day, 21/7, 24/4, or 28-day pill checklist with customizable daily reminder alarms, snooze, and refill heads-ups.
• Sanitary Hygiene Timer: Discreet pad, tampon, menstrual cup, and disc change reminders with estimated flow volume logging.
• Clinician / OB-GYN Summary PDF: Generate a clean, printable cycle history and symptom pattern report on-device to bring to doctor visits.
• Optional End-to-End Encrypted Partner View (18+): Share a read-only phase and comfort-cue summary with your partner using a 128-bit cryptographic Pairing Key QR code. Private journal notes, BBT decimals, LH tests, and intimacy logs are never shared.
• Multi-Language & Custom Themes: Available in English, Kannada (ಕನ್ನಡ), Hindi (हिन्दी), Tamil (தமிழ்), and Telugu (తెలుగు), with 6 curated themes plus a WCAG contrast-checked Custom Theme Studio.

PRIVACY & SECURITY BY DESIGN
• Encrypted at Rest from Day 1: All local IndexedDB records are automatically wrapped in 256-bit AES-GCM encryption, with optional 4-digit PIN + Biometric (Face ID / Touch ID / Fingerprint) double-layer protection.
• Lock-Screen & App-Switcher Protection: Notifications default to private lock-screen redaction, and OS app-switcher screenshots are shielded.
• Simple / Teen Mode: Hides fertility/intimacy fields and disables cloud Partner Sync completely.
• 1-Tap Data Ownership: Export encrypted JSON backups or permanently erase all local and relay data in a single tap.

IMPORTANT MEDICAL & NON-CONTRACEPTIVE DISCLAIMER
LunaCycle is a general wellness and personal record-keeping companion only. It is NOT a medical device, NOT a clinical diagnostic tool, and NOT a contraceptive or birth-control method. Never use LunaCycle predictions to prevent pregnancy. Peer-reviewed clinical references (ACOG, WHO, NIH, FIGO, Mayo Clinic) are accessible anytime inside Settings -> Medical Sources & Clinical References. Always consult a qualified OB-GYN or licensed physician before making any medical, fertility, pregnancy, or medication decisions.

### What's New / Release Notes (v1.0.31)
• Upgraded local privacy vault with automatic Day-1 256-bit AES-GCM encryption at rest
• Upgraded optional Partner Sync with 128-bit cryptographic `#hash` Pairing Keys & offline QR pairing
• Added lock-screen notification redaction by default (`VISIBILITY_PRIVATE`) and OS app-switcher screenshot shield
• Added in-app Peer-Reviewed Medical Sources & Clinical References (ACOG, WHO, NIH, Mayo Clinic)

---

## 2. Google Play Console — Health Apps Declaration Answers

Navigate to **Policy and programs -> App content -> Health apps** and select the following categories and exact disclosures:

### Selected Health Categories
- [x] **Reproductive and sexual health** (Menstrual cycle tracking, ovulation/BBT logging, pregnancy week journal)
- [x] **Medication and treatment management** (Personal daily pill pack reminder checklist & refill alerts)

### Exact Reviewer / Declaration Justification Text
> LunaCycle (`com.lunacycle.app`) is a non-diagnostic personal menstrual cycle, symptom, BBT, pregnancy week, and daily pill reminder wellness log.
> 1. **Not a Medical Device (Non-SaMD) & Not Contraception:** LunaCycle explicitly states during onboarding, inside the Daily Pill Pack Reminder section, on the Today screen, in exported PDF reports, and in Terms of Use (`terms.html`) that it is **NOT** a contraceptive method, birth-control device, or clinical diagnostic tool, and reminds users to consult a qualified OB-GYN/physician.
> 2. **Evidence-Based Clinical Citations:** All cycle length bands (21–35 days), 6-day fertile window estimates, BBT biphasic shift notes, and 280-day LMP pregnancy trimesters cite peer-reviewed obstetric literature (ACOG Committee Opinions No. 651 & 700, FIGO 2018, WHO Global Handbook, NEJM Wilcox et al., NIH/NICHD, Mayo Clinic) accessible directly inside **Settings -> Medical Sources & Clinical References**.
> 3. **PCPNDT Act Compliance:** Contains zero fetal sex/gender prediction features.
> 4. **Zero Health Data Harvesting:** All logs remain encrypted on-device (`AES-256-GCM`) with zero accounts, zero analytics, and zero ad SDKs (`android:allowBackup="false"`, `FLAG_SECURE` enabled, no `USE_FULL_SCREEN_INTENT` permission).

---

## 3. Google Play Console — Data Safety Section Answers

| Question | Answer | Notes for Reviewer |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **No** (Default 100% offline local storage; optional user-initiated E2EE Partner Sync transmits only unreadable AES-256-GCM ciphertext whose 128-bit key never leaves user devices) | If declaring optional E2EE relay transit: select *Health and fitness -> Other info (Optional, Ephemeral/30-day TTL, Encrypted in transit & E2EE, Not shared with third parties, User can request deletion in 1 tap via Settings -> Erase All Data)*. |
| Is all user data encrypted in transit? | **Yes** (`HTTPS / TLS 1.3` + client-side `AES-256-GCM` E2EE) | `cleartext: false`, `allowMixedContent: false`. |
| Do you provide a way for users to request that their data is deleted? | **Yes** (In-app 1-tap **Settings -> Erase All Data** & **Partner -> Stop Sharing & Wipe Relay Copy**; no account required) | Deletes local IndexedDB vault, cancels OS notifications, and sends authenticated `DELETE` to Cloudflare KV immediately. |
| Advertising ID (`com.google.android.gms.permission.AD_ID`) used? | **No** | Zero ad/analytics SDKs. |

---

## 4. Apple App Store Connect — App Review Notes & Privacy Labels

### App Review Notes (Paste into App Store Connect -> App Review Information -> Notes)
```text
1. ZERO-ACCOUNT PRIVACY ARCHITECTURE (Guideline 5.1.1):
LunaCycle requires NO login, email, or phone number so intimate reproductive wellness logs remain 100% private on the user's device (encrypted at rest from Day 1 with 256-bit AES-GCM). Reviewers can test all features immediately on launch, or tap "Load Sample Cycles" on the Today screen (or Settings -> Load Sample Data) to populate 4 sample cycles instantly.

2. MEDICAL CITATIONS & NON-CONTRACEPTIVE DISCLAIMERS (Guideline 1.4.1 & 5.1.3):
- Peer-reviewed clinical citations (ACOG Committee Opinions No. 651 & 700, FIGO, WHO, NEJM, NIH/NICHD, Mayo Clinic) are prominently accessible inside the app at:
  Settings -> Medical Sources & Clinical References -> "View Peer-Reviewed Citations" (and linked from Insights -> Medical Sources).
- Clear physician consultation reminders and explicit non-contraceptive / non-diagnostic notices ("LunaCycle is a wellness & reminder log only—NOT a contraceptive method, birth-control device, or clinical diagnostic tool") are displayed on the Today screen, in Settings -> Daily Pill Pack Reminder, and in Terms of Use.

3. 100% LOCAL BUNDLE / AIRPLANE MODE READY (Guideline 4.2):
The app runs 100% locally from bundled assets with zero remote server URLs and works completely offline in Airplane Mode. Face ID (NSFaceIDUsageDescription) is optional and used solely via Keychain to unlock the user's local 4-digit PIN vault.

4. ENCRYPTION COMPLIANCE:
ITSAppUsesNonExemptEncryption is set to NO (uses standard OS/WebCrypto HTTPS & AES-GCM solely for local data protection and user-controlled sync authentication/privacy exemption).
```

### Apple App Privacy ("Nutrition Labels")
- **Data Collection:** **Data Not Collected** (All health logs stay locally on-device; zero analytics, crash reporters, or advertising SDKs; optional 18+ Partner Sync uses client-side 128-bit `AES-256-GCM` E2EE with keys passed via `#hash` / QR so the relay cannot decrypt user payloads and no user identity exists).
- **Tracking (`NSPrivacyTracking`):** `false` (`PrivacyInfo.xcprivacy` bundled in `ios/App/App/PrivacyInfo.xcprivacy` declaring `NSPrivacyAccessedAPITypeUserDefaults` -> `CA92.1`).

---

## 5. Pre-Submission Owner Checklist

- [x] Signed release bundle generated at `android/app/build/outputs/bundle/release/app-release.aab` (Android SDK 35)
- [x] Store graphics generated in `store-assets/` (`icon-512-playstore.png`, `icon-1024-ios.png` opaque 24-bit RGB, `feature-graphic-1024x500.png`, Android `1080x2400` & iOS `1290x2796` screenshots)
- [x] `public/privacy.html` and `public/terms.html` included (`₹1,000 INR` liability cap, exclusive **Bengaluru, Karnataka** jurisdiction, DPDP Act 2023 & GDPR rights)
- [ ] **Before clicking Submit for Production Review:** Replace the developer support / Resident Grievance Officer placeholder in `public/privacy.html` and `public/terms.html` with your live support email & Grievance Officer details, then deploy `public/privacy.html` and `public/terms.html` to your public HTTPS URL (`https://jee1vk.github.io/lunacycle-app/privacy.html`).
