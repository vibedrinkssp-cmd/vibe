import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from "@/lib/safe-browser-storage";

// Cache/SW strategy:
// - Preview/dev: fully disable SW and clear caches to avoid stale preview versions
// - Published app/PWA: keep aggressive update for latest published version
const bootstrap = async () => {
  const isDev = import.meta.env.DEV;
  const appCacheVersion = "2026-05-13-ios-safe-v1";
  const appCacheVersionKey = "__vm_brasil_cache_version";
  const hostname = window.location.hostname;
  const userAgent = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  if (isIOS) {
    document.documentElement.classList.add("ios-safe-mode");
  }

  // Low-end device detection — disables backdrop-filter etc. to prevent jank on weak Android phones
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowMem = typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 2;
    const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
    if (lowMem || lowCpu) {
      document.documentElement.classList.add("low-end-mode");
    }
  } catch {
    // ignore — feature detection only
  }

  const isPreviewHost =
    hostname.includes("lovableproject.com") ||
    hostname.includes("id-preview--") ||
    window.location.search.includes("__lovable_token=");

  const shouldDisableSw = isDev || isPreviewHost || isInIframe || isIOS;
  const previewResetKey = "__lovable_preview_cache_reset_v4";
  const bootLoopKey = "__vm_boot_reload_count";
  const cachedVersion = safeLocalStorageGetItem(appCacheVersionKey);
  let shouldReloadAfterCleanup = false;

  // Hard cap: never reload more than 2 times in a 60s window — prevents infinite loop on broken devices
  const bootCountRaw = safeSessionStorageGetItem(bootLoopKey);
  const bootCount = bootCountRaw ? parseInt(bootCountRaw, 10) || 0 : 0;
  const reloadAllowed = bootCount < 2;

  if (!shouldDisableSw && cachedVersion !== appCacheVersion && reloadAllowed) {
    shouldReloadAfterCleanup = true;
    safeLocalStorageSetItem(appCacheVersionKey, appCacheVersion);
  } else if (cachedVersion !== appCacheVersion) {
    // Either preview, or already reloaded too many times — just record the version and continue
    safeLocalStorageSetItem(appCacheVersionKey, appCacheVersion);
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const reg of registrations) {
      if (shouldDisableSw || cachedVersion !== appCacheVersion) {
        shouldReloadAfterCleanup = true;
        await reg.unregister().catch(() => {});
        continue;
      }

      // Force update check on every load for published app
      await reg.update().catch(() => {});
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  }

  if ("caches" in window) {
    const names = await caches.keys();
    const namesToDelete = shouldDisableSw || cachedVersion !== appCacheVersion
      ? names
      : names.filter((name) => name.includes("workbox") || name.includes("precache"));

    if (shouldDisableSw && namesToDelete.length > 0) {
      shouldReloadAfterCleanup = true;
    }

    await Promise.all(namesToDelete.map((name) => caches.delete(name)));
  }

  if (shouldDisableSw && shouldReloadAfterCleanup && !safeSessionStorageGetItem(previewResetKey) && reloadAllowed) {
    // Never force a full page reload during boot. Operational panels (KDE/LOG/PDV)
    // must stay open; cache/SW cleanup above is enough and the next manual load
    // will naturally use the fresh bundle.
    safeSessionStorageSetItem(previewResetKey, "1");
    safeSessionStorageSetItem(bootLoopKey, String(bootCount + 1));
  }

  safeSessionStorageRemoveItem(previewResetKey);
  // Reset boot counter once we successfully reach this point
  safeSessionStorageRemoveItem(bootLoopKey);

  // ── Register native service worker (production only) ──
  if ('serviceWorker' in navigator && !shouldDisableSw) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered:', reg.scope);
          // Force update check on every load
          reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        })
        .catch((err) => console.warn('[SW] Registration failed:', err));
    });
  }

  // Global handler for unhandled chunk loading errors (lazy routes)
  // Coordinates with ErrorBoundary via shared flag to avoid double-reload
  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event.reason?.message || event.reason || '');
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed')
    ) {
      event.preventDefault();

      // If ErrorBoundary is already handling this, skip
      if ((window as any).__chunk_recovering) return;

      const RECOVERY_KEY = '__chunk_recovery';
      let state = { count: 0, ts: 0 };
      try {
        const raw = safeSessionStorageGetItem(RECOVERY_KEY);
        if (raw) state = JSON.parse(raw);
      } catch {}

      const elapsed = Date.now() - state.ts;
      const currentCount = elapsed > 30000 ? 0 : state.count;

      // If URL already has _cb param, we already tried — stop looping
      const alreadyRetried = window.location.search.includes('_cb=');

      if (currentCount < 2 && !alreadyRetried) {
        (window as any).__chunk_recovering = true;
        safeSessionStorageSetItem(RECOVERY_KEY, JSON.stringify({ count: currentCount + 1, ts: Date.now() }));
        const reloadFresh = () => {
          const url = window.location.pathname + window.location.search +
            (window.location.search.includes('?') ? '&' : '?') + '_cb=' + Date.now();
          window.location.replace(url);
        };
        console.warn('[ChunkRecovery] Falha de módulo detectada; limpando cache e recarregando automaticamente.');
        if ('caches' in window) {
          caches.keys()
            .then(names => Promise.all(names.map(n => caches.delete(n))))
            .catch(() => {})
            .finally(reloadFresh);
        } else {
          reloadFresh();
        }
      } else {
        safeSessionStorageRemoveItem(RECOVERY_KEY);
      }
    }
  });

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

bootstrap();
