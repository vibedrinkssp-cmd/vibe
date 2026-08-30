import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Gift, Leaf, Cookie, Sandwich, Wine, RotateCcw } from 'lucide-react';
import { BannerImageUploader } from '@/components/BannerImageUploader';
import { ensureImageUrl } from '@/lib/supabase';

// IDs fixos dos banners que correspondem ao FeatureBannerCarousel
const FEATURE_BANNERS = [
  {
    id: 'special-drinks',
    title: 'Drinks Especiais',
    description: 'Linha exclusiva de drinks',
    icon: Wine,
    defaultImage: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=200&fit=crop&q=60',
  },
  {
    id: 'combo',
    title: 'Monte Seu Combo',
    description: '5% OFF em combos personalizados',
    icon: Gift,
    defaultImage: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=200&fit=crop&q=80',
  },
  {
    id: 'natural-lunch',
    title: 'Combo Natural',
    description: 'Lanche + Suco por R$ 19,90',
    icon: Leaf,
    defaultImage: 'https://images.unsplash.com/photo-1540914124281-342587941389?w=400&h=200&fit=crop&q=80',
  },
  {
    id: 'salgado-combo',
    title: 'Salgado + Refri',
    description: 'Combo por R$ 12,99',
    icon: Cookie,
    defaultImage: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=400&h=200&fit=crop&q=80',
  },
  {
    id: 'hamburger-combo',
    title: 'Hambúrguer + Coca',
    description: 'Hambúrguer + Lata de Coca',
    icon: Sandwich,
    defaultImage: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=200&fit=crop&q=80',
  },
];

interface BannerImage {
  id: string;
  banner_id: string;
  image_url: string;
}

export function BannersTab() {
  const [editingBanner, setEditingBanner] = useState<typeof FEATURE_BANNERS[0] | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Buscar imagens customizadas dos banners
  const { data: bannerImages, isLoading } = useQuery({
    queryKey: ['feature-banner-images'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url')
        .in('title', FEATURE_BANNERS.map(b => b.id));
      
      if (error) throw error;
      
      // Map by banner_id (stored in title field)
      return (data || []).reduce((acc, item) => {
        acc[item.title] = item.image_url;
        return acc;
      }, {} as Record<string, string>);
    },
  });

  const bannerImagesMap = bannerImages || {};

  const saveMutation = useMutation({
    mutationFn: async ({ bannerId, imageUrl }: { bannerId: string; imageUrl: string }) => {
      // Check if banner already exists
      const { data: existing } = await supabase
        .from('banners')
        .select('id')
        .eq('title', bannerId)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase.rpc('update_banner', {
          p_id: existing.id,
          p_image_url: imageUrl,
        });
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase.rpc('create_banner', {
          p_title: bannerId,
          p_image_url: imageUrl,
          p_is_active: true,
          p_sort_order: FEATURE_BANNERS.findIndex(b => b.id === bannerId),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-banner-images'] });
      toast({ title: 'Sucesso', description: 'Imagem do banner atualizada!' });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar imagem',
        variant: 'destructive',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (bannerId: string) => {
      // Delete the custom banner to revert to default
      const { data: existing } = await supabase
        .from('banners')
        .select('id')
        .eq('title', bannerId)
        .single();

      if (existing) {
        const { error } = await supabase.rpc('delete_banner', { p_id: existing.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-banner-images'] });
      toast({ title: 'Sucesso', description: 'Banner restaurado para imagem padrão!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao restaurar banner',
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (banner: typeof FEATURE_BANNERS[0]) => {
    setEditingBanner(banner);
    setNewImageUrl(bannerImagesMap[banner.id] || '');
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBanner(null);
    setNewImageUrl('');
  };

  const handleSave = () => {
    if (!editingBanner || !newImageUrl) {
      toast({ title: 'Erro', description: 'Selecione uma imagem', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({ bannerId: editingBanner.id, imageUrl: newImageUrl });
  };

  const handleReset = (bannerId: string) => {
    if (confirm('Restaurar este banner para a imagem padrão?')) {
      resetMutation.mutate(bannerId);
    }
  };

  const getImageUrl = (banner: typeof FEATURE_BANNERS[0]) => {
    return bannerImagesMap[banner.id] || banner.defaultImage;
  };

  const hasCustomImage = (bannerId: string) => {
    return !!bannerImagesMap[bannerId];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Carregando banners...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gerenciar Banners</h2>
        <p className="text-muted-foreground">
          Altere as imagens de fundo dos banners do carrossel da página inicial. 
          As funcionalidades de cada banner são fixas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {FEATURE_BANNERS.map((banner) => {
          const Icon = banner.icon;
          const isCustom = hasCustomImage(banner.id);
          
          return (
            <Card key={banner.id} className="overflow-hidden">
              <div className="relative h-24 bg-muted">
                <img
                  src={ensureImageUrl(getImageUrl(banner))}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = banner.defaultImage;
                  }}
                />
                {isCustom && (
                  <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                    Personalizado
                  </span>
                )}
              </div>
              <CardContent className="p-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(banner)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Alterar Imagem
                  </Button>
                  {isCustom && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReset(banner.id)}
                      title="Restaurar imagem padrão"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog para editar imagem */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingBanner && (
                <>
                  {(() => {
                    const Icon = editingBanner.icon;
                    return <Icon className="h-5 w-5 text-primary" />;
                  })()}
                  Alterar Imagem: {editingBanner.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Selecione uma nova imagem para o banner "{editingBanner?.title}".
                A funcionalidade do banner permanece a mesma.
              </p>
              
              <BannerImageUploader
                currentImageUrl={newImageUrl}
                onImageUploaded={(url) => setNewImageUrl(url)}
                onImageRemoved={() => setNewImageUrl('')}
              />
              
              <p className="text-xs text-muted-foreground mt-2">
                Recomendado: 400x200px (proporção 2:1). A imagem será otimizada automaticamente.
              </p>
            </div>

            {editingBanner && (
              <div className="border rounded-lg overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground px-3 py-2 bg-muted">
                  Pré-visualização
                </p>
                <div className="relative h-24">
                  <img
                    src={ensureImageUrl(newImageUrl || editingBanner.defaultImage)}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-2 left-3 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/90 flex items-center justify-center">
                      {(() => {
                        const Icon = editingBanner.icon;
                        return <Icon className="h-4 w-4 text-primary-foreground" />;
                      })()}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{editingBanner.title}</h3>
                      <p className="text-white/80 text-xs">{editingBanner.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleCloseDialog} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!newImageUrl || saveMutation.isPending}
                className="flex-1"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
