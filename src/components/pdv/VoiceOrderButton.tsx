import { useState, useRef, useCallback } from 'react';
import { Mic, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/shared/schema';

interface Props {
  products: Product[];
  onAddItem: (product: Product) => void;
}

interface ParsedItem {
  product_id: string;
  quantity: number;
  matched_name?: string;
}

export function VoiceOrderButton({ products, onAddItem }: Props) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<Array<ParsedItem & { product: Product }>>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopStream = () => {
    recorderRef.current?.stream.getTracks().forEach(t => t.stop());
  };

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1500) {
          toast({ title: 'Áudio muito curto', variant: 'destructive' });
          return;
        }
        setProcessing(true);
        try {
          const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'wav';
          const form = new FormData();
          form.append('audio', blob, `pedido.${ext}`);
          const catalog = products.map(p => ({
            id: p.id,
            name: p.name,
            category: (p as any).category ?? null,
            stock: (p as any).stock ?? null,
          }));
          form.append('products', JSON.stringify(catalog));
          const { data, error } = await supabase.functions.invoke('voice-order-parse', { body: form });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const parsed = (data?.items ?? []) as ParsedItem[];
          const withProd = parsed
            .map(i => ({ ...i, product: products.find(p => p.id === i.product_id)! }))
            .filter(i => i.product);
          setTranscript(data?.transcript ?? '');
          setItems(withProd);
          setUnmatched(data?.unmatched ?? []);
          setReviewOpen(true);
        } catch (e: any) {
          toast({ title: 'Falha ao interpretar áudio', description: e?.message, variant: 'destructive' });
        } finally {
          setProcessing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast({ title: 'Sem acesso ao microfone', variant: 'destructive' });
    }
  }, [products, toast]);

  const stop = () => recorderRef.current?.state === 'recording' && recorderRef.current.stop();

  const confirmAdd = () => {
    for (const it of items) {
      for (let i = 0; i < it.quantity; i++) onAddItem(it.product);
    }
    toast({ title: `${items.reduce((s, i) => s + i.quantity, 0)} itens adicionados` });
    setReviewOpen(false);
    setItems([]);
    setTranscript('');
    setUnmatched([]);
  };

  return (
    <>
      <Button
        variant={recording ? 'default' : 'outline'}
        size="sm"
        onClick={recording ? stop : start}
        disabled={processing}
        className={`gap-1.5 ${recording ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : ''}`}
        title="Pedido por voz"
      >
        {processing ? <Loader2 className="h-4 w-4 animate-spin" />
          : recording ? <Square className="h-4 w-4" />
          : <Mic className="h-4 w-4" />}
        <span className="hidden sm:inline">
          {processing ? 'Interpretando…' : recording ? 'Parar' : 'Voz'}
        </span>
      </Button>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisar pedido por voz</DialogTitle>
            <DialogDescription className="text-xs italic">"{transcript}"</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto identificado.</p>}
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-md border bg-secondary/30">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{it.product.name}</p>
                  <p className="text-xs text-muted-foreground">R$ {Number(it.product.salePrice).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p))}>-</Button>
                  <span className="w-6 text-center font-bold">{it.quantity}</span>
                  <Button size="sm" variant="outline" onClick={() => setItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: p.quantity + 1 } : p))}>+</Button>
                </div>
              </div>
            ))}
            {unmatched.length > 0 && (
              <div className="mt-2 p-2 rounded-md border border-amber-500/40 bg-amber-500/10">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Não encontrados:</p>
                <p className="text-xs">{unmatched.join(', ')}</p>
              </div>
            )}
            {items.length > 0 && (
              <div className="pt-2 border-t text-right">
                <span className="text-sm text-muted-foreground mr-2">Total:</span>
                <span className="text-lg font-extrabold text-primary">
                  R$ {items.reduce((s, i) => s + Number(i.product.salePrice) * i.quantity, 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAdd} disabled={items.length === 0}>Adicionar ao carrinho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
