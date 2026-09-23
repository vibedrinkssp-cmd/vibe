import { useState } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BookOpen, Search, User, Loader2, DollarSign, Trash2, Plus, ArrowLeft, CreditCard, Banknote, Smartphone, Calendar, X, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
import {
  createCadernetaCustomer,
  deleteCadernetaCustomer,
  deleteCadernetaEntry,
  getCadernetaLedger,
  listCadernetaCustomers,
  registerCadernetaPayment,
} from '@/lib/caderneta';

interface CadernetaCustomer {
  id: string;
  name: string;
  whatsapp: string | null;
  is_active: boolean | null;
  notes: string | null;
}

interface CadernetaEntry {
  id: string;
  customer_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_paid: boolean | null;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
}

interface CadernetaPayment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const PAYMENT_METHODS: Record<string, { label: string; icon: typeof Banknote }> = {
  cash: { label: 'Dinheiro', icon: Banknote },
  pix: { label: 'PIX', icon: Smartphone },
  card_credit: { label: 'Cartão Crédito', icon: CreditCard },
  card_debit: { label: 'Cartão Débito', icon: CreditCard },
};

export function CadernetaTab({ readOnly = false, sessionTokenOverride }: { readOnly?: boolean; sessionTokenOverride?: string | null }) {
  const { toast } = useToast();
  const authContext = useAuth();
  const sessionToken = sessionTokenOverride || authContext.sessionToken;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [showNewCustomerInput, setShowNewCustomerInput] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{ customerId: string; customerName: string; balance: number } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState<{ entryId: string } | null>(null);
  const [confirmDeleteCustomerDialog, setConfirmDeleteCustomerDialog] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [periodPreset, setPeriodPreset] = useState<'all' | 'today' | '7d' | '30d' | 'month' | 'custom'>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { data: customerData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['caderneta-customers-admin', sessionToken],
    queryFn: async () => {
      if (!sessionToken) {
        return {
          customers: [] as CadernetaCustomer[],
          balances: {} as Record<string, number>,
        };
      }

      return listCadernetaCustomers(sessionToken);
    },
    enabled: !!sessionToken,
  });

  const customers = customerData?.customers ?? [];
  const balances = customerData?.balances ?? {};

  const { data: ledgerData, isLoading: loadingEntries } = useQuery({
    queryKey: ['caderneta-ledger', sessionToken, selectedCustomerId],
    queryFn: async () => {
      if (!sessionToken || !selectedCustomerId) {
        return {
          entries: [] as CadernetaEntry[],
          payments: [] as CadernetaPayment[],
        };
      }

      return getCadernetaLedger(sessionToken, selectedCustomerId);
    },
    enabled: !!sessionToken && !!selectedCustomerId,
  });

  const entries = ledgerData?.entries ?? [];
  const payments = ledgerData?.payments ?? [];

  const createCustomerMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa expirada. Faça login novamente.');
      }

      const { customer } = await createCadernetaCustomer(sessionToken, name);
      return customer;
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['caderneta-customers-admin'] });
      setShowNewCustomerInput(false);
      setNewCustomerName('');
      setSelectedCustomerId(customer.id);
      toast({ title: '✅ Cliente cadastrado!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' });
    },
  });

  const registerPaymentMutation = useMutation({
    mutationFn: async ({ customerId, amount, method }: { customerId: string; amount: number; method: string }) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa expirada. Faça login novamente.');
      }

      await registerCadernetaPayment(sessionToken, {
        customerId,
        amount,
        paymentMethod: method,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caderneta-customers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['caderneta-ledger'] });
      toast({ title: '✅ Pagamento registrado!' });
      setPaymentDialog(null);
      setPaymentAmount('');
      setPaymentMethod('cash');
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao registrar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa expirada. Faça login novamente.');
      }

      await deleteCadernetaEntry(sessionToken, entryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caderneta-customers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['caderneta-ledger'] });
      toast({ title: 'Lançamento excluído' });
      setConfirmDeleteDialog(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir lançamento', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa expirada. Faça login novamente.');
      }

      await deleteCadernetaCustomer(sessionToken, customerId);
    },
    onSuccess: (_data, customerId) => {
      queryClient.invalidateQueries({ queryKey: ['caderneta-customers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['caderneta-ledger'] });
      if (selectedCustomerId === customerId) setSelectedCustomerId(null);
      toast({ title: 'Cliente excluído' });
      setConfirmDeleteCustomerDialog(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
    },
  });

  const filteredCustomers = customers.filter(c =>
    searchIncludes(c.name, searchTerm)
  );

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Total acumulado de fiados (todos os clientes com saldo devedor)
  const totalAcumuladoFiados = Object.values(balances).reduce<number>(
    (sum, b) => sum + (Number(b) > 0 ? Number(b) : 0),
    0,
  );
  const clientesEmDebito = Object.values(balances).filter((b) => Number(b) > 0).length;

  // Calcula intervalo do período selecionado
  const periodRange = (() => {
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    switch (periodPreset) {
      case 'today': return { start: startOfDay(now), end: null as Date | null };
      case '7d': { const s = startOfDay(now); s.setDate(s.getDate() - 6); return { start: s, end: null }; }
      case '30d': { const s = startOfDay(now); s.setDate(s.getDate() - 29); return { start: s, end: null }; }
      case 'month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
      case 'custom': {
        const s = customStart ? new Date(customStart + 'T00:00:00') : null;
        const e = customEnd ? new Date(customEnd + 'T23:59:59') : null;
        return { start: s, end: e };
      }
      default: return { start: null as Date | null, end: null as Date | null };
    }
  })();

  const inPeriod = (dateStr: string) => {
    const d = new Date(dateStr);
    if (periodRange.start && d < periodRange.start) return false;
    if (periodRange.end && d > periodRange.end) return false;
    return true;
  };

  const filteredEntries = entries.filter(e => inPeriod(e.created_at));
  const filteredPayments = payments.filter(p => inPeriod(p.created_at));

  // Calculate balance for selected customer (no período filtrado)
  const totalCompras = filteredEntries.reduce((sum, e) => sum + Number(e.total_price), 0);
  const totalPagamentos = filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const saldoDevedor = balances[selectedCustomerId || ''] || 0;
  const saldoPeriodo = totalCompras - totalPagamentos;

  // Build unified timeline (purchases + payments) sorted by date desc
  const timeline = [
    ...filteredEntries.map(e => ({ type: 'purchase' as const, date: e.created_at, data: e })),
    ...filteredPayments.map(p => ({ type: 'payment' as const, date: p.created_at, data: p })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handlePayment = () => {
    if (!paymentDialog) return;
    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    registerPaymentMutation.mutate({
      customerId: paymentDialog.customerId,
      amount,
      method: paymentMethod,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-violet-400" />
          <h2 className="text-xl font-bold">Caderneta (Fiados)</h2>
        </div>
      </div>

      {/* Total acumulado de fiados */}
      <Card className="border-red-500/30 bg-gradient-to-br from-red-500/10 to-orange-500/5">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total acumulado de fiados</p>
              <p className="text-2xl font-bold text-red-400">{formatCurrency(totalAcumuladoFiados)}</p>
              <p className="text-xs text-muted-foreground">{clientesEmDebito} cliente{clientesEmDebito === 1 ? '' : 's'} em débito</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtro de período (afeta detalhes do cliente selecionado) */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
            <Calendar className="h-4 w-4" />
            <span className="font-medium">Período:</span>
          </div>
          {([
            ['all', 'Tudo'],
            ['today', 'Hoje'],
            ['7d', '7 dias'],
            ['30d', '30 dias'],
            ['month', 'Mês atual'],
            ['custom', 'Personalizado'],
          ] as const).map(([val, label]) => (
            <Button
              key={val}
              size="sm"
              variant={periodPreset === val ? 'default' : 'outline'}
              className={periodPreset === val ? 'bg-violet-600 hover:bg-violet-700' : ''}
              onClick={() => setPeriodPreset(val)}
            >
              {label}
            </Button>
          ))}
          {periodPreset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 w-auto" />
              <span className="text-muted-foreground text-xs">até</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 w-auto" />
              {(customStart || customEnd) && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCustomStart(''); setCustomEnd(''); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            Filtra os lançamentos exibidos para o cliente selecionado
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Customer list */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* New customer */}
            {!readOnly && (showNewCustomerInput ? (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Nome do cliente..."
                  value={newCustomerName}
                  onChange={e => setNewCustomerName(e.target.value.toUpperCase())}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={!newCustomerName.trim() || createCustomerMutation.isPending}
                  onClick={() => createCustomerMutation.mutate(newCustomerName.trim())}
                >
                  {createCustomerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowNewCustomerInput(false); setNewCustomerName(''); }}>
                  ✕
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-violet-500/50 text-violet-400 mt-2"
                onClick={() => setShowNewCustomerInput(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Cliente
              </Button>
            ))}
          </CardHeader>
          <CardContent className="p-0">
            {loadingCustomers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente encontrado</p>
            ) : (
              <div className="max-h-[60vh] overflow-auto divide-y">
                {filteredCustomers.map(c => {
                  const balance = balances[c.id] || 0;
                  const isSelected = selectedCustomerId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                        isSelected ? 'bg-violet-500/15 border-l-2 border-violet-500' : 'hover:bg-muted/50'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        onClick={() => setSelectedCustomerId(c.id)}
                      >
                        <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{c.name}</span>
                      </button>
                      {balance > 0 && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs flex-shrink-0 ml-2">
                          {formatCurrency(balance)}
                        </Badge>
                      )}
                      {balance <= 0 && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] flex-shrink-0 ml-2">
                          OK
                        </Badge>
                      )}
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 ml-1 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteCustomerDialog({ id: c.id, name: c.name, balance });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Customer detail */}
        <Card className="lg:col-span-2">
          {!selectedCustomerId ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <BookOpen className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Selecione um cliente para ver a caderneta</p>
            </div>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 lg:hidden"
                      onClick={() => setSelectedCustomerId(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                      <CardTitle className="text-base">{selectedCustomer?.name}</CardTitle>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          Compras{periodPreset !== 'all' ? ' (período)' : ''}: <span className="font-medium text-foreground">{formatCurrency(totalCompras)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Pagamentos{periodPreset !== 'all' ? ' (período)' : ''}: <span className="font-medium text-green-400">{formatCurrency(totalPagamentos)}</span>
                        </span>
                        {periodPreset !== 'all' && (
                          <span className="text-xs text-muted-foreground">
                            Saldo do período: <span className={`font-medium ${saldoPeriodo > 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(saldoPeriodo)}</span>
                          </span>
                        )}
                      </div>
                      {saldoDevedor > 0 ? (
                        <p className="text-sm text-red-400 mt-1 font-bold">
                          Saldo devedor: {formatCurrency(saldoDevedor)}
                        </p>
                      ) : (
                        <p className="text-sm text-green-400 mt-1 font-bold">Sem débitos ✓</p>
                      )}
                    </div>
                  </div>
                  {saldoDevedor > 0 && !readOnly && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => setPaymentDialog({
                        customerId: selectedCustomerId!,
                        customerName: selectedCustomer?.name || '',
                        balance: saldoDevedor,
                      })}
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Registrar Pagamento
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingEntries ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum lançamento</p>
                ) : (
                  <div className="max-h-[55vh] overflow-auto divide-y">
                    {timeline.map(item => {
                      if (item.type === 'purchase') {
                        const entry = item.data as CadernetaEntry;
                        return (
                          <div key={`e-${entry.id}`} className="px-4 py-3 flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium break-words">{entry.quantity}x {entry.product_name}</span>
                              </div>
                              {entry.notes && (
                                <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line break-words">{entry.notes}</p>
                              )}
                              <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
                            </div>
                            <span className="text-sm font-medium text-red-400 flex-shrink-0">
                              +{formatCurrency(Number(entry.total_price))}
                            </span>
                            {!readOnly && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                                onClick={() => setConfirmDeleteDialog({ entryId: entry.id })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      } else {
                        const payment = item.data as CadernetaPayment;
                        const methodInfo = PAYMENT_METHODS[payment.payment_method] || { label: payment.payment_method, icon: Banknote };
                        const MethodIcon = methodInfo.icon;
                        return (
                          <div key={`p-${payment.id}`} className="px-4 py-3 flex items-center gap-3 bg-green-500/5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <MethodIcon className="h-3.5 w-3.5 text-green-400" />
                                <span className="text-sm font-medium text-green-400">Pagamento ({methodInfo.label})</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatDate(payment.created_at)}</span>
                            </div>
                            <span className="text-sm font-bold text-green-400 flex-shrink-0">
                              −{formatCurrency(Number(payment.amount))}
                            </span>
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Payment dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={() => { setPaymentDialog(null); setPaymentAmount(''); setPaymentMethod('cash'); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              Registrar Pagamento
            </DialogTitle>
            <DialogDescription>
              {paymentDialog?.customerName} — Saldo devedor: <strong>{paymentDialog ? formatCurrency(paymentDialog.balance) : ''}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Valor pago</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                autoFocus
              />
              {paymentDialog && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-green-400 p-0 h-auto mt-1"
                  onClick={() => setPaymentAmount(paymentDialog.balance.toFixed(2))}
                >
                  Pagar tudo ({formatCurrency(paymentDialog.balance)})
                </Button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Forma de pagamento</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHODS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPaymentDialog(null); setPaymentAmount(''); }}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={registerPaymentMutation.isPending || !paymentAmount}
              onClick={handlePayment}
            >
              {registerPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={!!confirmDeleteDialog} onOpenChange={() => setConfirmDeleteDialog(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Excluir Lançamento</DialogTitle>
            <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteEntryMutation.isPending}
              onClick={() => confirmDeleteDialog && deleteEntryMutation.mutate(confirmDeleteDialog.entryId)}
            >
              {deleteEntryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete customer */}
      <Dialog open={!!confirmDeleteCustomerDialog} onOpenChange={() => setConfirmDeleteCustomerDialog(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Excluir Cliente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{confirmDeleteCustomerDialog?.name}</strong>?
              {confirmDeleteCustomerDialog && confirmDeleteCustomerDialog.balance > 0 && (
                <span className="block mt-1 text-red-400 font-medium">
                  Atenção: saldo devedor de {formatCurrency(confirmDeleteCustomerDialog.balance)} será perdido.
                </span>
              )}
              {' '}Todo o histórico de compras e pagamentos desse cliente será apagado. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteCustomerDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteCustomerMutation.isPending}
              onClick={() => confirmDeleteCustomerDialog && deleteCustomerMutation.mutate(confirmDeleteCustomerDialog.id)}
            >
              {deleteCustomerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
