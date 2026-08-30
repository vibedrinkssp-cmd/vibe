// Motoboys Tab Component - Shows registered motoboys as cards
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Phone, Power, FileText, Trash2, Edit2, WifiOff, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAdminMotoboys, useAdminOrders } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency, formatDate, type Motoboy } from '../shared';

function isMotoboyOnline(motoboy: Motoboy): boolean {
  // Online = flag is_online true (set by motoboy toggle)
  return !!motoboy.isOnline;
}

function hasRecentGps(motoboy: Motoboy): boolean {
  if (!motoboy.locationUpdatedAt) return false;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  return new Date(motoboy.locationUpdatedAt) > tenMinutesAgo;
}

export function MotoboysTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [editingMotoboy, setEditingMotoboy] = useState<Motoboy | null>(null);
  const [reportMotoboyId, setReportMotoboyId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const { data: motoboys = [] } = useAdminMotoboys();
  const { data: allOrders = [] } = useAdminOrders();

  const reportMotoboy = motoboys.find(m => m.id === reportMotoboyId);

  // Force re-render every 30s to update online status
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('motoboys-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'motoboys' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-motoboys'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Report data
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const motoboyOrders = allOrders.filter(o => {
    if (o.motoboyId !== reportMotoboyId) return false;
    if (o.status !== 'delivered') return false;
    const orderDate = o.deliveredAt ? new Date(o.deliveredAt) : null;
    return orderDate && orderDate > last24h;
  });

  const reportTotals = motoboyOrders.reduce((acc, order) => {
    acc.count += 1;
    acc.deliveryFees += Number(order.deliveryFee || 0);
    return acc;
  }, { count: 0, deliveryFees: 0 });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Motoboy> & { password?: string } }) => {
      const { error } = await supabase.rpc('update_motoboy', {
        p_id: id,
        p_name: data.name,
        p_whatsapp: data.whatsapp,
        p_is_active: data.isActive,
        p_password: data.password,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-motoboys'] });
      toast({ title: 'Motoboy atualizado!' });
      setIsEditDialogOpen(false);
      setEditingMotoboy(null);
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: error?.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_motoboy', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-motoboys'] });
      toast({ title: 'Motoboy excluído!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir', description: error?.message, variant: 'destructive' });
    },
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingMotoboy) return;
    const fd = new FormData(e.currentTarget);
    const password = fd.get('password') as string;
    updateMutation.mutate({
      id: editingMotoboy.id,
      data: {
        name: fd.get('name') as string,
        whatsapp: fd.get('whatsapp') as string,
        isActive: fd.get('isActive') === 'on',
        ...(password && password.length === 6 ? { password } : {}),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl text-primary">Motoboys</h2>
        <p className="text-sm text-muted-foreground">
          Motoboys se cadastram pela tela de login. Eles aparecem aqui automaticamente.
        </p>
      </div>

      {motoboys.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/30">
          <CardContent className="py-12 text-center">
            <Bike className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Nenhum motoboy cadastrado ainda.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Motoboys podem se cadastrar clicando em "Sou Motoboy" na tela de login.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {motoboys.map(motoboy => {
            const online = isMotoboyOnline(motoboy);
            return (
              <Card
                key={motoboy.id}
                className={`relative border-2 ${
                  motoboy.isActive
                    ? online
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-primary/50 bg-primary/5'
                    : 'border-muted opacity-60'
                }`}
              >
                <CardContent className="p-4">
                  {/* Active badge */}
                  <div className="absolute top-2 left-2">
                    {motoboy.isActive && <UserCheck className="w-4 h-4 text-primary" />}
                  </div>

                  {/* Online indicator */}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    {online ? (
                      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                        <WifiOff className="w-3 h-3" />
                        Offline
                      </span>
                    )}
                    {online && !hasRecentGps(motoboy) && (
                      <span className="text-[10px] text-amber-400">Sem GPS</span>
                    )}
                  </div>

                  {/* Motoboy info */}
                  <div className="flex flex-col items-center text-center mb-3 mt-2">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${
                      online ? 'bg-emerald-500/20 ring-2 ring-emerald-500/50' :
                      motoboy.isActive ? 'bg-primary/20 ring-2 ring-primary/30' : 'bg-muted'
                    }`}>
                      <Bike className={`w-7 h-7 ${
                        online ? 'text-emerald-400' :
                        motoboy.isActive ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <h3 className="font-semibold truncate w-full">{motoboy.name}</h3>
                    {motoboy.cpf && (
                      <p className="text-xs text-primary/70 font-mono mt-0.5">
                        CPF: {motoboy.cpf.slice(0, 3)}.***.***-{motoboy.cpf.slice(9)}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Phone className="w-3 h-3" />
                      <span>{motoboy.whatsapp || 'Sem WhatsApp'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 justify-center flex-wrap">
                    <Button size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => { setEditingMotoboy(motoboy); setIsEditDialogOpen(true); }}
                      title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-emerald-400 hover:text-emerald-300 h-8 w-8"
                      onClick={() => { setReportMotoboyId(motoboy.id); setIsReportDialogOpen(true); }}
                      title="Relatório 24h">
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => updateMutation.mutate({ id: motoboy.id, data: { isActive: !motoboy.isActive } })}
                      title={motoboy.isActive ? 'Desativar' : 'Ativar'}>
                      <Power className={`w-4 h-4 ${motoboy.isActive ? 'text-green-500' : 'text-red-500'}`} />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => { if (confirm('Excluir motoboy?')) deleteMutation.mutate(motoboy.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingMotoboy(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Motoboy</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" defaultValue={editingMotoboy?.name} required />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" name="whatsapp" defaultValue={editingMotoboy?.whatsapp} required />
            </div>
            <div>
              <Label htmlFor="password">Senha (6 dígitos)</Label>
              <Input id="password" name="password" type="text" inputMode="numeric" placeholder="Deixe em branco para manter" maxLength={6} pattern="\d{6}" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="isActive" name="isActive" defaultChecked={editingMotoboy?.isActive ?? true} />
              <Label htmlFor="isActive">Ativo</Label>
            </div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={isReportDialogOpen} onOpenChange={(open) => { setIsReportDialogOpen(open); if (!open) setReportMotoboyId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Entregas 24h - {reportMotoboy?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-primary">{reportTotals.count}</p>
                  <p className="text-sm text-muted-foreground">Entregas</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-500/10 border-emerald-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-400">{formatCurrency(reportTotals.deliveryFees)}</p>
                  <p className="text-sm text-emerald-300/80">A Pagar (Taxas)</p>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {motoboyOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                  <div>
                    <span className="font-mono text-sm">#{order.id.slice(-6)}</span>
                    <p className="text-xs text-muted-foreground">{formatDate(order.deliveredAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-400">+{formatCurrency(order.deliveryFee || 0)}</p>
                  </div>
                </div>
              ))}
              {motoboyOrders.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhuma entrega nas últimas 24h</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
