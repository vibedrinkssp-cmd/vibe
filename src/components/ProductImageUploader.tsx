import { useState, useCallback, useEffect, useRef } from "react";
import { Camera, Upload, X, ImageIcon, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { uploadImage, getStorageUrl } from "@/lib/supabase";
import { searchProductImages, uploadSerperImage } from "@/lib/serper-search";
import { compressImage, formatBytes } from "@/lib/image-compression";
import { getAdminSessionToken } from "@/lib/admin-session";
import { useToast } from "@/hooks/use-toast";
interface ProductImageUploaderProps {
  currentImageUrl?: string | null;
  onImageUploaded: (imagePath: string) => void;
  onImageRemoved?: () => void;
  disabled?: boolean;
  folder?: string;
  productName?: string;
  compact?: boolean;
}

interface SearchResult {
  imageUrl: string;
  title: string;
  source: string;
}

export function ProductImageUploader({
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  disabled = false,
  folder = "products",
  productName = "",
  compact = false,
}: ProductImageUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (currentImageUrl) {
      const displayUrl = getStorageUrl(currentImageUrl);
      setPreviewUrl(displayUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [currentImageUrl]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma imagem válida.",
        variant: "destructive",
      });
      return;
    }

    // Increased limit since we'll compress
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Erro",
        description: "A imagem deve ter no máximo 20MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Compress image to 512x512 max before upload
      console.log(`[ProductImageUploader] Compressing: ${formatBytes(file.size)}`);
      const compressed = await compressImage(file);
      console.log(`[ProductImageUploader] Compressed: ${formatBytes(compressed.originalSize)} -> ${formatBytes(compressed.compressedSize)} (${compressed.width}x${compressed.height})`);
      
      const { publicUrl } = await uploadImage(compressed.file, folder);
      
      setPreviewUrl(publicUrl);
      onImageUploaded(publicUrl);
      
      toast({
        title: "Sucesso",
        description: `Imagem otimizada e enviada! (${formatBytes(compressed.compressedSize)})`,
      });
    } catch (error) {
      console.error('[ProductImageUploader] Error:', error);
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Falha ao enviar imagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  }, [folder, onImageUploaded, toast]);

  const handleRemoveImage = useCallback(() => {
    setPreviewUrl(null);
    onImageRemoved?.();
  }, [onImageRemoved]);

  const handleSearchImages = useCallback(async () => {
    if (!productName.trim()) {
      toast({
        title: "Erro",
        description: "Digite o nome do produto para pesquisar.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchProductImages(productName);
      setSearchResults(results);
      
      if (results.length === 0) {
        toast({
          title: "Nenhuma imagem encontrada",
          description: "Tente outro nome para o produto.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro na pesquisa",
        description: error instanceof Error ? error.message : "Falha ao pesquisar imagens. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  }, [productName, toast]);

  const handleSelectSearchResult = useCallback(async (result: SearchResult) => {
    setIsUploading(true);
    try {
      const token = getAdminSessionToken();
      if (!token) throw new Error('Sessão admin não encontrada. Faça login novamente.');

      const uploaded = await uploadSerperImage({
        imageUrl: result.imageUrl,
        folder: folder as any,
        sessionToken: token,
        maxSize: 512,
      });

      setPreviewUrl(uploaded.publicUrl);
      onImageUploaded(uploaded.publicUrl);
      setShowSearchModal(false);
      setSearchResults([]);

      toast({
        title: "Sucesso",
        description: `Imagem salva! (${formatBytes(uploaded.size)})`,
      });
    } catch (error) {
      console.error('[ProductImageUploader] Search result error:', error);
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Falha ao enviar imagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [folder, onImageUploaded, toast]);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-camera-capture"
      />

      <div className={`relative w-full aspect-square ${compact ? 'max-w-[120px]' : 'max-w-[200px]'} mx-auto bg-muted rounded-md overflow-hidden border border-border`}>
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Product preview"
              className="w-full h-full object-cover"
              data-testid="img-product-preview"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://placehold.co/400x400?text=Erro+na+Imagem';
              }}
            />
            {!disabled && (
              <Button
                size="icon"
                variant="destructive"
                className={`absolute ${compact ? 'top-1 right-1 h-6 w-6' : 'top-2 right-2'}`}
                onClick={handleRemoveImage}
                type="button"
                data-testid="button-remove-image"
              >
                <X className={compact ? "h-3 w-3" : "h-4 w-4"} />
              </Button>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className={compact ? "h-8 w-8 mb-1" : "h-12 w-12 mb-2"} />
            <span className={compact ? "text-xs" : "text-sm"}>Sem imagem</span>
          </div>
        )}
        
        {isUploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Loader2 className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} animate-spin text-primary`} />
          </div>
        )}
      </div>

      <div className={`flex gap-1.5 justify-center ${compact ? 'flex-wrap' : 'flex-wrap'}`}>
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={compact ? "h-7 px-2 text-xs" : ""}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          type="button"
          data-testid="button-upload-image"
        >
          <Upload className={compact ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
          {compact ? "Enviar" : "Enviar Imagem"}
        </Button>

        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={compact ? "h-7 px-2 text-xs" : ""}
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || isUploading}
          type="button"
          data-testid="button-camera-capture"
        >
          <Camera className={compact ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
          {compact ? "Foto" : "Câmera"}
        </Button>

        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={compact ? "h-7 px-2 text-xs" : ""}
          onClick={async () => {
            setShowSearchModal(true);
            if (productName.trim()) {
              setIsSearching(true);
              try {
                const results = await searchProductImages(productName);
                setSearchResults(results);
                if (results.length === 0) {
                  toast({ title: "Nenhuma imagem encontrada", description: "Tente outro nome.", variant: "destructive" });
                }
              } catch (err) {
                toast({ title: "Erro na pesquisa", description: err instanceof Error ? err.message : "Falha ao pesquisar imagens.", variant: "destructive" });
              } finally {
                setIsSearching(false);
              }
            }
          }}
          disabled={disabled || isUploading || isSearching}
          type="button"
          data-testid="button-search-image"
        >
          {isSearching ? <Loader2 className={`${compact ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} /> : <Search className={compact ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />}
          {compact ? "Buscar" : "Pesquisar"}
        </Button>
      </div>

      <Dialog open={showSearchModal} onOpenChange={(open) => { setShowSearchModal(open); if (!open) setSearchResults([]); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pesquisar Imagem do Produto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Buscando imagens de "{productName}"...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Nenhuma imagem encontrada para "{productName}"
                </p>
                <Button
                  onClick={handleSearchImages}
                  disabled={!productName.trim()}
                  data-testid="button-perform-search"
                >
                  Tentar Novamente
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="group cursor-pointer relative overflow-hidden rounded-lg border-2 border-border hover:border-primary transition-colors bg-muted"
                    onClick={() => handleSelectSearchResult(result)}
                    data-testid={`button-select-image-${index}`}
                  >
                    <img
                      src={result.imageUrl}
                      alt={result.title}
                      className="w-full h-40 object-cover group-hover:opacity-75 transition-opacity"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = (e.target as HTMLImageElement).parentElement;
                        if (parent) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'w-full h-40 flex items-center justify-center text-muted-foreground text-xs';
                          placeholder.textContent = 'Imagem indisponível';
                          parent.insertBefore(placeholder, e.target as HTMLImageElement);
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-xs bg-background/95 text-foreground px-3 py-1.5 rounded-md font-semibold transition-opacity shadow-sm">
                        {isUploading ? "Enviando..." : "✓ Selecionar"}
                      </span>
                    </div>
                    <p className="text-xs p-2 line-clamp-1 text-center text-muted-foreground">{result.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
