import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ClipboardCopy, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client-safe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/format-utils';
import {
  buildReportPdf,
  buildReportText,
  channelLabel,
  marginPercent,
  paymentLabel,
  type DailyReport,
} from '@/lib/daily-report';
import { PlatformFeeSettingsCard } from './PlatformFeeSettingsCard';

/** Dia comercial: da virada configurada (ex.: 06h) até a mesma hora do dia seguinte. */
function businessDayRange(dateStr: string, startHour: number): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, startHour, 0, 0, 0);
  return { start, end: addDays(start, 1) };
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${tone ?? 'text-primary'}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ChannelsTable({ report }: { report: DailyReport }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vendas por canal</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2">Canal</th><th className="pb-2 text-right">Pedidos</th>
              <th className="pb-2 text-right">Bruto</th><th className="pb-2 text-right">Taxa</th>
              <th className="pb-2 text-right">Líquido</th><th className="pb-2 text-right">Custo</th>
              <th className="pb-2 text-right">Lucro</th><th className="pb-2 text-right">Margem</th>
            </tr>
          </thead>
          <tbody>
            {report.channels.map((c) => (
              <tr key={c.channel} className="border-t border-border">
                <td className="py-2 font-medium">{channelLabel(c.channel)}</td>
                <td className="py-2 text-right">{c.orders}</td>
                <td className="py-2 text-right">{formatCurrency(c.gross)}</td>
                <td className="py-2 text-right text-destructive">{c.fees > 0 ? `- ${formatCurrency(c.fees)}` : '-'}</td>
                <td className="py-2 text-right">{formatCurrency(c.net)}</td>
                <td className="py-2 text-right">{formatCurrency(c.cost)}</td>
                <td className={`py-2 text-right font-bold ${c.profit < 0 ? 'text-destructive' : 'text-green-500'}`}>
                  {formatCurrency(c.profit)}
                </td>
                <td className="py-2 text-right">{marginPercent(c.profit, c.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ListCard({ title, rows }: { title: string; rows: { key: string; left: string; right: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.length === 0 && <p className="text-muted-foreground">Sem dados no período.</p>}
        {rows.map((r) => (
          <div key={r.key} className="flex justify-between gap-2">
            <span className="truncate">{r.left}</span>
            <span className="font-medium">{r.right}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HourlyBars({ report }: { report: DailyReport }) {
  const max = Math.max(1, ...report.hourly.map((h) => Number(h.gross)));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vendas por hora</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {report.hourly.map((h) => (
          <div key={h.hour} className="flex items-center gap-2 text-xs">
            <span className="w-10 text-muted-foreground">{String(h.hour).padStart(2, '0')}h</span>
            <div className="h-3 flex-1 rounded bg-secondary">
              <div className="h-3 rounded bg-primary" style={{ width: `${(Number(h.gross) / max) * 100}%` }} />
            </div>
            <span className="w-24 text-right">{formatCurrency(Number(h.gross))} ({h.orders})</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function useDailyReport(dateStr: string, startHour: number) {
  return useQuery({
    queryKey: ['daily-report', dateStr, startHour],
    queryFn: async (): Promise<DailyReport> => {
      const { start, end } = businessDayRange(dateStr, startHour);
      const { data, error } = await supabase.rpc('get_daily_report' as never, {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      } as never);
      if (error) throw error;
      return data as unknown as DailyReport;
    },
  });
}

export function DailyReportTab() {
  const { toast } = useToast();
  const [dateStr, setDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [startHour, setStartHour] = useState(0);
  const { data: report, isLoading, error } = useDailyReport(dateStr, startHour);

  const dateLabel = format(businessDayRange(dateStr, startHour).start, "EEEE, dd/MM/yyyy", { locale: ptBR });
  const shiftDay = (delta: number) =>
    setDateStr(format(addDays(businessDayRange(dateStr, 0).start, delta), 'yyyy-MM-dd'));

  const copyText = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(buildReportText(report, dateLabel));
      toast({ title: 'Resumo copiado! Cole no WhatsApp.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const exportPdf = () => report && buildReportPdf(report, dateLabel).save(`relatorio-diario-${dateStr}.pdf`);

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-2xl md:text-3xl text-primary">Relatório Diário</h2>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shiftDay(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={dateStr} onChange={(e) => e.target.value && setDateStr(e.target.value)} className="w-[160px]" />
        <Button variant="outline" size="icon" onClick={() => shiftDay(1)}><ChevronRight className="h-4 w-4" /></Button>
        <select
          value={startHour}
          onChange={(e) => setStartHour(Number(e.target.value))}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Virada do dia"
        >
          {[0, 4, 5, 6, 8].map((h) => <option key={h} value={h}>Dia começa às {String(h).padStart(2, '0')}h</option>)}
        </select>
        <Button variant="outline" onClick={copyText} disabled={!report}><ClipboardCopy className="mr-1 h-4 w-4" />Copiar p/ WhatsApp</Button>
        <Button variant="outline" onClick={exportPdf} disabled={!report}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
      </div>
      <p className="text-sm capitalize text-muted-foreground">{dateLabel}</p>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {error && <p className="text-destructive">Erro ao gerar relatório: {(error as Error).message}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <SummaryCard label="Faturamento" value={formatCurrency(report.totals.gross)} hint={`${report.totals.orders} pedidos`} />
            <SummaryCard label="Taxas plataformas" value={formatCurrency(report.totals.fees)} tone="text-destructive" />
            <SummaryCard label="Custo produtos" value={formatCurrency(report.totals.cost)} tone="text-foreground" />
            <SummaryCard label="Lucro real" value={formatCurrency(report.totals.profit)} tone="text-green-500" hint={`Margem ${marginPercent(report.totals.profit, report.totals.gross)}`} />
            <SummaryCard label="Cancelados" value={String(report.cancelled)} tone="text-foreground" />
          </div>
          <ChannelsTable report={report} />
          <div className="grid gap-4 md:grid-cols-2">
            <ListCard title="Pagamentos (balcão e delivery)" rows={report.payments.map((p) => ({ key: p.method, left: `${paymentLabel(p.method)} (${p.orders})`, right: formatCurrency(p.total) }))} />
            <ListCard title="Mais vendidos" rows={report.top_products.map((p) => ({ key: p.name, left: `${p.quantity}x ${p.name}`, right: formatCurrency(p.revenue) }))} />
          </div>
          <HourlyBars report={report} />
        </>
      )}

      <PlatformFeeSettingsCard />
    </div>
  );
}
