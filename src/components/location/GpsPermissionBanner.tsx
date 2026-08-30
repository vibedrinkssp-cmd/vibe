import { useState } from 'react';
import { MapPin, Navigation, Shield, Settings, X, AlertTriangle, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PermissionState = 'prompt' | 'requesting' | 'granted' | 'denied' | 'unavailable';

interface GpsPermissionBannerProps {
  permissionStatus: PermissionState;
  isTracking: boolean;
  lastError: string | null;
  onRequestPermission: () => Promise<boolean>;
  className?: string;
}

function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function GpsPermissionBanner({
  permissionStatus,
  isTracking,
  lastError,
  onRequestPermission,
  className,
}: GpsPermissionBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const platform = detectPlatform();

  // Don't show if GPS is active and working
  if (isTracking && permissionStatus === 'granted') return null;
  // Don't show if dismissed (but re-show if denied)
  if (dismissed && permissionStatus !== 'denied') return null;

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      const success = await onRequestPermission();
      if (success) setDismissed(true);
    } finally {
      setIsRequesting(false);
    }
  };

  // GPS not supported
  if (permissionStatus === 'unavailable') {
    return (
      <Card className={cn('border-destructive/50 bg-destructive/10', className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">GPS não disponível</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Seu navegador não suporta geolocalização. Use o Chrome ou Safari para acessar o sistema de entregas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // GPS denied - show platform-specific instructions
  if (permissionStatus === 'denied') {
    return (
      <Card className={cn('border-destructive/50 bg-destructive/10 animate-in fade-in slide-in-from-top-2', className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">📍 GPS Bloqueado</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                O rastreamento de entregas precisa do GPS ativado. Siga as instruções para seu dispositivo:
              </p>
              
              {platform === 'ios' ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Smartphone className="h-4 w-4" /> iPhone / iPad:
                  </p>
                  {isStandalone() ? (
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
                      <li>Abra <strong>Ajustes</strong> do iPhone</li>
                      <li>Toque em <strong>Privacidade e Segurança</strong></li>
                      <li>Toque em <strong>Serviços de Localização</strong></li>
                      <li>Ative os <strong>Serviços de Localização</strong></li>
                      <li>Encontre o app e selecione <strong>"Enquanto Usa"</strong></li>
                      <li>Volte aqui e toque em <strong>"Tentar Novamente"</strong></li>
                    </ol>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
                      <li>Toque no <strong>ᴬᴬ</strong> ou 🔒 na barra de endereço do Safari</li>
                      <li>Toque em <strong>"Ajustes do Site"</strong></li>
                      <li>Ative <strong>"Localização"</strong> → <strong>Permitir</strong></li>
                      <li>Recarregue a página</li>
                    </ol>
                  )}
                </div>
              ) : platform === 'android' ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Smartphone className="h-4 w-4" /> Android:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
                    <li>Toque no <strong>🔒 cadeado</strong> na barra de endereço</li>
                    <li>Toque em <strong>"Permissões"</strong> ou <strong>"Configurações do site"</strong></li>
                    <li>Ative <strong>"Localização"</strong> → <strong>Permitir</strong></li>
                    <li>Volte aqui e toque em <strong>"Tentar Novamente"</strong></li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Verifique também se o <strong>GPS do celular</strong> está ativado nas Configurações → Localização.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Settings className="h-4 w-4" /> Desktop:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
                    <li>Clique no <strong>🔒 cadeado</strong> na barra de endereço</li>
                    <li>Encontre <strong>"Localização"</strong> e altere para <strong>"Permitir"</strong></li>
                    <li>Recarregue a página</li>
                  </ol>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button 
                  onClick={handleRequest}
                  disabled={isRequesting}
                  className="flex-1"
                  size="sm"
                >
                  <Navigation className="h-4 w-4 mr-1" />
                  {isRequesting ? 'Verificando...' : 'Tentar Novamente'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Recarregar
                </Button>
              </div>

              {lastError && (
                <p className="text-xs text-destructive mt-2">Erro: {lastError}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // GPS prompt - initial request
  return (
    <Card className={cn('border-primary/50 bg-primary/5 animate-in fade-in slide-in-from-top-2', className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <MapPin className="h-8 w-8 text-primary shrink-0 animate-bounce" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-ping" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">📍 Ativar Localização GPS</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Para iniciar o rastreamento de entregas, precisamos da sua localização em tempo real. 
              {platform === 'ios' 
                ? ' Toque "Permitir" quando o iOS solicitar.'
                : platform === 'android'
                ? ' Toque "Permitir" quando o Android solicitar.'
                : ' Clique "Permitir" quando o navegador solicitar.'}
            </p>
            
            <Button 
              onClick={handleRequest}
              disabled={isRequesting}
              className="w-full"
              size="lg"
            >
              {isRequesting ? (
                <>
                  <Navigation className="h-5 w-5 mr-2 animate-spin" />
                  Solicitando permissão...
                </>
              ) : (
                <>
                  <Navigation className="h-5 w-5 mr-2" />
                  Ativar GPS Agora
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground mt-2 text-center">
              🔒 Sua localização é usada apenas para rastreamento de entregas
            </p>

            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-xs text-muted-foreground w-full"
              onClick={() => setDismissed(true)}
            >
              <X className="h-3 w-3 mr-1" /> Ignorar por agora
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
