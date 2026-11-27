import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isRunningInsideNativeApk } from './engine/otaUpdater';
import { ensureTemporal } from './engine/temporal';
import './styles.css';

async function bootstrap() {
  // Feature-detect Temporal API and load polyfill only when missing
  await ensureTemporal();

  // Register offline-first service worker in browser PWA builds only (native bundles load locally)
  if (import.meta.env.PROD && !isRunningInsideNativeApk() && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Offline cache is progressive enhancement
      });
    });
  }

  const container = document.getElementById('root');
  if (!container) return;

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
