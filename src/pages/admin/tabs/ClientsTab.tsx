// Clients Tab Component
import { useState, useEffect } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Search, Eye, Key, Trash2, ChevronLeft, ChevronRight, User as UserIcon, Phone, MapPin, ShoppingBag, Ticket, Check, CreditCard, ChevronDown, ChevronUp, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAdminUsers, useAdminOrders, useAdminOrderItems } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { mapAddress } from '@/lib/db-mappers';
import { formatCurrency, formatDate, StatusBadge, type User, type Address, type OrderStatus, type OrderItem, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type OrderType, type PaymentMethod } from '../shared';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SimpleCouponModal, type SimpleCouponInitial } from '@/components/admin/SimpleCouponModal';
import { useAuth } from '@/lib/auth';
interface UserCoupon {
  id: string;
  coupon_id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  coupon_type: string;
  max_discount_value: number | null;
  assigned_at: string | null;
  is_used: boolean | null;
  used_at: string | null;
}

const CUSTOMERS_PER_PAGE = 20;

export function ClientsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponInitial, setCouponInitial] = useState<SimpleCouponInitial | null>(null);
  const { data: users = [], isLoading } = useAdminUsers();
  const { data: allOrders = [] } = useAdminOrders();

  // Fetch addresses for selected customer
  const { data: customerAddresses = [] } = useQuery<Address[]>({
    queryKey: ['customer-addresses', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', selectedCustomer.id);
      if (error) throw error;
      return (data || []).map(mapAddress);
    },
    enabled: !!selectedCustomer?.id && detailsOpen,
  });

  // Fetch customer's coupons
  const { data: customerCoupons = [], refetch: refetchCustomerCoupons } = useQuery<UserCoupon[]>({
    queryKey: ['customer-coupons', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const { data, error } = await supabase
        .from('user_coupons')
        .select(`
          id,
          assigned_at,
          is_used,
          used_at,
          coupons (
            id,
            code,
            description,
            discount_percent,
            coupon_type,
            max_discount_value
          )
        `)
        .eq('user_id', selectedCustomer.id)
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(uc => ({
        id: uc.id,
        coupon_id: (uc.coupons as any)?.id || '',
        code: (uc.coupons as any)?.code || '',
        description: (uc.coupons as any)?.description || null,
        discount_percent: (uc.coupons as any)?.discount_percent || 0,
        coupon_type: (uc.coupons as any)?.coupon_type || 'percent',
        max_discount_value: (uc.coupons as any)?.max_discount_value || null,
        assigned_at: uc.assigned_at,
        is_used: uc.is_used,
        used_at: uc.used_at
      }));
    },
    enabled: !!selectedCustomer?.id && (detailsOpen || couponModalOpen),
  });

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const customerOrders = allOrders.filter(o => o.userId === selectedCustomer?.id);
  const customerOrderIds = customerOrders.map(o => o.id);
  const { data: customerOrderItems = [] } = useAdminOrderItems(detailsOpen ? customerOrderIds : []);
  const customerTotalSpent = customerOrders.reduce((acc, o) => acc + Number(o.total), 0);

  const removeCouponMutation = useMutation({
    mutationFn: async (userCouponId: string) => {
      if (!user?.id) throw new Error('Admin não autenticado');
      // Use admin RPC function to bypass RLS
      const { error } = await supabase.rpc('delete_user_coupon_admin', { 
        p_admin_user_id: user.id,
        p_user_coupon_id: userCouponId 
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchCustomerCoupons();
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast({ title: 'Cupom removido!' });
    },
    onError: (err: any) => {
      console.error('Error removing coupon:', err);
      toast({ title: 'Erro ao remover cupom', description: err.message, variant: 'destructive' });
    },
  });

  // Realtime subscription for customer coupons updates
  useEffect(() => {
    const channel = supabase
      .channel('clients-coupons-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_coupons',
      }, () => {
        refetchCustomerCoupons();
        queryClient.invalidateQueries({ queryKey: ['all-coupons-admin'] });
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchCustomerCoupons, queryClient]);

  const toggleBlockMutation = useMutation({
    mutationFn: async ({ userId, isBlocked }: { userId: string; isBlocked: boolean }) => {
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('toggle_user_blocked', { 
        p_user_id: userId, 
        p_is_blocked: isBlocked 
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Usuário atualizado!' });
    },
    onError: (err) => {
      console.error('Error toggling user block:', err);
      toast({ title: 'Erro ao atualizar usuário', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('delete_user', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Cliente excluído!' });
    },
    onError: (err) => {
      console.error('Error deleting user:', err);
      toast({ title: 'Erro ao excluir cliente', variant: 'destructive' });
    },
  });

  const filteredCustomers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      searchIncludes(user.name, searchTerm) ||
      user.whatsapp.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'blocked' && user.isBlocked) ||
      (statusFilter === 'active' && !user.isBlocked);
    return matchesSearch && matchesStatus && user.role === 'customer';
  });

  const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * CUSTOMERS_PER_PAGE,
    currentPage * CUSTOMERS_PER_PAGE
  );

  const openCustomerDetails = (user: User) => {
    setSelectedCustomer(user);
    setDetailsOpen(true);
  };

  const openCustomerCoupons = (customer: User) => {
    setSelectedCustomer(customer);
    setDetailsOpen(false);
    setCouponInitial(null);
    setCouponModalOpen(true);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="font-serif text-2xl md:text-3xl text-primary">Clientes</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nome ou WhatsApp..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-9 w-full sm:w-48 md:w-64 bg-secondary border-primary/30 text-sm"
              data-testid="input-search-customers"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setCurrentPage(1); }}>
            <SelectTrigger className="w-full sm:w-32 md:w-40 bg-secondary border-primary/30 text-sm" data-testid="select-customer-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-16" />
            </Card>
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum cliente encontrado
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Mostrando {(currentPage - 1) * CUSTOMERS_PER_PAGE + 1} - {Math.min(currentPage * CUSTOMERS_PER_PAGE, filteredCustomers.length)} de {filteredCustomers.length} clientes
          </p>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="border-b border-border/30">
                    <tr>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm">Cliente</th>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm hidden sm:table-cell">WhatsApp</th>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm hidden md:table-cell">CPF</th>
                      <th className="text-center p-3 md:p-4 text-muted-foreground font-medium text-sm">Status</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.map(user => (
                      <tr key={user.id} className="border-b border-border/20 last:border-0">
                        <td className="p-3 md:p-4">
                          <div className="font-medium truncate max-w-[120px] md:max-w-none">{user.name}</div>
                          <div className="text-xs text-muted-foreground sm:hidden">{user.whatsapp}</div>
                        </td>
                        <td className="p-3 md:p-4 text-muted-foreground hidden sm:table-cell">{user.whatsapp}</td>
                        <td className="p-3 md:p-4 text-muted-foreground hidden md:table-cell">{user.cpf || '-'}</td>
                        <td className="p-3 md:p-4 text-center">
                          <Badge className={`text-xs ${user.isBlocked ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                            {user.isBlocked ? 'Bloqueado' : 'Ativo'}
                          </Badge>
                        </td>
                        <td className="p-3 md:p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Cupons"
                              onClick={() => openCustomerCoupons(user)}
                            >
                              <Ticket className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openCustomerDetails(user)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant={user.isBlocked ? 'default' : 'outline'}
                              className="text-xs px-2 hidden md:inline-flex"
                              onClick={() => toggleBlockMutation.mutate({ userId: user.id, isBlocked: !user.isBlocked })}
                            >
                              {user.isBlocked ? 'Desbloquear' : 'Bloquear'}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 md:hidden"
                              onClick={() => toggleBlockMutation.mutate({ userId: user.id, isBlocked: !user.isBlocked })}
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground/50 h-8 w-8"
                              onClick={() => {
                                if (confirm('Excluir este cliente?')) deleteMutation.mutate(user.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próxima
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <UserIcon className="w-5 h-5 text-primary" />
              Detalhes do Cliente
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
                <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Nome</Label>
                      <p className="font-medium">{selectedCustomer.name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">WhatsApp</Label>
                      <p className="font-medium flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedCustomer.whatsapp}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">CPF</Label>
                      <p className="font-medium flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {selectedCustomer.cpf || 'Não informado'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Cadastrado em</Label>
                      <p className="font-medium">{formatDate(selectedCustomer.createdAt)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Status</Label>
                      <Badge className={selectedCustomer.isBlocked ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}>
                        {selectedCustomer.isBlocked ? 'Bloqueado' : 'Ativo'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-primary" />
                  Endereços ({customerAddresses.length})
                </h3>
                {customerAddresses.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      Nenhum endereço cadastrado
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {customerAddresses.map(addr => (
                      <Card key={addr.id}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">
                                {addr.street}, {addr.number}
                                {addr.complement && ` - ${addr.complement}`}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {addr.neighborhood} - {addr.city}/{addr.state}
                              </p>
                              <p className="text-xs text-muted-foreground">CEP: {addr.zipCode}</p>
                            </div>
                            {addr.isDefault && (
                              <Badge variant="outline" className="text-xs">Principal</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção de Cupons */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-amber-500" />
                    Cupons ({customerCoupons.length})
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => { setCouponInitial(null); setCouponModalOpen(true); }}
                    className="gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Criar cupom
                  </Button>
                </div>

                {customerCoupons.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      Nenhum cupom criado ainda
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {customerCoupons.map(uc => {
                      const isFixed = uc.coupon_type === 'fixed_amount';
                      const valueLabel = isFixed
                        ? `R$ ${Number(uc.max_discount_value || 0).toFixed(2)}`
                        : `${uc.discount_percent}% OFF`;
                      return (
                        <Card key={uc.id} className={uc.is_used ? 'opacity-70' : ''}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge className={uc.is_used ? 'bg-muted text-muted-foreground' : 'bg-amber-500 text-white'}>
                                    {uc.code}
                                  </Badge>
                                  <Badge variant="outline" className={uc.is_used ? '' : 'text-amber-600 border-amber-500 font-bold'}>
                                    {valueLabel}
                                  </Badge>
                                  {uc.is_used && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Check className="w-3 h-3 mr-1" />
                                      Usado
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Criado em {uc.assigned_at ? format(new Date(uc.assigned_at), "dd/MM/yyyy", { locale: ptBR }) : '-'}
                                  {uc.is_used && uc.used_at && (
                                    <> • Usado em {format(new Date(uc.used_at), "dd/MM/yyyy", { locale: ptBR })}</>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {uc.is_used ? (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="gap-1 h-8"
                                    onClick={() => {
                                      setCouponInitial({
                                        userCouponId: uc.id,
                                        code: uc.code,
                                        discountType: isFixed ? 'fixed_amount' : 'percent',
                                        value: isFixed ? Number(uc.max_discount_value || 0) : Number(uc.discount_percent || 0),
                                      });
                                      setCouponModalOpen(true);
                                    }}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Renovar
                                  </Button>
                                ) : (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      if (confirm('Remover este cupom do cliente?')) {
                                        removeCouponMutation.mutate(uc.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  Histórico de Pedidos ({customerOrders.length})
                </h3>
                {customerOrders.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      Nenhum pedido realizado
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className="mb-3">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="text-xs text-muted-foreground">Total de Pedidos</p>
                            <p className="font-semibold">{customerOrders.length}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Entregues</p>
                            <p className="font-semibold">{customerOrders.filter(o => o.status === 'delivered').length}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Gasto</p>
                            <p className="font-semibold text-primary">{formatCurrency(customerTotalSpent)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <ScrollArea className="h-64">
                      <div className="space-y-2 pr-4">
                        {customerOrders.map(order => {
                          const isExpanded = expandedOrderId === order.id;
                          const orderItems = customerOrderItems.filter(item => item.orderId === order.id);
                          return (
                            <Card key={order.id}>
                              <CardContent className="py-2 px-4">
                                <div
                                  className="flex items-center justify-between gap-2 flex-wrap cursor-pointer"
                                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                    <div>
                                      <p className="text-xs text-muted-foreground">#{order.id.slice(0, 8)}</p>
                                      <p className="text-sm">{formatDate(order.createdAt)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <StatusBadge status={order.status as OrderStatus} />
                                    <span className="font-medium text-primary">{formatCurrency(order.total)}</span>
                                  </div>
                                </div>
                                {isExpanded && (
                                  <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span>Tipo: {ORDER_TYPE_LABELS[order.orderType as OrderType] || order.orderType}</span>
                                      <span>•</span>
                                      <span>Pgto: {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] || order.paymentMethod}</span>
                                    </div>
                                    {orderItems.length > 0 ? (
                                      <div className="space-y-1">
                                        <p className="text-xs font-medium text-muted-foreground">Itens:</p>
                                        {orderItems.map(item => (
                                          <div key={item.id} className="flex items-center justify-between text-sm">
                                            <span className="truncate flex-1">{item.quantity}x {item.productName}</span>
                                            <span className="text-muted-foreground ml-2">{formatCurrency(item.totalPrice)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground italic">Carregando itens...</p>
                                    )}
                                    {order.notes && (
                                      <p className="text-xs text-muted-foreground">Obs: {order.notes}</p>
                                    )}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                      <ScrollBar orientation="vertical" />
                    </ScrollArea>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal simples de criar/renovar cupom */}
      {selectedCustomer && (
        <SimpleCouponModal
          open={couponModalOpen}
          onOpenChange={setCouponModalOpen}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          initial={couponInitial}
          onSuccess={refetchCustomerCoupons}
        />
      )}
    </div>
  );
}
