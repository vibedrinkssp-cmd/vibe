import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  analyzeHourlyPatterns,
  analyzeWeekdayPatterns,
  type OrderLike,
} from '@/lib/predictive-analytics';
import {
  CalendarDays,
  UserPlus,
  Trash2,
  Printer,
  Sparkles,
  Truck,
  ChefHat,
  Wallet,
  Smartphone,
  TrendingUp,
} from 'lucide-react';

// ============================================================
// TIPOS
// ============================================================

type Position = 'logistica' | 'cozinha' | 'caixa' | 'pdv';

const POSITIONS: { key: Position; label: string; icon: any; color: string }[] = [
  { key: 'logistica', label: 'LOGÍSTICA', icon: Truck, color: 'bg-blue-500' },
  { key: 'cozinha', label: 'COZINHA', icon: ChefHat, color: 'bg-orange-500' },
  { key: 'caixa', label: 'CAIXA', icon: Wallet, color: 'bg-green-600' },
  { key: 'pdv', label: 'PDV', icon: Smartphone, color: 'bg-purple-600' },
];

interface ScheduleEmployee {
  id: string;
  name: string;
}

type Intensity = 'idle' | 'very_low' | 'low' | 'medium' | 'high';

interface ShiftBlock {
  date: string; // YYYY-MM-DD
  dow: number;
  startHour: number;
  endHour: number;
  intensity: Intensity;
  positions: Record<Position, string | null>; // employeeId or null
  expectedOrders: number;
  expectedRevenue: number;
  sacrificed: Position[]; // posições cortadas por baixo fluxo
}

const STORAGE_KEY = 'schedule_employees_v1';
const DOW_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

// ============================================================
// HELPERS
// ============================================================

function loadEmployees(): ScheduleEmployee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveEmployees(list: ScheduleEmployee[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Determina quantas posições preencher por intensidade.
// Como funcionários recebem por diária, em fluxo muito baixo cortamos posições
// para economizar — 1 pessoa cobre caixa+PDV; em fluxo ocioso, ninguém é escalado.
function positionsNeeded(intensity: Intensity): Position[] {
  // Hierarquia de importância (ordem de preenchimento):
  // 1º COZINHA (essencial — produção)
  // 2º CAIXA (pode acumular PDV se necessário)
  // 3º PDV (atendimento)
  // 4º LOGÍSTICA (menos crítico — pode ser absorvido)
  switch (intensity) {
    case 'idle': return [];
    case 'very_low': return ['cozinha']; // 1 pessoa: cozinha acumula caixa
    case 'low': return ['cozinha', 'caixa']; // caixa acumula PDV
    case 'medium': return ['cozinha', 'caixa', 'pdv'];
    case 'high': return ['cozinha', 'caixa', 'pdv', 'logistica'];
  }
}

const ALL_POSITION_KEYS: Position[] = ['logistica', 'cozinha', 'caixa', 'pdv'];

function intensityLabel(i: Intensity): string {
  return {
    idle: 'OCIOSO',
    very_low: 'MUITO BAIXO',
    low: 'BAIXO',
    medium: 'MÉDIO',
    high: 'PICO',
  }[i];
}

function intensityClass(i: Intensity): string {
  return {
    idle: 'b-idle',
    very_low: 'b-vlow',
    low: 'b-low',
    medium: 'b-medium',
    high: 'b-high',
  }[i];
}

// ============================================================
// COMPONENTE
// ============================================================

export function ScheduleTab() {
  const [employees, setEmployees] = useState<ScheduleEmployee[]>(loadEmployees);
  const [newName, setNewName] = useState('');
  const [period, setPeriod] = useState<'tomorrow' | 'week' | 'month'>('week');
  const [economyMode, setEconomyMode] = useState(true);
  const [maxPositions, setMaxPositions] = useState(4);
  // Sensibilidade de picos: 0 = muito conservador (precisa MUITOS pedidos pra virar pico/médio),
  // 50 = neutro, 100 = muito sensível (qualquer movimento já vira pico).
  const [sensitivity, setSensitivity] = useState(50);
  const [schedule, setSchedule] = useState<ShiftBlock[] | null>(null);

  // Ordem de prioridade para corte quando há limite máximo de posições
  // (mantemos cozinha > caixa > pdv > logistica)
  const POSITION_PRIORITY: Position[] = ['cozinha', 'caixa', 'pdv', 'logistica'];

  useEffect(() => saveEmployees(employees), [employees]);

  // Carrega histórico de pedidos para análise preditiva (últimos 60 dias)
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['schedule-orders-history'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_orders_complete');
      if (error) throw error;
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      return ((data || []) as any[])
        .filter(o => o.created_at && new Date(o.created_at).getTime() >= cutoff)
        .map(o => ({
          created_at: o.created_at,
          total: o.total,
          status: o.status,
        })) as OrderLike[];
    },
    staleTime: 5 * 60_000,
  });

  const hourStats = useMemo(() => analyzeHourlyPatterns(orders), [orders]);
  const weekdayStats = useMemo(() => analyzeWeekdayPatterns(orders), [orders]);

  // Adicionar funcionário
  const addEmployee = () => {
    const name = newName.trim().toUpperCase();
    if (!name) {
      // Auto-numerar
      const next = employees.length + 1;
      setEmployees([...employees, { id: crypto.randomUUID(), name: `FUNCIONÁRIO ${next}` }]);
    } else {
      setEmployees([...employees, { id: crypto.randomUUID(), name }]);
    }
    setNewName('');
  };

  const removeEmployee = (id: string) =>
    setEmployees(employees.filter(e => e.id !== id));

  const renameEmployee = (id: string, name: string) =>
    setEmployees(employees.map(e => (e.id === id ? { ...e, name: name.toUpperCase() } : e)));

  // ==========================================================
  // GERAÇÃO DE ESCALA
  // ==========================================================
  const generateSchedule = () => {
    if (employees.length === 0) {
      alert('Cadastre pelo menos 1 funcionário antes de gerar a escala.');
      return;
    }

    // Define datas alvo
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dates: Date[] = [];
    if (period === 'tomorrow') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      dates.push(d);
    } else if (period === 'week') {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        dates.push(d);
      }
    } else {
      for (let i = 1; i <= 30; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        dates.push(d);
      }
    }

    // TURNOS FIXOS da operação — funcionários trabalham por diária em
    // 2 períodos diários: TARDE (14h–22h) e NOITE (22h–06h do dia seguinte).
    // hours[] lista as horas reais que o turno cobre (para intensidade).
    const splitBlocks: { start: number; end: number; hours: number[]; label: string }[] = [
      { start: 14, end: 22, hours: [14, 15, 16, 17, 18, 19, 20, 21], label: 'TARDE' },
      { start: 22, end: 6, hours: [22, 23, 0, 1, 2, 3, 4, 5], label: 'NOITE' },
    ];

    // Classifica intensidade do turno pelo TOTAL DE PEDIDOS PREVISTOS
    // (média histórica somada das horas cobertas pelo turno).
    // Faz mais sentido que ratio relativo, pois o turno NOITE é naturalmente
    // mais baixo que o TARDE — usar absoluto evita inflar a TARDE como "pico"
    // e zerar a NOITE como "ociosa" o tempo todo.
    // Fator de sensibilidade: 50 = neutro (1.0); 0 = thresholds 2x maiores (mais rígido,
    // 32 vira "baixo"); 100 = thresholds 0.5x (mais frouxo, 32 vira "pico").
    const sFactor = Math.max(0.3, 2 - sensitivity / 50);
    const thHigh = 40 * sFactor;
    const thMedium = 18 * sFactor;
    const thLow = 6 * sFactor;
    const blockIntensity = (hours: number[]): Intensity => {
      let total = 0;
      for (const h of hours) total += hourStats[h]?.avgOrders || 0;
      if (total >= thHigh) return 'high';
      if (total >= thMedium) return 'medium';
      if (total >= thLow) return 'low';
      if (economyMode && total < 1) return 'idle';
      if (economyMode) return 'very_low';
      return 'low';
    };

    // Round-robin para distribuir funcionários
    let rotation = 0;
    const pickEmployee = () => {
      const emp = employees[rotation % employees.length];
      rotation++;
      return emp.id;
    };

    const result: ShiftBlock[] = [];
    for (const d of dates) {
      const dow = d.getDay();
      const dowMultiplier =
        weekdayStats[dow]?.probabilityBest != null
          ? weekdayStats[dow].probabilityBest / 100
          : 1;

      for (const b of splitBlocks) {
        let intensity = blockIntensity(b.hours);
        // Ajusta pelo dia da semana — dias historicamente fracos cortam mais ainda
        if (dowMultiplier < 0.5 && intensity === 'high') intensity = 'medium';
        if (dowMultiplier < 0.35 && intensity === 'medium') intensity = 'low';
        if (economyMode && dowMultiplier < 0.2 && intensity === 'low') intensity = 'very_low';

        let needed = positionsNeeded(intensity);
        // Aplica teto máximo de posições — corta no fim (logistica primeiro)
        if (needed.length > maxPositions) {
          needed = POSITION_PRIORITY.filter(p => needed.includes(p)).slice(0, maxPositions);
        }
        const positions: Record<Position, string | null> = {
          logistica: null,
          cozinha: null,
          caixa: null,
          pdv: null,
        };
        for (const p of needed) positions[p] = pickEmployee();
        const sacrificed = ALL_POSITION_KEYS.filter(p => !needed.includes(p));

        let exOrders = 0;
        let exRevenue = 0;
        for (const h of b.hours) {
          exOrders += (hourStats[h]?.avgOrders || 0) * dowMultiplier;
          exRevenue += (hourStats[h]?.avgRevenue || 0) * dowMultiplier;
        }

        result.push({
          date: dateToKey(d),
          dow,
          startHour: b.start,
          endHour: b.end,
          intensity,
          positions,
          expectedOrders: exOrders,
          expectedRevenue: exRevenue,
          sacrificed,
        });
      }
    }

    setSchedule(result);
  };

  // ==========================================================
  // IMPRESSÃO
  // ==========================================================
  const printSchedule = () => {
    if (!schedule) return;
    const empMap = new Map(employees.map(e => [e.id, e.name]));
    const byDate = schedule.reduce((acc, s) => {
      (acc[s.date] ||= []).push(s);
      return acc;
    }, {} as Record<string, ShiftBlock[]>);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Escala</title>
<style>
  body{font-family:Arial,sans-serif;padding:20px;color:#000}
  h1{margin:0 0 8px}
  h2{margin:20px 0 6px;border-bottom:2px solid #000;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px}
  th,td{border:1px solid #999;padding:6px 8px;text-align:left}
  th{background:#eee}
  .high{background:#fee}.medium{background:#fff8e1}.low{background:#e8f5e9}.very_low{background:#f1f5f9}.idle{background:#e2e8f0;color:#64748b}
  .badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;color:#fff}
  .b-high{background:#dc2626}.b-medium{background:#d97706}.b-low{background:#16a34a}.b-vlow{background:#64748b}.b-idle{background:#94a3b8}
  .sac{color:#9ca3af;font-style:italic;font-size:11px}
</style></head><body>
<h1>ESCALA DE TRABALHO — VIBE DRINKS</h1>
<div>Gerada em ${new Date().toLocaleString('pt-BR')}</div>
<div style="margin:6px 0 12px;font-size:12px;color:#444">
  Modo economia: <b>${economyMode ? 'ATIVO' : 'DESATIVADO'}</b> — posições marcadas como
  <i>"sacrificada"</i> não geram diária no período.
</div>
${Object.keys(byDate).sort().map(date => {
  const d = new Date(date + 'T12:00:00');
  return `<h2>${DOW_LABELS[d.getDay()]} — ${formatDateBR(d)}</h2>
<table><thead><tr>
  <th>Horário</th><th>Demanda</th>
  ${POSITIONS.map(p => `<th>${p.label}</th>`).join('')}
  <th>Pedidos prev.</th>
</tr></thead><tbody>
${byDate[date].map(s => `<tr class="${s.intensity}">
  <td><b>${String(s.startHour).padStart(2, '0')}:00 – ${String(s.endHour).padStart(2, '0')}:00</b></td>
  <td><span class="badge ${intensityClass(s.intensity)}">${intensityLabel(s.intensity)}</span></td>
  ${POSITIONS.map(p => {
    const id = s.positions[p.key];
    if (id) return `<td>${empMap.get(id) || '—'}</td>`;
    return `<td class="sac">— sacrificada —</td>`;
  }).join('')}
  <td>${s.expectedOrders.toFixed(1)}</td>
</tr>`).join('')}
</tbody></table>`;
}).join('')}
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  // ==========================================================
  // RENDER
  // ==========================================================
  const empMap = new Map(employees.map(e => [e.id, e.name]));
  const byDate = schedule
    ? schedule.reduce((acc, s) => {
        (acc[s.date] ||= []).push(s);
        return acc;
      }, {} as Record<string, ShiftBlock[]>)
    : {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            ESCALA DINÂMICA
          </h2>
          <p className="text-sm text-muted-foreground">
            Loja fechada das <b>06h–14h</b> · Turnos fixos: <b>TARDE 14h–22h</b> e <b>NOITE 22h–06h</b> (dia seguinte)
          </p>
        </div>
      </div>

      {/* Cadastro de funcionários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Funcionários ({employees.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder={`Nome (deixe vazio para auto-numerar: FUNCIONÁRIO ${employees.length + 1})`}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEmployee()}
              className="uppercase"
            />
            <Button onClick={addEmployee}>Adicionar</Button>
          </div>
          {employees.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum funcionário cadastrado. Adicione pelo menos 1 para gerar escala.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {employees.map(e => (
                <div key={e.id} className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded">
                  <Input
                    value={e.name}
                    onChange={ev => renameEmployee(e.id, ev.target.value)}
                    className="h-8 text-sm uppercase border-0 bg-transparent px-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeEmployee(e.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Controles de geração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Gerar Escala
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tomorrow">Apenas amanhã</SelectItem>
                  <SelectItem value="week">Próximos 7 dias</SelectItem>
                  <SelectItem value="month">Próximos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none px-3 py-2 rounded border bg-muted/30">
              <input
                type="checkbox"
                checked={economyMode}
                onChange={e => setEconomyMode(e.target.checked)}
                className="h-4 w-4"
              />
              <span>
                <span className="font-bold">MODO ECONOMIA</span>
                <span className="block text-[10px] text-muted-foreground">
                  Sacrifica posições em fluxo muito baixo (economiza diárias)
                </span>
              </span>
            </label>
            <div className="px-3 py-2 rounded border bg-muted/30 min-w-[220px]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">MÁX. POSIÇÕES POR TURNO</span>
                <span className="text-sm font-bold text-primary">{maxPositions}</span>
              </div>
              <input
                type="range"
                min={1}
                max={4}
                step={1}
                value={maxPositions}
                onChange={e => setMaxPositions(parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>1</span><span>2</span><span>3</span><span>4</span>
            </div>
            <div className="px-3 py-2 rounded border bg-muted/30 min-w-[240px]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">SENSIBILIDADE DE PICOS</span>
                <span className="text-sm font-bold text-primary">{sensitivity}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={sensitivity}
                onChange={e => setSensitivity(parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>RÍGIDO</span><span>NEUTRO</span><span>FROUXO</span>
              </div>
              <span className="block text-[10px] text-muted-foreground mt-1">
                Limiares atuais — PICO: <b>{Math.round(40 * Math.max(0.3, 2 - sensitivity / 50))}</b> · MÉDIO: <b>{Math.round(18 * Math.max(0.3, 2 - sensitivity / 50))}</b> · BAIXO: <b>{Math.round(6 * Math.max(0.3, 2 - sensitivity / 50))}</b> pedidos/turno
              </span>
            </div>
              <span className="block text-[10px] text-muted-foreground mt-1">
                Hierarquia: COZINHA → CAIXA → PDV → LOGÍSTICA (corta de trás pra frente)
              </span>
            </div>
            <Button
              onClick={generateSchedule}
              disabled={loadingOrders || employees.length === 0}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {loadingOrders ? 'Carregando dados...' : 'Gerar Escala Inteligente'}
            </Button>
            {schedule && (
              <Button variant="outline" onClick={printSchedule} className="gap-2">
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            )}
          </div>

          {/* Indicadores de análise */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t">
            <div className="text-xs">
              <div className="text-muted-foreground">Pedidos analisados</div>
              <div className="font-bold text-base flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-primary" /> {orders.length}
              </div>
            </div>
            <div className="text-xs">
              <div className="text-muted-foreground">Pico do dia</div>
              <div className="font-bold text-base">
                {(() => {
                  const peak = [...hourStats].sort((a, b) => b.avgOrders - a.avgOrders)[0];
                  return peak ? `${String(peak.hour).padStart(2, '0')}:00` : '—';
                })()}
              </div>
            </div>
            <div className="text-xs">
              <div className="text-muted-foreground">Melhor dia</div>
              <div className="font-bold text-base">
                {[...weekdayStats].sort((a, b) => b.avgRevenue - a.avgRevenue)[0]?.name.slice(0, 3).toUpperCase() || '—'}
              </div>
            </div>
            <div className="text-xs">
              <div className="text-muted-foreground">Posições</div>
              <div className="font-bold text-base">{POSITIONS.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultado */}
      {schedule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escala Sugerida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(byDate).sort().map(date => {
              const d = new Date(date + 'T12:00:00');
              return (
                <div key={date} className="border rounded-lg overflow-hidden">
                  <div className="bg-primary text-primary-foreground px-3 py-2 font-bold text-sm">
                    {DOW_LABELS[d.getDay()]} — {formatDateBR(d)}
                  </div>
                  <div className="divide-y">
                    {byDate[date].map((s, i) => (
                      <div
                        key={i}
                        className={`p-3 ${
                          s.intensity === 'high'
                            ? 'bg-red-50 dark:bg-red-950/20'
                            : s.intensity === 'medium'
                            ? 'bg-amber-50 dark:bg-amber-950/20'
                            : s.intensity === 'low'
                            ? 'bg-green-50 dark:bg-green-950/20'
                            : 'bg-slate-100 dark:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="font-bold text-sm">
                            {String(s.startHour).padStart(2, '0')}:00 – {String(s.endHour).padStart(2, '0')}:00
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                s.intensity === 'high'
                                  ? 'bg-red-600'
                                  : s.intensity === 'medium'
                                  ? 'bg-amber-600'
                                  : s.intensity === 'low'
                                  ? 'bg-green-600'
                                  : 'bg-slate-500'
                              }
                            >
                              {intensityLabel(s.intensity)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ~{s.expectedOrders.toFixed(0)} pedidos
                            </span>
                            {s.sacrificed.length > 0 && (
                              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                                {s.sacrificed.length} posição(ões) sacrificada(s)
                              </span>
                            )}
                          </div>
                        </div>
                        {s.intensity === 'idle' ? (
                          <div className="text-xs text-muted-foreground italic py-2 text-center">
                            Sem alocação — fluxo previsto praticamente nulo. Nenhuma diária neste turno.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {POSITIONS.map(p => {
                              const Icon = p.icon;
                              const empId = s.positions[p.key];
                              const isSacrificed = s.sacrificed.includes(p.key);
                              return (
                                <div
                                  key={p.key}
                                  className={`flex items-center gap-2 p-2 rounded ${
                                    empId ? 'bg-background border' : 'bg-muted/40 opacity-50 border border-dashed'
                                  }`}
                                >
                                  <div className={`${p.color} text-white p-1.5 rounded`}>
                                    <Icon className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[10px] text-muted-foreground font-semibold">
                                      {p.label}
                                    </div>
                                    <div className="text-xs font-bold truncate">
                                      {empId
                                        ? empMap.get(empId) || '—'
                                        : isSacrificed
                                        ? '— sacrificada —'
                                        : '— sem alocação —'}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
