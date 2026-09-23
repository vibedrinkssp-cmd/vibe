import { useMemo } from 'react';
import { Trophy, Medal, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

interface Order {
  id: string;
  salesperson?: string | null;
  total: number;
  order_type: string;
  payment_method: string;
  created_at?: string | null;
  status: string;
}

interface Sangria {
  id: string;
  responsible: string;
  amount: number;
  type: string;
  created_at?: string | null;
}

interface Props {
  orders: Order[];
  sangrias: Sangria[];
}

interface EmployeeStat {
  name: string;
  totalSales: number;
  orderCount: number;
  avgTicket: number;
  counterOrders: number;
  deliveryOrders: number;
  sangriaCount: number;
  sangriaTotal: number;
}

const MEDAL_COLORS = ['text-yellow-400', 'text-gray-400', 'text-amber-600'];

export function EmployeeReportSection({ orders, sangrias }: Props) {
  const stats = useMemo(() => {
    const map = new Map<string, EmployeeStat>();

    const getOrCreate = (name: string): EmployeeStat => {
      if (!map.has(name)) {
        map.set(name, {
          name,
          totalSales: 0,
          orderCount: 0,
          avgTicket: 0,
          counterOrders: 0,
          deliveryOrders: 0,
          sangriaCount: 0,
          sangriaTotal: 0,
        });
      }
      return map.get(name)!;
    };

    orders.forEach((order) => {
      const name = order.salesperson || 'Sem vendedor';
      const stat = getOrCreate(name);
      stat.totalSales += Number(order.total);
      stat.orderCount += 1;
      if (order.order_type === 'counter') stat.counterOrders += 1;
      if (order.order_type === 'delivery') stat.deliveryOrders += 1;
    });

    sangrias.forEach((s) => {
      const name = s.responsible || 'Sistema';
      const stat = getOrCreate(name);
      stat.sangriaCount += 1;
      stat.sangriaTotal += Number(s.amount);
    });

    // Calculate averages
    map.forEach((stat) => {
      stat.avgTicket = stat.orderCount > 0 ? stat.totalSales / stat.orderCount : 0;
    });

    return Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
  }, [orders, sangrias]);

  const chartData = useMemo(
    () => stats.filter((s) => s.orderCount > 0).map((s) => ({
      name: s.name.length > 10 ? s.name.slice(0, 10) + '…' : s.name,
      Vendas: s.totalSales,
      Pedidos: s.orderCount,
    })),
    [stats]
  );

  if (stats.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          Nenhum dado de funcionário no período
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ranking Top 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.slice(0, 3).map((stat, i) => (
          <Card key={stat.name} className={cn(
            "transition-all duration-300 hover:scale-[1.02]",
            i === 0 && "border-yellow-500/30 bg-yellow-500/5"
          )}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-shrink-0">
                {i === 0 ? (
                  <Trophy className={cn("w-8 h-8", MEDAL_COLORS[i])} />
                ) : (
                  <Medal className={cn("w-7 h-7", MEDAL_COLORS[i])} />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{stat.name}</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(stat.totalSales)}</p>
                <p className="text-xs text-muted-foreground">
                  {stat.orderCount} pedidos · TM {formatCurrency(stat.avgTicket)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              Vendas por Funcionário
            </CardTitle>
            <CardDescription>Faturamento total no período selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `R$${v}`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="name" width={100} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Vendas']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="Vendas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Funcionário</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>#</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Caixa</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Delivery</TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Sangrias</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((stat, i) => (
                  <TableRow key={stat.name}>
                    <TableCell>
                      {i < 3 ? (
                        <Badge variant={i === 0 ? "default" : "secondary"} className="text-xs">
                          {i + 1}º
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">{i + 1}º</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{stat.name}</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {formatCurrency(stat.totalSales)}
                    </TableCell>
                    <TableCell className="text-right">{stat.orderCount}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">{stat.counterOrders}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">{stat.deliveryOrders}</TableCell>
                    <TableCell className="text-right">{formatCurrency(stat.avgTicket)}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      {stat.sangriaCount > 0 ? (
                        <span className="text-orange-400">
                          {stat.sangriaCount}x (-{formatCurrency(stat.sangriaTotal)})
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
