/**
 * PWA-Style Over-The-Air (OTA) Live Update Engine
 * Works seamlessly inside both installed browser PWAs and the native Capacitor Android APK.
 *
 * - Compares the running bundle's VITE_APP_VERSION against ./version.json (no-store)
 * - Triggers Service Worker update checks (registration.update())
 * - Activates waiting Service Worker via SKIP_WAITING and reloads cleanly on user confirmation
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
  // 1. Nudge Service Worker to inspect for a newer sw.js / asset bundle
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

  // 2. Fetch live version.json bypassing HTTP & SW cache
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
      // Clear stale caches so reload grabs the freshest OTA bundle
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
