import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '@/lib/safe-browser-storage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recovering: boolean;
}

// Shared recovery tracking to coordinate with main.tsx global handler
const RECOVERY_KEY = '__chunk_recovery';

function getRecoveryState(): { count: number; ts: number } {
  try {
    const raw = safeSessionStorageGetItem(RECOVERY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { count: 0, ts: 0 };
}

function setRecoveryState(count: number) {
  safeSessionStorageSetItem(RECOVERY_KEY, JSON.stringify({ count, ts: Date.now() }));
}

function clearRecoveryState() {
  safeSessionStorageRemoveItem(RECOVERY_KEY);
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    recovering: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, recovering: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    const msg = error.message || '';
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Importing a module script failed');

    if (isChunkError) {
      // Check if main.tsx global handler is already recovering
      if ((window as any).__chunk_recovering) return;

      const state = getRecoveryState();
      const elapsed = Date.now() - state.ts;

      // Reset counter if last attempt was >30s ago
      const currentCount = elapsed > 30000 ? 0 : state.count;

      // If URL already has _cb param, we already tried — stop looping
      const alreadyRetried = window.location.search.includes('_cb=');

      if (currentCount < 2 && !alreadyRetried) {
        (window as any).__chunk_recovering = true;
        setRecoveryState(currentCount + 1);
        // Show the recovery spinner (not the error card) while we clean + reload.
        this.setState({ recovering: true });
        const reloadFresh = () => {
          const url = window.location.pathname + window.location.search +
            (window.location.search.includes('?') ? '&' : '?') + '_cb=' + Date.now();
          window.location.replace(url);
        };
        console.warn('[ErrorBoundary] Erro de módulo detectado; limpando cache e recarregando automaticamente.');
        if ('caches' in window) {
          caches.keys()
            .then(names => Promise.all(names.map(n => caches.delete(n))))
            .catch(() => {})
            .finally(reloadFresh);
        } else {
          reloadFresh();
        }
        return;
      }
      // Max attempts reached — show static error UI (no auto-reload)
      clearRecoveryState();
    }
  }

  private nukeAndReload = async (target: string) => {
    clearRecoveryState();
    // Clear ALL session/local recovery flags so a fresh boot is possible
    try {
      sessionStorage.removeItem('__vm_boot_reload_count');
      sessionStorage.removeItem('__lovable_preview_cache_reset_v3');
      sessionStorage.removeItem('__vm_splash_shown');
    } catch {}
    // Unregister all service workers (escape hatch for stuck PWA)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
    } catch {}
    // Wipe caches
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {}
    setTimeout(() => {
      window.location.replace(target + (target.includes('?') ? '&' : '?') + '_cb=' + Date.now());
    }, 100);
  };

  private handleReload = () => {
    void this.nukeAndReload(window.location.pathname);
  };

  private handleGoHome = () => {
    void this.nukeAndReload('/');
  };

  public render() {
    if (this.state.hasError) {
      // Show blank screen during auto-recovery to avoid flash of error UI
      if (this.state.recovering) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        );
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-card border-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-foreground">Ops! Algo deu errado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground text-sm">
                Ocorreu um erro inesperado. Por favor, tente novamente.
              </p>
              
              {import.meta.env.DEV && this.state.error && (
                <div className="bg-secondary/50 p-3 rounded-lg border border-primary/10">
                  <p className="text-xs text-destructive font-mono break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={this.handleGoHome}
                >
                  Ir para Início
                </Button>
                <Button
                  className="flex-1"
                  onClick={this.handleReload}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recarregar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
