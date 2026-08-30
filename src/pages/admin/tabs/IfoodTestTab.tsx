import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, Play, Webhook, Copy, KeyRound, Package, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { IfoodOrdersPanel } from './ifood/IfoodOrdersPanel';
import { IfoodLogsPanel } from './ifood/IfoodLogsPanel';

// IMPORTANTE: webhooks externos (iFood) precisam bater DIRETO no Supabase Edge Functions.
// O domínio www.lojasvm.com.br serve o PWA (SPA) — não tem rewrite para /functions/v1/*.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/ifood-webhook`;

export function IfoodTestTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testing, setTesting] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['ifood-test-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ifood_test_config').select('*').limit(1).single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 10_000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['ifood-test-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ifood_test_events_log')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10_000,
  });

  const toggleEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!config) return;
      const { error } = await supabase
        .from('ifood_test_config')
        .update({ is_enabled: enabled })
        .eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ifood-test-config'] });
      toast({ title: 'Configuração atualizada' });
    },
  });

  const toggleWebhook = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!config) return;
      const { error } = await supabase
        .from('ifood_test_config')
        .update({ webhook_enabled: enabled } as any)
        .eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ifood-test-config'] });
      toast({ title: 'Webhook atualizado' });
    },
  });

  const regenSecret = useMutation({
    mutationFn: async () => {
      if (!config) return;
      // Gera segredo HMAC aleatório (32 bytes hex)
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const { error } = await supabase
        .from('ifood_test_config')
        .update({ webhook_secret: secret } as any)
        .eq('id', config.id);
      if (error) throw error;
      return secret;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ifood-test-config'] });
      toast({ title: '🔑 Novo segredo gerado', description: 'Cole no painel iFood ao salvar o webhook.' });
    },
  });

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    toast({ title: '📋 URL copiada' });
  };

  const copySecret = async () => {
    const sec = (config as any)?.webhook_secret;
    if (!sec) return;
    await navigator.clipboard.writeText(sec);
    toast({ title: '📋 Segredo copiado' });
  };



  const testAuth = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ifood-test-auth');
      if (error) throw error;
      toast({
        title: data?.ok ? '✅ Credenciais OK' : '❌ Falha',
        description: data?.ok ? `Token obtido (${data.length} chars)` : data?.error,
        variant: data?.ok ? 'default' : 'destructive',
      });
    } catch (e) {
      toast({ title: 'Erro', description: String(e), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const forcePoll = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ifood-test-poll');
      if (error) throw error;
      toast({
        title: data?.ok ? '✅ Polling executado' : '❌ Falha',
        description: data?.ok
          ? `${data.processed ?? 0}/${data.total ?? 0} eventos processados`
          : data?.error,
        variant: data?.ok ? 'default' : 'destructive',
      });
      qc.invalidateQueries({ queryKey: ['ifood-test-events'] });
      qc.invalidateQueries({ queryKey: ['ifood-test-config'] });
    } catch (e) {
      toast({ title: 'Erro', description: String(e), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const testWebhook = async () => {
    setTesting(true);
    try {
      // Health check GET — bate na URL pública SEM auth (é o que o iFood faz)
      const res = await fetch(WEBHOOK_URL, { method: 'GET' });
      const text = await res.text();
      if (!res.ok) {
        toast({
          title: `❌ Webhook inacessível [${res.status}]`,
          description: text.slice(0, 200),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: '✅ Webhook acessível publicamente',
        description: `Resposta: ${text.slice(0, 120)}`,
      });
    } catch (e) {
      toast({ title: 'Erro de rede', description: String(e), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Tabs defaultValue="orders" className="space-y-4">
      <TabsList>
        <TabsTrigger value="orders"><Package className="h-4 w-4 mr-1" /> Pedidos</TabsTrigger>
        <TabsTrigger value="config"><ShieldCheck className="h-4 w-4 mr-1" /> Configuração</TabsTrigger>
        <TabsTrigger value="logs"><FileText className="h-4 w-4 mr-1" /> Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="orders"><IfoodOrdersPanel /></TabsContent>
      <TabsContent value="logs"><IfoodLogsPanel /></TabsContent>

      <TabsContent value="config" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            iFood — Integração Oficial (Modo TESTE)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-semibold">Polling automático (a cada 30s)</p>
              <p className="text-xs text-muted-foreground">
                Quando ativo, busca novos pedidos do sandbox iFood automaticamente.
              </p>
            </div>
            <Switch
              checked={!!config?.is_enabled}
              onCheckedChange={(v) => toggleEnabled.mutate(v)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Último poll</p>
              <p className="font-mono text-sm">
                {config?.last_polled_at
                  ? new Date(config.last_polled_at).toLocaleString('pt-BR')
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Eventos no último ciclo</p>
              <p className="font-mono text-sm">{config?.last_poll_event_count ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              {config?.last_error ? (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Erro
                </p>
              ) : (
                <p className="text-sm text-green-500">OK</p>
              )}
            </div>
          </div>

          {config?.last_error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs">
              <p className="font-semibold text-destructive">Último erro:</p>
              <p className="font-mono break-all">{config.last_error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={testAuth} disabled={testing} variant="outline">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Testar credenciais
            </Button>
            <Button onClick={forcePoll} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Forçar polling agora
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['ifood-test-events'] });
                qc.invalidateQueries({ queryKey: ['ifood-test-config'] });
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            Webhook (recepção em tempo real)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-semibold">Webhook ativo</p>
              <p className="text-xs text-muted-foreground">
                Recebe pedidos do iFood instantaneamente. O polling continua como fallback.
              </p>
            </div>
            <Switch
              checked={!!(config as any)?.webhook_enabled}
              onCheckedChange={(v) => toggleWebhook.mutate(v)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">URL do Webhook</p>
            <div className="flex gap-2">
              <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cole no painel do desenvolvedor iFood → módulo <code>events</code> → Webhook URL.
              Esta URL aponta DIRETO para o backend — não use o domínio do PWA.
            </p>
            <Button onClick={testWebhook} disabled={testing} variant="secondary" size="sm" className="w-full">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Testar acesso público ao webhook
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Segredo HMAC (opcional)</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={(config as any)?.webhook_secret ?? ''}
                placeholder="Nenhum segredo configurado — webhook aceita sem assinatura"
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copySecret}
                disabled={!(config as any)?.webhook_secret}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => regenSecret.mutate()}
                disabled={regenSecret.isPending}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                {regenSecret.isPending ? 'Gerando…' : 'Gerar novo'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Se preenchido, o webhook valida o header <code>x-ifood-signature</code> (HMAC SHA-256).
              Quando vazio, aceita qualquer chamada (recomendado apenas em TESTE).
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Último webhook recebido</p>
              <p className="font-mono text-sm">
                {(config as any)?.last_webhook_at
                  ? new Date((config as any).last_webhook_at).toLocaleString('pt-BR')
                  : '— ainda sem chamadas —'}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-xs space-y-1">
              <p className="text-muted-foreground">Loja TESTE conectada:</p>
              <p className="font-mono">{config?.merchant_id ?? '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Últimos eventos recebidos</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum evento recebido ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {events.map((ev: any) => (
                  <div key={ev.id} className="rounded-lg border p-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={ev.error ? 'destructive' : 'secondary'}>{ev.event_code}</Badge>
                      <span className="font-mono text-muted-foreground">
                        {new Date(ev.processed_at).toLocaleString('pt-BR')}
                      </span>
                      {ev.order_id_local && (
                        <Badge variant="outline" className="text-[10px]">
                          → pedido local criado
                        </Badge>
                      )}
                      {ev.error && <span className="text-destructive">{ev.error}</span>}
                    </div>
                    <p className="font-mono text-muted-foreground mt-1">
                      iFood Order: {ev.order_id_ifood ?? '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
