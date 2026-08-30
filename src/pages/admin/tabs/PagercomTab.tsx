import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Trash2, Loader2, MonitorPlay, ImageIcon } from 'lucide-react';
import { uploadImage, ensureImageUrl } from '@/lib/supabase';
import { compressFullscreenAd, formatBytes } from '@/lib/image-compression';
import { usePagerAds, type PagerAd } from '@/hooks/use-pager-ads';

export function PagercomTab() {
  const { data: ads = [], isLoading } = usePagerAds();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pager-ads'] });

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Selecione uma imagem válida.', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 20MB.', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const compressed = await compressFullscreenAd(file);
      const { path } = await uploadImage(compressed.file, 'pager-ads');
      const { error } = await supabase.rpc('create_pager_ad', {
        p_image_url: path,
        p_sort_order: ads.length,
      });
      if (error) throw error;
      refresh();
      toast({ title: 'Sucesso', description: `Propaganda enviada! (${formatBytes(compressed.compressedSize)})` });
    } catch (err) {
      console.error('[PagercomTab] upload error:', err);
      toast({
        title: 'Erro no upload',
        description: err instanceof Error ? err.message : 'Falha ao enviar imagem.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  }, [ads.length, toast]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.rpc('update_pager_ad', { p_id: id, p_is_active: isActive });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_pager_ad', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast({ title: 'Removida', description: 'Propaganda excluída.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MonitorPlay className="h-6 w-6 text-primary" /> PAGERCOM
          </h2>
          <p className="text-muted-foreground max-w-xl">
            Propagandas em tela cheia (proporção 16:9) exibidas em carrossel no Painel Pager
            durante os períodos ociosos. As imagens são otimizadas e servidas via CDN para
            economizar egress do banco de dados.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {isUploading ? 'Enviando...' : 'Enviar imagem 16:9'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : ads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed rounded-xl">
          <ImageIcon className="h-10 w-10 mb-2" />
          <p>Nenhuma propaganda cadastrada</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ads.map((ad: PagerAd) => (
            <Card key={ad.id} className="overflow-hidden">
              <div className="relative aspect-video bg-black">
                <img
                  src={ensureImageUrl(ad.imageUrl)}
                  alt={ad.title ?? 'Propaganda'}
                  className="w-full h-full object-contain"
                />
                {!ad.isActive && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <span className="text-sm font-bold uppercase text-muted-foreground">Inativa</span>
                  </div>
                )}
              </div>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={ad.isActive}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: ad.id, isActive: v })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {ad.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPendingDeleteId(ad.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir propaganda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e a imagem será removida do carrossel do Pager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) deleteMutation.mutate(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
