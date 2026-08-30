/**
 * Biblioteca de Análise Preditiva e Estatística
 * Usada no painel Financeiro para projeções e previsões de pico
 */

export interface OrderLike {
  created_at?: string | null;
  total: number | string;
  status?: string;
}

export interface HourStat {
  hour: number;
  avgRevenue: number;
  avgOrders: number;
  stdDev: number;
  probability: number; // 0-100, probabilidade de ser horário de pico
  confidenceLow: number;
  confidenceHigh: number;
  sampleSize: number;
}

export interface DayHourMatrix {
  dow: number; // 0=Dom, 6=Sab
  hour: number;
  avgRevenue: number;
  avgOrders: number;
  occurrences: number;
  intensity: number; // 0-1 normalizado
}

export interface ForecastPoint {
  label: string;
  date: Date;
  actual?: number;
  forecast?: number;
  upperBound?: number;
  lowerBound?: number;
  isHistorical: boolean;
}

export interface PeakWindow {
  startHour: number;
  endHour: number;
  avgRevenue: number;
  totalOrders: number;
  probability: number;
  daysOfWeek: string[];
}

const DOW_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// =============================================================
// FUNÇÕES ESTATÍSTICAS BASE
// =============================================================

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Regressão Linear Simples — y = a + b*x
 * Retorna coeficientes e R² (qualidade do ajuste)
 */
export function linearRegression(x: number[], y: number[]): { a: number; b: number; r2: number } {
  const n = x.length;
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  const mx = mean(x);
  const my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += Math.pow(x[i] - mx, 2);
  }
  const b = den === 0 ? 0 : num / den;
  const a = my - b * mx;
  // R²
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yPred = a + b * x[i];
    ssRes += Math.pow(y[i] - yPred, 2);
    ssTot += Math.pow(y[i] - my, 2);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { a, b, r2 };
}

/**
 * Média Móvel Exponencial (EMA) — dá mais peso aos dados recentes
 */
export function exponentialMovingAverage(values: number[], alpha = 0.3): number[] {
  if (!values.length) return [];
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(alpha * values[i] + (1 - alpha) * ema[i - 1]);
  }
  return ema;
}

/**
 * Suavização de Holt-Winters simplificada (nível + tendência)
 * Bom para forecast de séries com tendência
 */
export function holtForecast(values: number[], steps: number, alpha = 0.5, beta = 0.2): number[] {
  if (values.length < 2) return Array(steps).fill(values[0] || 0);
  let level = values[0];
  let trend = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const forecasts: number[] = [];
  for (let i = 1; i <= steps; i++) {
    forecasts.push(Math.max(0, level + i * trend));
  }
  return forecasts;
}

// =============================================================
// ANÁLISE DE HORÁRIOS DE PICO
// =============================================================

/**
 * Calcula estatísticas por hora do dia agregando todos os dias
 * Probabilidade = chance daquela hora estar no top 25% de receita
 */
export function analyzeHourlyPatterns(orders: OrderLike[]): HourStat[] {
  // Agrupa por (data + hora) para depois calcular médias por hora
  const buckets: Record<string, Record<number, { revenue: number; orders: number }>> = {};

  orders.forEach(o => {
    if (!o.created_at || o.status === 'cancelled') return;
    const d = new Date(o.created_at);
    const dateKey = d.toISOString().slice(0, 10);
    const hour = d.getHours();
    if (!buckets[dateKey]) buckets[dateKey] = {};
    if (!buckets[dateKey][hour]) buckets[dateKey][hour] = { revenue: 0, orders: 0 };
    buckets[dateKey][hour].revenue += Number(o.total) || 0;
    buckets[dateKey][hour].orders += 1;
  });

  const dates = Object.keys(buckets);
  const totalDays = dates.length || 1;

  // Para cada hora, junta todos os valores diários
  const stats: HourStat[] = [];
  for (let h = 0; h < 24; h++) {
    const dailyRevenues: number[] = [];
    const dailyOrders: number[] = [];
    dates.forEach(date => {
      const v = buckets[date][h];
      dailyRevenues.push(v?.revenue || 0);
      dailyOrders.push(v?.orders || 0);
    });
    const avgRevenue = mean(dailyRevenues);
    const sd = stdDev(dailyRevenues);
    const avgOrders = mean(dailyOrders);
    // Intervalo de confiança 95% (Z=1.96)
    const stdError = totalDays > 1 ? sd / Math.sqrt(totalDays) : 0;
    const ci = 1.96 * stdError;
    stats.push({
      hour: h,
      avgRevenue,
      avgOrders,
      stdDev: sd,
      probability: 0,
      confidenceLow: Math.max(0, avgRevenue - ci),
      confidenceHigh: avgRevenue + ci,
      sampleSize: totalDays,
    });
  }

  // Calcula probabilidade: percentil de cada hora dentro do conjunto
  const revenues = stats.map(s => s.avgRevenue);
  const maxR = Math.max(...revenues, 1);
  stats.forEach(s => {
    // probabilidade relativa ao máximo (0-100)
    s.probability = Math.round((s.avgRevenue / maxR) * 100);
  });

  return stats;
}

/**
 * Identifica janelas de pico contínuas (3+ horas com alta probabilidade)
 */
export function findPeakWindows(hourStats: HourStat[], threshold = 60): PeakWindow[] {
  const windows: PeakWindow[] = [];
  let currentStart = -1;
  let currentRevenue = 0;
  let currentOrders = 0;
  let currentProbSum = 0;

  for (let h = 0; h < 24; h++) {
    const isPeak = hourStats[h].probability >= threshold;
    if (isPeak) {
      if (currentStart === -1) currentStart = h;
      currentRevenue += hourStats[h].avgRevenue;
      currentOrders += hourStats[h].avgOrders;
      currentProbSum += hourStats[h].probability;
    } else if (currentStart !== -1) {
      const length = h - currentStart;
      if (length >= 1) {
        windows.push({
          startHour: currentStart,
          endHour: h - 1,
          avgRevenue: currentRevenue,
          totalOrders: Math.round(currentOrders),
          probability: Math.round(currentProbSum / length),
          daysOfWeek: [],
        });
      }
      currentStart = -1;
      currentRevenue = 0;
      currentOrders = 0;
      currentProbSum = 0;
    }
  }
  if (currentStart !== -1) {
    const length = 24 - currentStart;
    windows.push({
      startHour: currentStart,
      endHour: 23,
      avgRevenue: currentRevenue,
      totalOrders: Math.round(currentOrders),
      probability: Math.round(currentProbSum / length),
      daysOfWeek: [],
    });
  }

  return windows.sort((a, b) => b.avgRevenue - a.avgRevenue);
}

// =============================================================
// MATRIZ DIA DA SEMANA × HORA (HEATMAP)
// =============================================================

export function buildDayHourMatrix(orders: OrderLike[]): DayHourMatrix[] {
  const acc: Record<string, { revenue: number; orders: number; occurrences: Set<string> }> = {};
  orders.forEach(o => {
    if (!o.created_at || o.status === 'cancelled') return;
    const d = new Date(o.created_at);
    const dow = d.getDay();
    const hour = d.getHours();
    const key = `${dow}-${hour}`;
    const dateStr = d.toISOString().slice(0, 10);
    if (!acc[key]) acc[key] = { revenue: 0, orders: 0, occurrences: new Set() };
    acc[key].revenue += Number(o.total) || 0;
    acc[key].orders += 1;
    acc[key].occurrences.add(dateStr);
  });

  const matrix: DayHourMatrix[] = [];
  let maxRevenue = 0;
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${dow}-${hour}`;
      const v = acc[key];
      const occ = v?.occurrences.size || 0;
      const avgR = occ > 0 ? v.revenue / occ : 0;
      maxRevenue = Math.max(maxRevenue, avgR);
      matrix.push({
        dow,
        hour,
        avgRevenue: avgR,
        avgOrders: occ > 0 ? v.orders / occ : 0,
        occurrences: occ,
        intensity: 0,
      });
    }
  }
  matrix.forEach(m => {
    m.intensity = maxRevenue > 0 ? m.avgRevenue / maxRevenue : 0;
  });
  return matrix;
}

// =============================================================
// FORECAST DE RECEITA DIÁRIA
// =============================================================

/**
 * Gera previsão dos próximos N dias usando Holt + intervalo de confiança
 */
export function forecastDailyRevenue(
  historical: { date: Date; revenue: number }[],
  daysAhead: number
): ForecastPoint[] {
  const sorted = [...historical].sort((a, b) => a.date.getTime() - b.date.getTime());
  const values = sorted.map(d => d.revenue);

  const points: ForecastPoint[] = sorted.map(d => ({
    label: d.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    date: d.date,
    actual: d.revenue,
    isHistorical: true,
  }));

  if (values.length < 3) return points;

  const forecasts = holtForecast(values, daysAhead, 0.5, 0.2);
  // erro residual para banda de confiança
  const ema = exponentialMovingAverage(values, 0.3);
  const residuals = values.map((v, i) => v - ema[i]);
  const sigma = stdDev(residuals);

  const lastDate = sorted[sorted.length - 1].date;
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i + 1);
    const f = forecasts[i];
    // Banda cresce com a distância (raiz do tempo)
    const band = 1.96 * sigma * Math.sqrt(1 + i * 0.1);
    points.push({
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      date: d,
      forecast: Math.max(0, f),
      upperBound: Math.max(0, f + band),
      lowerBound: Math.max(0, f - band),
      isHistorical: false,
    });
  }
  return points;
}

/**
 * Agrupa pedidos por dia em uma série temporal
 */
export function groupByDay(orders: OrderLike[]): { date: Date; revenue: number }[] {
  const map: Record<string, number> = {};
  orders.forEach(o => {
    if (!o.created_at || o.status === 'cancelled') return;
    const d = new Date(o.created_at);
    const key = d.toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + (Number(o.total) || 0);
  });
  return Object.keys(map)
    .sort()
    .map(k => ({ date: new Date(k + 'T12:00:00'), revenue: map[k] }));
}

// =============================================================
// ANÁLISE POR DIA DA SEMANA
// =============================================================

export interface WeekdayPattern {
  dow: number;
  name: string;
  avgRevenue: number;
  avgOrders: number;
  stdDev: number;
  occurrences: number;
  rank: number; // 1=melhor
  probabilityBest: number;
}

export function analyzeWeekdayPatterns(orders: OrderLike[]): WeekdayPattern[] {
  const buckets: Record<number, Record<string, { revenue: number; orders: number }>> = {};
  for (let i = 0; i < 7; i++) buckets[i] = {};

  orders.forEach(o => {
    if (!o.created_at || o.status === 'cancelled') return;
    const d = new Date(o.created_at);
    const dow = d.getDay();
    const dateKey = d.toISOString().slice(0, 10);
    if (!buckets[dow][dateKey]) buckets[dow][dateKey] = { revenue: 0, orders: 0 };
    buckets[dow][dateKey].revenue += Number(o.total) || 0;
    buckets[dow][dateKey].orders += 1;
  });

  const patterns: WeekdayPattern[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const days = Object.values(buckets[dow]);
    const revenues = days.map(d => d.revenue);
    const orderCounts = days.map(d => d.orders);
    patterns.push({
      dow,
      name: DOW_NAMES[dow],
      avgRevenue: mean(revenues),
      avgOrders: mean(orderCounts),
      stdDev: stdDev(revenues),
      occurrences: days.length,
      rank: 0,
      probabilityBest: 0,
    });
  }

  // Ranking
  const sortedRev = [...patterns].sort((a, b) => b.avgRevenue - a.avgRevenue);
  sortedRev.forEach((p, i) => {
    const target = patterns.find(x => x.dow === p.dow)!;
    target.rank = i + 1;
  });

  const maxR = Math.max(...patterns.map(p => p.avgRevenue), 1);
  patterns.forEach(p => {
    p.probabilityBest = Math.round((p.avgRevenue / maxR) * 100);
  });

  return patterns;
}

// =============================================================
// PROJEÇÃO COM TENDÊNCIA + SAZONALIDADE
// =============================================================

export interface TrendProjection {
  period: string;
  daysAhead: number;
  expectedRevenue: number;
  optimistic: number;
  pessimistic: number;
  expectedOrders: number;
  trendPercent: number; // -X% / +X% vs período anterior
  confidence: number; // 0-100, qualidade do modelo (R²)
}

export function projectTrend(
  historical: { date: Date; revenue: number }[],
  daysAhead: number,
  label: string
): TrendProjection {
  if (historical.length < 3) {
    return {
      period: label,
      daysAhead,
      expectedRevenue: 0,
      optimistic: 0,
      pessimistic: 0,
      expectedOrders: 0,
      trendPercent: 0,
      confidence: 0,
    };
  }
  const values = historical.map(h => h.revenue);
  const x = historical.map((_, i) => i);
  const reg = linearRegression(x, values);
  const avgRecent = mean(values.slice(-Math.min(7, values.length)));
  const sigma = stdDev(values);

  // soma da projeção dos próximos `daysAhead` dias usando regressão linear
  let total = 0;
  for (let i = 1; i <= daysAhead; i++) {
    const proj = reg.a + reg.b * (values.length + i - 1);
    total += Math.max(0, proj);
  }
  // se confiança baixa (R² pequeno), usar média recente
  const confidence = Math.max(0, Math.min(100, Math.round(reg.r2 * 100)));
  const expectedRevenue = confidence < 30 ? avgRecent * daysAhead : total;
  const band = 1.96 * sigma * Math.sqrt(daysAhead) * 0.5;

  // tendência: comparar média dos últimos vs primeiros
  const half = Math.floor(values.length / 2);
  const avgFirst = mean(values.slice(0, half)) || 1;
  const avgLast = mean(values.slice(half));
  const trendPercent = ((avgLast - avgFirst) / avgFirst) * 100;

  return {
    period: label,
    daysAhead,
    expectedRevenue,
    optimistic: expectedRevenue + band,
    pessimistic: Math.max(0, expectedRevenue - band),
    expectedOrders: 0, // preenchido externamente se necessário
    trendPercent,
    confidence,
  };
}

export const DOW_LABELS = DOW_NAMES;
