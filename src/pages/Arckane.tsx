import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-safe";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, Calendar, TrendingUp, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const ARCKANE_PASSWORD = "418418";
const CONTRIBUTION_PER_ORDER = 0.05;

type FilterMode = "all" | "day" | "month";

export default function Arckane() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const handleLogin = () => {
    if (password === ARCKANE_PASSWORD) {
      setAuthenticated(true);
      setError("");
    } else {
      setError("Senha incorreta");
    }
  };

  const now = new Date();
  const dayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [now.toDateString()]);

  const monthStart = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [now.toDateString()]);

  const rangeStart = filterMode === "all" ? null : filterMode === "day" ? dayStart : monthStart;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["arckane-orders", rangeStart],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, total, created_at, order_type, status", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(0, 9999);
      if (rangeStart) query = query.gte("created_at", rangeStart);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: authenticated,
    refetchInterval: 30000,
  });

  const totalContribution = orders.length * CONTRIBUTION_PER_ORDER;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-zinc-900 border-zinc-800">
          <CardHeader className="text-center">
            <Lock className="mx-auto h-10 w-10 text-violet-500 mb-2" />
            <CardTitle className="text-white text-xl tracking-widest">ARCKANE</CardTitle>
            <p className="text-zinc-500 text-xs">Acesso restrito</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <Button onClick={handleLogin} className="w-full bg-violet-600 hover:bg-violet-700">
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-20">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-widest text-violet-400">ARCKANE</h1>
          <p className="text-zinc-500 text-xs">Contribuição por pedido: R$ {CONTRIBUTION_PER_ORDER.toFixed(2)}</p>
        </div>

        {/* Filter */}
        <div className="flex gap-2 justify-center">
          <Button
            size="sm"
            variant={filterMode === "all" ? "default" : "outline"}
            onClick={() => setFilterMode("all")}
            className={filterMode === "all" ? "bg-violet-600" : "border-zinc-700 text-zinc-400"}
          >
            <TrendingUp className="h-3 w-3 mr-1" /> Total
          </Button>
          <Button
            size="sm"
            variant={filterMode === "day" ? "default" : "outline"}
            onClick={() => setFilterMode("day")}
            className={filterMode === "day" ? "bg-violet-600" : "border-zinc-700 text-zinc-400"}
          >
            <Calendar className="h-3 w-3 mr-1" /> Hoje
          </Button>
          <Button
            size="sm"
            variant={filterMode === "month" ? "default" : "outline"}
            onClick={() => setFilterMode("month")}
            className={filterMode === "month" ? "bg-violet-600" : "border-zinc-700 text-zinc-400"}
          >
            <Calendar className="h-3 w-3 mr-1" /> 30d
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 text-center">
              <p className="text-zinc-500 text-[10px] uppercase">Pedidos</p>
              <p className="text-xl font-bold text-white">{orders.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 text-center">
              <p className="text-zinc-500 text-[10px] uppercase">Faturamento</p>
              <p className="text-lg font-bold text-emerald-400">
                R$ {totalRevenue.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-violet-900/50 border-violet-700">
            <CardContent className="p-3 text-center">
              <p className="text-violet-300 text-[10px] uppercase font-bold">Arckane</p>
              <p className="text-xl font-bold text-violet-300">
                R$ {totalContribution.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-center text-zinc-500 text-sm py-8">Carregando...</p>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 text-xs">Pedido</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Total</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Data/Hora</TableHead>
                  <TableHead className="text-zinc-400 text-xs text-right">Contrib.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={4} className="text-center text-zinc-600 py-8">
                      Nenhum pedido no período
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id} className="border-zinc-800 hover:bg-zinc-900/50">
                      <TableCell className="text-xs font-mono text-zinc-300">
                        {order.id.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-xs text-emerald-400">
                        R$ {Number(order.total).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {order.created_at
                          ? format(new Date(order.created_at), "dd/MM HH:mm", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge variant="outline" className="border-violet-700 text-violet-300 text-[10px]">
                          R$ {CONTRIBUTION_PER_ORDER.toFixed(2)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-zinc-700 text-[10px] mt-8">
          Arckane © {now.getFullYear()} — Crescimento contínuo
        </p>
      </div>
    </div>
  );
}
