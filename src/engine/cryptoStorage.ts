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
const KEY_DATA = 'luna_data';
const KEY_PIN = 'luna_pin_config';
const KEY_PARTNER_SHARE = 'luna_partner_share';
const KEY_PARTNER_WATCH = 'luna_partner_watch';
const KEY_PARTNER_SNAPSHOT = 'luna_partner_snapshot';

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

export function sanitizeLunaData(raw: Partial<LunaData> | null | undefined): LunaData {
  const base = createInitialData();
  if (!raw || typeof raw !== 'object') return base;

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(raw.settings ?? {}),
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
        moods: Array.isArray(entry.moods) ? entry.moods : [],
        mucus: entry.mucus ?? 'none',
        lhTest: entry.lhTest ?? 'none',
        bbtC: typeof entry.bbtC === 'number' ? entry.bbtC : undefined,
        sleepHours: typeof entry.sleepHours === 'number' ? entry.sleepHours : undefined,
        waterGlasses: typeof entry.waterGlasses === 'number' ? entry.waterGlasses : undefined,
        sexLogged: Boolean(entry.sexLogged),
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

// --- IndexedDB Private Vault (avoids storing sensitive health logs in localStorage) ---

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
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAll(): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPinConfig(): Promise<PinLockConfig | null> {
  const cfg = await idbGet<PinLockConfig>(KEY_PIN);
  return cfg?.enabled ? cfg : null;
}

export async function savePinConfig(config: PinLockConfig | null): Promise<void> {
  if (!config) {
    await idbSet(KEY_PIN, { enabled: false, saltBase64: '', verifierBase64: '', autoLockOnHide: true });
    return;
  }
  await idbSet(KEY_PIN, config);
}

export async function loadLunaData(activePin?: string): Promise<LunaData> {
  const stored = await idbGet<LunaData | EncryptedEnvelope>(KEY_DATA);
  if (!stored) return createInitialData();
  if (isEncryptedEnvelope(stored)) {
    if (!activePin) {
      throw new Error('Encrypted vault requires PIN to unlock.');
    }
    return decryptPayload(stored, activePin);
  }
  return sanitizeLunaData(stored);
}

export async function saveLunaData(data: LunaData, activePin?: string): Promise<void> {
  const updated: LunaData = { ...data, updatedAt: new Date().toISOString() };
  if (activePin) {
    const encrypted = await encryptPayload(updated, activePin);
    await idbSet(KEY_DATA, encrypted);
  } else {
    await idbSet(KEY_DATA, updated);
  }
}

export async function eraseAllVaultData(): Promise<void> {
  await idbClearAll();
}

export async function loadPartnerShareConfigFromVault(): Promise<PartnerShareConfig | null> {
  return (await idbGet<PartnerShareConfig>(KEY_PARTNER_SHARE)) ?? null;
}

export async function savePartnerShareConfigToVault(cfg: PartnerShareConfig): Promise<void> {
  await idbSet(KEY_PARTNER_SHARE, cfg);
}

export async function loadPartnerWatchConfigFromVault(): Promise<PartnerWatchConfig | null> {
  return (await idbGet<PartnerWatchConfig | null>(KEY_PARTNER_WATCH)) ?? null;
}

export async function savePartnerWatchConfigToVault(cfg: PartnerWatchConfig | null): Promise<void> {
  await idbSet(KEY_PARTNER_WATCH, cfg);
}

export async function loadCachedPartnerSnapshotFromVault(): Promise<PartnerSnapshot | null> {
  return (await idbGet<PartnerSnapshot | null>(KEY_PARTNER_SNAPSHOT)) ?? null;
}

export async function saveCachedPartnerSnapshotToVault(snap: PartnerSnapshot | null): Promise<void> {
  await idbSet(KEY_PARTNER_SNAPSHOT, snap);
}
