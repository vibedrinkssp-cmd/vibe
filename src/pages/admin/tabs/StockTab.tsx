// Stock Tab Component - Complete stock audit and management
import { useState, useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { Package, DollarSign, AlertTriangle, TrendingUp, Download, FileText, Search, ArrowUpDown, ShoppingCart } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAdminProducts, useAdminCategories } from '../use-admin-data';
import { formatCurrency, type Product, type Category } from '../shared';
import { isPreparedCategoryName } from '@/shared/schema';

const LOW_STOCK_THRESHOLD = 15;

type SortField = 'name' | 'stock' | 'costValue' | 'saleValue';
type SortDirection = 'asc' | 'desc';

export function StockTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('costValue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: products = [], isLoading } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();

  // Filter out prepared categories using isPreparedCategoryName
  const specialCategoryIds = useMemo(() => {
    return new Set(categories.filter(c => isPreparedCategoryName(c.name)).map(c => c.id));
  }, [categories]);

  // Get stock categories (non-prepared)
  const stockCategories = useMemo(() => {
    return categories.filter(c => !isPreparedCategoryName(c.name) && c.isActive);
  }, [categories]);

  // Calculate real stock values for each product (excluding special categories)
  const productsWithValues = useMemo(() => {
    return products
      .filter(product => !specialCategoryIds.has(product.categoryId || '')) // Exclude special categories
      .map(product => {
        const category = categories.find(c => c.id === product.categoryId);
        const stock = product.stock ?? 0;
        const costPrice = parseFloat(String(product.costPrice ?? 0));
        const salePrice = parseFloat(String(product.salePrice ?? 0));
        
        return {
          ...product,
          categoryName: category?.name || 'Sem categoria',
          stockValue: stock * costPrice, // Valor real em estoque (custo)
          stockSaleValue: stock * salePrice, // Valor em estoque (preço de venda)
          costPrice,
          salePrice,
          stock,
        };
      });
  }, [products, categories, specialCategoryIds]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = productsWithValues.filter(p => p.isActive);
    
    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.categoryId === categoryFilter);
    }
    
    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(p => 
        searchIncludes(p.name, searchQuery) ||
        searchIncludes(p.categoryName, searchQuery)
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'stock':
          comparison = a.stock - b.stock;
          break;
        case 'costValue':
          comparison = a.stockValue - b.stockValue;
          break;
        case 'saleValue':
          comparison = a.stockSaleValue - b.stockSaleValue;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [productsWithValues, categoryFilter, searchQuery, sortField, sortDirection]);

  // Low stock products
  const lowStockProducts = useMemo(() => {
    return filteredProducts.filter(p => p.stock <= LOW_STOCK_THRESHOLD);
  }, [filteredProducts]);

  // Calculate real totals (only for stock-tracked products)
  const stockSummary = useMemo(() => {
    const activeProducts = productsWithValues.filter(p => p.isActive);
    
    return {
      totalProducts: activeProducts.length,
      totalUnits: activeProducts.reduce((sum, p) => sum + p.stock, 0),
      totalCostValue: activeProducts.reduce((sum, p) => sum + p.stockValue, 0),
      totalSaleValue: activeProducts.reduce((sum, p) => sum + p.stockSaleValue, 0),
      lowStockCount: activeProducts.filter(p => p.stock <= LOW_STOCK_THRESHOLD).length,
      zeroStockCount: activeProducts.filter(p => p.stock === 0).length,
    };
  }, [productsWithValues]);

  // Filtered summary
  const filteredSummary = useMemo(() => {
    return {
      totalProducts: filteredProducts.length,
      totalUnits: filteredProducts.reduce((sum, p) => sum + p.stock, 0),
      totalCostValue: filteredProducts.reduce((sum, p) => sum + p.stockValue, 0),
      totalSaleValue: filteredProducts.reduce((sum, p) => sum + p.stockSaleValue, 0),
    };
  }, [filteredProducts]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, { name: string; units: number; costValue: number; saleValue: number; count: number }> = {};
    
    productsWithValues.filter(p => p.isActive).forEach(product => {
      const catId = product.categoryId || 'none';
      if (!breakdown[catId]) {
        breakdown[catId] = {
          name: product.categoryName,
          units: 0,
          costValue: 0,
          saleValue: 0,
          count: 0,
        };
      }
      breakdown[catId].units += product.stock;
      breakdown[catId].costValue += product.stockValue;
      breakdown[catId].saleValue += product.stockSaleValue;
      breakdown[catId].count += 1;
    });
    
    return Object.entries(breakdown)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.costValue - a.costValue);
  }, [productsWithValues]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleExportCSV = () => {
    const csvData = filteredProducts.map(p => [
      p.name,
      p.categoryName,
      p.stock,
      p.costPrice.toFixed(2),
      p.salePrice.toFixed(2),
      p.stockValue.toFixed(2),
      p.stockSaleValue.toFixed(2),
    ]);

    const csv = [
      ['Produto', 'Categoria', 'Qtd Estoque', 'Preço Custo', 'Preço Venda', 'Valor Custo', 'Valor Venda'],
      ...csvData,
      [],
      ['TOTAIS', '', filteredSummary.totalUnits, '', '', filteredSummary.totalCostValue.toFixed(2), filteredSummary.totalSaleValue.toFixed(2)],
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventario-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast({ title: 'Inventário exportado em CSV!' });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Inventário', 14, 22);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
    
    // Summary
    doc.setFontSize(12);
    doc.text('Resumo Geral:', 14, 42);
    doc.setFontSize(10);
    doc.text(`Total de Produtos: ${stockSummary.totalProducts}`, 14, 50);
    doc.text(`Total de Unidades: ${stockSummary.totalUnits}`, 14, 56);
    doc.text(`Valor Total (Custo): ${formatCurrency(stockSummary.totalCostValue)}`, 14, 62);
    doc.text(`Valor Total (Venda): ${formatCurrency(stockSummary.totalSaleValue)}`, 14, 68);
    doc.text(`Lucro Potencial: ${formatCurrency(stockSummary.totalSaleValue - stockSummary.totalCostValue)}`, 14, 74);

    const tableData = filteredProducts.map(p => [
      p.name,
      p.categoryName,
      p.stock.toString(),
      formatCurrency(p.costPrice),
      formatCurrency(p.salePrice),
      formatCurrency(p.stockValue),
      formatCurrency(p.stockSaleValue),
    ]);

    autoTable(doc, {
      startY: 82,
      head: [['Produto', 'Categoria', 'Qtd', 'P. Custo', 'P. Venda', 'V. Custo', 'V. Venda']],
      body: tableData,
      foot: [[
        'TOTAL',
        `${filteredSummary.totalProducts} produtos`,
        filteredSummary.totalUnits.toString(),
        '',
        '',
        formatCurrency(filteredSummary.totalCostValue),
        formatCurrency(filteredSummary.totalSaleValue),
      ]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 0, 0] },
    });

    doc.save(`inventario-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'Relatório PDF exportado!' });
  };

  // Shopping List Wizard state
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); // 0=zero, 1=<10, 2=<40, 3=pdf
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const zeroStockItems = useMemo(() => productsWithValues.filter(p => p.isActive && p.stock === 0), [productsWithValues]);
  const lowStockItems = useMemo(() => productsWithValues.filter(p => p.isActive && p.stock > 0 && p.stock < 10), [productsWithValues]);
  const medStockItems = useMemo(() => productsWithValues.filter(p => p.isActive && p.stock >= 10 && p.stock < 40), [productsWithValues]);

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (items: typeof zeroStockItems, checked: boolean) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      items.forEach(i => checked ? next.add(i.id) : next.delete(i.id));
      return next;
    });
  };

  const openShoppingListWizard = () => {
    setSelectedItems(new Set(zeroStockItems.map(i => i.id))); // pre-select all zero stock
    setWizardStep(0);
    setShowShoppingList(true);
  };

  const shoppingListItems = useMemo(() => {
    return productsWithValues
      .filter(p => selectedItems.has(p.id))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name));
  }, [productsWithValues, selectedItems]);

  const handleGenerateShoppingPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Lista de Compras', 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerada em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
    doc.text(`Total de itens: ${shoppingListItems.length}`, 14, 36);

    const tableData = shoppingListItems.map(p => [
      p.name,
      p.categoryName,
      p.stock.toString(),
      formatCurrency(p.costPrice),
      '____',
    ]);

    autoTable(doc, {
      startY: 44,
      head: [['Produto', 'Categoria', 'Estoque Atual', 'Custo Unit.', 'Qtd Comprar']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [88, 28, 135] },
      columnStyles: { 4: { cellWidth: 28 } },
    });

    doc.save(`lista-compras-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'Lista de compras gerada!' });
    setShowShoppingList(false);
  };

  // Group items by category
  const groupByCategory = (items: typeof zeroStockItems) => {
    const groups: Record<string, typeof items> = {};
    items.forEach(p => {
      const cat = p.categoryName || 'Sem categoria';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([name, prods]) => ({ name, products: prods.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
  };

  const renderWizardStepContent = () => {
    const stepConfigs = [
      { title: 'Produtos Esgotados (Estoque = 0)', items: zeroStockItems, color: 'text-destructive' },
      { title: 'Estoque Baixo (< 10 unidades)', items: lowStockItems, color: 'text-yellow-500' },
      { title: 'Estoque Médio (< 40 unidades)', items: medStockItems, color: 'text-blue-500' },
    ];

    if (wizardStep >= 3) {
      const reviewGroups = groupByCategory(shoppingListItems);
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {shoppingListItems.length} produto(s) selecionado(s). Clique em gerar para baixar o PDF.
          </p>
          <ScrollArea className="h-[350px]">
            <div className="space-y-3 pr-3">
              {reviewGroups.map(group => (
                <div key={group.name}>
                  <p className="text-xs font-bold text-primary uppercase sticky top-0 bg-background py-1 border-b border-primary/20 mb-1">{group.name}</p>
                  {group.products.map(p => (
                    <div key={p.id} className="flex justify-between text-sm py-1 border-b border-border/20 pl-2">
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">estoque: {p.stock}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      );
    }

    const { title, items, color } = stepConfigs[wizardStep];
    const allSelected = items.length > 0 && items.every(i => selectedItems.has(i.id));
    const categoryGroups = groupByCategory(items);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className={`text-sm font-medium ${color}`}>{title}</p>
          <span className="text-xs text-muted-foreground">{items.length} produto(s)</span>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum produto nesta faixa.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 pb-2 border-b border-border/30">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(items, !!checked)}
              />
              <span className="text-sm font-medium">Selecionar todos</span>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3 pr-3">
                {categoryGroups.map(group => {
                  const groupAllSelected = group.products.every(i => selectedItems.has(i.id));
                  return (
                    <div key={group.name}>
                      <div className="flex items-center gap-2 sticky top-0 bg-background py-1 border-b border-primary/20 mb-1">
                        <Checkbox
                          checked={groupAllSelected}
                          onCheckedChange={(checked) => toggleAll(group.products, !!checked)}
                        />
                        <span className="text-xs font-bold text-primary uppercase">{group.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{group.products.length}</span>
                      </div>
                      {group.products.map(p => (
                        <label key={p.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded px-1 pl-6">
                          <Checkbox
                            checked={selectedItems.has(p.id)}
                            onCheckedChange={() => toggleItem(p.id)}
                          />
                          <span className="text-sm flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">est: {p.stock}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="font-serif text-3xl text-primary">Inventário</h2>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl text-primary">Inventário</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={openShoppingListWizard}>
              <ShoppingCart className="w-4 h-4 mr-2" />
              Lista de Compras
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards - Real Values */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Total Produtos</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <p className="text-xl md:text-2xl font-bold">{stockSummary.totalProducts}</p>
            <p className="text-xs text-muted-foreground">{stockSummary.totalUnits} un.</p>
          </CardContent>
        </Card>

        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Valor (Custo)</CardTitle>
            <DollarSign className="w-4 h-4 text-primary hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <p className="text-xl md:text-2xl font-bold text-primary">{formatCurrency(stockSummary.totalCostValue)}</p>
            <p className="text-xs text-muted-foreground">investido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Potencial</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <p className="text-xl md:text-2xl font-bold text-green-500">{formatCurrency(stockSummary.totalSaleValue)}</p>
            <p className="text-xs text-muted-foreground">se vender tudo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Baixo/Zero</CardTitle>
            <AlertTriangle className="w-4 h-4 text-yellow-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <p className="text-xl md:text-2xl font-bold">
              <span className="text-yellow-500">{stockSummary.lowStockCount}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-destructive">{stockSummary.zeroStockCount}</span>
            </p>
            <p className="text-xs text-muted-foreground">lim: {LOW_STOCK_THRESHOLD}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Geral</TabsTrigger>
            <TabsTrigger value="products" className="text-xs sm:text-sm">Produtos</TabsTrigger>
            <TabsTrigger value="lowstock" className="text-xs sm:text-sm">Baixo ({stockSummary.lowStockCount})</TabsTrigger>
            <TabsTrigger value="categories" className="text-xs sm:text-sm">Categoria</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumo do Inventário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium">Valores Reais</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total em Estoque (Custo):</span>
                      <span className="font-medium">{formatCurrency(stockSummary.totalCostValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Potencial de Venda:</span>
                      <span className="font-medium">{formatCurrency(stockSummary.totalSaleValue)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">Lucro Potencial:</span>
                      <span className="font-medium text-green-500">{formatCurrency(stockSummary.totalSaleValue - stockSummary.totalCostValue)}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Métricas</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Produtos Ativos:</span>
                      <span className="font-medium">{stockSummary.totalProducts}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total de Unidades:</span>
                      <span className="font-medium">{stockSummary.totalUnits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Custo Médio/Unidade:</span>
                      <span className="font-medium">
                        {stockSummary.totalUnits > 0 
                          ? formatCurrency(stockSummary.totalCostValue / stockSummary.totalUnits) 
                          : 'R$ 0,00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top 10 by value */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Produtos por Valor em Estoque</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="border-b border-border/30">
                    <tr>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm">Produto</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">Qtd</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm hidden sm:table-cell">P. Custo</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsWithValues
                      .filter(p => p.isActive)
                      .sort((a, b) => b.stockValue - a.stockValue)
                      .slice(0, 10)
                      .map((product, index) => (
                        <tr key={product.id} className="border-b border-border/20 last:border-0">
                          <td className="p-3 md:p-4">
                            <span className="text-muted-foreground mr-2">{index + 1}.</span>
                            <span className="truncate">{product.name}</span>
                          </td>
                          <td className="p-3 md:p-4 text-right">{product.stock}</td>
                          <td className="p-3 md:p-4 text-right hidden sm:table-cell">{formatCurrency(product.costPrice)}</td>
                          <td className="p-3 md:p-4 text-right font-medium text-primary text-sm">{formatCurrency(product.stockValue)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {stockCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note about excluded categories */}
          {specialCategoryIds.size > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" />
              Categorias especiais (Batidas, Drinks, Copão, Doses, Caipirinhas) não são contabilizadas no estoque.
            </div>
          )}

          {/* Filtered summary */}
          {(categoryFilter !== 'all' || searchQuery.trim()) && (
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>{filteredSummary.totalProducts}</strong> produtos</span>
                  <span><strong>{filteredSummary.totalUnits}</strong> unidades</span>
                  <span>Custo: <strong>{formatCurrency(filteredSummary.totalCostValue)}</strong></span>
                  <span>Venda: <strong>{formatCurrency(filteredSummary.totalSaleValue)}</strong></span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="border-b border-border/30">
                    <tr>
                      <th 
                        className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('name')}
                      >
                        <span className="flex items-center gap-1">
                          Produto
                          {sortField === 'name' && <ArrowUpDown className="w-3 h-3" />}
                        </span>
                      </th>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm hidden md:table-cell">Categoria</th>
                      <th 
                        className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('stock')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          Qtd
                          {sortField === 'stock' && <ArrowUpDown className="w-3 h-3" />}
                        </span>
                      </th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm hidden sm:table-cell">Custo</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm hidden lg:table-cell">Venda</th>
                      <th 
                        className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm cursor-pointer hover:text-foreground"
                        onClick={() => handleSort('costValue')}
                      >
                        <span className="flex items-center justify-end gap-1">
                          V.Est
                          {sortField === 'costValue' && <ArrowUpDown className="w-3 h-3" />}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(product => (
                      <tr key={product.id} className="border-b border-border/20 last:border-0 hover:bg-muted/50">
                        <td className="p-3 md:p-4">
                          <span className="font-medium truncate block max-w-[150px] md:max-w-none">{product.name}</span>
                          <span className="text-xs text-muted-foreground md:hidden">{product.categoryName}</span>
                        </td>
                        <td className="p-3 md:p-4 text-muted-foreground text-sm hidden md:table-cell">{product.categoryName}</td>
                        <td className="p-3 md:p-4 text-right">
                          <span className={`font-medium ${product.stock === 0 ? 'text-destructive' : product.stock <= LOW_STOCK_THRESHOLD ? 'text-yellow-500' : ''}`}>
                            {product.stock}
                          </span>
                        </td>
                        <td className="p-3 md:p-4 text-right text-sm hidden sm:table-cell">{formatCurrency(product.costPrice)}</td>
                        <td className="p-3 md:p-4 text-right text-sm hidden lg:table-cell">{formatCurrency(product.salePrice)}</td>
                        <td className="p-3 md:p-4 text-right font-medium text-sm text-primary">{formatCurrency(product.stockValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/50">
                    <tr>
                      <td className="p-3 md:p-4 font-bold text-sm">TOTAL</td>
                      <td className="p-3 md:p-4 text-muted-foreground text-sm hidden md:table-cell">{filteredSummary.totalProducts} prod.</td>
                      <td className="p-3 md:p-4 text-right font-bold text-sm">{filteredSummary.totalUnits}</td>
                      <td className="p-3 md:p-4 hidden sm:table-cell"></td>
                      <td className="p-3 md:p-4 hidden lg:table-cell"></td>
                      <td className="p-3 md:p-4 text-right font-bold text-primary text-sm">{formatCurrency(filteredSummary.totalCostValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Low Stock Tab */}
        <TabsContent value="lowstock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">Estoque Baixo (≤ {LOW_STOCK_THRESHOLD})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="border-b border-border/30">
                    <tr>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm">Produto</th>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm hidden sm:table-cell">Categoria</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">Est.</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsWithValues
                      .filter(p => p.isActive && p.stock <= LOW_STOCK_THRESHOLD)
                      .sort((a, b) => a.stock - b.stock)
                      .map(product => (
                        <tr key={product.id} className="border-b border-border/20 last:border-0 hover:bg-muted/50">
                          <td className="p-3 md:p-4">
                            <span className="font-medium truncate block max-w-[150px] md:max-w-none">{product.name}</span>
                            <span className="text-xs text-muted-foreground sm:hidden">{product.categoryName}</span>
                          </td>
                          <td className="p-3 md:p-4 text-muted-foreground text-sm hidden sm:table-cell">{product.categoryName}</td>
                          <td className="p-3 md:p-4 text-right">
                            <span className={`font-bold ${product.stock === 0 ? 'text-destructive' : 'text-yellow-500'}`}>
                              {product.stock}
                            </span>
                          </td>
                          <td className="p-3 md:p-4 text-right font-medium text-primary text-sm">{formatCurrency(product.stockValue)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {stockSummary.lowStockCount === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>Todos os produtos estão com estoque adequado!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">Por Categoria</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="border-b border-border/30">
                    <tr>
                      <th className="text-left p-3 md:p-4 text-muted-foreground font-medium text-sm">Categoria</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">Prod.</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm hidden sm:table-cell">Un.</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm">V.Custo</th>
                      <th className="text-right p-3 md:p-4 text-muted-foreground font-medium text-sm hidden md:table-cell">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map(cat => (
                      <tr key={cat.id} className="border-b border-border/20 last:border-0 hover:bg-muted/50">
                        <td className="p-3 md:p-4 font-medium text-sm truncate max-w-[120px] md:max-w-none">{cat.name}</td>
                        <td className="p-3 md:p-4 text-right text-sm">{cat.count}</td>
                        <td className="p-3 md:p-4 text-right text-sm hidden sm:table-cell">{cat.units}</td>
                        <td className="p-3 md:p-4 text-right font-medium text-primary text-sm">{formatCurrency(cat.costValue)}</td>
                        <td className="p-3 md:p-4 text-right text-muted-foreground text-sm hidden md:table-cell">
                          {stockSummary.totalCostValue > 0 
                            ? `${((cat.costValue / stockSummary.totalCostValue) * 100).toFixed(1)}%`
                            : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/50">
                    <tr>
                      <td className="p-3 md:p-4 font-bold text-sm">TOTAL</td>
                      <td className="p-3 md:p-4 text-right font-bold text-sm">{stockSummary.totalProducts}</td>
                      <td className="p-3 md:p-4 text-right font-bold text-sm hidden sm:table-cell">{stockSummary.totalUnits}</td>
                      <td className="p-3 md:p-4 text-right font-bold text-primary text-sm">{formatCurrency(stockSummary.totalCostValue)}</td>
                      <td className="p-3 md:p-4 text-right font-bold text-sm hidden md:table-cell">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shopping List Wizard Modal */}
      <Dialog open={showShoppingList} onOpenChange={setShowShoppingList}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Lista de Compras
              <span className="text-xs text-muted-foreground ml-auto">
                Etapa {wizardStep + 1} de 4
              </span>
            </DialogTitle>
          </DialogHeader>

          {renderWizardStepContent()}

          <DialogFooter className="flex-row gap-2">
            {wizardStep > 0 && (
              <Button variant="outline" size="sm" onClick={() => setWizardStep(s => s - 1)}>
                Voltar
              </Button>
            )}
            <div className="flex-1" />
            {wizardStep < 3 ? (
              <Button size="sm" onClick={() => setWizardStep(s => s + 1)}>
                Próximo
              </Button>
            ) : (
              <Button size="sm" onClick={handleGenerateShoppingPDF} disabled={shoppingListItems.length === 0}>
                <FileText className="w-4 h-4 mr-2" />
                Gerar PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
