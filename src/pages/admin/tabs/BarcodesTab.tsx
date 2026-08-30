import { useState, useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, ScanLine, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
import { mapProduct } from '@/lib/db-mappers';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import type { Product } from '@/shared/schema';

// Categories to exclude from barcode registration
const EXCLUDED_CATEGORIES = [
  'caipirinha',
  'caipirinhas',
  'batida',
  'batidas',
  'drink',
  'drinks',
  'drinks especiais',
  'drink especial',
  'copão',
  'copao',
  'copões',
  'copaos',
  'dose',
  'doses',
];

const ITEMS_PER_PAGE = 20;

export function BarcodesTab() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Fetch products with categories
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['barcode-products'],
    queryFn: async () => {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*, categories(name)')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (productsError) throw productsError;
      return (productsData || []).map(p => ({
        ...mapProduct(p),
        categoryName: p.categories?.name || '',
      }));
    },
  });

  // Update barcode mutation
  const updateBarcodeMutation = useMutation({
    mutationFn: async ({ productId, barcode }: { productId: string; barcode: string }) => {
      const { error } = await supabase.rpc('update_product_barcode', {
        p_id: productId,
        p_barcode: barcode,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barcode-products'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      toast({ title: 'Código de barras salvo!' });
      setSelectedProduct(null);
    },
    onError: (error: any) => {
      console.error('Barcode update error:', error);
      if (error.message?.includes('unique')) {
        toast({ title: 'Código já cadastrado em outro produto', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao salvar código', variant: 'destructive' });
      }
    },
  });

  // Remove barcode mutation
  const removeBarcodeMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('products')
        .update({ barcode: null })
        .eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barcode-products'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      toast({ title: 'Código de barras removido!' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover código', variant: 'destructive' });
    },
  });

  // Filter products - exclude drinks, doses, etc.
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      // Exclude special categories
      const categoryLower = (p.categoryName || '').toLowerCase();
      const nameLower = p.name.toLowerCase();
      
      const isExcluded = EXCLUDED_CATEGORIES.some(cat => 
        categoryLower.includes(cat) || nameLower.includes(cat)
      );
      
      if (isExcluded) return false;

      // Apply search filter
      const matchesSearch = searchIncludes(p.name, searchTerm) ||
        (p.barcode && p.barcode.includes(searchTerm));

      if (!matchesSearch) return false;

      // Apply barcode filter
      if (filter === 'with') return !!p.barcode;
      if (filter === 'without') return !p.barcode;
      return true;
    });
  }, [products, searchTerm, filter]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Stats
  const stats = useMemo(() => {
    const eligible = products.filter((p: any) => {
      const categoryLower = (p.categoryName || '').toLowerCase();
      const nameLower = p.name.toLowerCase();
      return !EXCLUDED_CATEGORIES.some(cat => 
        categoryLower.includes(cat) || nameLower.includes(cat)
      );
    });
    
    return {
      total: eligible.length,
      withBarcode: eligible.filter((p: any) => p.barcode).length,
      withoutBarcode: eligible.filter((p: any) => !p.barcode).length,
    };
  }, [products]);

  const handleScan = (barcode: string) => {
    if (selectedProduct) {
      updateBarcodeMutation.mutate({ productId: selectedProduct.id, barcode });
    }
    setScannerOpen(false);
  };

  const handleRegisterBarcode = (product: Product) => {
    setSelectedProduct(product);
    setScannerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{stats.withBarcode}</div>
            <div className="text-sm text-muted-foreground">Com Código</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.withoutBarcode}</div>
            <div className="text-sm text-muted-foreground">Sem Código</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('all'); setCurrentPage(1); }}
          >
            Todos
          </Button>
          <Button
            variant={filter === 'with' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('with'); setCurrentPage(1); }}
            className="gap-1"
          >
            <Check className="h-3 w-3" />
            Com Código
          </Button>
          <Button
            variant={filter === 'without' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('without'); setCurrentPage(1); }}
            className="gap-1"
          >
            <X className="h-3 w-3" />
            Sem Código
          </Button>
        </div>
      </div>

      {/* Products List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
          ))
        ) : paginatedProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum produto encontrado
          </div>
        ) : (
          paginatedProducts.map((product: any) => (
            <Card key={product.id} className="overflow-hidden">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{product.name}</div>
                  {product.barcode ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {product.barcode}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={() => removeBarcodeMutation.mutate(product.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem código</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={product.barcode ? 'outline' : 'default'}
                  onClick={() => handleRegisterBarcode(product)}
                  className="gap-2 flex-shrink-0"
                >
                  <ScanLine className="h-4 w-4" />
                  {product.barcode ? 'Alterar' : 'Registrar'}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setSelectedProduct(null);
        }}
        onScan={handleScan}
        title={selectedProduct ? `Código: ${selectedProduct.name}` : 'Escanear Código'}
      />
    </div>
  );
}
