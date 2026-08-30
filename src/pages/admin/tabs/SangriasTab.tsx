// Sangrias Tab Component - Lançamentos Avulsos
import { useState } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { 
  Plus, 
  Search, 
  Trash2, 
  DollarSign, 
  ShoppingCart,
  User,
  Car,
  Utensils,
  Package,
  MoreHorizontal,
  Download,
  Calendar,
  X,
  Minus
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency } from '../shared';
import type { Product } from '@/shared/schema';

import { cn } from '@/lib/utils';

// Tipos de sangria
export const SANGRIA_TYPES = {
  compra_produtos: { label: 'Compra de Produtos', icon: Package, color: 'bg-blue-500/20 text-blue-400' },
  vale_funcionario: { label: 'Vale Funcionário', icon: User, color: 'bg-purple-500/20 text-purple-400' },
  alimentacao: { label: 'Alimentação', icon: Utensils, color: 'bg-orange-500/20 text-orange-400' },
  combustivel: { label: 'Combustível', icon: Car, color: 'bg-green-500/20 text-green-400' },
  consumo_funcionario: { label: 'Consumo Funcionário', icon: ShoppingCart, color: 'bg-yellow-500/20 text-yellow-400' },
  manutencao: { label: 'Manutenção', icon: MoreHorizontal, color: 'bg-gray-500/20 text-gray-400' },
  limpeza: { label: 'Limpeza', icon: MoreHorizontal, color: 'bg-cyan-500/20 text-cyan-400' },
  outros: { label: 'Outros', icon: MoreHorizontal, color: 'bg-red-500/20 text-red-400' },
} as const;

type SangriaType = keyof typeof SANGRIA_TYPES;

interface SangriaItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

interface Sangria {
  id: string;
  closure_id: string | null;
  created_at: string;
  type: SangriaType;
  amount: number;
  description: string | null;
  responsible: string;
  items?: SangriaItem[];
}

type BackendResult<T> = { data: T | null; error: unknown };

async function safeBackendResult<T>(request: PromiseLike<BackendResult<T>>): Promise<BackendResult<T>> {
  try {
    const result = await request;
    return { data: result?.data ?? null, error: result?.error ?? null };
  } catch (error) {
    return { data: null, error };
  }
}

export function SangriasTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [searchFilter, setSearchFilter] = useState('');

  // Check if cash register is open
  const { data: cashRegisterStatus } = useQuery({
    queryKey: ['cash-register-status'],
    queryFn: async () => {
      const result = await safeBackendResult(supabase.rpc('get_session_summary'));
      const data = Array.isArray(result?.data) ? result.data : [];
      const error = result?.error;
      if (error) {
        console.error('Error checking cash register status:', error);
        return { isOpen: false };
      }
      const session = data?.[0];
      return { 
        isOpen: session?.session_status === 'open',
        sessionId: session?.session_id 
      };
    },
  });

  const isCashRegisterOpen = cashRegisterStatus?.isOpen ?? false;

  // Form state
  const [formType, setFormType] = useState<SangriaType>('compra_produtos');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formResponsible, setFormResponsible] = useState('');
  
  const [cartItems, setCartItems] = useState<SangriaItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Fetch sangrias usando RPC para bypass RLS
  const { data: sangrias = [], isLoading } = useQuery({
    queryKey: ['sangrias', startDate, endDate],
    queryFn: async () => {
      const endOfDay = endDate ? new Date(endDate) : null;
      if (endOfDay) {
        endOfDay.setHours(23, 59, 59, 999);
      }

      const params: { p_start_date?: string; p_end_date?: string } = {};
      if (startDate) params.p_start_date = startDate.toISOString();
      if (endOfDay) params.p_end_date = endOfDay.toISOString();

      const result = await safeBackendResult(supabase.rpc('get_all_sangrias_list', params));
      const data = Array.isArray(result?.data) ? result.data : [];
      const error = result?.error;

      if (error) {
        console.error('Error fetching sangrias:', error);
        return [] as Sangria[];
      }
      return (data || []) as Sangria[];
    },
  });

  // Fetch products for consumo_funcionario
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-sangria'],
    queryFn: async () => {
      const result = await safeBackendResult(supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name'));
      const data = Array.isArray(result?.data) ? result.data : [];
      const error = result?.error;
      if (error) throw error;
      return data.map(p => ({
        id: p.id,
        categoryId: p.category_id,
        name: p.name,
        description: p.description,
        imageUrl: p.image_url,
        costPrice: String(p.cost_price || 0),
        profitMargin: String(p.profit_margin || 0),
        salePrice: String(p.sale_price),
        stock: p.stock ?? 0,
        isActive: p.is_active ?? true,
        isPrepared: p.is_prepared ?? false,
        comboEligible: p.combo_eligible ?? false,
        productType: p.product_type,
        sortOrder: p.sort_order ?? 0,
        createdAt: p.created_at,
      })) as Product[];
    },
  });

  // Create sangria mutation usando RPC para bypass RLS
  const createSangria = useMutation({
    mutationFn: async (data: { type: SangriaType; amount: number; description: string; responsible: string; items?: SangriaItem[] }) => {
      // Create sangria using RPC
      const rpcParams: { p_type: string; p_amount: number; p_responsible: string; p_description?: string } = {
        p_type: data.type,
        p_amount: data.amount,
        p_responsible: data.responsible,
      };
      if (data.description) rpcParams.p_description = data.description;

      const sangriaResult = await safeBackendResult(supabase.rpc('insert_sangria', rpcParams));
      const sangriaId = sangriaResult?.data;
      const sangriaError = sangriaResult?.error;

      if (sangriaError) throw sangriaError;
      if (!sangriaId) throw new Error('Não foi possível criar a sangria. Tente novamente.');
      
      const sangria = { id: sangriaId };

      // If consumo_funcionario, create items and decrement stock
      if (data.type === 'consumo_funcionario' && data.items && data.items.length > 0) {
        // Insert sangria items
        const itemsToInsert = data.items.map(item => ({
          sangria_id: sangria.id,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          total_cost: item.totalCost,
        }));

        const itemsResult = await safeBackendResult(supabase
          .from('sangria_items')
          .insert(itemsToInsert));
        const itemsError = itemsResult?.error;

        if (itemsError) throw itemsError;

        // Decrement stock for each product
        for (const item of data.items) {
          // Fetch current stock first
          const productResult = await safeBackendResult(supabase
            .from('products')
            .select('stock')
            .eq('id', item.productId)
            .maybeSingle());
          const productData = productResult?.data as { stock: number | null } | null;
          const fetchError = productResult?.error;
          
          if (fetchError) throw fetchError;
          
          const newStock = Math.max(0, (productData?.stock || 0) - item.quantity);
          
          const updateResult = await safeBackendResult(supabase
            .from('products')
            .update({ stock: newStock })
            .eq('id', item.productId));
          const updateError = updateResult?.error;
          
          if (updateError) throw updateError;
        }
      }

      return sangria;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sangrias'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Sangria registrada com sucesso!' });
      resetForm();
      setIsModalOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar sangria', description: String(error), variant: 'destructive' });
    },
  });

  // Delete sangria mutation
  const deleteSangria = useMutation({
    mutationFn: async (id: string) => {
      // Use RPC function to bypass RLS
      const result = await safeBackendResult(supabase.rpc('delete_sangria', { p_id: id }));
      const error = result?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sangrias'] });
      toast({ title: 'Sangria removida!' });
    },
    onError: (err) => {
      console.error('Error deleting sangria:', err);
      toast({ title: 'Erro ao remover sangria', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormType('compra_produtos');
    setFormAmount('');
    setFormDescription('');
    setFormResponsible('');
    setCartItems([]);
    setProductSearch('');
  };

  const addToCart = (product: Product) => {
    const existing = cartItems.find(item => item.productId === product.id);
    if (existing) {
      setCartItems(cartItems.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1, totalCost: (item.quantity + 1) * item.unitCost }
          : item
      ));
    } else {
      setCartItems([...cartItems, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitCost: Number(product.costPrice),
        totalCost: Number(product.costPrice),
      }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCartItems(cartItems.filter(item => item.productId !== productId));
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCartItems(cartItems.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, totalCost: newQty * item.unitCost };
      }
      return item;
    }));
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.totalCost, 0);

  const handleSubmit = () => {
    if (!formResponsible) {
      toast({ title: 'Selecione o funcionário responsável', variant: 'destructive' });
      return;
    }

    const responsibleLabel = formResponsible;

    if (formType === 'consumo_funcionario') {
      if (cartItems.length === 0) {
        toast({ title: 'Adicione produtos ao carrinho', variant: 'destructive' });
        return;
      }
      createSangria.mutate({
        type: formType,
        amount: cartTotal,
        description: formDescription,
        responsible: responsibleLabel,
        items: cartItems,
      });
    } else {
      const amount = parseFloat(formAmount.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        toast({ title: 'Informe um valor válido', variant: 'destructive' });
        return;
      }
      createSangria.mutate({
        type: formType,
        amount,
        description: formDescription,
        responsible: responsibleLabel,
      });
    }
  };

  // Filter products for search
  const filteredProducts = (products ?? []).filter(p =>
    (p?.name ?? '').toLowerCase().includes((productSearch ?? '').toLowerCase()) && (p?.stock ?? 0) > 0
  ).slice(0, 10);

  // Filter sangrias
  const filteredSangrias = (sangrias ?? []).filter(s =>
    searchIncludes(s?.responsible ?? '', searchFilter ?? '') ||
    (s?.description && searchIncludes(s.description, searchFilter ?? ''))
  );

  // Totals by type
  const totalsByType = filteredSangrias.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + Number(s.amount);
    return acc;
  }, {} as Record<SangriaType, number>);

  const grandTotal = filteredSangrias.reduce((sum, s) => sum + Number(s.amount), 0);


  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatorio de Sangrias', 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Periodo: ${startDate ? format(startDate, 'dd/MM/yyyy') : 'Inicio'} ate ${endDate ? format(endDate, 'dd/MM/yyyy') : 'Hoje'}`, 14, 32);
    doc.text(`Total Geral: ${formatCurrency(grandTotal)}`, 14, 40);

    const tableData = filteredSangrias.map(s => [
      format(new Date(s.created_at), 'dd/MM/yyyy HH:mm'),
      (SANGRIA_TYPES[s.type] ?? SANGRIA_TYPES.outros).label,
      s.responsible ?? '-',
      s.description || '-',
      formatCurrency(s.amount),
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Data', 'Tipo', 'Responsável', 'Descrição', 'Valor']],
      body: tableData,
    });

    doc.save(`sangrias-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF exportado!' });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="font-serif text-2xl md:text-3xl text-primary">Sangrias</h2>
        <div className="flex gap-2">
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="text-xs">
            <Download className="w-4 h-4 mr-1" />
            PDF
          </Button>
          <Button 
            onClick={() => setIsModalOpen(true)} 
            size="sm" 
            className="text-xs"
            disabled={!isCashRegisterOpen}
            title={!isCashRegisterOpen ? "Abra o caixa primeiro" : "Nova sangria"}
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova
          </Button>
        </div>
      </div>

      {/* Alert when cash register is closed */}
      {!isCashRegisterOpen && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Caixa Fechado</AlertTitle>
          <AlertDescription>
            Sangrias só podem ser registradas quando o caixa está aberto. 
            Vá até a aba "Caixa" e abra uma nova sessão para registrar sangrias.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-3">
        <div className="w-full sm:w-auto">
          <Label className="text-xs">Data Início</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full sm:w-36 justify-start text-left font-normal text-sm", !startDate && "text-muted-foreground")}>
                <Calendar className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, 'dd/MM/yy') : 'Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="w-full sm:w-auto">
          <Label className="text-xs">Data Fim</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full sm:w-36 justify-start text-left font-normal text-sm", !endDate && "text-muted-foreground")}>
                <Calendar className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, 'dd/MM/yy') : 'Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={endDate} onSelect={setEndDate} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-1 min-w-0 w-full sm:w-auto">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Responsável..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Sangrias</CardTitle>
            <DollarSign className="w-4 h-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-400">{formatCurrency(grandTotal)}</p>
            <p className="text-xs text-muted-foreground">{filteredSangrias.length} lançamentos</p>
          </CardContent>
        </Card>

        {Object.entries(totalsByType).slice(0, 3).map(([type, total]) => {
          const config = SANGRIA_TYPES[type as SangriaType];
          if (!config) return null;
          const Icon = config.icon;
          return (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{config.label}</CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              </CardContent>
            </Card>
          );
        })}

      </div>

      {/* Sangrias List */}
      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filteredSangrias.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma sangria encontrada</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
              {filteredSangrias.map((sangria) => {
                const config = SANGRIA_TYPES[sangria.type] ?? SANGRIA_TYPES.outros;
                const Icon = config.icon;
                const descRaw = sangria.description || '';
                const desc = descRaw.length > 200 ? descRaw.slice(0, 200) + '…' : descRaw;

                return (
                  <div
                    key={sangria.id}
                    className="flex flex-col gap-2 p-3 md:p-4 rounded-lg bg-card border border-border h-full"
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn("p-2 rounded-lg flex-shrink-0", config.color)}>
                        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={cn(config.color, "text-[10px]")}>
                            {config.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(sangria.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-xs font-medium mt-1">{sangria.responsible}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive h-7 w-7 flex-shrink-0"
                        onClick={() => deleteSangria.mutate(sangria.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {desc && (
                      <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap break-words flex-1">
                        {desc}
                      </p>
                    )}
                    <div className="mt-auto pt-2 border-t border-border/50 flex items-center justify-end">
                      <span className="text-lg font-bold text-red-400">-{formatCurrency(sangria.amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Sangria Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Nova Sangria</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4">
              {/* Tipo de Sangria */}
              <div className="space-y-2">
                <Label>Tipo de Sangria</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as SangriaType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SANGRIA_TYPES).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className="w-4 h-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Valor (não para consumo_funcionario) */}
              {formType !== 'consumo_funcionario' && (
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="text"
                    placeholder="0,00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                  />
                </div>
              )}

              {/* Carrinho de produtos (para consumo_funcionario) */}
              {formType === 'consumo_funcionario' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Buscar Produto</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Digite o nome do produto..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    {productSearch && filteredProducts.length > 0 && (
                      <div className="border rounded-lg mt-2 max-h-40 overflow-y-auto">
                        {filteredProducts.map((product) => (
                          <button
                            key={product.id}
                            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left border-b last:border-b-0"
                            onClick={() => {
                              addToCart(product);
                              setProductSearch('');
                            }}
                          >
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-xs text-muted-foreground">Estoque: {product.stock} | Custo: {formatCurrency(product.costPrice)}</p>
                            </div>
                            <Plus className="w-4 h-4 text-primary" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Carrinho */}
                  {cartItems.length > 0 && (
                    <div className="space-y-2">
                      <Label>Produtos Selecionados</Label>
                      <div className="border rounded-lg divide-y">
                        {cartItems.map((item) => (
                          <div key={item.productId} className="flex items-center justify-between p-3">
                            <div className="flex-1">
                              <p className="font-medium">{item.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(item.unitCost)} x {item.quantity} = {formatCurrency(item.totalCost)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateCartQuantity(item.productId, -1)}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateCartQuantity(item.productId, 1)}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeFromCart(item.productId)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="p-3 bg-muted/50 flex justify-between">
                          <span className="font-medium">Total:</span>
                          <span className="font-bold text-red-400">{formatCurrency(cartTotal)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Responsável */}
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input
                  value={formResponsible}
                  onChange={(e) => setFormResponsible(e.target.value)}
                  placeholder="Nome do responsável..."
                />
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Textarea
                  placeholder="Observações sobre o lançamento..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createSangria.isPending}>
              {createSangria.isPending ? 'Salvando...' : 'Registrar Sangria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}