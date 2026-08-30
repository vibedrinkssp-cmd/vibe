import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  ArrowLeft, User, MapPin, Package, Clock, Truck, CheckCircle, XCircle, 
  ChefHat, AlertCircle, Edit2, Trash2, Plus, Save, X, Phone, LogOut, AlertTriangle, Navigation, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose 
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
import { useOrders, useOrderItems, useAddresses } from '@/hooks/use-supabase-data';
import { mapAddress } from '@/lib/db-mappers';
import { AddressAutocomplete } from '@/components/location/AddressAutocomplete';
import { InteractiveAddressMap } from '@/components/location/InteractiveAddressMap';
import { useGoogleMaps, type AddressComponents } from '@/hooks/use-google-maps';
import type { Order, OrderItem, Address } from '@/shared/schema';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type OrderStatus, type PaymentMethod } from '@/shared/schema';

interface OrderWithItems extends Order {
  items: OrderItem[];
}

const STATUS_CONFIG: Record<OrderStatus, { icon: typeof Package; color: string }> = {
  pending: { icon: AlertCircle, color: 'bg-yellow/20 text-yellow border-yellow/30' },
  accepted: { icon: CheckCircle, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  preparing: { icon: ChefHat, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  ready: { icon: Package, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  dispatched: { icon: Truck, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  arrived: { icon: Truck, color: 'bg-purple-600/20 text-purple-500 border-purple-600/30' },
  delivered: { icon: CheckCircle, color: 'bg-green-600/20 text-green-500 border-green-600/30' },
  cancelled: { icon: XCircle, color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const profileFormSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  whatsapp: z.string().min(10, 'WhatsApp deve ter pelo menos 10 digitos').max(15, 'WhatsApp invalido'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const addressFormSchema = z.object({
  street: z.string().min(3, 'Rua e obrigatoria'),
  number: z.string().min(1, 'Numero e obrigatorio'),
  complement: z.string().optional(),
  neighborhood: z.string().min(2, 'Bairro e obrigatorio'),
  city: z.string().min(2, 'Cidade e obrigatoria'),
  state: z.string().length(2, 'Estado deve ter 2 letras'),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type AddressFormValues = z.infer<typeof addressFormSchema>;

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated, login, logout, setAddress: setAuthAddress, address: currentAddress } = useAuth();
  const { geocodeAddress } = useGoogleMaps();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressDistanceError, setAddressDistanceError] = useState('');

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user?.name || '',
      whatsapp: user?.whatsapp || '',
    },
  });

  const addressForm = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        name: user.name || '',
        whatsapp: user.whatsapp || '',
      });
    }
  }, [user, profileForm]);

  // Use Supabase hooks for data fetching
  const { data: addresses = [], isLoading: isLoadingAddresses } = useAddresses(user?.id || '', { enabled: !!user?.id });

  // Sync default address to auth context whenever addresses change
  useEffect(() => {
    if (addresses.length > 0) {
      const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
      // Only update if the address data actually changed
      if (defaultAddr && (!currentAddress || defaultAddr.id !== currentAddress.id || 
          defaultAddr.street !== currentAddress.street || 
          defaultAddr.latitude !== currentAddress.latitude ||
          defaultAddr.longitude !== currentAddress.longitude)) {
        setAuthAddress(defaultAddr);
      }
    }
  }, [addresses, currentAddress, setAuthAddress]);

  const { data: ordersRaw = [], isLoading: isLoadingOrders } = useOrders({
    userId: user?.id,
    enabled: !!user?.id,
    useRpc: true, // Use RPC to bypass RLS for custom auth
  });

  const orderIds = ordersRaw.map(o => o.id);
  // Use admin RPC to bypass RLS for custom auth
  const { data: orderItems = [] } = useOrderItems(orderIds, { 
    enabled: orderIds.length > 0,
    useAdminRpc: true,
  });

  const orders: OrderWithItems[] = ordersRaw.map(order => ({
    ...order,
    items: orderItems.filter(item => item.orderId === order.id),
  }));

  const updateUserMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      if (!user?.id) throw new Error('User not found');
      const { data: updated, error } = await supabase
        .from('users')
        .update({ name: data.name, whatsapp: data.whatsapp })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    },
    onSuccess: (updated) => {
      login({ ...user!, name: updated.name, whatsapp: updated.whatsapp }, 'customer');
      setIsEditingProfile(false);
      toast({ title: 'Dados atualizados com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar dados', variant: 'destructive' });
    },
  });

  // Fetch store settings for distance validation
  const { data: storeSettings } = useQuery({
    queryKey: ['store-settings-for-distance'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_store_info');
      if (error) return null;
      const rows = data as any[];
      if (!rows || rows.length === 0) return null;
      return { store_lat: rows[0].store_lat, store_lng: rows[0].store_lng };
    },
  });

  const MAX_DISTANCE_KM = 22;

  const buildAddressSearchText = (data: AddressFormValues) =>
    [data.street, data.number, data.neighborhood, data.city, data.state, 'Brasil']
      .filter(Boolean)
      .join(', ');

  const resolveAddressCoordinates = async (data: AddressFormValues) => {
    if (data.latitude != null && data.longitude != null) {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
      };
    }

    const geocoded = await geocodeAddress(buildAddressSearchText(data));

    if (!geocoded?.latitude || !geocoded?.longitude) {
      throw new Error('MISSING_COORDINATES');
    }

    return {
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
    };
  };

  const handleAddressInputChange = (field: keyof AddressFormValues, value: string) => {
    addressForm.setValue(field, value, { shouldDirty: true, shouldValidate: true });

    if (['street', 'number', 'neighborhood', 'city', 'state'].includes(field)) {
      addressForm.setValue('latitude', undefined, { shouldDirty: true });
      addressForm.setValue('longitude', undefined, { shouldDirty: true });
      setAddressDistanceError('');
    }
  };

  const validateDistance = (lat: number | undefined | null, lng: number | undefined | null): boolean => {
    if (!lat || !lng || !storeSettings?.store_lat || !storeSettings?.store_lng) return true; // Allow if no coords
    const R = 6371;
    const dLat = (Number(storeSettings.store_lat) - lat) * Math.PI / 180;
    const dLng = (Number(storeSettings.store_lng) - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(Number(storeSettings.store_lat) * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return dist <= MAX_DISTANCE_KM;
  };

  const createAddressMutation = useMutation({
    mutationFn: async (data: AddressFormValues) => {
      if (!user?.id) throw new Error('User not found');
      const resolvedCoordinates = await resolveAddressCoordinates(data);

      if (!validateDistance(resolvedCoordinates.latitude, resolvedCoordinates.longitude)) {
        throw new Error('DISTANCE_TOO_FAR');
      }

      const { data: newId, error } = await supabase.rpc('create_user_address', {
        p_user_id: user.id,
        p_street: data.street,
        p_number: data.number,
        p_neighborhood: data.neighborhood,
        p_city: data.city,
        p_state: data.state,
        p_complement: data.complement || undefined,
        p_zip_code: data.zipCode || undefined,
        p_notes: data.notes || undefined,
        p_latitude: resolvedCoordinates.latitude,
        p_longitude: resolvedCoordinates.longitude,
        p_is_default: addresses.length === 0,
      });
      if (error) throw error;
      return newId;
    },
    onSuccess: async () => {
      setIsAddressDialogOpen(false);
      addressForm.reset();
      toast({ title: 'Endereço adicionado com sucesso!' });
      await queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
    },
    onError: (err: any) => {
      if (err.message === 'DISTANCE_TOO_FAR') {
        toast({ title: 'Endereço muito distante', description: `Não atendemos endereços acima de ${MAX_DISTANCE_KM}km.`, variant: 'destructive' });
      } else if (err.message === 'MISSING_COORDINATES') {
        toast({ title: 'Localização obrigatória', description: 'Não conseguimos localizar o endereço digitado. Use a busca, o GPS ou ajuste no mapa.', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao adicionar endereço', variant: 'destructive' });
      }
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (data: AddressFormValues) => {
      if (!editingAddress?.id || !user?.id) throw new Error('Address not found');
      const resolvedCoordinates = await resolveAddressCoordinates(data);

      if (!validateDistance(resolvedCoordinates.latitude, resolvedCoordinates.longitude)) {
        throw new Error('DISTANCE_TOO_FAR');
      }
      
      const { error } = await supabase.rpc('update_user_address', {
        p_address_id: editingAddress.id,
        p_user_id: user.id,
        p_street: data.street,
        p_number: data.number,
        p_neighborhood: data.neighborhood,
        p_city: data.city,
        p_state: data.state,
        p_complement: data.complement || undefined,
        p_zip_code: data.zipCode || undefined,
        p_notes: data.notes || undefined,
        p_latitude: resolvedCoordinates.latitude,
        p_longitude: resolvedCoordinates.longitude,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setIsAddressDialogOpen(false);
      setEditingAddress(null);
      addressForm.reset();
      toast({ title: 'Endereço atualizado com sucesso!' });
      await queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
    },
    onError: (err: any) => {
      if (err.message === 'DISTANCE_TOO_FAR') {
        toast({ title: 'Endereço muito distante', description: `Não atendemos endereços acima de ${MAX_DISTANCE_KM}km.`, variant: 'destructive' });
      } else if (err.message === 'MISSING_COORDINATES') {
        toast({ title: 'Localização obrigatória', description: 'Não conseguimos localizar o endereço digitado. Use a busca, o GPS ou ajuste no mapa.', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao atualizar endereço', variant: 'destructive' });
      }
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!user?.id) throw new Error('User not found');
      const { error } = await supabase.rpc('delete_user_address', {
        p_address_id: addressId,
        p_user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: 'Endereço removido com sucesso!' });
      await queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
    },
    onError: () => {
      toast({ title: 'Erro ao remover endereço', variant: 'destructive' });
    },
  });

  const setDefaultAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!user?.id) throw new Error('User not found');
      const { error } = await supabase.rpc('set_default_address', {
        p_address_id: addressId,
        p_user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: 'Endereço padrão atualizado!' });
      await queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] });
    },
    onError: () => {
      toast({ title: 'Erro ao definir endereço padrão', variant: 'destructive' });
    },
  });

  const [autocompleteKey, setAutocompleteKey] = useState(0);

  const openEditAddress = (address: Address) => {
    setEditingAddress(address);
    addressForm.reset({
      street: address.street,
      number: address.number,
      complement: address.complement || '',
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      notes: address.notes || '',
      latitude: address.latitude || undefined,
      longitude: address.longitude || undefined,
    });
    // Force remount of autocomplete with new key
    setAutocompleteKey(prev => prev + 1);
    setAddressDistanceError('');
    setIsAddressDialogOpen(true);
  };

  const openNewAddress = () => {
    setEditingAddress(null);
    addressForm.reset({
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
      notes: '',
      latitude: undefined,
      longitude: undefined,
    });
    // Force remount of autocomplete with new key
    setAutocompleteKey(prev => prev + 1);
    setAddressDistanceError('');
    setIsAddressDialogOpen(true);
  };

  const handleSaveAddress = (data: AddressFormValues) => {
    if (editingAddress) {
      updateAddressMutation.mutate(data);
    } else {
      createAddressMutation.mutate(data);
    }
  };

  const handleSaveProfile = (data: ProfileFormValues) => {
    updateUserMutation.mutate(data);
  };

  const formatPrice = (price: number | string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(price));
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date as string | Date));
  };

  const formatWhatsapp = (phone: string | undefined | null) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  if (!isAuthenticated || !user) {
    navigate('/login?redirect=/perfil');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
    toast({ title: 'Voce saiu da sua conta' });
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 overflow-x-hidden" style={{ paddingBottom: 'max(32px, calc(16px + env(safe-area-inset-bottom, 0px)))' }}>
      <div className="max-w-4xl mx-auto pb-8">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            className="text-primary"
            onClick={() => navigate('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar ao cardapio
          </Button>
          <Button
            variant="outline"
            className="border-destructive/50 text-destructive"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair da conta
          </Button>
        </div>

        <h1 className="font-serif text-3xl text-primary mb-8">Meu Perfil</h1>

        <Tabs defaultValue="dados" className="space-y-6">
          <TabsList className="bg-card border border-primary/20 p-1">
            <TabsTrigger 
              value="dados" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-dados"
            >
              <User className="h-4 w-4 mr-2" />
              Dados Pessoais
            </TabsTrigger>
            <TabsTrigger 
              value="enderecos"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-enderecos"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Enderecos
            </TabsTrigger>
            <TabsTrigger 
              value="pedidos"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-pedidos"
            >
              <Package className="h-4 w-4 mr-2" />
              Historico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4">
            <Card className="bg-card border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <User className="h-5 w-5 text-primary" />
                  Informacoes Pessoais
                </CardTitle>
                {!isEditingProfile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                    data-testid="button-edit-profile"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingProfile ? (
                  <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(handleSaveProfile)} className="space-y-4">
                      <FormField
                        control={profileForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Nome</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="bg-secondary/50 border-primary/20"
                                data-testid="input-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={profileForm.control}
                        name="whatsapp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">WhatsApp</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="bg-secondary/50 border-primary/20"
                                placeholder="11999999999"
                                data-testid="input-whatsapp"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2 pt-2">
                        <Button
                          type="submit"
                          disabled={updateUserMutation.isPending}
                          className="bg-primary text-primary-foreground"
                          data-testid="button-save-profile"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {updateUserMutation.isPending ? 'Salvando...' : 'Salvar'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsEditingProfile(false);
                            profileForm.reset({
                              name: user.name || '',
                              whatsapp: user.whatsapp || '',
                            });
                          }}
                          data-testid="button-cancel-edit"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </Form>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg border border-primary/10">
                      <User className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Nome</p>
                        <p className="font-medium text-foreground" data-testid="text-user-name">{user.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg border border-primary/10">
                      <Phone className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">WhatsApp</p>
                        <p className="font-medium text-foreground" data-testid="text-user-whatsapp">
                          {formatWhatsapp(user.whatsapp)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg border border-primary/10">
                      <Clock className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Membro desde</p>
                        <p className="font-medium text-foreground" data-testid="text-member-since">
                          {user.createdAt ? formatDate(user.createdAt) : 'Data nao disponivel'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enderecos" className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Meu Endereço de Entrega</h2>

            <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
              <DialogContent className="bg-card border-primary/20 max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-foreground">
                    {addresses.length > 0 ? 'Alterar Endereço' : 'Cadastrar Endereço'}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Busque seu endereço ou use sua localização atual.
                  </DialogDescription>
                </DialogHeader>
                
                {/* Smart Address Search */}
                <div className="pt-2 pb-4 border-b border-primary/10">
                  <AddressAutocomplete
                    key={autocompleteKey}
                    defaultValue={editingAddress ? `${editingAddress.street}, ${editingAddress.number} - ${editingAddress.neighborhood}, ${editingAddress.city}` : ''}
                    onAddressSelect={(addr: AddressComponents) => {
                      addressForm.setValue('street', addr.street);
                      addressForm.setValue('number', addr.number);
                      addressForm.setValue('city', addr.city);
                      addressForm.setValue('state', addr.state.length === 2 ? addr.state : 'SP');
                      addressForm.setValue('zipCode', addr.zipCode);
                      addressForm.setValue('latitude', addr.latitude);
                      addressForm.setValue('longitude', addr.longitude);
                      addressForm.setValue('neighborhood', addr.neighborhood);
                      if (addr.latitude && addr.longitude) {
                        if (!validateDistance(addr.latitude, addr.longitude)) {
                          const R = 6371;
                          const dLat = (Number(storeSettings?.store_lat) - addr.latitude) * Math.PI / 180;
                          const dLng = (Number(storeSettings?.store_lng) - addr.longitude) * Math.PI / 180;
                          const a = Math.sin(dLat / 2) ** 2 + Math.cos(addr.latitude * Math.PI / 180) * Math.cos(Number(storeSettings?.store_lat) * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                          setAddressDistanceError(`Endereço a ${dist.toFixed(1)}km — acima do limite de ${MAX_DISTANCE_KM}km.`);
                        } else {
                          setAddressDistanceError('');
                        }
                      }
                    }}
                    placeholder="Buscar novo endereço ou usar GPS..."
                    showCurrentAddressHint={!!editingAddress}
                  />
                  {editingAddress && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="text-primary">Endereço atual:</span> {editingAddress.street}, {editingAddress.number} - {editingAddress.neighborhood}
                    </p>
                  )}
                  {addressDistanceError && (
                    <Alert className="mt-2 bg-destructive/10 border-destructive/30">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <AlertDescription className="text-sm text-destructive">
                        {addressDistanceError}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                
                <Form {...addressForm}>
                  <form onSubmit={addressForm.handleSubmit(handleSaveAddress)} className="space-y-4 pt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <FormField
                          control={addressForm.control}
                          name="street"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Rua</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => handleAddressInputChange('street', e.target.value)}
                                  className="bg-secondary/50 border-primary/20"
                                  placeholder="Nome da rua"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={addressForm.control}
                        name="number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Número</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => handleAddressInputChange('number', e.target.value)}
                                className="bg-secondary/50 border-primary/20"
                                placeholder="123"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={addressForm.control}
                      name="complement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Complemento (opcional)</FormLabel>
                          <FormControl>
                            <Input {...field} className="bg-secondary/50 border-primary/20" placeholder="Apto, bloco, etc." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addressForm.control}
                      name="neighborhood"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Bairro</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => handleAddressInputChange('neighborhood', e.target.value)}
                              className="bg-secondary/50 border-primary/20"
                              placeholder="Bairro"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addressForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Cidade</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => handleAddressInputChange('city', e.target.value)}
                              className="bg-secondary/50 border-primary/20"
                              placeholder="Cidade"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addressForm.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Estado</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => handleAddressInputChange('state', e.target.value.toUpperCase().slice(0, 2))}
                                className="bg-secondary/50 border-primary/20"
                                placeholder="SP"
                                maxLength={2}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addressForm.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">CEP</FormLabel>
                            <FormControl>
                              <Input {...field} className="bg-secondary/50 border-primary/20" placeholder="00000-000" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={addressForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Observações (opcional)</FormLabel>
                          <FormControl>
                            <Input {...field} className="bg-secondary/50 border-primary/20" placeholder="Ponto de referência, instruções de entrega..." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Interactive Map Preview */}
                    <div className="pt-2">
                      <FormLabel className="text-foreground mb-2 block">Localização no Mapa</FormLabel>
                      <InteractiveAddressMap
                        latitude={addressForm.watch('latitude')}
                        longitude={addressForm.watch('longitude')}
                        className="h-[200px]"
                        onLocationChange={(lat, lng) => {
                          addressForm.setValue('latitude', lat);
                          addressForm.setValue('longitude', lng);
                          if (!validateDistance(lat, lng)) {
                            setAddressDistanceError(`Endereço muito distante — acima do limite de ${MAX_DISTANCE_KM}km.`);
                          } else {
                            setAddressDistanceError('');
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Clique no mapa para ajustar a localização exata
                      </p>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        type="submit"
                        disabled={createAddressMutation.isPending || updateAddressMutation.isPending || !!addressDistanceError}
                        className="flex-1 bg-primary text-primary-foreground"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {createAddressMutation.isPending || updateAddressMutation.isPending
                          ? 'Salvando...'
                          : 'Salvar Endereço'}
                      </Button>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Cancelar</Button>
                      </DialogClose>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            {isLoadingAddresses ? (
              <Card className="bg-card border-primary/20">
                <CardContent className="p-6">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ) : addresses.length === 0 ? (
              <Card className="bg-card border-primary/20">
                <CardContent className="p-12 text-center">
                  <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">Nenhum endereço cadastrado</h3>
                  <p className="text-muted-foreground mb-6">
                    Adicione seu endereço para receber entregas
                  </p>
                  <Button
                    onClick={openNewAddress}
                    className="bg-primary text-primary-foreground"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar Endereço
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-primary/20 ring-2 ring-primary">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        <Badge className="bg-primary/20 text-primary border-primary/30">
                          Endereço de Entrega
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground">
                        {addresses[0].street}, {addresses[0].number}
                        {addresses[0].complement && ` - ${addresses[0].complement}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {addresses[0].neighborhood}, {addresses[0].city} - {addresses[0].state}
                      </p>
                      {addresses[0].zipCode && (
                        <p className="text-sm text-muted-foreground">CEP: {addresses[0].zipCode}</p>
                      )}
                      {addresses[0].notes && (
                        <p className="text-sm text-yellow mt-2">Obs: {addresses[0].notes}</p>
                      )}
                      {addresses[0].latitude && addresses[0].longitude && (
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                            <Navigation className="h-3 w-3 mr-1" />
                            GPS Confirmado
                          </Badge>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary/30 text-primary"
                      onClick={() => openEditAddress(addresses[0])}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Alterar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pedidos" className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Historico de Pedidos</h2>

            {isLoadingOrders ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-card border-primary/20">
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-32 mb-4" />
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <Card className="bg-card border-primary/20">
                <CardContent className="p-12 text-center">
                  <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">Nenhum pedido ainda</h3>
                  <p className="text-muted-foreground mb-6">
                    Voce ainda nao fez nenhum pedido. Que tal explorar nosso cardapio?
                  </p>
                  <Button
                    className="bg-primary text-primary-foreground"
                    onClick={() => navigate('/')}
                    data-testid="button-explore-menu"
                  >
                    Ver Cardapio
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const status = order.status as OrderStatus;
                  const config = STATUS_CONFIG[status];
                  const StatusIcon = config.icon;

                  return (
                    <Card key={order.id} className="bg-card border-primary/20" data-testid={`order-card-${order.id}`}>
                      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${config.color}`}>
                            <StatusIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-foreground text-lg">
                              Pedido #{order.id.slice(-6).toUpperCase()}
                            </CardTitle>
                            <p className="text-muted-foreground text-sm flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(order.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Badge className={config.color} data-testid={`status-badge-${order.id}`}>
                          {ORDER_STATUS_LABELS[status]}
                        </Badge>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                {item.quantity}x {item.productName}
                              </span>
                              <span className="text-foreground">
                                {formatPrice(item.totalPrice)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-3 border-t border-primary/10 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="text-foreground">{formatPrice(order.subtotal)}</span>
                          </div>
                          {Number(order.discount || 0) > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-green-400">Desconto Combo</span>
                              <span className="text-green-400">-{formatPrice(order.discount || 0)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Truck className="h-3 w-3" />
                              Entrega
                            </span>
                            <span className="text-foreground">{formatPrice(order.deliveryFee)}</span>
                          </div>
                          <div className="flex justify-between font-semibold pt-2">
                            <span className="text-foreground">Total</span>
                            <span className="text-primary">{formatPrice(order.total)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm pt-2 border-t border-primary/10">
                          <span className="text-muted-foreground">
                            Pagamento: {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod]}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
