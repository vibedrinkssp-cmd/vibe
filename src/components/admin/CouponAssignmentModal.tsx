// Modal for assigning coupons to customers with advanced options
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Ticket, Plus, Percent, Gift, Wine, Target, 
  ChevronRight, Sparkles, DollarSign, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAuth } from '@/lib/auth';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  coupon_type: string;
  max_discount_value: number | null;
  product_id: string | null;
  category_id: string | null;
  min_quantity: number;
  is_template: boolean;
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  salePrice: number;
  isActive: boolean;
}

interface CouponAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  availableCoupons: Coupon[];
  products: Product[];
  onSuccess: () => void;
}

const COUPON_TYPES = [
  { value: 'percent', label: 'Desconto %', icon: Percent, color: 'bg-amber-500', description: 'Percentual de desconto no total' },
  { value: 'full_discount', label: 'Desconto Total', icon: Gift, color: 'bg-green-500', description: '100% de desconto até um valor máximo' },
  { value: 'caipirinha_dobro', label: 'Caipirinha 2x1', icon: Wine, color: 'bg-orange-500', description: 'Segunda caipirinha grátis' },
  { value: 'product_specific', label: 'Produto Específico', icon: Target, color: 'bg-blue-500', description: 'Desconto em produto específico' },
];

export function CouponAssignmentModal({
  open,
  onOpenChange,
  customerId,
  customerName,
  availableCoupons,
  products,
  onSuccess,
}: CouponAssignmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'template' | 'custom'>('template');
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [customMaxValue, setCustomMaxValue] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Custom coupon form
  const [customForm, setCustomForm] = useState({
    code: '',
    description: '',
    coupon_type: 'percent',
    discount_percent: 10,
    max_discount_value: null as number | null,
    product_id: null as string | null,
    min_quantity: 2,
    expires_at: null as string | null,
  });

  const templateCoupons = availableCoupons.filter(c => c.is_template);
  const filteredTemplates = templateCoupons.filter(c => 
    typeFilter === 'all' || c.coupon_type === typeFilter
  );

  // Assign existing coupon
  const assignMutation = useMutation({
    mutationFn: async ({ couponId, maxValue }: { couponId: string; maxValue?: number }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      if (maxValue !== undefined && maxValue !== null) {
        // Use RPC to assign with custom max value
        const { error } = await supabase.rpc('assign_coupon_with_max_value_admin', {
          p_admin_user_id: user.id,
          p_target_user_id: customerId,
          p_coupon_id: couponId,
          p_max_discount_value: maxValue,
        });
        if (error) throw error;
      } else {
        // Regular assignment
        const { error } = await supabase.rpc('assign_coupon_to_user_admin', {
          p_admin_user_id: user.id,
          p_target_user_id: customerId,
          p_coupon_id: couponId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-coupons'] });
      toast({ title: 'Cupom atribuído com sucesso!' });
      onSuccess();
      handleClose();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao atribuir cupom', 
        description: error.message?.includes('duplicate') ? 'Cliente já possui este cupom' : error.message,
        variant: 'destructive' 
      });
    },
  });

  // Create custom coupon
  const createCustomMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const params: Record<string, unknown> = {
        p_admin_user_id: user.id,
        p_target_user_id: customerId,
        p_code: customForm.code.toUpperCase() || `CUSTOM_${Date.now()}`,
        p_description: customForm.description || `Cupom personalizado para ${customerName}`,
        p_coupon_type: customForm.coupon_type,
        p_discount_percent: customForm.discount_percent,
        p_max_discount_value: customForm.max_discount_value,
        p_product_id: customForm.product_id,
        p_category_id: null,
        p_min_quantity: customForm.min_quantity,
        p_expires_at: customForm.expires_at,
      };
      const { error } = await supabase.rpc('create_custom_coupon_admin', params as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-coupons'] });
      toast({ title: 'Cupom personalizado criado e atribuído!' });
      onSuccess();
      handleClose();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao criar cupom', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleClose = () => {
    setSelectedCoupon(null);
    setCustomMaxValue(null);
    setActiveTab('template');
    setTypeFilter('all');
    setCustomForm({
      code: '',
      description: '',
      coupon_type: 'percent',
      discount_percent: 10,
      max_discount_value: null,
      product_id: null,
      min_quantity: 2,
      expires_at: null,
    });
    onOpenChange(false);
  };

  const handleAssignTemplate = () => {
    if (!selectedCoupon) return;
    
    // If it's a full_discount coupon and custom max value is set, use that
    if (selectedCoupon.coupon_type === 'full_discount' && customMaxValue) {
      assignMutation.mutate({ couponId: selectedCoupon.id, maxValue: customMaxValue });
    } else {
      assignMutation.mutate({ couponId: selectedCoupon.id });
    }
  };

  const handleCreateCustom = () => {
    if (!customForm.code.trim()) {
      toast({ title: 'Código é obrigatório', variant: 'destructive' });
      return;
    }
    createCustomMutation.mutate();
  };

  const getCouponTypeInfo = (type: string) => {
    return COUPON_TYPES.find(t => t.value === type) || COUPON_TYPES[0];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-500" />
            Atribuir Cupom para {customerName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template" className="gap-2">
              <Ticket className="w-4 h-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Personalizado
            </TabsTrigger>
          </TabsList>

          {/* Template Selection */}
          <TabsContent value="template" className="space-y-4">
            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {COUPON_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="flex items-center gap-2">
                      <type.icon className="w-4 h-4" />
                      {type.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Coupon List */}
            {filteredTemplates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Nenhum template disponível
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredTemplates.map(coupon => {
                  const typeInfo = getCouponTypeInfo(coupon.coupon_type);
                  const TypeIcon = typeInfo.icon;
                  const isSelected = selectedCoupon?.id === coupon.id;
                  
                  return (
                    <Card 
                      key={coupon.id}
                      className={`cursor-pointer transition-all ${
                        isSelected 
                          ? 'ring-2 ring-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        setSelectedCoupon(coupon);
                        setCustomMaxValue(null);
                      }}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                            <TypeIcon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {coupon.code}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {coupon.discount_percent}%
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {coupon.description || typeInfo.description}
                            </p>
                          </div>
                          {isSelected && (
                            <ChevronRight className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Custom Max Value for full_discount */}
            {selectedCoupon?.coupon_type === 'full_discount' && (
              <Card className="border-dashed border-green-500/50">
                <CardContent className="py-4 px-4">
                  <Label className="flex items-center gap-2 text-green-600 mb-2">
                    <DollarSign className="w-4 h-4" />
                    Definir Valor Máximo do Desconto
                  </Label>
                  <Input
                    type="number"
                    value={customMaxValue || ''}
                    onChange={(e) => setCustomMaxValue(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Ex: 50.00 (deixe vazio para usar o padrão)"
                    step={0.01}
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedCoupon.max_discount_value 
                      ? `Valor padrão: R$ ${Number(selectedCoupon.max_discount_value).toFixed(2)}`
                      : 'Este cupom não tem valor máximo definido'
                    }
                  </p>
                </CardContent>
              </Card>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button 
                onClick={handleAssignTemplate}
                disabled={!selectedCoupon || assignMutation.isPending}
              >
                {assignMutation.isPending ? 'Atribuindo...' : 'Atribuir Cupom'}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Custom Coupon Creation */}
          <TabsContent value="custom" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input
                  value={customForm.code}
                  onChange={(e) => setCustomForm({ ...customForm, code: e.target.value.toUpperCase() })}
                  placeholder="CODIGO10"
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label>Tipo de Cupom</Label>
                <Select 
                  value={customForm.coupon_type} 
                  onValueChange={(v) => setCustomForm({ ...customForm, coupon_type: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUPON_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          {type.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={customForm.description}
                onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                placeholder="Descreva o cupom..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desconto (%)</Label>
                <Input
                  type="number"
                  value={customForm.discount_percent}
                  onChange={(e) => setCustomForm({ ...customForm, discount_percent: Number(e.target.value) })}
                  min={0}
                  max={100}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Valor Máximo (R$)</Label>
                <Input
                  type="number"
                  value={customForm.max_discount_value || ''}
                  onChange={(e) => setCustomForm({ 
                    ...customForm, 
                    max_discount_value: e.target.value ? Number(e.target.value) : null 
                  })}
                  placeholder="Sem limite"
                  step={0.01}
                  min={0}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Data de Expiração
              </Label>
              <Input
                type="date"
                value={customForm.expires_at || ''}
                onChange={(e) => setCustomForm({ 
                  ...customForm, 
                  expires_at: e.target.value || null 
                })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Deixe vazio para cupom sem expiração
              </p>
            </div>

            {customForm.coupon_type === 'product_specific' && (
              <div>
                <Label>Produto</Label>
                <Select 
                  value={customForm.product_id || ''} 
                  onValueChange={(v) => setCustomForm({ ...customForm, product_id: v || null })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.filter(p => p.isActive).map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - R$ {Number(product.salePrice).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {customForm.coupon_type === 'caipirinha_dobro' && (
              <div>
                <Label>Quantidade Mínima de Caipirinhas</Label>
                <Input
                  type="number"
                  value={customForm.min_quantity}
                  onChange={(e) => setCustomForm({ ...customForm, min_quantity: Number(e.target.value) })}
                  min={1}
                  className="mt-1"
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button 
                onClick={handleCreateCustom}
                disabled={createCustomMutation.isPending}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {createCustomMutation.isPending ? 'Criando...' : 'Criar e Atribuir'}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
