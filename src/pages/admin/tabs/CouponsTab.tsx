// Coupons Tab - Admin management of coupon templates
import { useState, useEffect } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Ticket, Plus, Search, Edit2, Trash2, Check, X, 
  Percent, Gift, Wine, Target, Users, TrendingUp, Calendar, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAdminProducts, useAdminCategories } from '../use-admin-data';
import { useAuth } from '@/lib/auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CouponAdmin {
  id: string;
  code: string;
  description: string | null;
  coupon_type: string;
  discount_percent: number;
  max_discount_value: number | null;
  product_id: string | null;
  category_id: string | null;
  min_quantity: number;
  is_template: boolean;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  expires_at: string | null;
  assign_to_all: boolean;
  times_assigned: number;
  times_used: number;
}

const COUPON_TYPES = [
  { value: 'percent', label: 'Desconto %', icon: Percent, color: 'bg-amber-500' },
  { value: 'full_discount', label: 'Desconto Total', icon: Gift, color: 'bg-green-500' },
  { value: 'caipirinha_dobro', label: 'Caipirinha 2x1', icon: Wine, color: 'bg-orange-500' },
  { value: 'product_specific', label: 'Produto Específico', icon: Target, color: 'bg-blue-500' },
];

export function CouponsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editingCoupon, setEditingCoupon] = useState<CouponAdmin | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    coupon_type: 'percent',
    discount_percent: 10,
    max_discount_value: null as number | null,
    product_id: null as string | null,
    category_id: null as string | null,
    min_quantity: 1,
    is_active: true,
    expires_at: null as string | null,
    assign_to_all: false,
  });

  const { data: products = [] } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();

  const { data: coupons = [], isLoading } = useQuery<CouponAdmin[]>({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const params: Record<string, unknown> = { p_admin_user_id: user?.id || undefined };
      const { data, error } = await supabase.rpc('get_all_coupons_admin', params as any);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Realtime subscription for coupon updates
  useEffect(() => {
    const channel = supabase
      .channel('admin-coupons-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_coupons',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'coupons',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const upsertMutation = useMutation({
    mutationFn: async (data: { id?: string } & typeof formData) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const params: Record<string, unknown> = {
        p_admin_user_id: user.id,
        p_id: data.id || null,
        p_code: data.code.toUpperCase(),
        p_description: data.description || '',
        p_coupon_type: data.coupon_type,
        p_discount_percent: data.discount_percent,
        p_max_discount_value: data.max_discount_value,
        p_product_id: data.product_id,
        p_category_id: data.category_id,
        p_min_quantity: data.min_quantity,
        p_is_active: data.is_active,
        p_expires_at: data.expires_at,
        p_assign_to_all: data.assign_to_all,
      };
      const { error } = await supabase.rpc('upsert_coupon_template_admin', params as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['all-coupons'] });
      toast({ title: editingCoupon ? 'Cupom atualizado!' : 'Cupom criado!' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao salvar cupom', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (couponId: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { error } = await supabase.rpc('delete_coupon_template_admin', { 
        p_admin_user_id: user.id,
        p_coupon_id: couponId 
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['all-coupons'] });
      toast({ title: 'Cupom excluído!' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao excluir cupom', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = searchTerm === '' || 
      searchIncludes(coupon.code, searchTerm) ||
      (coupon.description && searchIncludes(coupon.description, searchTerm));
    const matchesType = typeFilter === 'all' || coupon.coupon_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const activeCoupons = coupons.filter(c => c.is_active);
  const totalAssigned = coupons.reduce((acc, c) => acc + c.times_assigned, 0);
  const totalUsed = coupons.reduce((acc, c) => acc + c.times_used, 0);

  const openCreate = () => {
    setFormData({
      code: '',
      description: '',
      coupon_type: 'percent',
      discount_percent: 10,
      max_discount_value: null,
      product_id: null,
      category_id: null,
      min_quantity: 1,
      is_active: true,
      expires_at: null,
      assign_to_all: false,
    });
    setEditingCoupon(null);
    setIsCreateOpen(true);
  };

  const openEdit = (coupon: CouponAdmin) => {
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      coupon_type: coupon.coupon_type,
      discount_percent: coupon.discount_percent,
      max_discount_value: coupon.max_discount_value,
      product_id: coupon.product_id,
      category_id: coupon.category_id,
      min_quantity: coupon.min_quantity,
      is_active: coupon.is_active,
      expires_at: coupon.expires_at ? coupon.expires_at.split('T')[0] : null,
      assign_to_all: coupon.assign_to_all,
    });
    setEditingCoupon(coupon);
    setIsCreateOpen(true);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingCoupon(null);
  };

  const handleSave = () => {
    if (!formData.code.trim()) {
      toast({ title: 'Código é obrigatório', variant: 'destructive' });
      return;
    }
    upsertMutation.mutate({ 
      id: editingCoupon?.id, 
      ...formData 
    });
  };

  const getCouponTypeInfo = (type: string) => {
    return COUPON_TYPES.find(t => t.value === type) || COUPON_TYPES[0];
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="font-serif text-2xl md:text-3xl text-primary flex items-center gap-2">
          <Ticket className="w-7 h-7" />
          Cupons
        </h2>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Cupom
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Ticket className="w-3 h-3" />
              Total
            </div>
            <p className="text-2xl font-bold">{coupons.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Check className="w-3 h-3" />
              Ativos
            </div>
            <p className="text-2xl font-bold text-green-500">{activeCoupons.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="w-3 h-3" />
              Atribuídos
            </div>
            <p className="text-2xl font-bold text-blue-500">{totalAssigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3 h-3" />
              Usados
            </div>
            <p className="text-2xl font-bold text-amber-500">{totalUsed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-secondary border-primary/30"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-secondary border-primary/30">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {COUPON_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Coupons List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : filteredCoupons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum cupom encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredCoupons.map(coupon => {
            const typeInfo = getCouponTypeInfo(coupon.coupon_type);
            const TypeIcon = typeInfo.icon;
            const expired = isExpired(coupon.expires_at);
            
            return (
              <Card key={coupon.id} className={!coupon.is_active || expired ? 'opacity-60' : ''}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                        <TypeIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="font-mono font-bold">
                            {coupon.code}
                          </Badge>
                          {coupon.assign_to_all && (
                            <Badge className="bg-blue-500/20 text-blue-400 text-xs gap-1">
                              <Globe className="w-3 h-3" />
                              Todos
                            </Badge>
                          )}
                          {!coupon.is_active && (
                            <Badge variant="secondary" className="text-xs">Inativo</Badge>
                          )}
                          {expired && (
                            <Badge variant="destructive" className="text-xs">Expirado</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {coupon.description || 'Sem descrição'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Percent className="w-3 h-3" />
                            {coupon.discount_percent}%
                          </span>
                          {coupon.max_discount_value && (
                            <span>Máx: R$ {Number(coupon.max_discount_value).toFixed(2)}</span>
                          )}
                          {coupon.expires_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(coupon.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {coupon.times_assigned} atrib.
                          </span>
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            {coupon.times_used} usados
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(coupon)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm('Excluir este cupom e todas as atribuições?')) {
                            deleteMutation.mutate(coupon.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Código *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="Ex: DESCONTO20"
                className="mt-1 font-mono"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva o cupom..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div>
              <Label>Tipo de Cupom</Label>
              <Select 
                value={formData.coupon_type} 
                onValueChange={(v) => setFormData({ ...formData, coupon_type: v })}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desconto (%)</Label>
                <Input
                  type="number"
                  value={formData.discount_percent}
                  onChange={(e) => setFormData({ ...formData, discount_percent: Number(e.target.value) })}
                  min={0}
                  max={100}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Valor Máximo (R$)</Label>
                <Input
                  type="number"
                  value={formData.max_discount_value || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    max_discount_value: e.target.value ? Number(e.target.value) : null 
                  })}
                  min={0}
                  step={0.01}
                  placeholder="Sem limite"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Data de Expiração</Label>
              <Input
                type="date"
                value={formData.expires_at || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  expires_at: e.target.value || null 
                })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Deixe vazio para cupom sem expiração
              </p>
            </div>

            {formData.coupon_type === 'product_specific' && (
              <div>
                <Label>Produto</Label>
                <Select 
                  value={formData.product_id || ''} 
                  onValueChange={(v) => setFormData({ ...formData, product_id: v || null })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.filter(p => p.isActive).map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.coupon_type === 'caipirinha_dobro' && (
              <div>
                <Label>Quantidade Mínima</Label>
                <Input
                  type="number"
                  value={formData.min_quantity}
                  onChange={(e) => setFormData({ ...formData, min_quantity: Number(e.target.value) })}
                  min={1}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Quantidade mínima de caipirinhas para ativar o cupom
                </p>
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                  id="is-active"
                />
                <Label htmlFor="is-active" className="cursor-pointer">
                  Cupom ativo
                </Label>
              </div>
              
              {!editingCoupon && (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.assign_to_all}
                    onCheckedChange={(v) => setFormData({ ...formData, assign_to_all: v })}
                    id="assign-to-all"
                  />
                  <Label htmlFor="assign-to-all" className="cursor-pointer flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Atribuir a TODOS os clientes ativos
                  </Label>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
