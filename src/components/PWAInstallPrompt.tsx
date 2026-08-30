import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Share, Plus, MoreVertical, Download, Smartphone } from 'lucide-react';
import appIcon from '@/assets/app-icon.jpg';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '@/lib/safe-browser-storage';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallPromptProps {
  showAfterSplash?: boolean;
}

// ── Global capture: never lose the native event ──
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners: Set<(p: BeforeInstallPromptEvent) => void> = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    console.log('[PWA] beforeinstallprompt captured');
    promptListeners.forEach(fn => fn(globalDeferredPrompt!));
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed!');
    globalDeferredPrompt = null;
    safeLocalStorageSetItem(INSTALLED_KEY, '1');
  });
}

const isPreviewEnvironment = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return import.meta.env.DEV || host.includes('lovableproject.com') || host.includes('id-preview--');
};

const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isAndroid = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
};

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
};

const isSamsungBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /SamsungBrowser/.test(navigator.userAgent);
};

const DISMISS_KEY = 'pwa-install-dismissed';
const INSTALLED_KEY = 'pwa-installed';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ── External trigger ──
let externalShowFn: ((forceFallback?: boolean) => void) | null = null;
export const triggerPWAInstallPrompt = () => externalShowFn?.();

// Direct install – triggers native prompt immediately (must run inside the user gesture)
export const directInstallPWA = async () => {
  // Already installed / running standalone → show instructions modal (no-op native prompt)
  if (isStandalone()) {
    externalShowFn?.();
    return;
  }
  const prompt = globalDeferredPrompt;
  if (prompt) {
    try {
      // IMPORTANT: call prompt() synchronously within the gesture, no awaits before it
      const result = prompt.prompt();
      const choice = await prompt.userChoice;
      await result;
      if (choice.outcome === 'accepted') {
        safeLocalStorageSetItem(INSTALLED_KEY, '1');
      }
      globalDeferredPrompt = null;
      return;
    } catch {
      // Native prompt failed (e.g. gesture lost / unsupported) → fall through to manual instructions
      globalDeferredPrompt = null;
    }
  }
  // No native prompt – fall back to modal with platform-specific instructions
  externalShowFn?.(true);
};

export function PWAInstallPrompt({ showAfterSplash = true }: PWAInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [showModal, setShowModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const isPreview = isPreviewEnvironment();
  const isInstalled = isStandalone();
  const userIsIOS = isIOS();
  const userIsAndroid = isAndroid();

  // Register external trigger
  useEffect(() => {
    externalShowFn = (forceFallback?: boolean) => {
      setShowFallback(!!forceFallback);
      setShowModal(true);
    };
    return () => { externalShowFn = null; };
  }, []);

  // Listen for native prompt event (may arrive late)
  useEffect(() => {
    if (isPreview) return;

    const handler = (p: BeforeInstallPromptEvent) => {
      setDeferredPrompt(p);
      setShowFallback(false); // native prompt arrived, hide fallback
    };

    promptListeners.add(handler);
    return () => { promptListeners.delete(handler); };
  }, [isPreview]);

  // Auto-show after splash
  useEffect(() => {
    if (!showAfterSplash || isInstalled || isPreview) return;
    if (safeLocalStorageGetItem(INSTALLED_KEY) === '1') return;

    const dismissedAt = safeLocalStorageGetItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < COOLDOWN_MS) return;

    // Wait a bit for beforeinstallprompt to fire, then show
    const timer = setTimeout(() => {
      setShowModal(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [showAfterSplash, isInstalled, isPreview]);

  const handleInstall = async () => {
    const prompt = deferredPrompt || globalDeferredPrompt;
    if (prompt) {
      setInstalling(true);
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') {
          safeLocalStorageSetItem(INSTALLED_KEY, '1');
        }
      } catch (error) {
        console.error('[PWA] Install error:', error);
      } finally {
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
        setShowModal(false);
        setInstalling(false);
      }
      return;
    }

    // No native prompt available – show platform instructions
    setShowFallback(true);
  };

  const handleDismiss = () => {
    setShowModal(false);
    setShowFallback(false);
    safeLocalStorageSetItem(DISMISS_KEY, String(Date.now()));
  };

  if (!showModal) return null;

  const hasNativePrompt = !!(deferredPrompt || globalDeferredPrompt);

  // ── Fallback instructions per platform ──
  const renderFallbackInstructions = () => {
    if (userIsIOS) {
      return (
        <div className="space-y-3 text-sm text-left w-full">
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
            <Share className="w-6 h-6 shrink-0" />
            <span>1. Toque em <strong>Compartilhar</strong> <Share className="w-4 h-4 inline" /> na barra do Safari</span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
            <Plus className="w-6 h-6 shrink-0" />
            <span>2. Selecione <strong>"Adicionar à Tela de Início"</strong></span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
            <Download className="w-6 h-6 shrink-0" />
            <span>3. Toque em <strong>"Adicionar"</strong></span>
          </div>
        </div>
      );
    }

    if (userIsAndroid) {
      return (
        <div className="space-y-3 text-sm text-left w-full">
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
            <MoreVertical className="w-6 h-6 shrink-0" />
            <span>1. Toque no menu <strong>⋮</strong> do navegador</span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
            <Download className="w-6 h-6 shrink-0" />
            <span>2. Selecione <strong>{isSamsungBrowser() ? '"Adicionar à tela inicial"' : '"Instalar aplicativo"'}</strong></span>
          </div>
        </div>
      );
    }

    // Desktop
    return (
      <div className="space-y-3 text-sm text-left w-full">
        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
          <MoreVertical className="w-6 h-6 shrink-0" />
          <span>1. Clique no menu <strong>⋮</strong> (3 pontos) no canto superior direito do Chrome</span>
        </div>
        <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
          <Download className="w-6 h-6 shrink-0" />
          <span>2. Clique em <strong>"Instalar VM Brasil"</strong></span>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={showModal} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="max-w-xs mx-auto bg-primary text-primary-foreground border-none rounded-3xl p-6">
        <DialogTitle className="sr-only">Instalar aplicativo</DialogTitle>
        <DialogDescription className="sr-only">
          Instale o aplicativo para acessar a loja mais rapidamente.
        </DialogDescription>
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-xl border-2 border-white/20">
            <img src={appIcon} alt="VM Brasil" className="w-full h-full object-cover" />
          </div>

          <p className="text-lg font-semibold">Instalar VM Brasil</p>
          <p className="text-sm opacity-80">
            Acesse mais rápido direto da sua tela inicial, como um app de verdade!
          </p>

          {showFallback ? (
            <>
              {renderFallbackInstructions()}
              <Button
                onClick={handleDismiss}
                className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold rounded-xl h-12"
              >
                Entendi
              </Button>
            </>
          ) : (
            <div className="flex gap-3 w-full">
              <Button
                onClick={handleDismiss}
                variant="secondary"
                className="flex-1 font-medium rounded-xl h-12"
              >
                Depois
              </Button>
              <Button
                onClick={handleInstall}
                disabled={installing}
                className="flex-1 bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold rounded-xl h-12 gap-2"
              >
                <Smartphone className="w-4 h-4" />
                {installing ? 'Instalando...' : 'Instalar'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
