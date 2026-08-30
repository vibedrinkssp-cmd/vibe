// Products Tab Component - Inline editing in cards
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, ShoppingBag, Check, X, Sparkles, ScanBarcode, List, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductsQuickEditTab } from './ProductsQuickEditTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAdminProducts, useAdminCategories } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency, type Product } from '../shared';
import { ProductImageUploader } from '@/components/ProductImageUploader';
import { ensureImageUrl } from '@/lib/supabase';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { BulkImageSearch } from '@/components/admin/BulkImageSearch';
import { normalizeText, searchIncludes } from '@/lib/text-utils';

// Inline edit state for a product
interface InlineEditState {
  name: string;
  description: string;
  categoryId: string;
  costPrice: string;
  profitMargin: string;
  salePrice: string;
  stock: string;
  imageUrl: string | null;
  barcode: string | null;
}

export function ProductsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Inline editing state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editState, setEditState] = useState<InlineEditState | null>(null);
  
  // Barcode scanner state
  const [scanningBarcodeFor, setScanningBarcodeFor] = useState<string | null>(null);
  const [newProductBarcodeScanning, setNewProductBarcodeScanning] = useState(false);
  const [newProductBarcode, setNewProductBarcode] = useState<string | null>(null);
  
  // New product dialog state
  const [newCategoryId, setNewCategoryId] = useState<string>('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newProfitMargin, setNewProfitMargin] = useState('50');
  const [newSalePrice, setNewSalePrice] = useState('');
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);

  const { data: products = [], isLoading } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Product> & { barcode?: string | null }) => {
      // Use RPC function to bypass RLS
      const { data: productId, error } = await supabase.rpc('create_product', {
        p_name: data.name!,
        p_description: data.description || undefined,
        p_category_id: data.categoryId || undefined,
        p_cost_price: Number(data.costPrice) || 0,
        p_profit_margin: Number(data.profitMargin) || 0,
        p_sale_price: Number(data.salePrice) || 0,
        p_stock: data.stock || 0,
        p_image_url: data.imageUrl || undefined,
        p_is_active: true,
      });
      if (error) throw error;
      
      // If barcode was provided, update it separately
      if (data.barcode && productId) {
        const { error: barcodeError } = await supabase.rpc('update_product_barcode', {
          p_id: productId,
          p_barcode: data.barcode,
        });
        if (barcodeError) {
          console.error('Error saving barcode:', barcodeError);
          // Don't throw - product was created successfully
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto criado!' });
      setIsDialogOpen(false);
      resetNewForm();
    },
    onError: (err) => {
      console.error('Error creating product:', err);
      toast({ title: 'Erro ao criar produto', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Product> }) => {
      // Use RPC function to bypass RLS
      // Ensure empty strings are converted to undefined so COALESCE keeps old value
      const catId = data.categoryId && data.categoryId.length > 0 ? data.categoryId : undefined;
      const imgUrl = data.imageUrl && data.imageUrl.length > 0 ? data.imageUrl : undefined;
      const { error } = await supabase.rpc('update_product', {
        p_id: id,
        p_name: data.name !== undefined ? data.name : undefined,
        p_description: data.description !== undefined ? (data.description || undefined) : undefined,
        p_category_id: catId,
        p_cost_price: data.costPrice !== undefined ? Number(data.costPrice) : undefined,
        p_profit_margin: data.profitMargin !== undefined ? Number(data.profitMargin) : undefined,
        p_sale_price: data.salePrice !== undefined ? Number(data.salePrice) : undefined,
        p_stock: data.stock !== undefined ? Number(data.stock) : undefined,
        p_image_url: imgUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto atualizado!' });
      setEditingProductId(null);
      setEditState(null);
    },
    onError: (err) => {
      console.error('Error updating product:', err);
      toast({ title: 'Erro ao atualizar produto', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('delete_product', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Produto excluído!' });
    },
    onError: (err) => {
      console.error('Error deleting product:', err);
      toast({ title: 'Erro ao excluir produto', variant: 'destructive' });
    },
  });

  const resetNewForm = () => {
    setNewCategoryId('');
    setNewCostPrice('');
    setNewProfitMargin('50');
    setNewSalePrice('');
    setNewImageUrl(null);
    setNewProductBarcode(null);
  };

  // Start inline editing
  const startEditing = (product: Product) => {
    setEditingProductId(product.id);
    setEditState({
      name: product.name,
      description: product.description || '',
      categoryId: product.categoryId || '',
      costPrice: String(product.costPrice || 0),
      profitMargin: String(product.profitMargin || 0),
      salePrice: String(product.salePrice || 0),
      stock: String(product.stock || 0),
      imageUrl: product.imageUrl ?? null,
      barcode: product.barcode ?? null,
    });
  };
  
  // Handle barcode scan for existing product (inline edit mode)
  const handleBarcodeScanForProduct = async (barcode: string) => {
    if (!scanningBarcodeFor) return;
    
    try {
      const { error } = await supabase.rpc('update_product_barcode', {
        p_id: scanningBarcodeFor,
        p_barcode: barcode,
      });
      
      if (error) throw error;
      
      // Update edit state if in edit mode
      if (editState && editingProductId === scanningBarcodeFor) {
        setEditState({ ...editState, barcode });
      }
      
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Código de barras registrado!', description: barcode });
    } catch (err) {
      console.error('Error saving barcode:', err);
      toast({ title: 'Erro ao salvar código de barras', variant: 'destructive' });
    }
    
    setScanningBarcodeFor(null);
  };
  
  // Handle barcode scan for new product
  const handleBarcodeScanForNewProduct = (barcode: string) => {
    setNewProductBarcode(barcode);
    setNewProductBarcodeScanning(false);
    toast({ title: 'Código capturado!', description: barcode });
  };

  // Cancel inline editing
  const cancelEditing = () => {
    setEditingProductId(null);
    setEditState(null);
  };

  // Confirm inline editing
  const confirmEditing = () => {
    if (!editingProductId || !editState) return;
    
    updateMutation.mutate({
      id: editingProductId,
      data: {
        name: editState.name,
        description: editState.description,
        categoryId: editState.categoryId,
        costPrice: editState.costPrice,
        profitMargin: editState.profitMargin,
        salePrice: editState.salePrice,
        stock: parseInt(editState.stock) || 0,
        imageUrl: editState.imageUrl,
      },
    });
  };

  // Handle cost price change with margin calculation
  const handleEditCostChange = (value: string) => {
    if (!editState) return;
    const cost = parseFloat(value);
    const margin = parseFloat(editState.profitMargin);
    let newSalePrice = editState.salePrice;
    if (!isNaN(cost) && !isNaN(margin) && cost > 0) {
      newSalePrice = (cost * (1 + margin / 100)).toFixed(2);
    }
    setEditState({ ...editState, costPrice: value, salePrice: newSalePrice });
  };

  // Handle margin change with sale price calculation
  const handleEditMarginChange = (value: string) => {
    if (!editState) return;
    const cost = parseFloat(editState.costPrice);
    const margin = parseFloat(value);
    let newSalePrice = editState.salePrice;
    if (!isNaN(cost) && !isNaN(margin) && cost > 0) {
      newSalePrice = (cost * (1 + margin / 100)).toFixed(2);
    }
    setEditState({ ...editState, profitMargin: value, salePrice: newSalePrice });
  };

  // Handle sale price change with margin calculation
  const handleEditSalePriceChange = (value: string) => {
    if (!editState) return;
    const cost = parseFloat(editState.costPrice);
    const sale = parseFloat(value);
    let newMargin = editState.profitMargin;
    if (!isNaN(cost) && !isNaN(sale) && cost > 0) {
      newMargin = (((sale - cost) / cost) * 100).toFixed(2);
    }
    setEditState({ ...editState, salePrice: value, profitMargin: newMargin });
  };

  // New product handlers
  const handleNewCostChange = (value: string) => {
    setNewCostPrice(value);
    const cost = parseFloat(value);
    const margin = parseFloat(newProfitMargin);
    if (!isNaN(cost) && !isNaN(margin) && cost > 0) {
      setNewSalePrice((cost * (1 + margin / 100)).toFixed(2));
    }
  };

  const handleNewMarginChange = (value: string) => {
    setNewProfitMargin(value);
    const cost = parseFloat(newCostPrice);
    const margin = parseFloat(value);
    if (!isNaN(cost) && !isNaN(margin) && cost > 0) {
      setNewSalePrice((cost * (1 + margin / 100)).toFixed(2));
    }
  };

  const handleNewSalePriceChange = (value: string) => {
    setNewSalePrice(value);
    const cost = parseFloat(newCostPrice);
    const sale = parseFloat(value);
    if (!isNaN(cost) && !isNaN(sale) && cost > 0) {
      setNewProfitMargin((((sale - cost) / cost) * 100).toFixed(2));
    }
  };

  const handleNewSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createMutation.mutate({
      name: normalizeText(formData.get('name') as string),
      description: formData.get('description') as string || undefined,
      categoryId: newCategoryId || undefined,
      costPrice: newCostPrice,
      profitMargin: newProfitMargin,
      salePrice: newSalePrice,
      stock: parseInt(formData.get('stock') as string) || 0,
      imageUrl: newImageUrl || undefined,
      barcode: newProductBarcode,
    });
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = searchTerm === '' || 
      searchIncludes(product.name, searchTerm) ||
      (product.description && searchIncludes(product.description, searchTerm));
    const matchesCategory = selectedCategoryId === 'all' || product.categoryId === selectedCategoryId;
    return matchesSearch && matchesCategory;
  });

  const handleGenerateProductListPDF = () => {
    const catName = (id: string | null) => categories.find(c => c.id === id)?.name || 'SEM CATEGORIA';
    // Sort by category name then product name
    const sorted = [...products].sort((a, b) => {
      const c = catName(a.categoryId).localeCompare(catName(b.categoryId), 'pt-BR');
      return c !== 0 ? c : a.name.localeCompare(b.name, 'pt-BR');
    });

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Lista de Produtos', 14, 22);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
    doc.text(`Total de produtos: ${sorted.length}`, 14, 36);

    const tableData = sorted.map(p => [catName(p.categoryId), p.name]);

    autoTable(doc, {
      startY: 44,
      head: [['Categoria', 'Produto']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 0, 0] },
    });

    doc.save(`lista-produtos-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'Lista de produtos em PDF gerada!' });
  };



  return (
    <Tabs defaultValue="catalog" className="space-y-4">
      {!readOnly && (
        <TabsList>
          <TabsTrigger value="catalog"><ShoppingBag className="h-4 w-4 mr-1" />Catálogo</TabsTrigger>
          <TabsTrigger value="quick-edit"><List className="h-4 w-4 mr-1" />Edição Rápida</TabsTrigger>
        </TabsList>
      )}
      {!readOnly && (
        <TabsContent value="quick-edit">
          <ProductsQuickEditTab />
        </TabsContent>
      )}
      <TabsContent value="catalog">
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl text-primary">Produtos</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleGenerateProductListPDF} data-testid="button-generate-product-list-pdf">
            <FileText className="w-4 h-4 mr-2" />
            Gerar Lista de Produtos PDF
          </Button>
          {!readOnly && <BulkImageSearch products={products} />}
          {!readOnly && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetNewForm(); }} data-testid="button-add-product">
                <Plus className="w-4 h-4 mr-2" />
                Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Novo Produto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleNewSubmit} className="space-y-3">
              <div>
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" required data-testid="input-product-name" className="uppercase" onBlur={(e) => { e.target.value = normalizeText(e.target.value); }} />
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" name="description" data-testid="input-product-description" />
              </div>
              <div>
                <Label htmlFor="categoryId">Categoria</Label>
                <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                  <SelectTrigger data-testid="select-product-category">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[200] max-h-60">
                    {categories.length === 0 ? (
                      <SelectItem value="__loading" disabled>Carregando categorias...</SelectItem>
                    ) : (
                      categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="newCostPrice">Custo</Label>
                  <CurrencyInput 
                    id="newCostPrice" 
                    value={newCostPrice} 
                    onChange={(v) => handleNewCostChange(String(v))}
                  />
                </div>
                <div>
                  <Label htmlFor="newMargin">Margem %</Label>
                  <Input 
                    id="newMargin" 
                    type="number" 
                    step="0.01" 
                    value={newProfitMargin} 
                    onChange={(e) => handleNewMarginChange(e.target.value)}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="newSalePrice">Venda</Label>
                  <CurrencyInput 
                    id="newSalePrice" 
                    value={newSalePrice} 
                    onChange={(v) => handleNewSalePriceChange(String(v))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="stock">Estoque</Label>
                <Input id="stock" name="stock" type="number" defaultValue={0} data-testid="input-product-stock" />
              </div>
              <div>
                <Label>Imagem do Produto</Label>
                <ProductImageUploader
                  currentImageUrl={newImageUrl}
                  onImageUploaded={(url) => setNewImageUrl(url)}
                  onImageRemoved={() => setNewImageUrl(null)}
                  productName=""
                />
              </div>
              <div>
                <Label>Código de Barras</Label>
                <div className="flex gap-2">
                  <Input 
                    value={newProductBarcode || ''} 
                    onChange={(e) => setNewProductBarcode(e.target.value || null)}
                    placeholder="Ex: 7891234567890"
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon"
                    onClick={() => setNewProductBarcodeScanning(true)}
                    title="Escanear código de barras"
                  >
                    <ScanBarcode className="w-4 h-4" />
                  </Button>
                </div>
                {newProductBarcode && (
                  <p className="text-xs text-green-500 mt-1">✓ Código: {newProductBarcode}</p>
                )}
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-product">
                Criar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar produtos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-products"
          />
        </div>
        <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
          <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-filter-category">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground">
        {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
      </p>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-48" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map(product => {
            const category = categories.find(c => c.id === product.categoryId);
            const isEditing = editingProductId === product.id;
            return (
              <Card 
                key={product.id} 
                data-testid={`card-product-${product.id}`} 
                className={`overflow-hidden ${isEditing ? 'ring-2 ring-primary' : ''}`}
              >
                <CardContent className="p-3 overflow-hidden">
                  {isEditing && editState ? (
                    // EDITING MODE
                    <div className="space-y-2 overflow-hidden">
                      {/* Image uploader */}
                      <div className="w-full max-w-full overflow-hidden">
                        <ProductImageUploader
                          currentImageUrl={editState.imageUrl}
                          onImageUploaded={(url) => setEditState({ ...editState, imageUrl: url })}
                          onImageRemoved={() => setEditState({ ...editState, imageUrl: null })}
                          productName={editState.name}
                          compact
                        />
                      </div>
                      
                      {/* Name */}
                      <Input
                        value={editState.name}
                        onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                        onBlur={(e) => setEditState((prev) => prev ? { ...prev, name: normalizeText(e.target.value) } : null)}
                        placeholder="Nome"
                        className="font-semibold text-sm h-8"
                      />
                      
                      {/* Category */}
                      <Select 
                        value={editState.categoryId} 
                        onValueChange={(v) => setEditState({ ...editState, categoryId: v })}
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Prices grid - 2x2 layout for better fit */}
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <div className="min-w-0">
                          <span className="text-muted-foreground block mb-0.5 truncate">Custo</span>
                          <CurrencyInput
                            value={editState.costPrice}
                            onChange={(v) => handleEditCostChange(String(v))}
                            size="sm"
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-muted-foreground block mb-0.5 truncate">Venda</span>
                          <CurrencyInput
                            value={editState.salePrice}
                            onChange={(v) => handleEditSalePriceChange(String(v))}
                            size="sm"
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-muted-foreground block mb-0.5 truncate">Margem %</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={editState.profitMargin}
                            onChange={(e) => handleEditMarginChange(e.target.value)}
                            className="h-7 text-xs px-2"
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-muted-foreground block mb-0.5 truncate">Estoque</span>
                          <Input
                            type="number"
                            value={editState.stock}
                            onChange={(e) => setEditState({ ...editState, stock: e.target.value })}
                            className="h-7 text-xs px-2"
                          />
                        </div>
                      </div>
                      
                      {/* Barcode section in edit mode */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground text-xs truncate block mb-0.5">Cód. Barras</span>
                          <div className="flex items-center gap-1">
                            <Input
                              value={editState.barcode || ''}
                              onChange={(e) => setEditState({ ...editState, barcode: e.target.value || null })}
                              placeholder="Sem código"
                              className="h-7 text-xs px-2 flex-1"
                            />
                            <Button 
                              size="icon" 
                              variant="outline"
                              className="h-7 w-7 flex-shrink-0"
                              onClick={() => setScanningBarcodeFor(product.id)}
                              title="Escanear código de barras"
                            >
                              <ScanBarcode className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 pt-1">
                        <Button 
                          size="sm" 
                          className="flex-1 bg-green-600 hover:bg-green-700 text-xs h-8 px-2"
                          onClick={confirmEditing}
                          disabled={updateMutation.isPending}
                        >
                          <Check className="w-3 h-3 mr-1 flex-shrink-0" />
                          <span className="truncate">Salvar</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 w-8 p-0 flex-shrink-0"
                          onClick={cancelEditing}
                          disabled={updateMutation.isPending}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // VIEW MODE
                    <div className="overflow-hidden">
                      <div className="flex items-start gap-2">
                        {product.imageUrl ? (
                          <img 
                            src={ensureImageUrl(product.imageUrl)} 
                            alt={product.name} 
                            className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-lg bg-white/10 flex-shrink-0" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/400x400?text=Sem+Imagem';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                            <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-1">
                            <h3 className="font-semibold text-sm truncate">
                              {product.name}
                            </h3>
                          </div>
                          {category && (
                            <p className="text-xs truncate text-muted-foreground">
                              {category.name}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1.5 mt-3 text-xs">
                        <div className="bg-secondary/50 rounded-md p-1.5 min-w-0">
                          <span className="text-muted-foreground block truncate">Custo</span>
                          <span className="font-medium truncate block">{formatCurrency(product.costPrice)}</span>
                        </div>
                        <div className="bg-secondary/50 rounded-md p-1.5 min-w-0">
                          <span className="text-muted-foreground block truncate">Venda</span>
                          <span className="font-bold text-primary truncate block">{formatCurrency(product.salePrice)}</span>
                        </div>
                        <div className="bg-secondary/50 rounded-md p-1.5 min-w-0">
                          <span className="text-muted-foreground block truncate">Margem</span>
                          <span className="font-medium truncate block">{product.profitMargin}%</span>
                        </div>
                        <div className="bg-secondary/50 rounded-md p-1.5 min-w-0">
                          <span className="text-muted-foreground block truncate">Estoque</span>
                          <span className={`font-medium truncate block ${product.stock <= 5 ? 'text-destructive' : ''}`}>
                            {product.stock} un
                          </span>
                        </div>
                      </div>
                      
                      {/* Barcode indicator */}
                      {product.barcode && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-md p-1.5 mt-2 text-xs">
                          <span className="text-green-400 flex items-center gap-1">
                            <ScanBarcode className="w-3 h-3" />
                            <span className="truncate">{product.barcode}</span>
                          </span>
                        </div>
                      )}

                      {!readOnly && (
                      <div className="flex items-center gap-1 mt-3">
                        <Button size="sm" variant="outline" className="flex-1 text-xs h-8 px-2" onClick={() => startEditing(product)}>
                          <Edit2 className="w-3 h-3 mr-1 flex-shrink-0" />
                          <span className="truncate">Editar</span>
                        </Button>
                        <Button 
                          size="icon" 
                          variant="outline"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => setScanningBarcodeFor(product.id)}
                          title={product.barcode ? 'Alterar código de barras' : 'Escanear código de barras'}
                        >
                          <ScanBarcode className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => {
                            if (confirm('Excluir este produto?')) deleteMutation.mutate(product.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Barcode Scanner Modal for existing products */}
      <BarcodeScanner
        isOpen={!!scanningBarcodeFor}
        onClose={() => setScanningBarcodeFor(null)}
        onScan={handleBarcodeScanForProduct}
        title="Registrar Código de Barras"
      />
      
      {/* Barcode Scanner Modal for new product */}
      <BarcodeScanner
        isOpen={newProductBarcodeScanning}
        onClose={() => setNewProductBarcodeScanning(false)}
        onScan={handleBarcodeScanForNewProduct}
        title="Escanear Código para Novo Produto"
      />
    </div>
      </TabsContent>
    </Tabs>
  );
}
