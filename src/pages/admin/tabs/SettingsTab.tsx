// Settings Tab Component - Configurações da Loja
import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Truck, MapPin, Volume2, Send, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StoreAddressForm } from '@/components/location/StoreAddressForm';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAdminSettings } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { sendSoundTestSignal } from '@/hooks/use-sound-test-listener';
import { useNotificationSound, type SoundType } from '@/hooks/use-notification-sound';
import type { NotificationSoundType } from '@/lib/notification-sound-engine';

const PANELS = [
  { id: 'all', label: 'Todos os Painéis' },
  { id: 'admin', label: 'Admin (Dashboard)' },
  { id: 'kitchen', label: 'Cozinha (KDE)' },
  { id: 'log', label: 'Logística (LOG)' },
  { id: 'motoboy', label: 'Motoboy' },
] as const;

const SOUND_TYPES: { id: NotificationSoundType; label: string; emoji: string }[] = [
  { id: 'generic', label: 'Genérico', emoji: '🔔' },
  { id: 'ifood', label: 'iFood', emoji: '🟥' },
  { id: 'delivery', label: 'Delivery', emoji: '🛵' },
  { id: 'pdv', label: 'PDV', emoji: '🏪' },
  { id: 'kitchen', label: 'Cozinha', emoji: '👨‍🍳' },
  { id: 'logistics', label: 'Logística', emoji: '📦' },
  { id: 'motoboy', label: 'Motoboy', emoji: '🏍️' },
  { id: 'cancelled', label: 'Cancelado', emoji: '❌' },
  { id: 'status_update', label: 'Atualização', emoji: '🔄' },
  { id: 'arrived', label: 'Chegou', emoji: '📍' },
];

export function SettingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { playOnce, enableSound, needsSoundActivation } = useNotificationSound({ volume: 0.85 });
  
  const [storeAddressData, setStoreAddressData] = useState<{
    address: string;
    lat: number;
    lng: number;
  } | null>(null);

  const { data: settings } = useAdminSettings();

  const [minDeliveryFee, setMinDeliveryFee] = useState(0);
  const [deliveryRatePerKm, setDeliveryRatePerKm] = useState(0);
  const [maxDeliveryDistance, setMaxDeliveryDistance] = useState('15');

  const [testTarget, setTestTarget] = useState('all');
  const [testSoundType, setTestSoundType] = useState<NotificationSoundType>('generic');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (settings) {
      setMinDeliveryFee(parseFloat(settings.minDeliveryFee) || 4);
      setDeliveryRatePerKm(parseFloat(settings.deliveryRatePerKm) || 1.25);
      setMaxDeliveryDistance(settings.maxDeliveryDistance || '15');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: { 
      storeAddress?: string;
      storeLat?: number;
      storeLng?: number;
      minDeliveryFee?: string; 
      deliveryRatePerKm?: string; 
      maxDeliveryDistance?: string;
    }) => {
      // NOTE: is_open is NOT sent here on purpose.
      // The store open/closed status is controlled exclusively by the
      // StoreStatusToggle in the admin header (set_store_open RPC),
      // so this form never overwrites it accidentally.
      const { error } = await supabase.rpc('update_settings', {
        p_store_address: data.storeAddress || undefined,
        p_store_lat: data.storeLat || undefined,
        p_store_lng: data.storeLng || undefined,
        p_min_delivery_fee: data.minDeliveryFee ? parseFloat(data.minDeliveryFee) : undefined,
        p_delivery_rate_per_km: data.deliveryRatePerKm ? parseFloat(data.deliveryRatePerKm) : undefined,
        p_max_delivery_distance: data.maxDeliveryDistance ? parseFloat(data.maxDeliveryDistance) : undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['store-info-public'] });
      queryClient.invalidateQueries({ queryKey: ['store-info'] });
      toast({ title: 'Configurações salvas!' });
    },
    onError: (err) => {
      console.error('Error updating settings:', err);
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    },
  });
  
  const handleStoreAddressChange = useCallback((data: { address: string; lat: number; lng: number }) => {
    setStoreAddressData(data);
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const addressToSave = storeAddressData?.address || settings?.storeAddress || '';
    const latToSave = storeAddressData?.lat || (settings?.storeLat ? Number(settings.storeLat) : undefined);
    const lngToSave = storeAddressData?.lng || (settings?.storeLng ? Number(settings.storeLng) : undefined);
    
    const data = {
      storeAddress: addressToSave,
      storeLat: latToSave,
      storeLng: lngToSave,
      minDeliveryFee: String(minDeliveryFee),
      deliveryRatePerKm: String(deliveryRatePerKm),
      maxDeliveryDistance: maxDeliveryDistance,
    };
    updateMutation.mutate(data);
  };

  const handleSendTestSound = async () => {
    if (isSending) return;
    setIsSending(true);
    const timer = setTimeout(() => setIsSending(false), 5000); // safety reset
    try {
      playOnce(testSoundType);
      await sendSoundTestSignal(testTarget, testSoundType);
      const targetLabel = PANELS.find(p => p.id === testTarget)?.label || testTarget;
      toast({ title: `🔊 Sinal de teste enviado para: ${targetLabel}` });
    } catch (err) {
      console.error('Error sending test signal:', err);
      toast({ title: 'Erro ao enviar sinal', variant: 'destructive' });
    } finally {
      clearTimeout(timer);
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-3xl text-primary">Configurações</h2>

      {/* Sound Tester Card */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-primary" />
            Testador de Som
          </CardTitle>
          <CardDescription>
            Envie sinais sonoros para testar se os alertas estão funcionando nos painéis operacionais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {needsSoundActivation && (
            <Button 
              variant="outline" 
              className="w-full border-amber-500 text-amber-600"
              onClick={() => enableSound(testSoundType)}
            >
              <Volume2 className="w-4 h-4 mr-2" />
              Ativar som neste dispositivo primeiro
            </Button>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Painel destino</Label>
              <Select value={testTarget} onValueChange={setTestTarget}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PANELS.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de som</Label>
              <Select value={testSoundType} onValueChange={(v) => setTestSoundType(v as NotificationSoundType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_TYPES.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.emoji} {s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleSendTestSound} 
              disabled={isSending}
              className="flex-1 gap-2"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar Sinal de Teste
            </Button>
            <Button
              variant="outline"
              onClick={() => playOnce(testSoundType)}
              className="gap-2"
            >
              <Volume2 className="w-4 h-4" />
              Ouvir aqui
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Os painéis precisam estar abertos e com o som ativado para receber o sinal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Configurações da Loja
          </CardTitle>
          <CardDescription>
            Configure o endereço e parâmetros de entrega da loja
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <StoreAddressForm
                defaultAddress={settings?.storeAddress || ''}
                defaultLat={settings?.storeLat ? Number(settings.storeLat) : null}
                defaultLng={settings?.storeLng ? Number(settings.storeLng) : null}
                onAddressChange={handleStoreAddressChange}
              />
              {settings?.storeLat && settings?.storeLng && !storeAddressData && (
                <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Coordenadas configuradas: {Number(settings.storeLat).toFixed(4)}, {Number(settings.storeLng).toFixed(4)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 p-4 bg-secondary rounded-lg">
              <Store className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  Status da loja: {settings?.isOpen ? '🟢 ABERTA' : '🔴 FECHADA'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Use o botão no topo do painel para abrir ou fechar a loja em tempo real.
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-lg">Configuração de Entrega</h3>
              </div>
              
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="minDeliveryFee">Taxa Mínima (até 1km)</Label>
                  <CurrencyInput 
                    id="minDeliveryFee" 
                    value={minDeliveryFee} 
                    onChange={setMinDeliveryFee}
                    placeholder="4,00"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="deliveryRatePerKm">Taxa por KM Adicional</Label>
                  <CurrencyInput 
                    id="deliveryRatePerKm" 
                    value={deliveryRatePerKm} 
                    onChange={setDeliveryRatePerKm}
                    placeholder="1,25"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxDeliveryDistance">Distância Máxima</Label>
                  <div className="relative">
                    <Input 
                      id="maxDeliveryDistance" 
                      type="number"
                      step="0.5"
                      min="1"
                      value={maxDeliveryDistance}
                      onChange={(e) => setMaxDeliveryDistance(e.target.value)}
                      placeholder="15"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">km</span>
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={updateMutation.isPending} className="w-full gap-2">
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Salvar Configurações
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
