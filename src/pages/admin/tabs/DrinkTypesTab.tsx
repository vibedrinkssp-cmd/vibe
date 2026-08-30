import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, Image as ImageIcon, Check, Loader2 } from 'lucide-react';
import { compressImage, formatBytes } from '@/lib/image-compression';
import { uploadImage } from '@/lib/supabase';

interface DrinkType {
  id: string;
  label: string;
  defaultImage: string;
}

const DRINK_TYPES: DrinkType[] = [
  { id: 'batida', label: 'Batidas', defaultImage: '/assets/drinks/batida.webp' },
  { id: 'caipirinha', label: 'Caipirinhas', defaultImage: '/assets/drinks/caipirinha.webp' },
  { id: 'caipi-ice', label: 'Caipi Ice', defaultImage: '/assets/drinks/caipi-ice.webp' },
  { id: 'dose', label: 'Doses', defaultImage: '/assets/drinks/dose.webp' },
  { id: 'drink-43', label: 'Drinks de Licor', defaultImage: '/assets/drinks/drink-43.webp' },
  { id: 'copao', label: 'Copão', defaultImage: '/assets/drinks/copao.webp' },
  { id: 'gin', label: 'Gin', defaultImage: '/assets/drinks/gin.webp' },
  { id: 'whisky', label: 'Whisky', defaultImage: '/assets/drinks/whisky.webp' },
  { id: 'energetico', label: 'Energético', defaultImage: '/assets/drinks/energetico.webp' },
];

export function DrinkTypesTab() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<string | null>(null);
  const [customImages, setCustomImages] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('drink_type_images') || '{}');
    } catch { return {}; }
  });
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleImageUpload = async (drinkId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione uma imagem.', variant: 'destructive' });
      return;
    }

    setUploading(drinkId);
    try {
      // Compress to 512x512 max
      const compressed = await compressImage(file, 512, 0.7);
      console.log(`[DrinkTypes] Compressed: ${formatBytes(compressed.originalSize)} → ${formatBytes(compressed.compressedSize)}`);

      // Upload to storage with 1-year cache
      const { publicUrl } = await uploadImage(compressed.file, 'drink-types');

      // Save reference
      const updated = { ...customImages, [drinkId]: publicUrl };
      setCustomImages(updated);
      localStorage.setItem('drink_type_images', JSON.stringify(updated));

      toast({ title: '✅ Imagem atualizada!', description: `${formatBytes(compressed.compressedSize)} enviados` });
    } catch (err) {
      console.error('[DrinkTypes] Upload error:', err);
      toast({ title: 'Erro no upload', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Tipos de Drink Especial</h2>
        <p className="text-sm text-muted-foreground">
          Gerencie as imagens dos ícones do carrossel de drinks. Imagens são comprimidas para 512×512px automaticamente.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {DRINK_TYPES.map((type) => {
          const currentImage = customImages[type.id] || type.defaultImage;
          const isUploading = uploading === type.id;

          return (
            <Card key={type.id} className="overflow-hidden">
              <CardHeader className="p-2 pb-1">
                <CardTitle className="text-xs font-semibold">{type.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0 space-y-2">
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted">
                  <img
                    src={currentImage}
                    alt={type.label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {customImages[type.id] && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => { fileInputRefs.current[type.id] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(type.id, file);
                    e.target.value = '';
                  }}
                />

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs h-7"
                  disabled={isUploading}
                  onClick={() => fileInputRefs.current[type.id]?.click()}
                >
                  {isUploading ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Enviando...</>
                  ) : (
                    <><Upload className="h-3 w-3 mr-1" /> Trocar Imagem</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Dicas:</strong></p>
              <ul className="list-disc pl-3 space-y-0.5">
                <li>Imagens são redimensionadas para 512×512px e convertidas para WebP</li>
                <li>Cache CDN de 1 ano para economizar egress</li>
                <li>Use fotos quadradas para melhor resultado</li>
                <li>Tamanho máximo recomendado: 2MB (será comprimido)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
