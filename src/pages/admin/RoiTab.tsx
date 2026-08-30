import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Target, TrendingUp, Calendar, Sparkles, Trophy,
  Rocket, PiggyBank, Heart, Lightbulb, ArrowUp, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY_INVESTMENT = '__roi_investment_total';
const STORAGE_KEY_START = '__roi_start_date';

interface Props {
  metrics: any;
  allProducts: any[];
  allOrderItems: any[];
  allOrders: any[];
  formatCurrency: (n: number) => string;
}

// Round to nearest .X0 or .X9 (psicologia de preço)
function smartRoundCents(value: number): number {
  // Mantém centavos psicológicos (.90, .99, .50)
  const rounded = Math.round(value * 100) / 100;
  const cents = Math.round((rounded - Math.floor(rounded)) * 100);
  // Se já tá em terminação boa, mantém
  if ([0, 50, 90, 99].includes(cents)) return rounded;
  // Sobe pra próxima terminação .90
  const integerPart = Math.floor(rounded);
  if (cents < 50) return integerPart + 0.50;
  if (cents < 90) return integerPart + 0.90;
  return integerPart + 1 + 0.00;
}

export function RoiTab({ metrics, allProducts, allOrderItems, allOrders, formatCurrency }: Props) {
  const [investment, setInvestment] = useState<number>(() => {
    if (typeof window === 'undefined') return 100000;
    const v = Number(localStorage.getItem(STORAGE_KEY_INVESTMENT));
    return v > 0 ? v : 100000;
  });
  const [startDate, setStartDate] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY_START) || new Date().toISOString().slice(0, 10);
  });
  const [adjustmentIntensity, setAdjustmentIntensity] = useState<number[]>([50]); // 0-100 (suave -> agressivo)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INVESTMENT, String(investment));
  }, [investment]);

  useEffect(() => {
    if (startDate) localStorage.setItem(STORAGE_KEY_START, startDate);
  }, [startDate]);

  // ===== ACUMULADO HISTÓRICO DE LUCRO =====
  // Usa todos os pedidos desde a data de início do investimento
  const accumulated = useMemo(() => {
    const start = startDate ? new Date(startDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const validOrders = (allOrders || []).filter(o => {
      if (!o.created_at || o.status === 'cancelled') return false;
      return new Date(o.created_at) >= start;
    });
    const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const margin = metrics.totalSales > 0 ? metrics.grossProfit / metrics.totalSales : 0.4;
    const accumulatedProfit = totalRevenue * margin;

    const daysSinceStart = Math.max(1, Math.ceil(
      (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
    ));
    const dailyAvgProfit = accumulatedProfit / daysSinceStart;
    const monthlyAvgProfit = dailyAvgProfit * 30;

    return { totalRevenue, accumulatedProfit, daysSinceStart, dailyAvgProfit, monthlyAvgProfit, ordersCount: validOrders.length };
  }, [allOrders, startDate, metrics.totalSales, metrics.grossProfit]);

  // ===== PROGRESSO DO ROI =====
  const roiProgress = Math.min(100, (accumulated.accumulatedProfit / investment) * 100);
  const remaining = Math.max(0, investment - accumulated.accumulatedProfit);
  const daysToBreakeven = accumulated.dailyAvgProfit > 0
    ? Math.ceil(remaining / accumulated.dailyAvgProfit)
    : Infinity;
  const breakevenDate = isFinite(daysToBreakeven)
    ? new Date(Date.now() + daysToBreakeven * 86400000)
    : null;

  // ===== ANÁLISE DE PRODUTOS PARA REAJUSTE INTELIGENTE =====
  const adjustmentSuggestions = useMemo(() => {
    // Conta vendas dos últimos 90 dias (ou tudo se faltar dado)
    const cutoff = Date.now() - 90 * 86400000;
    const recentOrderIds = new Set(
      (allOrders || [])
        .filter(o => o.created_at && o.status !== 'cancelled' && new Date(o.created_at).getTime() >= cutoff)
        .map(o => o.id)
    );
    const sales: Record<string, { qty: number; revenue: number }> = {};
    (allOrderItems || []).forEach(item => {
      if (!recentOrderIds.has(item.order_id)) return;
      if (!item.product_id) return;
      if (!sales[item.product_id]) sales[item.product_id] = { qty: 0, revenue: 0 };
      sales[item.product_id].qty += Number(item.quantity || 0);
      sales[item.product_id].revenue += Number(item.total_price || 0);
    });

    const intensity = adjustmentIntensity[0] / 100; // 0..1

    const allQtys = Object.values(sales).map(s => s.qty).sort((a, b) => b - a);
    const top20Threshold = allQtys[Math.floor(allQtys.length * 0.2)] || 0;
    const bottom50Threshold = allQtys[Math.floor(allQtys.length * 0.5)] || 0;

    const suggestions = (allProducts || [])
      .filter(p => p.is_active && Number(p.sale_price) > 0)
      .map(p => {
        const sale = sales[p.id] || { qty: 0, revenue: 0 };
        const currentPrice = Number(p.sale_price);

        // Estratégia: produtos top vendidos = subir MUITO POUCO (cliente é sensível)
        // Produtos pouco vendidos = subir mais (cliente menos sensível, ou produto mal precificado)
        let pctIncrease: number;
        let reason: string;
        let category: 'top' | 'medio' | 'baixo' | 'parado';

        if (sale.qty === 0) {
          pctIncrease = 0; // não mexe em produto parado, problema é outro
          reason = 'Sem vendas — analisar visibilidade antes';
          category = 'parado';
        } else if (sale.qty >= top20Threshold && top20Threshold > 0) {
          pctIncrease = 0.5 + intensity * 1.0; // 0.5% a 1.5%
          reason = 'Campeão de vendas — reajuste sutil';
          category = 'top';
        } else if (sale.qty >= bottom50Threshold) {
          pctIncrease = 1.5 + intensity * 2.0; // 1.5% a 3.5%
          reason = 'Vendas médias — reajuste moderado';
          category = 'medio';
        } else {
          pctIncrease = 3.0 + intensity * 4.0; // 3% a 7%
          reason = 'Pouca rotatividade — reajuste maior';
          category = 'baixo';
        }

        const rawNewPrice = currentPrice * (1 + pctIncrease / 100);
        const newPrice = smartRoundCents(rawNewPrice);
        const realIncrease = newPrice - currentPrice;
        const realPct = currentPrice > 0 ? (realIncrease / currentPrice) * 100 : 0;
        // Ganho mensal estimado = aumento * (qty / 3 meses)
        const monthlyExtra = realIncrease * (sale.qty / 3);

        return {
          id: p.id,
          name: p.name,
          currentPrice,
          newPrice,
          realIncrease,
          realPct,
          qty90d: sale.qty,
          monthlyExtra,
          reason,
          category,
        };
      })
      .filter(s => s.realIncrease > 0)
      .sort((a, b) => b.monthlyExtra - a.monthlyExtra);

    const totalMonthlyExtra = suggestions.reduce((s, x) => s + x.monthlyExtra, 0);

    return { list: suggestions, totalMonthlyExtra };
  }, [allProducts, allOrderItems, allOrders, adjustmentIntensity]);

  // ===== SIMULAÇÃO DE PAYBACK COM REAJUSTE =====
  const simulatedMonthlyProfit = accumulated.monthlyAvgProfit + adjustmentSuggestions.totalMonthlyExtra;
  const monthsWithoutAdjust = accumulated.monthlyAvgProfit > 0 ? remaining / accumulated.monthlyAvgProfit : Infinity;
  const monthsWithAdjust = simulatedMonthlyProfit > 0 ? remaining / simulatedMonthlyProfit : Infinity;
  const monthsSaved = monthsWithoutAdjust - monthsWithAdjust;

  // ===== MILESTONES =====
  const milestones = [
    { pct: 10, label: '10% — Primeiro fôlego', icon: '🌱' },
    { pct: 25, label: '25% — Quartal conquistado', icon: '💪' },
    { pct: 50, label: '50% — Metade do caminho!', icon: '🚀' },
    { pct: 75, label: '75% — Reta final', icon: '⭐' },
    { pct: 100, label: '100% — INVESTIMENTO RECUPERADO', icon: '🏆' },
  ];

  return (
    <div className="space-y-4">
      {/* CABEÇALHO MOTIVACIONAL */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-purple-500/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-400" />
                Sua jornada de retorno
              </CardTitle>
              <CardDescription className="mt-1">
                Investimento aplicado com coragem — agora vamos acompanhar cada centavo voltando 💜
              </CardDescription>
            </div>
            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-3 h-3 mr-1" /> Painel ROI
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor investido na reformulação (R$)</Label>
              <Input
                type="number"
                value={investment}
                onChange={e => setInvestment(Number(e.target.value) || 0)}
                className="text-lg font-bold"
              />
            </div>
            <div>
              <Label className="text-xs">Início da contagem (data do investimento)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {/* PROGRESS BAR PRINCIPAL */}
          <div className="space-y-2">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Já recuperado</p>
                <p className="text-3xl font-black text-green-400">
                  {formatCurrency(accumulated.accumulatedProfit)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Meta</p>
                <p className="text-2xl font-bold">{formatCurrency(investment)}</p>
              </div>
            </div>

            <div className="relative">
              <Progress value={roiProgress} className="h-6" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold mix-blend-difference text-white drop-shadow">
                  {roiProgress.toFixed(2)}% recuperado
                </span>
              </div>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Falta: <strong className="text-foreground">{formatCurrency(remaining)}</strong></span>
              <span>{accumulated.daysSinceStart} dias rodando</span>
            </div>
          </div>

          {/* MENSAGEM MOTIVACIONAL */}
          <div className="p-3 rounded-lg bg-background/50 border border-primary/20">
            {roiProgress >= 100 ? (
              <p className="text-sm text-green-400 font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4" /> 🏆 PARABÉNS! Você recuperou TODO o investimento. Daqui pra frente é lucro puro!
              </p>
            ) : roiProgress >= 75 ? (
              <p className="text-sm text-amber-300 flex items-center gap-2">
                <Rocket className="w-4 h-4" /> Reta final! Mais um empurrãozinho e o investimento volta inteiro.
              </p>
            ) : roiProgress >= 50 ? (
              <p className="text-sm text-blue-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Você já passou da metade. O ritmo é seu — está dando certo.
              </p>
            ) : roiProgress >= 25 ? (
              <p className="text-sm text-purple-300 flex items-center gap-2">
                <PiggyBank className="w-4 h-4" /> Já tem um quarto recuperado. Constância vence pressa.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-400" /> Todo gigante começa pequeno. O importante é que o caixa já está devolvendo.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PROJEÇÃO DE TEMPO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-4 h-4" /> Lucro médio mensal
            </div>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {formatCurrency(accumulated.monthlyAvgProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Baseado nos últimos {accumulated.daysSinceStart} dias
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="w-4 h-4" /> Tempo até recuperar tudo
            </div>
            <p className="text-2xl font-bold text-blue-400 mt-1">
              {isFinite(daysToBreakeven)
                ? daysToBreakeven > 365
                  ? `${(daysToBreakeven / 365).toFixed(1)} anos`
                  : daysToBreakeven > 30
                  ? `${(daysToBreakeven / 30).toFixed(1)} meses`
                  : `${daysToBreakeven} dias`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {breakevenDate ? `Previsão: ${breakevenDate.toLocaleDateString('pt-BR')}` : 'Aumente o lucro mensal'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="w-4 h-4" /> Velocidade diária
            </div>
            <p className="text-2xl font-bold text-purple-400 mt-1">
              {formatCurrency(accumulated.dailyAvgProfit)}/dia
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {accumulated.ordersCount} pedidos no período
            </p>
          </CardContent>
        </Card>
      </div>

      {/* MILESTONES */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> Conquistas no caminho
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {milestones.map(m => {
              const reached = roiProgress >= m.pct;
              return (
                <div
                  key={m.pct}
                  className={cn(
                    'p-2 rounded-lg border text-center transition-all',
                    reached
                      ? 'bg-green-500/10 border-green-500/40'
                      : 'bg-muted/30 border-border opacity-50'
                  )}
                >
                  <div className="text-2xl">{reached ? m.icon : '🔒'}</div>
                  <p className="text-[10px] font-semibold mt-1">{m.label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* SIMULADOR DE REAJUSTE INTELIGENTE */}
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" /> Reajuste inteligente em centavos
          </CardTitle>
          <CardDescription className="text-xs">
            Sugestões equilibradas: produtos campeões sobem pouco (cliente sensível), produtos parados sobem mais.
            Tudo arredondado em terminações psicológicas (.50 / .90).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Slider de intensidade */}
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Intensidade do reajuste</span>
              <span className="font-bold">
                {adjustmentIntensity[0] < 30 ? '🌱 Suave' : adjustmentIntensity[0] < 70 ? '⚖️ Moderado' : '🔥 Agressivo'}
              </span>
            </div>
            <Slider
              value={adjustmentIntensity}
              onValueChange={setAdjustmentIntensity}
              max={100}
              step={5}
            />
          </div>

          {/* Resumo da simulação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-xs text-muted-foreground">Receita extra mensal estimada</p>
              <p className="text-xl font-bold text-emerald-400">
                +{formatCurrency(adjustmentSuggestions.totalMonthlyExtra)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {adjustmentSuggestions.list.length} produtos ajustados
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs text-muted-foreground">Tempo p/ ROI sem reajuste</p>
              <p className="text-xl font-bold text-blue-400">
                {isFinite(monthsWithoutAdjust)
                  ? monthsWithoutAdjust > 12
                    ? `${(monthsWithoutAdjust / 12).toFixed(1)} anos`
                    : `${monthsWithoutAdjust.toFixed(1)} meses`
                  : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <p className="text-xs text-muted-foreground">Tempo p/ ROI COM reajuste</p>
              <p className="text-xl font-bold text-purple-400">
                {isFinite(monthsWithAdjust)
                  ? monthsWithAdjust > 12
                    ? `${(monthsWithAdjust / 12).toFixed(1)} anos`
                    : `${monthsWithAdjust.toFixed(1)} meses`
                  : '—'}
              </p>
              {isFinite(monthsSaved) && monthsSaved > 0 && (
                <p className="text-[10px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" /> Economiza {monthsSaved.toFixed(1)} meses!
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Tabela de sugestões */}
          <div>
            <p className="text-xs font-semibold mb-2">Top sugestões (ordenadas por ganho mensal):</p>
            <ScrollArea className="h-80 border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs">Produto</TableHead>
                    <TableHead className="text-xs text-right">Atual</TableHead>
                    <TableHead className="text-xs text-right">Sugerido</TableHead>
                    <TableHead className="text-xs text-right">Δ</TableHead>
                    <TableHead className="text-xs text-right">Vendas 90d</TableHead>
                    <TableHead className="text-xs text-right">+R$/mês</TableHead>
                    <TableHead className="text-xs">Categoria</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustmentSuggestions.list.slice(0, 50).map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">
                        {formatCurrency(s.currentPrice)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-bold text-emerald-400">
                        {formatCurrency(s.newPrice)}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        +{formatCurrency(s.realIncrease)}
                        <span className="text-muted-foreground ml-1">({s.realPct.toFixed(1)}%)</span>
                      </TableCell>
                      <TableCell className="text-xs text-right">{s.qty90d}</TableCell>
                      <TableCell className="text-xs text-right font-semibold text-emerald-300">
                        +{formatCurrency(s.monthlyExtra)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            'text-[10px]',
                            s.category === 'top' && 'bg-green-500/20 text-green-300 border-green-500/30',
                            s.category === 'medio' && 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                            s.category === 'baixo' && 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                            s.category === 'parado' && 'bg-muted text-muted-foreground'
                          )}
                        >
                          {s.category === 'top' && '🏆 Campeão'}
                          {s.category === 'medio' && '⚖️ Médio'}
                          {s.category === 'baixo' && '🐢 Baixo giro'}
                          {s.category === 'parado' && '😴 Parado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {adjustmentSuggestions.list.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                        Sem sugestões — colete mais dados de vendas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
            <p className="text-[10px] text-muted-foreground mt-2">
              💡 As sugestões são informativas. Aplique manualmente em Produtos / Edição Rápida revisando caso a caso.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
