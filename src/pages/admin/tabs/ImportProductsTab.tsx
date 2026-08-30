import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

// Categorias que são preparadas (não dependem de estoque direto)
const PREPARED_CATEGORIES = [
  'CAIPI ICE', 'COROTES DRINKS'
];

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

export default function ImportProductsTab() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    const products: Array<{
      name: string;
      description: string | null;
      sale_price: number;
      cost_price: number;
      profit_margin: number;
      is_active: boolean;
      is_prepared: boolean;
      category_name: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 11) continue;

      const [
        , // ID
        name,
        description,
        priceStr,
        costStr,
        marginStr,
        categoryCSV,
        , // estoque
        , // estoque minimo
        , // unidade
        status
      ] = values;

      const categoryName = categoryCSV.trim();
      const salePrice = parseFloat(priceStr.replace(',', '.')) || 0;
      const costPrice = parseFloat(costStr.replace(',', '.')) || 0;
      const profitMargin = parseFloat(marginStr.replace(',', '.')) || 0;

      const isPrepared = PREPARED_CATEGORIES.some(cat =>
        categoryName.toUpperCase().includes(cat)
      );

      products.push({
        name: name.trim(),
        description: description === 'Produto de qualidade' ? null : description.trim(),
        sale_price: salePrice,
        cost_price: costPrice,
        profit_margin: profitMargin,
        is_active: status.trim() !== 'Pausado',
        is_prepared: isPrepared,
        category_name: categoryName
      });
    }

    return products;
  };

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);
    setResult(null);

    try {
      const response = await fetch('/data/produtos-import.csv');
      const csvText = await response.text();
      const products = parseCSV(csvText);
      console.log(`[Import] Parsed ${products.length} products from CSV`);

      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < products.length; i += batchSize) {
        batches.push(products.slice(i, i + batchSize));
      }

      let totalSuccess = 0;
      let totalFailed = 0;
      const errors: string[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        try {
          const { data, error } = await supabase.rpc('import_products_batch', {
            p_products: batch
          });

          if (error) {
            console.error('[Import] Batch error:', error);
            totalFailed += batch.length;
            errors.push(`Lote ${batchIndex + 1}: ${error.message}`);
          } else {
            totalSuccess += data || batch.length;
          }
        } catch (err) {
          console.error('[Import] Batch exception:', err);
          totalFailed += batch.length;
          errors.push(`Lote ${batchIndex + 1}: Erro de conexão`);
        }

        setProgress(Math.round(((batchIndex + 1) / batches.length) * 100));
      }

      setResult({ total: products.length, success: totalSuccess, failed: totalFailed, errors });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });

      toast({
        title: 'Importação concluída!',
        description: `${totalSuccess} produtos importados com sucesso`
      });
    } catch (err) {
      console.error('[Import] Fatal error:', err);
      toast({
        title: 'Erro na importação',
        description: 'Erro ao processar arquivo CSV',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Importar Produtos do CSV
        </h3>
        
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>Este processo irá:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Importar todos os produtos do arquivo CSV</li>
              <li>Definir estoque inicial de <strong>10 unidades</strong> para todos</li>
              <li>Preço de custo e margem serão importados do CSV</li>
              <li>Categorias preparadas (Caipi Ice, Corotes Drinks) marcadas automaticamente</li>
            </ul>
          </div>

          {!importing && !result && (
            <Button onClick={handleImport} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Iniciar Importação de 287 Produtos
            </Button>
          )}

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Importando produtos...</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Importação Concluída</span>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-foreground">{result.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">{result.success}</div>
                  <div className="text-xs text-muted-foreground">Sucesso</div>
                </div>
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-red-500">{result.failed}</div>
                  <div className="text-xs text-muted-foreground">Falhas</div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Erros:</span>
                  </div>
                  <ul className="text-xs text-red-400 space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button variant="outline" onClick={() => setResult(null)} className="w-full">
                Nova Importação
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
