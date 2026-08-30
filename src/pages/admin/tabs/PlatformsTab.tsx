import { useState } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, Trash2, Package, Filter, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PLATFORM_DESCRIPTORS } from '@/lib/external-platforms';

const PLATFORMS = PLATFORM_DESCRIPTORS.map((p) => ({ id: p.id, label: p.label, color: p.badgeClass }));

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getPlatformBadge(platform: string) {
  const p = PLATFORMS.find(pl => pl.id === platform);
  return p || { id: platform, label: platform, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
}

export function PlatformsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterDate, setFilterDate] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; product_name: string; platform: string; total_price: number } | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['platform-sales', filterPlatform, filterDate],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (filterPlatform !== 'all') params.p_platform = filterPlatform;
      if (filterDate) {
        params.p_start_date = `${filterDate}T00:00:00Z`;
        params.p_end_date = `${filterDate}T23:59:59Z`;
      }
      const { data, error } = await supabase.rpc('get_platform_sales', params);
      if (error) throw error;
      return data || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sale: { id: string; product_name: string; platform: string; total_price: number }) => {
      const { error } = await supabase.rpc('delete_platform_sale', { p_id: sale.id });
      if (error) throw error;
      // Audit trail — non-blocking
      try {
        await (supabase.from('cash_register_audit') as any).insert({
          action: 'platform_sale_deleted',
          notes: `${sale.platform.toUpperCase()} • ${sale.product_name} • R$ ${sale.total_price.toFixed(2)}`,
        });
      } catch (e) {
        console.warn('[PlatformsTab] audit log failed', e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-sales'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      toast({ title: 'Venda removida e estoque restaurado!' });
      setPendingDelete(null);
    },
    onError: () => {
      toast({ title: 'Erro ao remover venda', variant: 'destructive' });
      setPendingDelete(null);
    },
  });

  const filtered = sales.filter((s: any) =>
    searchIncludes(s.product_name || '', search)
  );

  const totalValue = filtered.reduce((sum: number, s: any) => sum + (s.total_price || 0), 0);
  const totalItems = filtered.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);

  // Group by platform for summary
  const platformSummary = PLATFORMS.map(p => {
    const platformSales = filtered.filter((s: any) => s.platform === p.id);
    return {
      ...p,
      count: platformSales.length,
      total: platformSales.reduce((sum: number, s: any) => sum + (s.total_price || 0), 0),
      items: platformSales.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0),
    };
  }).filter(p => p.count > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Vendas por Plataformas</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Card className="col-span-2 sm:col-span-3 lg:col-span-1">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Geral</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(totalValue)}</p>
            <p className="text-xs text-muted-foreground">{totalItems} itens • {filtered.length} vendas</p>
          </CardContent>
        </Card>
        {platformSummary.map(p => (
          <Card key={p.id}>
            <CardContent className="p-3 text-center">
              <Badge className={p.color}>{p.label}</Badge>
              <p className="text-sm font-bold mt-1">{formatCurrency(p.total)}</p>
              <p className="text-xs text-muted-foreground">{p.items} itens</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-primary/30 text-sm"
          />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[140px] bg-secondary border-primary/30">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {PLATFORMS.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="w-[160px] bg-secondary border-primary/30 text-sm"
        />
        {filterDate && (
          <Button variant="ghost" size="sm" onClick={() => setFilterDate('')}>Limpar</Button>
        )}
      </div>

      {/* Sales List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma venda de plataforma registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sale: any) => {
            const platInfo = getPlatformBadge(sale.platform);
            return (
              <Card key={sale.id}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={platInfo.color}>{platInfo.label}</Badge>
                      <span className="font-medium text-sm truncate">{sale.product_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{sale.quantity}x {formatCurrency(sale.unit_price)}</span>
                      <span className="font-bold text-primary">{formatCurrency(sale.total_price)}</span>
                      <span>{format(new Date(sale.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                      {sale.salesperson && <span>• {sale.salesperson}</span>}
                    </div>
                    {sale.notes && <p className="text-xs text-muted-foreground mt-1">{sale.notes}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete({
                      id: sale.id,
                      product_name: sale.product_name,
                      platform: sale.platform,
                      total_price: Number(sale.total_price || 0),
                    })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover venda de plataforma?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Esta ação irá <strong>devolver o estoque</strong> de{' '}
                  <strong>{pendingDelete.product_name}</strong> ({getPlatformBadge(pendingDelete.platform).label} •{' '}
                  {formatCurrency(pendingDelete.total_price)}) e registrará uma entrada de auditoria.
                  Esta operação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
            >
              {deleteMutation.isPending ? 'Removendo...' : 'Confirmar Remoção'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
