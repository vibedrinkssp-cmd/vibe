import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { QrCode, Download, FileImage, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_URL = 'https://www.lojasvm.com.br';

export function QrCodeTab() {
  const { toast } = useToast();
  const [url, setUrl] = useState(DEFAULT_URL);
  const [caption, setCaption] = useState('VM BRASIL CONVENIENCIA');
  const [dataUrl, setDataUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generate = useCallback(async (value: string) => {
    const target = value.trim() || DEFAULT_URL;
    try {
      const png = await QRCode.toDataURL(target, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 1024,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      setDataUrl(png);
    } catch {
      toast({ title: 'Erro ao gerar QR Code', variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    generate(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = () => generate(url);

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'qrcode-lojasvm.png';
    a.click();
  };

  const downloadPdf = () => {
    if (!dataUrl) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const qrSize = 130;
    const x = (pageW - qrSize) / 2;
    const y = 50;

    if (caption.trim()) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(caption.trim().toUpperCase(), pageW / 2, 30, { align: 'center' });
    }

    doc.addImage(dataUrl, 'PNG', x, y, qrSize, qrSize);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.text('Aponte a camera do celular para acessar', pageW / 2, y + qrSize + 18, { align: 'center' });
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(url.trim() || DEFAULT_URL, pageW / 2, y + qrSize + 28, { align: 'center' });

    doc.save('qrcode-lojasvm.pdf');
    toast({ title: 'PDF gerado', description: 'Download iniciado.' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <QrCode className="h-6 w-6 text-primary" /> Gerador de QR Code
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gere QR Codes permanentes que nunca expiram, apontando direto para o site da loja.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuração</CardTitle>
            <CardDescription>Defina o destino e o título do QR Code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qr-url" className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> Endereço (URL)
              </Label>
              <Input
                id="qr-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={DEFAULT_URL}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-caption">Título no PDF</Label>
              <Input
                id="qr-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="VM BRASIL CONVENIENCIA"
              />
            </div>
            <Button onClick={handleGenerate} className="w-full gap-2">
              <QrCode className="h-4 w-4" /> Gerar QR Code
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pré-visualização</CardTitle>
            <CardDescription>Baixe em PNG (alta qualidade) ou PDF para impressão.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center rounded-xl border bg-white p-6">
              {dataUrl ? (
                <img src={dataUrl} alt="QR Code" className="w-56 h-56 object-contain" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-muted-foreground">
                  <QrCode className="h-16 w-16 opacity-30" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={downloadPng} disabled={!dataUrl} className="gap-2">
                <FileImage className="h-4 w-4" /> PNG
              </Button>
              <Button onClick={downloadPdf} disabled={!dataUrl} className="gap-2">
                <Download className="h-4 w-4" /> PDF
              </Button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default QrCodeTab;
