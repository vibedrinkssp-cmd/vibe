import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowUpFromLine,
  Calendar,
  Filter,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  User,
  Clock,
  Hash,
  StickyNote,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { SaqDepModal } from '@/components/pdv/SaqDepModal';

interface CashTransaction {
  id: string;
  created_at: string;
  type: 'saque';
  amount: number;
  fee: number;
  total: number;
  payment_method: string | null;
  responsible: string;
  notes: string | null;
  session_id: string | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const PAYMENT_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  pix:         { label: 'PIX',     emoji: '💠', color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40' },
  card_credit: { label: 'Crédito', emoji: '💳', color: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  card_debit:  { label: 'Débito',  emoji: '💳', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' },
  vr:          { label: 'VR',      emoji: '🍽️', color: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
};

const QUICK_RANGES = [
  { label: 'Hoje', days: 0 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: 'Tudo', days: 3650 },
];

export function SaqDepTab() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(today);
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Parse "yyyy-MM-dd" como data LOCAL (não UTC) para evitar deslocamento de fuso
  const parseLocalDate = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const { data: transactions = [], isLoading, refetch } = useQuery<CashTransaction[]>({
    queryKey: ['cash-transactions', 'saque', startDate, endDate],
    queryFn: async () => {
      const start = startOfDay(parseLocalDate(startDate)).toISOString();
      // Para o dia "hoje", estende o fim para "agora + 1min" para capturar saques recém-feitos
      // mesmo que o relógio do servidor tenha pequena diferença
      const isToday = endDate === today;
      const end = isToday
        ? new Date(Date.now() + 60_000).toISOString()
        : endOfDay(parseLocalDate(endDate)).toISOString();
      const { data, error } = await (supabase.rpc as any)('get_cash_transactions', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'saque',
      });
      if (error) throw error;
      return (data || []) as CashTransaction[];
    },
    refetchInterval: 15_000, // Refresh automático a cada 15s
  });

  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['saq-dep-summary'] });
    queryClient.invalidateQueries({ queryKey: ['session_summary'] });
  };

  const applyQuickRange = (days: number) => {
    setEndDate(today);
    setStartDate(format(subDays(new Date(), days), 'yyyy-MM-dd'));
  };

  const filtered = useMemo(() => {
    if (paymentFilter === 'all') return transactions;
    if (paymentFilter === 'unknown') return transactions.filter((t) => !t.payment_method);
    return transactions.filter((t) => t.payment_method === paymentFilter);
  }, [transactions, paymentFilter]);

  const totalSaques = filtered.reduce((s, t) => s + Number(t.amount), 0);
  const totalFees = filtered.reduce((s, t) => s + Number(t.fee), 0);
  const totalCobrado = totalSaques + totalFees;
  const semMetodo = transactions.filter((t) => !t.payment_method).length;

  // Breakdown por método
  const byMethod = useMemo(() => {
    const map: Record<string, { count: number; amount: number; fee: number; total: number }> = {};
    for (const t of filtered) {
      const k = t.payment_method || 'unknown';
      if (!map[k]) map[k] = { count: 0, amount: 0, fee: 0, total: 0 };
      map[k].count++;
      map[k].amount += Number(t.amount);
      map[k].fee += Number(t.fee);
      map[k].total += Number(t.total);
    }
    return map;
  }, [filtered]);

  const sessions = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => t.session_id && set.add(t.session_id));
    return set.size;
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ArrowUpFromLine className="h-6 w-6 text-red-500" />
            Saques
          </h2>
          <p className="text-muted-foreground text-sm">
            Cliente paga digital (PIX/Cartão/VR), leva dinheiro físico do caixa. Taxa: 50%
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <ArrowUpFromLine className="h-4 w-4 mr-2" /> Novo Saque
          </Button>
        </div>
      </div>

      {/* Period totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-red-500/10 border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4" /> Saques no período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{formatCurrency(totalSaques)}</div>
            <p className="text-xs text-muted-foreground">{filtered.length} operações em {sessions} sessões</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Taxas Recebidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalFees)}</div>
            <p className="text-xs text-muted-foreground">Receita digital de serviço (50%)</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Total Cobrado (digital)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{formatCurrency(totalCobrado)}</div>
            <p className="text-xs text-muted-foreground">Valor + taxa recebido digitalmente</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown por método */}
      {Object.keys(byMethod).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Detalhamento por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(byMethod).map(([method, m]) => {
                const meta = PAYMENT_LABELS[method] || { label: 'Sem método', emoji: '⚠️', color: 'bg-orange-500/15 text-orange-300 border-orange-500/40' };
                return (
                  <div key={method} className={`p-3 rounded-lg border ${meta.color}`}>
                    <div className="text-xs font-semibold flex items-center gap-1">
                      {meta.emoji} {meta.label}
                    </div>
                    <div className="text-lg font-bold mt-1 font-mono">{formatCurrency(m.total)}</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {m.count} op · saída {formatCurrency(m.amount)} + taxa {formatCurrency(m.fee)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert sem método */}
      {semMetodo > 0 && (
        <Card
          className="bg-orange-500/10 border-orange-500/40 cursor-pointer hover:bg-orange-500/20 transition-colors"
          onClick={() => setPaymentFilter('unknown')}
        >
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-orange-300">
                {semMetodo} saque(s) sem forma de pagamento — clique para revisar
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Saques antigos importados. Cruze com extratos para reconciliação.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map((r) => (
              <Button key={r.label} size="sm" variant="outline" onClick={() => applyQuickRange(r.days)}>
                {r.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> De
              </label>
              <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="w-auto" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Até
              </label>
              <Input type="date" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} className="w-auto" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Forma de pagamento</label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pix">💠 PIX</SelectItem>
                  <SelectItem value="card_credit">💳 Crédito</SelectItem>
                  <SelectItem value="card_debit">💳 Débito</SelectItem>
                  <SelectItem value="vr">🍽️ VR</SelectItem>
                  <SelectItem value="unknown">⚠️ Sem método</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards detalhados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Histórico de Saques</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({filtered.length} de {transactions.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum saque encontrado no período/filtro selecionado
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((tx) => {
                const meta = tx.payment_method
                  ? PAYMENT_LABELS[tx.payment_method] || { label: tx.payment_method, emoji: '❓', color: 'bg-muted text-foreground border-border' }
                  : { label: 'Sem método', emoji: '⚠️', color: 'bg-orange-500/15 text-orange-300 border-orange-500/40' };
                return (
                  <Card key={tx.id} className="border-2 hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge className={`${meta.color} border text-xs px-2 py-0.5`}>
                            {meta.emoji} {meta.label}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(tx.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold font-mono text-blue-400">
                            {formatCurrency(Number(tx.total))}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">cobrado digital</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5 pt-0">
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                          <div className="text-[10px] text-red-300 uppercase font-semibold">Saiu do caixa</div>
                          <div className="font-mono font-bold text-red-400">- {formatCurrency(Number(tx.amount))}</div>
                        </div>
                        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30">
                          <div className="text-[10px] text-amber-300 uppercase font-semibold">Taxa (50%)</div>
                          <div className="font-mono font-bold text-amber-400">+ {formatCurrency(Number(tx.fee))}</div>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>Resp.: <span className="text-foreground font-medium">{tx.responsible}</span></span>
                        </div>
                        {tx.session_id && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Wallet className="h-3 w-3" />
                            <span>Sessão: <span className="font-mono text-foreground">{tx.session_id.slice(0, 8)}</span></span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Hash className="h-3 w-3" />
                          <span className="font-mono text-[10px]">{tx.id.slice(0, 8)}</span>
                        </div>
                        {tx.notes && (
                          <div className="flex items-start gap-2 text-muted-foreground pt-1 border-t mt-1">
                            <StickyNote className="h-3 w-3 mt-0.5" />
                            <span className="italic text-foreground">{tx.notes}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SaqDepModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </div>
  );
}
