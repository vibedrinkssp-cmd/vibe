import { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, BarChart, Bar, Cell, ReferenceLine, ReferenceArea
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, TrendingDown, Activity, Target, Zap, Clock, Calendar, Brain, AlertTriangle } from 'lucide-react';
import {
  analyzeHourlyPatterns, findPeakWindows, buildDayHourMatrix,
  forecastDailyRevenue, groupByDay, analyzeWeekdayPatterns,
  projectTrend, DOW_LABELS, type OrderLike,
} from '@/lib/predictive-analytics';

interface PredictiveProjectionsTabProps {
  orders: OrderLike[];
  allOrdersUnfiltered: OrderLike[];
  metrics: any;
  formatCurrency: (n: number) => string;
}

export function PredictiveProjectionsTab({
  orders,
  allOrdersUnfiltered,
  metrics,
  formatCurrency,
}: PredictiveProjectionsTabProps) {
  // Análise horária — usa todo o histórico para mais robustez
  const hourStats = useMemo(() => analyzeHourlyPatterns(allOrdersUnfiltered), [allOrdersUnfiltered]);
  const peakWindows = useMemo(() => findPeakWindows(hourStats, 60), [hourStats]);
  const matrix = useMemo(() => buildDayHourMatrix(allOrdersUnfiltered), [allOrdersUnfiltered]);
  const weekdayPatterns = useMemo(() => analyzeWeekdayPatterns(allOrdersUnfiltered), [allOrdersUnfiltered]);

  // Forecast de receita — período selecionado
  const dailySeries = useMemo(() => groupByDay(orders), [orders]);
  const forecast30 = useMemo(() => forecastDailyRevenue(dailySeries, 30), [dailySeries]);

  // Projeções de tendência (todo o histórico, mais confiável)
  const allDailySeries = useMemo(() => groupByDay(allOrdersUnfiltered), [allOrdersUnfiltered]);
  const proj7 = useMemo(() => projectTrend(allDailySeries, 7, 'Próximos 7 dias'), [allDailySeries]);
  const proj30 = useMemo(() => projectTrend(allDailySeries, 30, 'Próximos 30 dias'), [allDailySeries]);
  const proj90 = useMemo(() => projectTrend(allDailySeries, 90, 'Próximos 90 dias'), [allDailySeries]);

  // Próximas 6 horas — qual é a probabilidade?
  const nextHours = useMemo(() => {
    const now = new Date().getHours();
    const list: Array<{ hour: number; label: string; probability: number; expectedRevenue: number; expectedOrders: number }> = [];
    for (let i = 0; i < 6; i++) {
      const h = (now + i) % 24;
      const stat = hourStats[h];
      list.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}h`,
        probability: stat.probability,
        expectedRevenue: stat.avgRevenue,
        expectedOrders: stat.avgOrders,
      });
    }
    return list;
  }, [hourStats]);

  const hourChartData = hourStats.map(s => ({
    hour: `${String(s.hour).padStart(2, '0')}h`,
    receita: Math.round(s.avgRevenue),
    pedidos: Number(s.avgOrders.toFixed(1)),
    probabilidade: s.probability,
    confLow: Math.round(s.confidenceLow),
    confHigh: Math.round(s.confidenceHigh),
    intervalo: Math.round(s.confidenceHigh - s.confidenceLow),
  }));

  const weekdayChartData = weekdayPatterns.map(p => ({
    dia: p.name.slice(0, 3),
    receita: Math.round(p.avgRevenue),
    pedidos: Math.round(p.avgOrders),
    probabilidade: p.probabilityBest,
    desvio: Math.round(p.stdDev),
  }));

  const forecastChartData = forecast30.map(p => ({
    dia: p.label,
    real: p.actual ? Math.round(p.actual) : null,
    previsto: p.forecast ? Math.round(p.forecast) : null,
    upper: p.upperBound ? Math.round(p.upperBound) : null,
    lower: p.lowerBound ? Math.round(p.lowerBound) : null,
  }));

  // Heatmap data
  const heatmapMax = Math.max(...matrix.map(m => m.avgRevenue), 1);

  const totalDataPoints = allOrdersUnfiltered.length;
  const dataQuality = totalDataPoints < 50 ? 'Baixa' : totalDataPoints < 200 ? 'Média' : 'Alta';
  const qualityColor = totalDataPoints < 50 ? 'text-amber-400' : totalDataPoints < 200 ? 'text-blue-400' : 'text-green-400';

  return (
    <div className="space-y-4">
      {/* HEADER COM QUALIDADE */}
      <Card className="border-purple-500/30 bg-gradient-to-br from-purple-950/40 to-indigo-950/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            Inteligência Preditiva — Probabilidade & Estatística
          </CardTitle>
          <CardDescription className="text-xs flex items-center gap-3 flex-wrap">
            <span>Modelos: Holt-Winters · Regressão Linear · IC 95% (Z=1.96)</span>
            <Badge variant="outline" className={qualityColor}>
              Qualidade dos dados: {dataQuality} ({totalDataPoints} pedidos)
            </Badge>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* PRÓXIMAS HORAS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Próximas 6 horas — Previsão em tempo real
          </CardTitle>
          <CardDescription className="text-xs">
            Receita esperada e probabilidade de pico baseada no histórico completo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {nextHours.map((nh, idx) => {
              const isHigh = nh.probability >= 70;
              const isMed = nh.probability >= 40;
              const colorClass = isHigh
                ? 'border-red-500/40 bg-red-500/10'
                : isMed
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-border/40 bg-muted/20';
              return (
                <div key={idx} className={`rounded-lg border-2 p-3 text-center ${colorClass}`}>
                  <div className="text-xs text-muted-foreground">{idx === 0 ? 'AGORA' : `+${idx}h`}</div>
                  <div className="text-lg font-bold">{nh.label}</div>
                  <div className="text-sm font-semibold mt-1">{formatCurrency(nh.expectedRevenue)}</div>
                  <div className="text-xs text-muted-foreground">{nh.expectedOrders.toFixed(1)} ped.</div>
                  <Badge
                    className={`mt-2 text-xs ${
                      isHigh ? 'bg-red-500/30 text-red-200' : isMed ? 'bg-amber-500/30 text-amber-200' : 'bg-muted'
                    }`}
                  >
                    {nh.probability}% pico
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* PROJEÇÕES COM TENDÊNCIA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[proj7, proj30, proj90].map((p, i) => (
          <TrendProjectionCard key={i} projection={p} formatCurrency={formatCurrency} />
        ))}
      </div>

      {/* GRÁFICO DE PREVISÃO COM BANDA DE CONFIANÇA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Forecast de Receita — Próximos 30 dias com IC 95%
          </CardTitle>
          <CardDescription className="text-xs">
            Modelo Holt-Winters. A área sombreada representa o intervalo de confiança estatística
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={forecastChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={10} interval="preserveStartEnd" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                formatter={(v: any) => v !== null ? formatCurrency(v) : '-'}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="upper" stroke="none" fill="#8b5cf6" fillOpacity={0.15} name="IC superior" />
              <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(var(--background))" name="IC inferior" />
              <Line type="monotone" dataKey="real" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Histórico real" />
              <Line type="monotone" dataKey="previsto" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} name="Previsão" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* PROBABILIDADE POR HORA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-pink-400" />
            Probabilidade de Pico por Horário (24h)
          </CardTitle>
          <CardDescription className="text-xs">
            Cada barra mostra a probabilidade relativa daquele horário ser de alta receita. Linha = receita média esperada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={hourChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="right" dataKey="probabilidade" name="Probabilidade %" radius={[4, 4, 0, 0]}>
                {hourChartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.probabilidade >= 70 ? '#ef4444' : entry.probabilidade >= 40 ? '#f59e0b' : '#6366f1'}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
              <Line yAxisId="left" type="monotone" dataKey="receita" stroke="#22c55e" strokeWidth={2} name="Receita média (R$)" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* JANELAS DE PICO */}
      {peakWindows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Janelas de Pico Identificadas (probabilidade ≥ 60%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {peakWindows.slice(0, 6).map((w, idx) => (
                <div key={idx} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-amber-500/30 text-amber-200">#{idx + 1}</Badge>
                    <span className="text-xs text-muted-foreground">{w.probability}% prob.</span>
                  </div>
                  <div className="text-lg font-bold">
                    {String(w.startHour).padStart(2, '0')}h — {String(w.endHour).padStart(2, '0')}h
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Receita esperada: <span className="text-foreground font-semibold">{formatCurrency(w.avgRevenue)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">~{w.totalOrders} pedidos no período</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DIA DA SEMANA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            Padrão Semanal — Probabilidade e Variabilidade
          </CardTitle>
          <CardDescription className="text-xs">
            Receita média por dia da semana com desvio padrão (volatilidade)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={weekdayChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                formatter={(v: any, name: string) => name === 'Probabilidade' ? `${v}%` : formatCurrency(v)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="receita" name="Receita média" radius={[4, 4, 0, 0]}>
                {weekdayChartData.map((e, i) => (
                  <Cell key={i} fill={e.probabilidade >= 80 ? '#22c55e' : e.probabilidade >= 50 ? '#3b82f6' : '#6366f1'} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="desvio" stroke="#f59e0b" strokeWidth={2} name="Desvio padrão (volatilidade)" />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-7 gap-2 mt-4">
            {weekdayPatterns.map(p => (
              <div key={p.dow} className="text-center p-2 rounded border border-border/40">
                <div className="text-xs text-muted-foreground">{p.name.slice(0, 3)}</div>
                <div className="text-xs font-bold text-amber-400">#{p.rank}</div>
                <div className="text-xs">{p.probabilityBest}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* HEATMAP */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Heatmap — Dia da Semana × Hora
          </CardTitle>
          <CardDescription className="text-xs">
            Intensidade de receita média. Identifique padrões cruzados entre dia e horário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid gap-px" style={{ gridTemplateColumns: '60px repeat(24, 1fr)' }}>
                <div></div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-[9px] text-center text-muted-foreground">
                    {h}
                  </div>
                ))}
                {DOW_LABELS.map((day, dow) => (
                  <>
                    <div key={`label-${dow}`} className="text-xs text-muted-foreground flex items-center pr-2">
                      {day.slice(0, 3)}
                    </div>
                    {Array.from({ length: 24 }, (_, h) => {
                      const cell = matrix.find(m => m.dow === dow && m.hour === h);
                      const intensity = cell?.intensity || 0;
                      const opacity = Math.max(0.05, intensity);
                      return (
                        <div
                          key={`${dow}-${h}`}
                          className="aspect-square rounded-sm border border-border/20 cursor-help transition-transform hover:scale-125 hover:z-10"
                          style={{
                            backgroundColor: `hsla(280, 70%, 50%, ${opacity})`,
                          }}
                          title={`${day} ${h}h\n${formatCurrency(cell?.avgRevenue || 0)}\n${(cell?.avgOrders || 0).toFixed(1)} ped.`}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-3 text-xs text-muted-foreground">
            <span>Baixo</span>
            <div className="flex gap-px">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                <div
                  key={o}
                  className="w-4 h-4 rounded-sm"
                  style={{ backgroundColor: `hsla(280, 70%, 50%, ${o})` }}
                />
              ))}
            </div>
            <span>Alto</span>
          </div>
        </CardContent>
      </Card>

      {/* INSIGHTS PREDITIVOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            Insights Preditivos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {peakWindows[0] && (
            <InsightLine
              icon={<Zap className="w-4 h-4 text-amber-400" />}
              text={`Melhor janela do dia: ${String(peakWindows[0].startHour).padStart(2, '0')}h — ${String(peakWindows[0].endHour).padStart(2, '0')}h. Reforce equipe e estoque.`}
            />
          )}
          {weekdayPatterns.length > 0 && (
            <InsightLine
              icon={<Calendar className="w-4 h-4 text-blue-400" />}
              text={`Melhor dia: ${weekdayPatterns.find(p => p.rank === 1)?.name}. Pior dia: ${weekdayPatterns.find(p => p.rank === 7)?.name}. Diferença: ${formatCurrency((weekdayPatterns.find(p => p.rank === 1)?.avgRevenue || 0) - (weekdayPatterns.find(p => p.rank === 7)?.avgRevenue || 0))}.`}
            />
          )}
          {proj30.trendPercent > 5 && (
            <InsightLine
              icon={<TrendingUp className="w-4 h-4 text-green-400" />}
              text={`Tendência POSITIVA: receita crescendo ${proj30.trendPercent.toFixed(1)}% comparando metade recente vs inicial.`}
            />
          )}
          {proj30.trendPercent < -5 && (
            <InsightLine
              icon={<TrendingDown className="w-4 h-4 text-red-400" />}
              text={`Tendência NEGATIVA: receita caindo ${Math.abs(proj30.trendPercent).toFixed(1)}%. Ação corretiva recomendada.`}
            />
          )}
          {proj30.confidence < 40 && (
            <InsightLine
              icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
              text={`Baixa confiabilidade do modelo (R²=${proj30.confidence}%). Dados muito voláteis — projeções devem ser usadas como referência ampla.`}
            />
          )}
          {proj30.confidence >= 70 && (
            <InsightLine
              icon={<Target className="w-4 h-4 text-green-400" />}
              text={`Alta confiabilidade do modelo (R²=${proj30.confidence}%). Padrão estatístico bem estabelecido.`}
            />
          )}
          <InsightLine
            icon={<Activity className="w-4 h-4 text-cyan-400" />}
            text={`Receita esperada nos próximos 30 dias: ${formatCurrency(proj30.expectedRevenue)} (entre ${formatCurrency(proj30.pessimistic)} e ${formatCurrency(proj30.optimistic)}).`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TrendProjectionCard({ projection, formatCurrency }: { projection: any; formatCurrency: (n: number) => string }) {
  const isPositive = projection.trendPercent >= 0;
  return (
    <Card className="border-purple-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">{projection.period}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-xl font-bold">{formatCurrency(projection.expectedRevenue)}</div>
        <div className="text-xs text-muted-foreground">
          Faixa: {formatCurrency(projection.pessimistic)} — {formatCurrency(projection.optimistic)}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <Badge variant="outline" className={isPositive ? 'text-green-400 border-green-500/40' : 'text-red-400 border-red-500/40'}>
            {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {isPositive ? '+' : ''}{projection.trendPercent.toFixed(1)}%
          </Badge>
          <Badge variant="outline" className="text-xs">
            R²={projection.confidence}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/20">
      <div className="mt-0.5">{icon}</div>
      <span className="flex-1">{text}</span>
    </div>
  );
}
