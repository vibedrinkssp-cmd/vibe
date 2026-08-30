import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Download, FileSpreadsheet, Check, AlertCircle, Loader2, Database, HardDrive, Image, FolderUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import JSZip from 'jszip';

// ============== CONSTANTS ==============

const TABLES_ORDER = [
  'categories', 'users', 'employees', 'motoboys', 'settings',
  'addresses', 'products', 'banners', 'drink_fruits', 'special_drink_configs',
  'coupons', 'user_coupons', 'caderneta_customers', 'caderneta_entries',
  'orders', 'order_items', 'open_bottles',
  'cash_register_sessions', 'cash_register_closures',
  'sangrias', 'sangria_items', 'platform_sales', 'user_roles',
  'visitor_sessions', 'motoboy_locations',
];

const TABLE_LABELS: Record<string, string> = {
  categories: 'Categorias', users: 'Usuários', employees: 'Funcionários',
  motoboys: 'Motoboys', settings: 'Configurações', addresses: 'Endereços',
  products: 'Produtos', banners: 'Banners', drink_fruits: 'Frutas (Drinks)',
  special_drink_configs: 'Config Drinks Especiais', coupons: 'Cupons',
  user_coupons: 'Cupons de Usuários', caderneta_customers: 'Clientes Caderneta',
  caderneta_entries: 'Lançamentos Caderneta', orders: 'Pedidos',
  order_items: 'Itens de Pedidos', open_bottles: 'Garrafas Abertas',
  cash_register_sessions: 'Sessões de Caixa', cash_register_closures: 'Fechamentos de Caixa',
  sangrias: 'Sangrias', sangria_items: 'Itens de Sangria',
  platform_sales: 'Vendas Plataformas', user_roles: 'Roles de Usuários',
  visitor_sessions: 'Sessões de Visitantes', motoboy_locations: 'Localizações Motoboys',
};

// ============== HELPERS ==============

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCSV(row[h])).join(','));
  }
  return '\ufeff' + lines.join('\n'); // UTF-8 BOM
}

function parseCSVToObjects(csv: string): Record<string, string>[] {
  const lines = csv.replace(/^\ufeff/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]);
  const result: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx]?.trim() || '';
    });
    result.push(obj);
  }
  return result;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += char; }
  }
  result.push(current);
  return result;
}

function coerceValue(value: string): unknown {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Try JSON parse for objects/arrays
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function nowStr() {
  return new Date().toLocaleTimeString('pt-BR');
}

async function getAdminKey(): Promise<string> {
  // Use the service role key passed via edge function header
  // We store it temporarily from a settings fetch
  const { data } = await supabase.functions.invoke('export-database', {
    method: 'POST',
    body: {},
  });
  // This won't work - we need the key from somewhere else
  // Instead, we'll prompt user or use a stored secret
  return '';
}

// ============== MAIN COMPONENT ==============

export function BackupDataTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('export-db');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Sistema de Migração Completa
          </CardTitle>
          <CardDescription>
            Exporte e importe todos os dados e imagens do sistema. Compatível com qualquer instância Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="export-db" className="text-xs">
                <Download className="h-3 w-3 mr-1" /> Exportar BD
              </TabsTrigger>
              <TabsTrigger value="import-db" className="text-xs">
                <Upload className="h-3 w-3 mr-1" /> Importar BD
              </TabsTrigger>
              <TabsTrigger value="export-storage" className="text-xs">
                <Image className="h-3 w-3 mr-1" /> Exportar Imagens
              </TabsTrigger>
              <TabsTrigger value="import-storage" className="text-xs">
                <FolderUp className="h-3 w-3 mr-1" /> Importar Imagens
              </TabsTrigger>
            </TabsList>

            <TabsContent value="export-db"><ExportDBTab /></TabsContent>
            <TabsContent value="import-db"><ImportDBTab /></TabsContent>
            <TabsContent value="export-storage"><ExportStorageTab /></TabsContent>
            <TabsContent value="import-storage"><ImportStorageTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== EXPORT DB TAB ==============

function ExportDBTab() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { time: nowStr(), type, message }]);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setLogs([]);
    setTableCounts({});

    try {
      addLog('info', 'Iniciando exportação completa do banco de dados...');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;

      // We call the edge function with the anon key in authorization
      // and pass a special admin key header
      // For security, we prompt the user for the service role key
      const serviceKey = prompt(
        'Digite a Service Role Key do Supabase para exportar todos os dados.\n\n' +
        'Você encontra em: Supabase Dashboard → Settings → API → service_role key\n\n' +
        '(Esta chave NÃO é salva em nenhum lugar)'
      );

      if (!serviceKey) {
        addLog('error', 'Exportação cancelada - chave não fornecida.');
        setIsExporting(false);
        return;
      }

      addLog('info', 'Chamando função de exportação...');

      const response = await fetch(`${supabaseUrl}/functions/v1/export-database`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'x-admin-key': serviceKey,
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.errors && Object.keys(result.errors).length > 0) {
        for (const [table, err] of Object.entries(result.errors)) {
          addLog('warn', `⚠ ${TABLE_LABELS[table] || table}: ${err}`);
        }
      }

      addLog('success', 'Dados recebidos. Gerando arquivos CSV...');

      const zip = new JSZip();
      const counts: Record<string, number> = {};
      let tableIdx = 0;

      for (const table of TABLES_ORDER) {
        const rows = result.data?.[table] || [];
        counts[table] = rows.length;

        if (rows.length > 0) {
          const csv = arrayToCSV(rows);
          zip.file(`${table}.csv`, csv);
          addLog('success', `✓ ${TABLE_LABELS[table] || table}: ${rows.length} registros`);
        } else {
          addLog('info', `○ ${TABLE_LABELS[table] || table}: vazio`);
        }

        tableIdx++;
        setProgress(Math.round((tableIdx / TABLES_ORDER.length) * 100));
      }

      // Add manifest
      zip.file('_manifest.json', JSON.stringify({
        exportDate: new Date().toISOString(),
        version: '2.0',
        source: 'vibe-drinks-migration',
        tables: counts,
        totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
      }, null, 2));

      setTableCounts(counts);

      addLog('info', 'Compactando ZIP...');
      const blob = await zip.generateAsync({ type: 'blob' });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `backup-completo-${date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      addLog('success', `✅ Exportação concluída! ${total} registros em ${Object.keys(counts).filter(k => counts[k] > 0).length} tabelas.`);

      toast({ title: 'Backup exportado', description: `${total} registros exportados com sucesso.` });
    } catch (error) {
      console.error('Export error:', error);
      addLog('error', `❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      toast({ title: 'Erro na exportação', description: String(error), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Exportar Banco Completo</h3>
          <p className="text-sm text-muted-foreground">
            Gera um ZIP com CSV de todas as {TABLES_ORDER.length} tabelas do sistema.
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting} size="lg">
          {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          {isExporting ? 'Exportando...' : 'Exportar Tudo'}
        </Button>
      </div>

      {isExporting && <Progress value={progress} className="w-full" />}

      {Object.keys(tableCounts).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(tableCounts).filter(([, c]) => c > 0).map(([table, count]) => (
            <Badge key={table} variant="secondary" className="text-xs">
              {TABLE_LABELS[table] || table}: {count}
            </Badge>
          ))}
        </div>
      )}

      {logs.length > 0 && <LogViewer logs={logs} />}
    </div>
  );
}

// ============== IMPORT DB TAB ==============

function ImportDBTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [zipData, setZipData] = useState<Record<string, Record<string, string>[]> | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { time: nowStr(), type, message }]);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLogs([]);
    setZipData(null);

    try {
      const zip = await JSZip.loadAsync(file);
      const data: Record<string, Record<string, string>[]> = {};

      for (const [name, zipEntry] of Object.entries(zip.files)) {
        if (name.endsWith('.csv') && !name.startsWith('_')) {
          const tableName = name.replace('.csv', '');
          const content = await zipEntry.async('string');
          const rows = parseCSVToObjects(content);
          if (rows.length > 0) {
            data[tableName] = rows;
          }
        }
      }

      setZipData(data);
      const tables = Object.keys(data);
      const totalRows = Object.values(data).reduce((a, b) => a + b.length, 0);

      toast({
        title: 'ZIP carregado',
        description: `${tables.length} tabelas detectadas, ${totalRows} registros total.`,
      });
    } catch (error) {
      toast({ title: 'Erro ao ler ZIP', description: String(error), variant: 'destructive' });
    }

    if (event.target) event.target.value = '';
  };

  const processImport = async () => {
    if (!zipData) return;

    setIsImporting(true);
    setProgress(0);
    setLogs([]);

    const serviceKey = prompt(
      'Digite a Service Role Key do Supabase para importar os dados.\n\n' +
      'ATENÇÃO: Isso irá sobrescrever dados existentes (upsert por ID).\n\n' +
      'Você encontra em: Supabase Dashboard → Settings → API → service_role key'
    );

    if (!serviceKey) {
      addLog('error', 'Importação cancelada.');
      setIsImporting(false);
      return;
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;

    // Create admin client
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Sort tables by import order
    const sortedTables = Object.keys(zipData).sort((a, b) => {
      const idxA = TABLES_ORDER.indexOf(a);
      const idxB = TABLES_ORDER.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    const totalTables = sortedTables.length;
    let processed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    for (const table of sortedTables) {
      const rows = zipData[table];
      addLog('info', `Importando ${TABLE_LABELS[table] || table} (${rows.length} registros)...`);

      try {
        // Coerce values
        const coercedRows = rows.map(row => {
          const obj: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(row)) {
            obj[key] = coerceValue(val);
          }
          return obj;
        });

        // Batch upsert in chunks of 100
        const chunkSize = 100;
        let tableSuccess = 0;
        let tableErrors = 0;

        for (let i = 0; i < coercedRows.length; i += chunkSize) {
          const chunk = coercedRows.slice(i, i + chunkSize);
          
          const { error } = await adminClient
            .from(table)
            .upsert(chunk as any, { onConflict: 'id', ignoreDuplicates: false });

          if (error) {
            addLog('error', `  Chunk ${Math.floor(i/chunkSize)+1}: ${error.message}`);
            tableErrors += chunk.length;
          } else {
            tableSuccess += chunk.length;
          }
        }

        totalSuccess += tableSuccess;
        totalErrors += tableErrors;

        if (tableErrors === 0) {
          addLog('success', `✓ ${TABLE_LABELS[table] || table}: ${tableSuccess} registros importados`);
        } else {
          addLog('warn', `⚠ ${TABLE_LABELS[table] || table}: ${tableSuccess} ok, ${tableErrors} erros`);
        }
      } catch (error) {
        addLog('error', `❌ ${TABLE_LABELS[table] || table}: ${error instanceof Error ? error.message : 'Erro'}`);
        totalErrors += rows.length;
      }

      processed++;
      setProgress(Math.round((processed / totalTables) * 100));
    }

    addLog('success', `\n✅ Importação concluída! ${totalSuccess} sucesso, ${totalErrors} erros.`);
    
    queryClient.invalidateQueries();
    toast({ title: 'Importação concluída', description: `${totalSuccess} registros importados.` });
    setIsImporting(false);
  };

  return (
    <div className="space-y-4 mt-4">
      <div>
        <h3 className="font-semibold">Importar Banco Completo</h3>
        <p className="text-sm text-muted-foreground">
          Faça upload de um ZIP exportado. Os dados serão importados na ordem correta (respeitando dependências).
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {fileName || 'Selecionar ZIP'}
        </Button>

        {zipData && (
          <Button onClick={processImport} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {isImporting ? 'Importando...' : 'Iniciar Importação'}
          </Button>
        )}
      </div>

      {zipData && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(zipData).map(([table, rows]) => (
            <Badge key={table} variant="secondary" className="text-xs">
              {TABLE_LABELS[table] || table}: {rows.length}
            </Badge>
          ))}
        </div>
      )}

      {isImporting && <Progress value={progress} className="w-full" />}
      {logs.length > 0 && <LogViewer logs={logs} />}
    </div>
  );
}

// ============== EXPORT STORAGE TAB ==============

function ExportStorageTab() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { time: nowStr(), type, message }]);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setLogs([]);

    try {
      const serviceKey = prompt(
        'Digite a Service Role Key do Supabase para exportar as imagens.\n\n' +
        'Você encontra em: Supabase Dashboard → Settings → API → service_role key'
      );

      if (!serviceKey) {
        addLog('error', 'Exportação cancelada.');
        setIsExporting(false);
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;

      addLog('info', 'Listando arquivos do bucket...');

      const response = await fetch(`${supabaseUrl}/functions/v1/export-storage?action=list&bucket=images`, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'x-admin-key': serviceKey,
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const files = result.files || [];

      if (files.length === 0) {
        addLog('warn', 'Nenhum arquivo encontrado no bucket.');
        setIsExporting(false);
        return;
      }

      addLog('success', `${files.length} arquivos encontrados. Iniciando download...`);

      const zip = new JSZip();
      let downloaded = 0;

      for (const file of files) {
        try {
          if (!file.signedUrl) {
            addLog('warn', `⚠ Sem URL para: ${file.path}`);
            continue;
          }

          const fileResponse = await fetch(file.signedUrl);
          if (!fileResponse.ok) {
            addLog('warn', `⚠ Falha ao baixar: ${file.path}`);
            continue;
          }

          const blob = await fileResponse.blob();
          zip.file(file.path, blob);
          downloaded++;
          
          setProgress(Math.round((downloaded / files.length) * 100));
          
          if (downloaded % 10 === 0) {
            addLog('info', `Baixados ${downloaded}/${files.length}...`);
          }
        } catch (err) {
          addLog('warn', `⚠ Erro em ${file.path}: ${err}`);
        }
      }

      // Add manifest
      zip.file('_manifest.json', JSON.stringify({
        exportDate: new Date().toISOString(),
        bucket: 'images',
        totalFiles: downloaded,
        files: files.map((f: any) => ({ path: f.path, size: f.size, mimetype: f.mimetype })),
      }, null, 2));

      addLog('info', 'Compactando ZIP...');
      const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setProgress(Math.round(metadata.percent));
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `storage-images-${date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog('success', `✅ ${downloaded} imagens exportadas com sucesso!`);
      toast({ title: 'Imagens exportadas', description: `${downloaded} arquivos empacotados.` });
    } catch (error) {
      addLog('error', `❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      toast({ title: 'Erro na exportação', description: String(error), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Exportar Imagens (Storage)</h3>
          <p className="text-sm text-muted-foreground">
            Baixa todas as imagens do bucket e empacota em ZIP com manifesto.
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting} size="lg">
          {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Image className="h-4 w-4 mr-2" />}
          {isExporting ? 'Exportando...' : 'Exportar Imagens'}
        </Button>
      </div>

      {isExporting && <Progress value={progress} className="w-full" />}
      {logs.length > 0 && <LogViewer logs={logs} />}
    </div>
  );
}

// ============== IMPORT STORAGE TAB ==============

function ImportStorageTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { time: nowStr(), type, message }]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setZipFile(file);
    setLogs([]);
    toast({ title: 'ZIP selecionado', description: file.name });
    if (event.target) event.target.value = '';
  };

  const processImport = async () => {
    if (!zipFile) return;

    setIsImporting(true);
    setProgress(0);
    setLogs([]);

    try {
      const serviceKey = prompt(
        'Digite a Service Role Key do Supabase de DESTINO para upload das imagens.\n\n' +
        'As imagens serão enviadas para o bucket "images" mantendo os mesmos paths.'
      );

      if (!serviceKey) {
        addLog('error', 'Importação cancelada.');
        setIsImporting(false);
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;

      const { createClient } = await import('@supabase/supabase-js');
      const adminClient = createClient(supabaseUrl, serviceKey);

      addLog('info', 'Lendo ZIP...');
      const zip = await JSZip.loadAsync(zipFile);

      // Read manifest
      let manifest: any = null;
      const manifestFile = zip.file('_manifest.json');
      if (manifestFile) {
        const manifestContent = await manifestFile.async('string');
        manifest = JSON.parse(manifestContent);
        addLog('info', `Manifesto: ${manifest.totalFiles} arquivos do bucket "${manifest.bucket}"`);
      }

      const bucket = manifest?.bucket || 'images';

      // Get all files (excluding manifest)
      const filesToUpload = Object.entries(zip.files).filter(
        ([name]) => !name.startsWith('_') && !name.endsWith('/')
      );

      addLog('info', `${filesToUpload.length} arquivos para upload...`);

      let uploaded = 0;
      let errors = 0;

      for (const [path, zipEntry] of filesToUpload) {
        try {
          const blob = await zipEntry.async('blob');
          
          // Detect content type
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const contentTypes: Record<string, string> = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
            'mp4': 'video/mp4', 'mp3': 'audio/mpeg',
          };
          const contentType = contentTypes[ext] || 'application/octet-stream';

          const { error } = await adminClient.storage
            .from(bucket)
            .upload(path, blob, { contentType, upsert: true });

          if (error) {
            addLog('warn', `⚠ ${path}: ${error.message}`);
            errors++;
          } else {
            uploaded++;
          }

          setProgress(Math.round(((uploaded + errors) / filesToUpload.length) * 100));
          
          if ((uploaded + errors) % 10 === 0) {
            addLog('info', `Progresso: ${uploaded + errors}/${filesToUpload.length}`);
          }
        } catch (err) {
          addLog('error', `❌ ${path}: ${err}`);
          errors++;
        }
      }

      addLog('success', `✅ Upload concluído! ${uploaded} enviados, ${errors} erros.`);
      toast({ title: 'Imagens importadas', description: `${uploaded} arquivos enviados ao storage.` });
    } catch (error) {
      addLog('error', `❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      toast({ title: 'Erro na importação', description: String(error), variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div>
        <h3 className="font-semibold">Importar Imagens (Storage)</h3>
        <p className="text-sm text-muted-foreground">
          Faça upload de um ZIP exportado. As imagens serão enviadas para o bucket mantendo a mesma estrutura de pastas.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {fileName || 'Selecionar ZIP'}
        </Button>

        {zipFile && (
          <Button onClick={processImport} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderUp className="h-4 w-4 mr-2" />}
            {isImporting ? 'Enviando...' : 'Iniciar Upload'}
          </Button>
        )}
      </div>

      {isImporting && <Progress value={progress} className="w-full" />}
      {logs.length > 0 && <LogViewer logs={logs} />}
    </div>
  );
}

// ============== LOG VIEWER ==============

function LogViewer({ logs }: { logs: LogEntry[] }) {
  return (
    <ScrollArea className="h-64 rounded-md border p-3 bg-muted/30">
      <div className="space-y-1 font-mono text-xs">
        {logs.map((log, i) => (
          <div key={i} className={`flex gap-2 ${
            log.type === 'error' ? 'text-red-500' :
            log.type === 'success' ? 'text-green-500' :
            log.type === 'warn' ? 'text-yellow-500' :
            'text-muted-foreground'
          }`}>
            <span className="text-muted-foreground/60 shrink-0">[{log.time}]</span>
            <span className="whitespace-pre-wrap">{log.message}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
