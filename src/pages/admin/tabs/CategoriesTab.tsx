// Categories Tab Component
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Eye, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAdminCategories, useAdminProducts } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency, type Category, type Product } from '../shared';
import { CATEGORY_ICONS, getCategoryIcon, CategoryIconDisplay } from '@/lib/category-icons';
import { ensureImageUrl } from '@/lib/supabase';

export function CategoriesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string>('glass-water');

  const { data: categories = [] } = useAdminCategories();
  const { data: products = [] } = useAdminProducts();

  const getProductCountByCategory = (categoryId: string) => {
    return products.filter(p => p.categoryId === categoryId).length;
  };

  const getProductsByCategory = (categoryId: string) => {
    return products.filter(p => p.categoryId === categoryId);
  };

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Category>) => {
      const { error } = await supabase.rpc('create_category', {
        p_name: data.name!,
        p_icon_url: data.iconUrl || undefined,
        p_sort_order: data.sortOrder || 0,
        p_is_special: false,
        p_is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Categoria criada!' });
      setIsDialogOpen(false);
    },
    onError: (err) => {
      console.error('Error creating category:', err);
      toast({ title: 'Erro ao criar categoria', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Category> }) => {
      const { error } = await supabase.rpc('update_category', {
        p_id: id,
        p_name: data.name !== undefined ? data.name : undefined,
        p_icon_url: data.iconUrl !== undefined ? (data.iconUrl ?? undefined) : undefined,
        p_sort_order: data.sortOrder !== undefined ? data.sortOrder : undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Categoria atualizada!' });
      setIsDialogOpen(false);
      setEditingCategory(null);
    },
    onError: (err) => {
      console.error('Error updating category:', err);
      toast({ title: 'Erro ao atualizar categoria', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const count = getProductCountByCategory(id);
      if (count > 0) {
        throw new Error('Remova os produtos desta categoria primeiro');
      }
      const { error } = await supabase.rpc('delete_category', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Categoria excluída!' });
    },
    onError: (error: Error) => {
      console.error('Error deleting category:', error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const handleOpenCategoryDialog = (cat: Category | null) => {
    setEditingCategory(cat);
    if (cat) {
      setSelectedIcon(cat.iconUrl || 'glass-water');
    } else {
      setSelectedIcon('glass-water');
    }
    setIsDialogOpen(true);
  };

  const handleViewCategory = (category: Category) => {
    setViewingCategory(category);
    setIsViewDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      iconUrl: selectedIcon,
      sortOrder: parseInt(formData.get('sortOrder') as string) || 0,
    };

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl text-primary">Categorias</h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">{categories.length} categorias (A-Z)</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenCategoryDialog(null)} size="sm" className="text-xs" data-testid="button-add-category">
              <Plus className="w-4 h-4 mr-1" />
              Nova
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" defaultValue={editingCategory?.name} required autoUppercase data-testid="input-category-name" />
              </div>
              <div>
                <Label>Ícone</Label>
                <div className="grid grid-cols-6 gap-2 mt-2 max-h-[200px] overflow-y-auto p-2 border rounded-md">
                  {CATEGORY_ICONS.map((iconOption) => {
                    const IconComp = iconOption.icon;
                    return (
                      <button
                        key={iconOption.id}
                        type="button"
                        onClick={() => setSelectedIcon(iconOption.id)}
                        className={`p-2 rounded-md flex flex-col items-center gap-1 transition-all ${
                          selectedIcon === iconOption.id 
                            ? 'bg-primary/20 border-2 border-primary' 
                            : 'bg-muted/50 border border-transparent hover:border-primary/30'
                        }`}
                        title={iconOption.name}
                        data-testid={`button-icon-${iconOption.id}`}
                      >
                        <IconComp className={`w-5 h-5 ${selectedIcon === iconOption.id ? 'text-primary' : 'text-muted-foreground'}`} />
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecionado: {CATEGORY_ICONS.find(i => i.id === selectedIcon)?.name || 'Água'}
                </p>
              </div>
              <div>
                <Label htmlFor="sortOrder">Ordem</Label>
                <Input id="sortOrder" name="sortOrder" type="number" defaultValue={editingCategory?.sortOrder || 0} />
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-category">
                {editingCategory ? 'Salvar' : 'Criar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {sortedCategories.map(category => {
          const productCount = getProductCountByCategory(category.id);
          
          return (
            <Card 
              key={category.id} 
              data-testid={`card-category-${category.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/20">
                    <CategoryIconDisplay iconId={category.iconUrl} className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">
                      {category.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">{productCount} produtos</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleViewCategory(category)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleOpenCategoryDialog(category)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      if (productCount > 0) {
                        toast({ title: 'Remova os produtos primeiro', variant: 'destructive' });
                        return;
                      }
                      if (confirm('Excluir esta categoria?')) {
                        deleteMutation.mutate(category.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingCategory && (
                <>
                  <CategoryIconDisplay iconId={viewingCategory.iconUrl} className="h-5 w-5 text-primary" />
                  Produtos em: {viewingCategory.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingCategory && (
            <div className="space-y-4">
              {getProductsByCategory(viewingCategory.id).length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum produto nesta categoria
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {getProductsByCategory(viewingCategory.id).map(product => (
                    <Card key={product.id}>
                      <CardContent className="p-4 flex items-center gap-4">
                        {product.imageUrl ? (
                          <img 
                            src={ensureImageUrl(product.imageUrl)} 
                            alt={product.name} 
                            className="w-14 h-14 object-contain rounded-lg bg-white/10" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/400x400?text=Sem+Imagem';
                            }}
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center">
                            <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{product.name}</h4>
                          <span className="text-sm text-muted-foreground">
                            Estoque: {product.stock}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary">{formatCurrency(product.salePrice)}</p>
                          <p className="text-xs text-muted-foreground">Custo: {formatCurrency(product.costPrice)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
