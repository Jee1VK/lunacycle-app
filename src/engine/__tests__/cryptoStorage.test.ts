import { describe, expect, it } from 'vitest';
import {
  createPinConfig,
  decryptPayload,
  encryptPayload,
  eraseAllVaultData,
  inspectRawVaultEntry,
  isDeviceEncryptedRecord,
  loadCachedPartnerSnapshotFromVault,
  loadLunaData,
  loadPartnerShareConfigFromVault,
  loadPartnerWatchConfigFromVault,
  saveCachedPartnerSnapshotToVault,
  saveLunaData,
  savePartnerShareConfigToVault,
  savePartnerWatchConfigToVault,
  VAULT_KEYS,
  verifyPin,
} from '../cryptoStorage';
import { createDefaultPartnerShareConfig } from '../partnerSync';
import { createEmptyLog, createInitialData, type PartnerSnapshot } from '../../types';

describe('cryptoStorage Web Crypto & Day-1 Vault Encryption', () => {
  it('hashes and verifies 4-digit PINs with salted PBKDF2-SHA256', async () => {
    const cfg = await createPinConfig('2580', true);
    expect(cfg.enabled).toBe(true);
    expect(await verifyPin('2580', cfg)).toBe(true);
    expect(await verifyPin('2581', cfg)).toBe(false);
  });

  it('encrypts and decrypts LunaData with AES-GCM and rejects wrong passphrases', async () => {
    const data = createInitialData();
    data.logs['2026-05-01'] = {
      ...createEmptyLog('2026-05-01'),
      flow: 'heavy',
      symptoms: ['cramps'],
      notes: 'Private health note',
    };

    const envelope = await encryptPayload(data, 'my-secret-pass');
    expect(envelope.encrypted).toBe(true);
    expect(envelope.ciphertextBase64).not.toContain('Private health note');

    const restored = await decryptPayload(envelope, 'my-secret-pass');
    expect(restored.logs['2026-05-01'].notes).toBe('Private health note');
    expect(restored.logs['2026-05-01'].flow).toBe('heavy');

    await expect(decryptPayload(envelope, 'wrong-pass')).rejects.toThrow();
  });

  it('encrypts ALL vault stores at rest from Day 1 with 256-bit AES-GCM even BEFORE setting a UI PIN', async () => {
    await eraseAllVaultData();

    const data = createInitialData();
    data.settings.mode = 'pregnancy';
    data.settings.pregnancyDueDate = '2026-12-15';
    data.logs['2026-05-02'] = {
      ...createEmptyLog('2026-05-02'),
      sexLogged: true,
      notes: 'Ultra sensitive clinical journal note',
    };

    // Save WITHOUT setting any UI PIN
    await saveLunaData(data);

    const rawDataRecord = await inspectRawVaultEntry(VAULT_KEYS.DATA);
    expect(isDeviceEncryptedRecord(rawDataRecord)).toBe(true);
    const rawDataJson = JSON.stringify(rawDataRecord);
    expect(rawDataJson).not.toContain('Ultra sensitive clinical journal note');
    expect(rawDataJson).not.toContain('2026-12-15');
    expect(rawDataJson).not.toContain('sexLogged');

    // Load back seamlessly without PIN
    const loaded = await loadLunaData();
    expect(loaded.logs['2026-05-02'].notes).toBe('Ultra sensitive clinical journal note');
    expect(loaded.logs['2026-05-02'].sexLogged).toBe(true);
    expect(loaded.settings.pregnancyDueDate).toBe('2026-12-15');

    // Partner Share, Partner Watch (including Care Kit), and Partner Snapshot are also encrypted at rest
    const shareCfg = createDefaultPartnerShareConfig();
    shareCfg.profileLabel = 'SecretProfileName';
    await savePartnerShareConfigToVault(shareCfg);
    const rawShare = await inspectRawVaultEntry(VAULT_KEYS.PARTNER_SHARE);
    expect(isDeviceEncryptedRecord(rawShare)).toBe(true);
    expect(JSON.stringify(rawShare)).not.toContain(shareCfg.writeSecret);
    expect(JSON.stringify(rawShare)).not.toContain(shareCfg.syncKey!);
    expect(JSON.stringify(rawShare)).not.toContain('SecretProfileName');
    const loadedShare = await loadPartnerShareConfigFromVault();
    expect(loadedShare?.writeSecret).toBe(shareCfg.writeSecret);
    expect(loadedShare?.syncKey).toBe(shareCfg.syncKey);

    await savePartnerWatchConfigToVault({
      code: shareCfg.code,
      syncKey: shareCfg.syncKey,
      syncServerUrl: shareCfg.syncServerUrl,
      alertsOnThisPhone: true,
      careKitCycleKey: '2026-06-01',
      careKitChecked: ['Heating pad charged / ready'],
    });
    const rawWatch = await inspectRawVaultEntry(VAULT_KEYS.PARTNER_WATCH);
    expect(isDeviceEncryptedRecord(rawWatch)).toBe(true);
    expect(JSON.stringify(rawWatch)).not.toContain('Heating pad');
    expect(JSON.stringify(rawWatch)).not.toContain(shareCfg.syncKey!);
    const loadedWatch = await loadPartnerWatchConfigFromVault();
    expect(loadedWatch?.careKitChecked).toEqual(['Heating pad charged / ready']);

    const snap: PartnerSnapshot = {
      version: 1,
      code: shareCfg.code,
      profileLabel: 'SecretPartnerSnap',
      updatedAt: '2026-05-02T00:00:00.000Z',
      asOfDate: '2026-05-02',
      mode: 'cycle',
      phase: 'menstrual',
      cycleDay: 1,
      averageCycleLength: 28,
      daysUntilNextPeriod: 27,
      daysLate: 0,
      nextPeriodDate: '2026-05-30',
      isPeriodActiveToday: true,
    };
    await saveCachedPartnerSnapshotToVault(snap);
    const rawSnap = await inspectRawVaultEntry(VAULT_KEYS.PARTNER_SNAPSHOT);
    expect(isDeviceEncryptedRecord(rawSnap)).toBe(true);
    expect(JSON.stringify(rawSnap)).not.toContain('SecretPartnerSnap');
    expect((await loadCachedPartnerSnapshotFromVault())?.profileLabel).toBe('SecretPartnerSnap');

    // Double-layer encryption when UI PIN is set
    await saveLunaData(data, '9876');
    await expect(loadLunaData()).rejects.toThrow(/requires PIN/);
    const unlocked = await loadLunaData('9876');
    expect(unlocked.logs['2026-05-02'].notes).toBe('Ultra sensitive clinical journal note');

    // 1-Tap Erase wipes everything
    await eraseAllVaultData();
    expect(await inspectRawVaultEntry(VAULT_KEYS.DATA)).toBeUndefined();
    expect(await inspectRawVaultEntry(VAULT_KEYS.PARTNER_SHARE)).toBeUndefined();
  });
});
