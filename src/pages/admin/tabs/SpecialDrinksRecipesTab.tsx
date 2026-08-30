import { useState, useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAdminProducts, useAdminCategories } from '../use-admin-data';
import { formatCurrency } from '../shared';
import { compressImage } from '@/lib/image-compression';
import { uploadImage, ensureImageUrl } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getAdminSessionToken } from '@/lib/admin-session';
import {
  Wine, Plus, Trash2, Search, Upload, Loader2, Sparkles, Beaker, Zap, Package,
} from 'lucide-react';

/* ─── Types ─── */
interface Recipe {
  id: string;
  product_id: string;
  ingredient_product_id: string | null;
  bottle_product_name: string | null;
  ingredient_type: string;
  quantity: number;
  created_at: string;
}

/* ─── Hooks ─── */
function useRecipes(sessionToken: string | null, productId?: string) {
  return useQuery<Recipe[]>({
    queryKey: ['special-drink-recipes', sessionToken || 'no-session', productId || 'all'],
    queryFn: async () => {
      if (!sessionToken) return [];
      const { data, error } = await supabase.rpc('get_special_drink_recipes_admin', {
        p_session_token: sessionToken,
        p_product_id: productId || undefined,
      });
      if (error) throw error;
      return (data || []) as Recipe[];
    },
    enabled: !!sessionToken,
  });
}

/* ─── Component ─── */
export function SpecialDrinksRecipesTab({ sessionTokenOverride }: { sessionTokenOverride?: string | null } = {}) {
  const { toast } = useToast();
  const { sessionToken: authSessionToken } = useAuth();
  const sessionToken = sessionTokenOverride || getAdminSessionToken(authSessionToken);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDrinkId, setSelectedDrinkId] = useState<string | null>(null);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  // New ingredient form state
  const [ingredientType, setIngredientType] = useState<'dose' | 'product'>('dose');
  const [ingredientProductId, setIngredientProductId] = useState('');
  const [ingredientQty, setIngredientQty] = useState(1);
  const [ingredientSearch, setIngredientSearch] = useState('');

  const { data: products = [] } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes(sessionToken);

  // Fetch open bottles for dose selection
  const { data: openBottles = [] } = useQuery({
    queryKey: ['open-bottles-for-recipes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_available_bottles_for_assembly');
      if (error) throw error;
      return (data || []) as { bottle_id: string; product_id: string; product_name: string; remaining_doses: number; dose_price: number }[];
    },
  });

  // Find special drinks category
  const specialCat = useMemo(
    () => categories.find(c => c.name.toLowerCase() === 'drinks especiais'),
    [categories]
  );

  const specialDrinks = useMemo(
    () => products.filter(p => p.categoryId === specialCat?.id && p.isActive),
    [products, specialCat]
  );

  const filteredDrinks = useMemo(() => {
    if (!searchQuery) return specialDrinks;
    return specialDrinks.filter(p => searchIncludes(p.name, searchQuery));
  }, [specialDrinks, searchQuery]);

  // Non-special products (for ingredients like energéticos)
  const ingredientProducts = useMemo(
    () => products.filter(p => p.categoryId !== specialCat?.id && p.isActive),
    [products, specialCat]
  );

  const recipesForDrink = useMemo(
    () => selectedDrinkId ? recipes.filter(r => r.product_id === selectedDrinkId) : [],
    [recipes, selectedDrinkId]
  );

  const selectedDrink = specialDrinks.find(d => d.id === selectedDrinkId);

  /* ─── Mutations ─── */
  const addRecipeMutation = useMutation({
    mutationFn: async (params: { product_id: string; ingredient_type: 'dose' | 'product'; ingredient_product_id: string; quantity: number }) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa não encontrada. Faça login novamente.');
      }

      const { error } = await supabase.rpc('create_special_drink_recipe_admin', {
        p_session_token: sessionToken,
        p_product_id: params.product_id,
        p_ingredient_type: params.ingredient_type,
        p_ingredient_product_id: params.ingredient_product_id,
        p_quantity: params.quantity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-drink-recipes'] });
      toast({ title: 'Ingrediente adicionado!' });
      setShowAddIngredient(false);
      resetIngredientForm();
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa não encontrada. Faça login novamente.');
      }

      const { error } = await supabase.rpc('delete_special_drink_recipe_admin', {
        p_session_token: sessionToken,
        p_recipe_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-drink-recipes'] });
      toast({ title: 'Ingrediente removido' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteDrinkMutation = useMutation({
    mutationFn: async ({ drinkId, recipeIds }: { drinkId: string; recipeIds: string[] }) => {
      if (recipeIds.length > 0) {
        if (!sessionToken) {
          throw new Error('Sessão administrativa não encontrada. Faça login novamente.');
        }

        for (const recipeId of recipeIds) {
          const { error: recipeError } = await supabase.rpc('delete_special_drink_recipe_admin', {
            p_session_token: sessionToken,
            p_recipe_id: recipeId,
          });

          if (recipeError) throw recipeError;
        }
      }

      const { error } = await supabase.rpc('delete_product', { p_id: drinkId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-drink-recipes'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelectedDrinkId(null);
      toast({ title: 'Drink especial excluído!' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao excluir drink', description: e.message, variant: 'destructive' }),
  });

  const updateImageMutation = useMutation({
    mutationFn: async ({ productId, imageUrl }: { productId: string; imageUrl: string }) => {
      if (!sessionToken) {
        throw new Error('Sessão administrativa não encontrada. Faça login novamente.');
      }

      const { error } = await supabase.rpc('update_special_drink_image_admin', {
        p_session_token: sessionToken,
        p_product_id: productId,
        p_image_url: imageUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Foto atualizada!' });
      setUploadingFor(null);
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao atualizar foto', description: e.message, variant: 'destructive' });
      setUploadingFor(null);
    },
  });

  /* ─── Handlers ─── */
  const resetIngredientForm = () => {
    setIngredientType('dose');
    setIngredientProductId('');
    setIngredientQty(1);
    setIngredientSearch('');
  };

  const handleAddIngredient = () => {
    if (!selectedDrinkId) return;
    if (!ingredientProductId) {
      toast({
        title: ingredientType === 'dose' ? 'Selecione o destilado da receita' : 'Selecione o produto',
        variant: 'destructive',
      });
      return;
    }

    addRecipeMutation.mutate({
      product_id: selectedDrinkId,
      ingredient_type: ingredientType,
      ingredient_product_id: ingredientProductId,
      quantity: ingredientQty,
    });
  };

  const handleImageUpload = async (productId: string, file: File) => {
    setUploadingFor(productId);
    try {
      const compressed = await compressImage(file, 512, 0.8);
      const result = await uploadImage(compressed.file, 'special-drinks');
      updateImageMutation.mutate({ productId, imageUrl: result.publicUrl });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
      setUploadingFor(null);
    }
  };

  const handleDeleteDrink = (drinkId: string, drinkName: string) => {
    const recipeIds = recipes
      .filter(recipe => recipe.product_id === drinkId)
      .map(recipe => recipe.id);

    const confirmed = window.confirm(
      recipeIds.length > 0
        ? `Excluir o drink especial "${drinkName}" e remover ${recipeIds.length} ingrediente(s) da receita?`
        : `Excluir o drink especial "${drinkName}"?`
    );

    if (!confirmed) return;

    deleteDrinkMutation.mutate({ drinkId, recipeIds });
  };

  const getRecipeCount = (productId: string) => recipes.filter(r => r.product_id === productId).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-pink-500" />
            Drinks Especiais — Receitas & Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar drink especial..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Drinks grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredDrinks.map(drink => (
          <Card
            key={drink.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedDrinkId === drink.id ? 'ring-2 ring-pink-500 shadow-lg' : ''
            }`}
            onClick={() => setSelectedDrinkId(drink.id === selectedDrinkId ? null : drink.id)}
          >
            <CardContent className="p-3">
              <div className="flex gap-3">
                {/* Image */}
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {drink.imageUrl ? (
                    <img
                      src={ensureImageUrl(drink.imageUrl)}
                      alt={drink.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Wine className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {/* Upload overlay */}
                  <label className="absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                    {uploadingFor === drink.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Upload className="h-4 w-4 text-white" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(drink.id, f);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  </label>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{drink.name}</h3>
                  <p className="text-xs text-muted-foreground">{formatCurrency(drink.salePrice)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <Beaker className="h-2.5 w-2.5 mr-0.5" />
                      {getRecipeCount(drink.id)} ingrediente(s)
                    </Badge>
                  </div>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 flex-shrink-0 text-destructive hover:bg-destructive/10"
                  disabled={deleteDrinkMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDrink(drink.id, drink.name);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredDrinks.length === 0 && (
        <div className="text-center py-12">
          <Wine className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {searchQuery ? 'Nenhum drink encontrado.' : 'Nenhum drink especial cadastrado na categoria "DRINKS ESPECIAIS".'}
          </p>
        </div>
      )}

      {/* Recipe panel */}
      {selectedDrink && (
        <Card className="border-pink-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Beaker className="h-4 w-4 text-pink-500" />
                Receita: {selectedDrink.name}
              </span>
              <Button
                size="sm"
                onClick={() => { resetIngredientForm(); setShowAddIngredient(true); }}
                className="bg-gradient-to-r from-purple-500 to-pink-500"
              >
                <Plus className="h-3 w-3 mr-1" /> Ingrediente
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recipesLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : recipesForDrink.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum ingrediente cadastrado. Adicione doses de garrafas abertas e/ou produtos (energéticos).
              </p>
            ) : (
              <div className="space-y-2">
                {recipesForDrink.map(recipe => {
                  const ingProduct = recipe.ingredient_product_id
                    ? products.find(p => p.id === recipe.ingredient_product_id)
                    : null;
                  return (
                    <div key={recipe.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border/50">
                      <div className="flex items-center gap-2">
                        {recipe.ingredient_type === 'dose' ? (
                          <Wine className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Package className="h-4 w-4 text-green-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {recipe.ingredient_type === 'dose'
                              ? recipe.bottle_product_name
                              : ingProduct?.name || 'Produto removido'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {recipe.ingredient_type === 'dose'
                              ? `${recipe.quantity} dose(s) de garrafa aberta`
                              : `${recipe.quantity} unid. do estoque`}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteRecipeMutation.mutate(recipe.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add ingredient dialog */}
      <Dialog open={showAddIngredient} onOpenChange={setShowAddIngredient}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Ingrediente</DialogTitle>
            <DialogDescription>
              Adicione uma dose de garrafa aberta ou um produto do estoque à receita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={ingredientType} onValueChange={v => { setIngredientType(v as 'dose' | 'product'); setIngredientProductId(''); setIngredientSearch(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dose">
                    <span className="flex items-center gap-1"><Wine className="h-3 w-3" /> Dose (garrafa aberta)</span>
                  </SelectItem>
                  <SelectItem value="product">
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" /> Produto (estoque)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ingredientType === 'dose' ? (
              <div>
                <Label>Garrafa aberta</Label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar garrafa..."
                    value={ingredientSearch}
                    onChange={e => setIngredientSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {openBottles.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhuma garrafa aberta no estoque</div>
                  )}
                  {openBottles
                    .filter(b => !ingredientSearch || searchIncludes(b.product_name, ingredientSearch))
                    .map(b => (
                      <button
                        key={b.bottle_id}
                        type="button"
                        onClick={() => setIngredientProductId(b.product_id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                          ingredientProductId === b.product_id ? 'bg-primary/10 font-medium' : ''
                        }`}
                      >
                        <Wine className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        <span className="flex-1 truncate">{b.product_name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {b.remaining_doses} doses
                        </Badge>
                      </button>
                    ))}
                  {openBottles.length > 0 && openBottles.filter(b => !ingredientSearch || searchIncludes(b.product_name, ingredientSearch)).length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhuma garrafa encontrada</div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Apenas garrafas abertas com doses disponíveis. A baixa será automática na venda.
                </p>
              </div>
            ) : (
              <div>
                <Label>Produto</Label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={ingredientSearch}
                    onChange={e => setIngredientSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {ingredientProducts
                    .filter(p => !ingredientSearch || searchIncludes(p.name, ingredientSearch))
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setIngredientProductId(p.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                          ingredientProductId === p.id ? 'bg-primary/10 font-medium' : ''
                        }`}
                      >
                        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 truncate">{p.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          Est: {p.stock}
                        </Badge>
                      </button>
                    ))}
                  {ingredientProducts.filter(p => !ingredientSearch || searchIncludes(p.name, ingredientSearch)).length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum produto encontrado</div>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={ingredientQty}
                onChange={e => setIngredientQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {ingredientType === 'dose' ? 'Nº de doses por drink vendido' : 'Unidades consumidas por drink vendido'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIngredient(false)}>Cancelar</Button>
            <Button
              onClick={handleAddIngredient}
              disabled={addRecipeMutation.isPending}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {addRecipeMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
