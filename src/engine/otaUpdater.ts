/**
 * PWA Over-The-Air (OTA) Live Update Engine (Web Browser PWA only).
 * Native Android (.aab/.apk) and iOS builds run 100% locally from dist/ with zero
 * startup network fetches (Apple Guideline 4.2 Airplane-Mode & Zero-IP-Leak compliance).
 */

export const CURRENT_APP_VERSION: string = import.meta.env.VITE_APP_VERSION || '1.0.0-local';

export interface OtaUpdateState {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checking: boolean;
  lastCheckedAt: string | null;
  isNativeApk: boolean;
}

export function isRunningInsideNativeApk(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export async function checkForOtaUpdate(): Promise<{
  updateAvailable: boolean;
  latestVersion: string | null;
  offline?: boolean;
}> {
  // Native mobile store builds run strictly from local signed assets — never ping GitHub CDN.
  if (isRunningInsideNativeApk()) {
    return { updateAvailable: false, latestVersion: null };
  }

  let swHasWaiting = false;
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          swHasWaiting = true;
        }
      }
    } catch {
      // Offline or dev server
    }
  }

  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) {
      return { updateAvailable: swHasWaiting, latestVersion: null };
    }
    const payload = (await res.json()) as { version?: string };
    const latestVersion = typeof payload.version === 'string' ? payload.version : null;
    const versionChanged =
      Boolean(latestVersion) &&
      CURRENT_APP_VERSION !== '1.0.0-local' &&
      latestVersion !== CURRENT_APP_VERSION;

    return {
      updateAvailable: swHasWaiting || versionChanged,
      latestVersion,
    };
  } catch {
    return { updateAvailable: swHasWaiting, latestVersion: null, offline: true };
  }
}

export async function applyOtaUpdateNow(): Promise<void> {
  if (isRunningInsideNativeApk()) return;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        await new Promise<void>((resolve) => {
          const onChange = () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onChange);
            resolve();
          };
          navigator.serviceWorker.addEventListener('controllerchange', onChange);
          window.setTimeout(resolve, 1200);
        });
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Fall through to hard reload
    }
  }
  window.location.reload();
}
