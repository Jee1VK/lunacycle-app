/**
 * Native Android Fingerprint & Biometric Unlock backed by Android Hardware Keystore
 * via @capgo/capacitor-native-biometric.
 *
 * Security model:
 * - The user's IndexedDB vault remains AES-GCM encrypted with their 4-digit PIN.
 * - Enabling Biometric Unlock requires passing Android BiometricPrompt once, then
 *   stores the vault PIN inside Android Keystore (never in localStorage or plain JS).
 * - Unlocking triggers BiometricPrompt; on hardware verification, retrieves the PIN
 *   from Keystore and decrypts the local AES-GCM vault cleanly.
 * - Safely no-ops on web browsers outside the native Android APK.
 */

import { Capacitor } from '@capacitor/core';
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';

const VAULT_SERVER_ID = 'com.lunacycle.app';
const VAULT_USERNAME = 'lunacycle_vault';

export interface BiometricAvailability {
  available: boolean;
  label: string;
}

function biometryTypeToLabel(type: BiometryType): string {
  switch (type) {
    case BiometryType.FINGERPRINT:
    case BiometryType.TOUCH_ID:
      return 'Fingerprint';
    case BiometryType.FACE_AUTHENTICATION:
    case BiometryType.FACE_ID:
      return 'Face Unlock';
    case BiometryType.IRIS_AUTHENTICATION:
      return 'Iris Unlock';
    case BiometryType.MULTIPLE:
      return 'Fingerprint / Face';
    default:
      return 'Biometrics';
  }
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, label: 'Biometrics' };
  }
  try {
    const res = await NativeBiometric.isAvailable({ useFallback: false });
    return {
      available: Boolean(res.isAvailable),
      label: biometryTypeToLabel(res.biometryType),
    };
  } catch {
    return { available: false, label: 'Biometrics' };
  }
}

export async function enableBiometricForVault(
  pin: string,
  disguiseMode: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'Biometric unlock is only available inside the Android APK.' };
  }
  try {
    await NativeBiometric.verifyIdentity({
      reason: disguiseMode ? 'Enable biometric unlock for Daily Notes' : 'Enable biometric unlock for LunaCycle',
      title: disguiseMode ? 'Daily Notes' : 'LunaCycle Vault',
      subtitle: 'Verify your identity to enable hardware-backed unlock',
      negativeButtonText: 'Cancel',
    });

    await NativeBiometric.setCredentials({
      username: VAULT_USERNAME,
      password: pin,
      server: VAULT_SERVER_ID,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Biometric verification was cancelled or failed.' };
  }
}

export async function unlockVaultWithBiometric(disguiseMode: boolean): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    await NativeBiometric.verifyIdentity({
      reason: disguiseMode ? 'Unlock Daily Notes' : 'Unlock your private LunaCycle vault',
      title: disguiseMode ? 'Daily Notes' : 'LunaCycle',
      subtitle: 'Use fingerprint or biometrics to decrypt vault',
      negativeButtonText: 'Use PIN',
    });

    const creds = await NativeBiometric.getCredentials({ server: VAULT_SERVER_ID });
    return creds.password || null;
  } catch {
    return null;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: VAULT_SERVER_ID });
  } catch {
    // Credential may not exist; safe to ignore
  }
}
