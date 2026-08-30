import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function IfoodLogsPanel() {
  const [tab, setTab] = useState('events');

  const { data: events = [] } = useQuery({
    queryKey: ['ifood-events-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ifood_events').select('*')
        .order('received_at', { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ['ifood-action-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ifood_action_logs').select('*')
        .order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const errors = [
    ...events.filter((e: any) => e.error).map((e: any) => ({
      type: 'EVENT', when: e.received_at, code: e.code, msg: e.error, ref: e.ifood_order_id,
    })),
    ...actions.filter((a: any) => !a.success).map((a: any) => ({
      type: 'ACTION', when: a.created_at, code: a.action,
      msg: a.error_message ?? `HTTP ${a.http_status}`,
      ref: a.ifood_order_id,
    })),
  ].sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs iFood TESTE</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="events">Eventos ({events.length})</TabsTrigger>
            <TabsTrigger value="actions">Ações ({actions.length})</TabsTrigger>
            <TabsTrigger value="errors">
              Erros {errors.length > 0 && <Badge variant="destructive" className="ml-2">{errors.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {events.map((e: any) => (
                  <div key={e.id} className="border rounded p-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={e.error ? 'destructive' : 'secondary'}>{e.code}</Badge>
                      <Badge variant="outline" className="text-[10px]">{e.source}</Badge>
                      {e.acknowledged && <Badge variant="outline" className="text-[10px]">ACK</Badge>}
                      <span className="font-mono text-muted-foreground">
                        {new Date(e.received_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {e.ifood_order_id && (
                      <p className="font-mono text-muted-foreground mt-1">order: {e.ifood_order_id}</p>
                    )}
                    {e.error && <p className="text-destructive mt-1">{e.error}</p>}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="actions">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {actions.map((a: any) => (
                  <div key={a.id} className="border rounded p-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={a.success ? 'default' : 'destructive'}>{a.action}</Badge>
                      <Badge variant="outline" className="text-[10px]">HTTP {a.http_status}</Badge>
                      <span className="font-mono text-muted-foreground">
                        {new Date(a.created_at).toLocaleString('pt-BR')}
                      </span>
                      {a.performed_by && <span className="text-muted-foreground">por {a.performed_by}</span>}
                    </div>
                    {a.ifood_order_id && (
                      <p className="font-mono text-muted-foreground mt-1">order: {a.ifood_order_id}</p>
                    )}
                    {a.error_message && <p className="text-destructive mt-1">{a.error_message}</p>}
                    {a.response_payload && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">resposta</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto">
                          {JSON.stringify(a.response_payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="errors">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {errors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    🎉 Sem erros recentes.
                  </p>
                ) : (
                  errors.map((e, idx) => (
                    <div key={idx} className="border border-destructive/30 bg-destructive/10 rounded p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">{e.type}</Badge>
                        <Badge variant="outline">{e.code}</Badge>
                        <span className="font-mono text-muted-foreground">
                          {new Date(e.when).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {e.ref && <p className="font-mono mt-1">ref: {e.ref}</p>}
                      <p className="mt-1 text-destructive">{e.msg}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
