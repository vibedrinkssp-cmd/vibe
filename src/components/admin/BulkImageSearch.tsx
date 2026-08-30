import { useState, useRef, useCallback } from 'react';
import { ImageIcon, Loader2, Play, X, CheckCircle2, AlertCircle, Clock, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { searchProductImages, uploadSerperImage, type SerperImageResult } from '@/lib/serper-search';
import { supabase } from '@/integrations/supabase/client-safe';
import { getAdminSessionToken } from '@/lib/admin-session';
import type { Product } from '@/pages/admin/shared';

interface ProductStatus {
  id: string;
  name: string;
  status: 'pending' | 'searching' | 'waiting_selection' | 'uploading' | 'success' | 'error' | 'skipped';
  message?: string;
}

interface BulkImageSearchProps {
  products: Product[];
}

export function BulkImageSearch({ products }: BulkImageSearchProps) {
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [productStatuses, setProductStatuses] = useState<ProductStatus[]>([]);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [currentResults, setCurrentResults] = useState<SerperImageResult[]>([]);
  const [isSearchingCurrent, setIsSearchingCurrent] = useState(false);
  const [isUploadingSelected, setIsUploadingSelected] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);
  const selectionResolveRef = useRef<((result: SerperImageResult | null) => void) | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const productsWithoutImage = products.filter(p => !p.imageUrl);

  const waitForUserSelection = (): Promise<SerperImageResult | null> => {
    return new Promise((resolve) => {
      selectionResolveRef.current = resolve;
    });
  };

  const handleSelectImage = (result: SerperImageResult) => {
    if (selectionResolveRef.current) {
      selectionResolveRef.current(result);
      selectionResolveRef.current = null;
    }
  };

  const handleSkipProduct = () => {
    if (selectionResolveRef.current) {
      selectionResolveRef.current(null);
      selectionResolveRef.current = null;
    }
  };

  const handleImageError = (url: string) => {
    setFailedImages(prev => new Set(prev).add(url));
  };

  const getDisplayUrl = (result: SerperImageResult) => {
    // If the main imageUrl failed, use the source page or a placeholder
    if (failedImages.has(result.imageUrl)) {
      return null;
    }
    return result.imageUrl;
  };

  const processProduct = async (product: Product, index: number): Promise<{ success: boolean; message: string }> => {
    try {
      setCurrentProduct(product);
      setCurrentResults([]);
      setFailedImages(new Set());
      setIsSearchingCurrent(true);
      setProductStatuses(prev => prev.map((s, idx) =>
        idx === index ? { ...s, status: 'searching' } : s
      ));

      let results: SerperImageResult[] = [];
      try {
        results = await searchProductImages(product.name);
      } catch (err) {
        console.error('[BulkImageSearch] Search error for', product.name, err);
        setIsSearchingCurrent(false);
        setCurrentProduct(null);
        return { success: false, message: 'Erro na busca' };
      }
      
      setIsSearchingCurrent(false);

      if (!results || results.length === 0) {
        setCurrentProduct(null);
        return { success: false, message: 'Sem resultados' };
      }

      setCurrentResults(results);
      setProductStatuses(prev => prev.map((s, idx) =>
        idx === index ? { ...s, status: 'waiting_selection' } : s
      ));

      const selected = await waitForUserSelection();

      if (!selected) {
        setCurrentProduct(null);
        setCurrentResults([]);
        return { success: false, message: 'Pulado' };
      }

      // Download, compress, upload
      setIsUploadingSelected(true);
      setProductStatuses(prev => prev.map((s, idx) =>
        idx === index ? { ...s, status: 'uploading' } : s
      ));

      let publicUrl: string;
      try {
        const token = getAdminSessionToken();
        if (!token) throw new Error('Sessão admin não encontrada. Faça login novamente.');
        const result = await uploadSerperImage({
          imageUrl: selected.imageUrl,
          folder: 'products',
          sessionToken: token,
          maxSize: 512,
        });
        publicUrl = result.publicUrl;
      } catch (err) {
        console.error('[BulkImageSearch] Upload failed:', err);
        setIsUploadingSelected(false);
        setCurrentProduct(null);
        setCurrentResults([]);
        return { success: false, message: err instanceof Error ? err.message : 'Falha no upload' };
      }

      try {
        const { error } = await supabase.rpc('update_product', {
          p_id: product.id,
          p_image_url: publicUrl,
        });
        if (error) throw error;
      } catch (err) {
        console.error('[BulkImageSearch] DB update failed:', err);
        setIsUploadingSelected(false);
        setCurrentProduct(null);
        setCurrentResults([]);
        return { success: false, message: 'Erro ao salvar' };
      }

      setIsUploadingSelected(false);
      setCurrentProduct(null);
      setCurrentResults([]);
      return { success: true, message: '✅ Salvo!' };
    } catch (err: any) {
      setIsSearchingCurrent(false);
      setIsUploadingSelected(false);
      setCurrentProduct(null);
      setCurrentResults([]);
      return { success: false, message: err?.message || 'Erro desconhecido' };
    }
  };

  const startProcessing = useCallback(async () => {
    const toProcess = productsWithoutImage;
    if (toProcess.length === 0) {
      toast({ title: 'Todos os produtos já têm imagem!' });
      return;
    }

    cancelRef.current = false;
    setIsRunning(true);

    const statuses: ProductStatus[] = toProcess.map(p => ({
      id: p.id,
      name: p.name,
      status: 'pending' as const,
    }));
    setProductStatuses(statuses);

    let successTotal = 0;

    for (let i = 0; i < toProcess.length; i++) {
      if (cancelRef.current) break;

      const result = await processProduct(toProcess[i], i);

      if (result.success) successTotal++;

      setProductStatuses(prev => prev.map((s, idx) =>
        idx === i ? {
          ...s,
          status: result.success ? 'success' : (result.message === 'Pulado' ? 'skipped' : 'error'),
          message: result.message,
        } : s
      ));

      if (cancelRef.current) break;

      if (i < toProcess.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setIsRunning(false);
    setCurrentProduct(null);
    setCurrentResults([]);
    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });

    toast({ title: 'Concluído!', description: `${successTotal} imagens adicionadas.` });
  }, [productsWithoutImage, queryClient, toast]);

  const handleCancel = () => {
    cancelRef.current = true;
    if (selectionResolveRef.current) {
      selectionResolveRef.current(null);
      selectionResolveRef.current = null;
    }
    setIsRunning(false);
    setCurrentProduct(null);
    setCurrentResults([]);
    setIsSearchingCurrent(false);
    setIsUploadingSelected(false);
  };

  const completedCount = productStatuses.filter(s => ['success', 'error', 'skipped'].includes(s.status)).length;
  const successCount = productStatuses.filter(s => s.status === 'success').length;
  const errorCount = productStatuses.filter(s => s.status === 'error').length;
  const skippedCount = productStatuses.filter(s => s.status === 'skipped').length;
  const progress = productStatuses.length > 0 ? (completedCount / productStatuses.length) * 100 : 0;

  const statusIcon = (status: ProductStatus['status']) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'searching': return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'waiting_selection': return <ImageIcon className="h-4 w-4 text-primary" />;
      case 'uploading': return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'skipped': return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Visible results = those whose images haven't failed to load
  const visibleResults = currentResults.filter(r => !failedImages.has(r.imageUrl));

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="relative"
      >
        <ImageIcon className="w-4 h-4 mr-2" />
        Buscar Imagens
        {productsWithoutImage.length > 0 && (
          <span className="ml-2 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium">
            {productsWithoutImage.length}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!isRunning) setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Busca de Imagens — Selecione para cada produto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            {/* Initial state */}
            {!isRunning && productStatuses.length === 0 && (
              <div className="text-center space-y-4 py-4">
                <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <strong>{productsWithoutImage.length}</strong> produtos sem imagem.
                </p>
                <p className="text-xs text-muted-foreground">
                  O sistema buscará imagens para cada produto e você escolhe qual usar.
                </p>
                <Button onClick={startProcessing} disabled={productsWithoutImage.length === 0}>
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar ({productsWithoutImage.length} produtos)
                </Button>
              </div>
            )}

            {/* Running or completed */}
            {(isRunning || productStatuses.length > 0) && (
              <>
                {/* Progress bar */}
                <div className="space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-sm">
                    <span>{completedCount} de {productStatuses.length}</span>
                    <span className="text-muted-foreground text-xs">
                      ✅ {successCount} ⏭ {skippedCount} ❌ {errorCount}
                    </span>
                  </div>
                  <Progress value={progress} />
                </div>

                {/* Current product selection area */}
                {currentProduct && (
                  <div className="border border-border rounded-lg p-3 space-y-3 shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm">
                        Selecione a imagem para: <span className="text-primary font-bold">{currentProduct.name}</span>
                      </h3>
                      <Button variant="ghost" size="sm" onClick={handleSkipProduct} disabled={isUploadingSelected}>
                        <SkipForward className="h-4 w-4 mr-1" />
                        Pular
                      </Button>
                    </div>

                    {isSearchingCurrent && (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Buscando imagens para "{currentProduct.name}"...</span>
                      </div>
                    )}

                    {isUploadingSelected && (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Baixando, comprimindo e salvando...</span>
                      </div>
                    )}

                    {!isSearchingCurrent && !isUploadingSelected && visibleResults.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
                        {visibleResults.map((result, index) => (
                          <button
                            key={index}
                            className="group relative overflow-hidden rounded-lg border-2 border-border hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer bg-muted"
                            onClick={() => handleSelectImage(result)}
                            type="button"
                          >
                            <div className="w-full aspect-square relative">
                              <img
                                src={result.imageUrl}
                                alt={result.title}
                                className="w-full h-full object-cover"
                                loading="eager"
                                crossOrigin="anonymous"
                                onError={() => handleImageError(result.imageUrl)}
                              />
                            </div>
                            <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 text-xs bg-background/95 text-foreground px-3 py-1.5 rounded-md font-semibold transition-opacity shadow-sm">
                                ✓ Usar esta
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground p-1 line-clamp-1 text-center">
                              {result.title || result.source}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}

                    {!isSearchingCurrent && !isUploadingSelected && currentResults.length > 0 && visibleResults.length === 0 && (
                      <div className="text-center py-6 space-y-2">
                        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          As imagens encontradas não puderam ser carregadas.
                        </p>
                        <Button variant="ghost" size="sm" onClick={handleSkipProduct}>
                          Pular este produto
                        </Button>
                      </div>
                    )}

                    {!isSearchingCurrent && !isUploadingSelected && currentResults.length === 0 && (
                      <div className="text-center py-6 space-y-2">
                        <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Nenhuma imagem encontrada para este produto.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Cancel button */}
                {isRunning && (
                  <div className="flex justify-center shrink-0">
                    <Button variant="destructive" size="sm" onClick={handleCancel}>
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                )}

                {/* Product list */}
                <ScrollArea className="flex-1 min-h-0 max-h-[180px]">
                  <div className="space-y-1 pr-3">
                    {productStatuses.map((ps) => (
                      <div
                        key={ps.id}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded text-xs border border-border/50 ${
                          ['waiting_selection', 'searching', 'uploading'].includes(ps.status)
                            ? 'bg-primary/5 border-primary/30'
                            : ''
                        }`}
                      >
                        {statusIcon(ps.status)}
                        <span className="flex-1 truncate">{ps.name}</span>
                        {ps.message && (
                          <span className={`text-xs shrink-0 ${
                            ps.status === 'error' ? 'text-destructive' :
                            ps.status === 'skipped' ? 'text-muted-foreground' :
                            'text-green-500'
                          }`}>
                            {ps.message}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Completed state */}
                {!isRunning && productStatuses.length > 0 && (
                  <div className="flex gap-2 justify-center pt-2 shrink-0">
                    <Button variant="outline" onClick={() => { setProductStatuses([]); }}>
                      Reiniciar
                    </Button>
                    <Button onClick={() => setOpen(false)}>
                      Fechar
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
