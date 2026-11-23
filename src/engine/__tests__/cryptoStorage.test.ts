import { describe, expect, it } from 'vitest';
import {
  createPinConfig,
  decryptPayload,
  encryptPayload,
  verifyPin,
} from '../cryptoStorage';
import { createEmptyLog, createInitialData } from '../../types';

describe('cryptoStorage Web Crypto primitives', () => {
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
});
