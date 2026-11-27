import type {
  LunaData,
  PartnerShareConfig,
  PartnerSnapshot,
  PartnerWatchConfig,
  PinLockConfig,
} from '../types';
import { createInitialData, DEFAULT_SETTINGS } from '../types';

const DB_NAME = 'lunacycle_private_db';
const DB_VERSION = 1;
const STORE_NAME = 'vault';

export const VAULT_KEYS = {
  DEVICE_KEY: 'luna_device_wrap_key_v1',
  DATA: 'luna_data',
  PIN: 'luna_pin_config',
  PARTNER_SHARE: 'luna_partner_share',
  PARTNER_WATCH: 'luna_partner_watch',
  PARTNER_SNAPSHOT: 'luna_partner_snapshot',
} as const;

const PBKDF2_ITERATIONS = 120_000;

export interface EncryptedEnvelope {
  encrypted: true;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

export interface DeviceEncryptedRecord {
  deviceEncrypted: true;
  v: 1;
  ivBase64: string;
  ciphertextBase64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveVerifier(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function createPinConfig(pin: string, autoLockOnHide = true): Promise<PinLockConfig> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const verifierBase64 = await deriveVerifier(pin, salt);
  return {
    enabled: true,
    saltBase64: bytesToBase64(salt),
    verifierBase64,
    autoLockOnHide,
  };
}

export async function verifyPin(pin: string, config: PinLockConfig): Promise<boolean> {
  const salt = base64ToBytes(config.saltBase64);
  const candidate = await deriveVerifier(pin, salt);
  if (candidate.length !== config.verifierBase64.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ config.verifierBase64.charCodeAt(i);
  }
  return diff === 0;
}

export async function encryptPayload(
  data: LunaData,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    encrypted: true,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptPayload(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<LunaData> {
  const salt = base64ToBytes(envelope.saltBase64);
  const iv = base64ToBytes(envelope.ivBase64);
  const ciphertext = base64ToBytes(envelope.ciphertextBase64);

  const key = await deriveAesKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<LunaData>;
  return sanitizeLunaData(parsed);
}

export function isEncryptedEnvelope(val: unknown): val is EncryptedEnvelope {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.encrypted === true &&
    obj.algorithm === 'AES-GCM' &&
    typeof obj.saltBase64 === 'string' &&
    typeof obj.ivBase64 === 'string' &&
    typeof obj.ciphertextBase64 === 'string'
  );
}

export function isDeviceEncryptedRecord(val: unknown): val is DeviceEncryptedRecord {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.deviceEncrypted === true &&
    obj.v === 1 &&
    typeof obj.ivBase64 === 'string' &&
    typeof obj.ciphertextBase64 === 'string'
  );
}

export function sanitizeLunaData(raw: Partial<LunaData> | null | undefined): LunaData {
  const base = createInitialData();
  if (!raw || typeof raw !== 'object') return base;

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(raw.settings ?? {}),
    customSymptoms: Array.isArray(raw.settings?.customSymptoms) ? raw.settings.customSymptoms : [],
    customMoods: Array.isArray(raw.settings?.customMoods) ? raw.settings.customMoods : [],
    pillPack: {
      ...DEFAULT_SETTINGS.pillPack,
      ...(raw.settings?.pillPack ?? {}),
      takenDates: Array.isArray(raw.settings?.pillPack?.takenDates)
        ? raw.settings.pillPack.takenDates
        : [],
    },
    activeHygieneTimer: raw.settings?.activeHygieneTimer ?? null,
    reminders: {
      ...DEFAULT_SETTINGS.reminders,
      ...(raw.settings?.reminders ?? {}),
    },
  };

  const logs: LunaData['logs'] = {};
  if (raw.logs && typeof raw.logs === 'object') {
    for (const [key, entry] of Object.entries(raw.logs)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !entry || typeof entry !== 'object') continue;
      logs[key] = {
        date: key,
        flow: entry.flow ?? 'none',
        symptoms: Array.isArray(entry.symptoms) ? entry.symptoms : [],
        customSymptoms: Array.isArray(entry.customSymptoms) ? entry.customSymptoms : [],
        moods: Array.isArray(entry.moods) ? entry.moods : [],
        customMoods: Array.isArray(entry.customMoods) ? entry.customMoods : [],
        mucus: entry.mucus ?? 'none',
        lhTest: entry.lhTest ?? 'none',
        bbtC: typeof entry.bbtC === 'number' ? entry.bbtC : undefined,
        sleepHours: typeof entry.sleepHours === 'number' ? entry.sleepHours : undefined,
        waterGlasses: typeof entry.waterGlasses === 'number' ? entry.waterGlasses : undefined,
        sexLogged: Boolean(entry.sexLogged),
        hygieneChanges: Array.isArray(entry.hygieneChanges) ? entry.hygieneChanges : [],
        notes: typeof entry.notes === 'string' ? entry.notes : '',
      };
    }
  }

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    logs,
    settings,
  };
}

// --- IndexedDB Private Vault (Day-1 Automatic 256-bit AES-GCM Encryption at Rest) ---

const memoryFallbackVault = new Map<string, unknown>();
let cachedDeviceKeyPromise: Promise<CryptoKey> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Unable to open local privacy vault'));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  if (!hasIndexedDb()) {
    return memoryFallbackVault.get(key) as T | undefined;
  }
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  if (!hasIndexedDb()) {
    memoryFallbackVault.set(key, value);
    return;
  }
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAll(): Promise<void> {
  memoryFallbackVault.clear();
  if (!hasIndexedDb()) return;
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Inspects the raw underlying record in the vault (used by security unit tests to
 * verify zero plaintext health data or secrets exist at rest even before setting a PIN).
 */
export async function inspectRawVaultEntry(key: string): Promise<unknown> {
  return idbGet(key);
}

function isCryptoKeyLike(val: unknown): val is CryptoKey {
  return Boolean(
    val &&
      typeof val === 'object' &&
      'type' in (val as Record<string, unknown>) &&
      'algorithm' in (val as Record<string, unknown>),
  );
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  if (!cachedDeviceKeyPromise) {
    cachedDeviceKeyPromise = (async () => {
      const stored = await idbGet<CryptoKey | { rawKeyBase64: string }>(VAULT_KEYS.DEVICE_KEY);
      if (isCryptoKeyLike(stored)) {
        return stored;
      }
      if (stored && typeof stored === 'object' && typeof stored.rawKeyBase64 === 'string') {
        const rawBytes = base64ToBytes(stored.rawKeyBase64);
        return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
      }

      // Prefer non-extractable Web Crypto CryptoKey cloned directly into IndexedDB
      try {
        const nonExtractableKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        );
        await idbSet(VAULT_KEYS.DEVICE_KEY, nonExtractableKey);
        return nonExtractableKey;
      } catch {
        // Fallback if a minimal WebView/shim cannot structured-clone CryptoKey
        const raw = new Uint8Array(new ArrayBuffer(32));
        crypto.getRandomValues(raw);
        await idbSet(VAULT_KEYS.DEVICE_KEY, { rawKeyBase64: bytesToBase64(raw) });
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
      }
    })().catch((err) => {
      cachedDeviceKeyPromise = null;
      throw err;
    });
  }
  return cachedDeviceKeyPromise;
}

async function wrapWithDeviceKey(payload: unknown): Promise<DeviceEncryptedRecord> {
  const key = await getOrCreateDeviceKey();
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    deviceEncrypted: true,
    v: 1,
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function unwrapWithDeviceKey<T>(
  stored: unknown,
): Promise<{ value: T | undefined; wasDeviceEncrypted: boolean }> {
  if (stored === undefined || stored === null) {
    return { value: undefined, wasDeviceEncrypted: false };
  }
  if (isDeviceEncryptedRecord(stored)) {
    const key = await getOrCreateDeviceKey();
    const iv = base64ToBytes(stored.ivBase64);
    const ciphertext = base64ToBytes(stored.ciphertextBase64);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as T;
    return { value: parsed, wasDeviceEncrypted: true };
  }
  // Legacy plaintext record migration path
  return { value: stored as T, wasDeviceEncrypted: false };
}

async function saveVaultRecordEncrypted(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) {
    await idbSet(key, null);
    return;
  }
  const wrapped = await wrapWithDeviceKey(value);
  await idbSet(key, wrapped);
}

async function loadVaultRecordEncrypted<T>(key: string): Promise<T | null> {
  const raw = await idbGet<unknown>(key);
  if (raw === undefined || raw === null) return null;
  const { value, wasDeviceEncrypted } = await unwrapWithDeviceKey<T>(raw);
  if (value === undefined || value === null) return null;
  if (!wasDeviceEncrypted) {
    // Seamlessly upgrade legacy unencrypted vault record to AES-256-GCM at rest
    await saveVaultRecordEncrypted(key, value);
  }
  return value;
}

export async function loadPinConfig(): Promise<PinLockConfig | null> {
  const cfg = await loadVaultRecordEncrypted<PinLockConfig>(VAULT_KEYS.PIN);
  return cfg?.enabled ? cfg : null;
}

export async function savePinConfig(config: PinLockConfig | null): Promise<void> {
  if (!config) {
    await saveVaultRecordEncrypted(VAULT_KEYS.PIN, {
      enabled: false,
      saltBase64: '',
      verifierBase64: '',
      autoLockOnHide: true,
    });
    return;
  }
  await saveVaultRecordEncrypted(VAULT_KEYS.PIN, config);
}

export async function loadLunaData(activePin?: string): Promise<LunaData> {
  const raw = await idbGet<unknown>(VAULT_KEYS.DATA);
  if (!raw) return createInitialData();

  const { value: inner, wasDeviceEncrypted } = await unwrapWithDeviceKey<
    LunaData | EncryptedEnvelope
  >(raw);
  if (!inner) return createInitialData();

  if (!wasDeviceEncrypted) {
    await saveVaultRecordEncrypted(VAULT_KEYS.DATA, inner);
  }

  if (isEncryptedEnvelope(inner)) {
    if (!activePin) {
      throw new Error('Encrypted vault requires PIN to unlock.');
    }
    return decryptPayload(inner, activePin);
  }
  return sanitizeLunaData(inner);
}

export async function saveLunaData(data: LunaData, activePin?: string): Promise<void> {
  const updated: LunaData = { ...data, updatedAt: new Date().toISOString() };
  if (activePin) {
    // Double-layer protection: PBKDF2(PIN) inner envelope + 256-bit Device Key outer AES-GCM envelope
    const pinEncrypted = await encryptPayload(updated, activePin);
    await saveVaultRecordEncrypted(VAULT_KEYS.DATA, pinEncrypted);
  } else {
    // Day-1 automatic AES-256-GCM encryption at rest even before a UI PIN is configured
    await saveVaultRecordEncrypted(VAULT_KEYS.DATA, updated);
  }
}

export async function eraseAllVaultData(): Promise<void> {
  cachedDeviceKeyPromise = null;
  await idbClearAll();
  try {
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('luna_') || key.startsWith('CapacitorStorage')) {
          localStorage.removeItem(key);
        }
      }
      localStorage.clear();
    }
  } catch {
    // Ignore storage access errors in strict privacy WebViews
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch {
    // Ignore storage access errors in strict privacy WebViews
  }
}

export async function loadPartnerShareConfigFromVault(): Promise<PartnerShareConfig | null> {
  const cfg = await loadVaultRecordEncrypted<PartnerShareConfig>(VAULT_KEYS.PARTNER_SHARE);
  if (!cfg) return null;
  // Migrate legacy localStorage 18+ consent or dismissed ping into encrypted vault if present
  try {
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem('luna_partner_18plus_consent') === '1') {
        cfg.adultSyncConsent = true;
        localStorage.removeItem('luna_partner_18plus_consent');
      }
      const legacyDismissed = localStorage.getItem('luna_dismissed_care_ping_id');
      if (legacyDismissed && !cfg.dismissedCarePingId) {
        cfg.dismissedCarePingId = legacyDismissed;
        localStorage.removeItem('luna_dismissed_care_ping_id');
      }
    }
  } catch {
    // Ignore
  }
  return cfg;
}

export async function savePartnerShareConfigToVault(cfg: PartnerShareConfig): Promise<void> {
  await saveVaultRecordEncrypted(VAULT_KEYS.PARTNER_SHARE, cfg);
}

export async function loadPartnerWatchConfigFromVault(): Promise<PartnerWatchConfig | null> {
  const cfg = await loadVaultRecordEncrypted<PartnerWatchConfig>(VAULT_KEYS.PARTNER_WATCH);
  try {
    if (typeof localStorage !== 'undefined') {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('luna_partner_carekit_')) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {
    // Ignore
  }
  return cfg;
}

export async function savePartnerWatchConfigToVault(cfg: PartnerWatchConfig | null): Promise<void> {
  await saveVaultRecordEncrypted(VAULT_KEYS.PARTNER_WATCH, cfg);
}

export async function loadCachedPartnerSnapshotFromVault(): Promise<PartnerSnapshot | null> {
  return loadVaultRecordEncrypted<PartnerSnapshot>(VAULT_KEYS.PARTNER_SNAPSHOT);
}

export async function saveCachedPartnerSnapshotToVault(snap: PartnerSnapshot | null): Promise<void> {
  await saveVaultRecordEncrypted(VAULT_KEYS.PARTNER_SNAPSHOT, snap);
}
