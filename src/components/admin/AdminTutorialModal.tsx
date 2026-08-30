import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, ChevronRight, X,
  Package, Truck, MapPin, Wallet, ArrowLeftRight, Wine, Receipt,
  Calculator, ClipboardCheck, Warehouse, ScanLine, BookOpen,
  Users, Ticket, ShoppingBag, Grid3X3, Image, Bike, Store,
  Sparkles, Wifi, HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminTutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToTab?: (tabId: string) => void;
}

interface TutorialStep {
  icon: any;
  title: string;
  description: string;
  tips?: string[];
  color: string;
  tabId?: string;
  targetSelector?: string;
  tooltipPosition: 'top' | 'bottom';
}

const tutorialSteps: TutorialStep[] = [
  {
    icon: Sparkles,
    title: '🎛️ Bem-vindo ao Painel Admin!',
    description: 'Este é o centro de controle da sua loja. Aqui você gerencia pedidos, produtos, entregas, finanças e muito mais. Vamos fazer um tour completo para que você domine todas as funcionalidades!',
    tips: [
      'Use as abas na parte superior para navegar entre as seções',
      'O painel atualiza em tempo real — pedidos novos aparecem automaticamente',
      'O indicador verde "Ao Vivo" mostra que a conexão está ativa',
    ],
    color: 'from-primary to-purple-600',
    tooltipPosition: 'bottom',
  },
  {
    icon: Wifi,
    title: '🟢 Indicador de Conexão',
    description: 'Este badge mostra se o painel está recebendo atualizações em tempo real. Quando está verde com "Ao Vivo", novos pedidos e mudanças aparecem instantaneamente sem precisar atualizar a página.',
    tips: [
      'Verde = conectado e recebendo dados em tempo real',
      'Vermelho = desconectado — tente recarregar a página',
      'Se ficar offline frequentemente, verifique sua conexão de internet',
    ],
    color: 'from-green-500 to-emerald-500',
    targetSelector: '[data-testid="badge-connection-status"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Package,
    title: '📦 Aba Pedidos — Coração da Operação',
    description: 'Aqui chegam TODOS os pedidos da loja: balcão, delivery e plataformas externas. Cada pedido passa por etapas: Pendente → Aceito → Preparando → Pronto → Entregue. Você controla o fluxo clicando nos botões de ação de cada pedido.',
    tips: [
      'Pedidos novos tocam um alerta sonoro — fique atento!',
      'Clique no pedido para expandir os detalhes e ver os itens',
      'Use os filtros para ver apenas pedidos de um status específico',
      'Pedidos de delivery mostram o endereço e taxa de entrega',
    ],
    color: 'from-blue-500 to-cyan-500',
    tabId: 'pedidos',
    targetSelector: '[data-testid="tab-pedidos"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Truck,
    title: '🚚 Aba Delivery — Gestão de Entregas',
    description: 'Visualize todos os pedidos de delivery e atribua motoboys. Aqui você vê quais pedidos estão aguardando entregador, quais já foram despachados e o progresso de cada entrega.',
    tips: [
      'Atribua um motoboy ao pedido assim que ele estiver "Pronto"',
      'O motoboy recebe notificação automática ao ser atribuído',
      'Acompanhe o tempo desde que o pedido saiu para entrega',
      'Pedidos sem motoboy atribuído ficam destacados em vermelho',
    ],
    color: 'from-emerald-500 to-green-500',
    tabId: 'delivery',
    targetSelector: '[data-testid="tab-delivery"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Store,
    title: '🍕 Aba iFood / Pedidos Externos',
    description: 'Pedidos vindos de plataformas como iFood entram aqui automaticamente. Eles seguem o mesmo fluxo dos pedidos normais, mas ficam separados para facilitar o controle e conferência com as plataformas.',
    tips: [
      'Pedidos externos são identificados pela plataforma de origem',
      'Confira os dados do pedido antes de aceitar',
      'A confirmação no painel NÃO confirma na plataforma — faça em ambos',
      'Use esta aba para conciliar comissões das plataformas',
    ],
    color: 'from-red-500 to-rose-500',
    tabId: 'ifood',
    targetSelector: '[data-testid="tab-ifood"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: MapPin,
    title: '📍 Aba Tracking — Mapa em Tempo Real',
    description: 'Veja a localização de cada motoboy no mapa em tempo real. Saiba quem está disponível, quem está em rota e a posição exata de cada entregador para tomar decisões rápidas de despacho.',
    tips: [
      'Motoboys online aparecem como marcadores no mapa',
      'A posição atualiza a cada poucos segundos via GPS do celular',
      'Use para decidir qual motoboy despachar (o mais próximo)',
      'Motoboys offline não aparecem no mapa',
    ],
    color: 'from-cyan-500 to-blue-500',
    tabId: 'tracking',
    targetSelector: '[data-testid="tab-tracking"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Wallet,
    title: '💰 Aba Caixa — Controle Financeiro Diário',
    description: 'Abra o caixa no início do turno informando o saldo inicial. Durante o dia, o sistema calcula automaticamente o saldo baseado nas vendas e sangrias. No final, feche o caixa e confira se o valor bate.',
    tips: [
      'SEMPRE abra o caixa antes de começar a receber pedidos',
      'O saldo é atualizado automaticamente a cada venda confirmada',
      'Registre suprimentos (dinheiro adicionado ao caixa) aqui',
      'O caixa precisa estar aberto para o sistema funcionar corretamente',
    ],
    color: 'from-yellow-500 to-amber-500',
    tabId: 'caixa',
    targetSelector: '[data-testid="tab-caixa"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: ArrowLeftRight,
    title: '💵 Aba SAQ/DEP — Saques e Depósitos',
    description: 'Registre qualquer movimentação avulsa de dinheiro no caixa: saques (retiradas) e depósitos (adições). Cada registro fica documentado com motivo, valor e responsável para total rastreabilidade.',
    tips: [
      'Use para trocos, pagamentos avulsos de fornecedores, etc.',
      'Sempre informe o motivo da movimentação',
      'Saques reduzem o saldo do caixa, depósitos aumentam',
      'Todas as movimentações aparecem no fechamento do caixa',
    ],
    color: 'from-orange-500 to-red-500',
    tabId: 'saqdep',
    targetSelector: '[data-testid="tab-saqdep"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Wine,
    title: '🍷 Aba Garrafas — Controle de Doses',
    description: 'Para lojas que vendem doses avulsas de bebidas. Ao abrir uma garrafa, registre aqui: o sistema calcula quantas doses tem, o preço por dose e controla quantas já foram vendidas até esvaziar.',
    tips: [
      'Registre cada garrafa aberta com a quantidade em ML',
      'Defina o tamanho da dose (ex: 50ml) e o preço por dose',
      'O sistema desconta automaticamente as doses vendidas',
      'Quando acabar, marque a garrafa como "vazia"',
    ],
    color: 'from-purple-500 to-violet-500',
    tabId: 'garrafas',
    targetSelector: '[data-testid="tab-garrafas"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Receipt,
    title: '📋 Aba Sangrias — Retiradas do Caixa',
    description: 'Sangria é quando você retira dinheiro do caixa (ex: para pagar um fornecedor, ou levar dinheiro ao banco). Registre aqui com valor, motivo e responsável. Tudo fica documentado para o fechamento.',
    tips: [
      'Toda retirada de dinheiro do caixa DEVE ser registrada aqui',
      'Informe sempre o responsável e o motivo',
      'As sangrias são descontadas automaticamente do saldo do caixa',
      'No fechamento, as sangrias aparecem discriminadas',
    ],
    color: 'from-pink-500 to-rose-500',
    tabId: 'sangrias',
    targetSelector: '[data-testid="tab-sangrias"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Calculator,
    title: '🧮 Aba Fechamento — Encerramento do Turno',
    description: 'No final do turno, faça o fechamento do caixa. O sistema gera um resumo completo: total de vendas por forma de pagamento (dinheiro, PIX, cartão crédito/débito), sangrias realizadas, lucro bruto e líquido do período.',
    tips: [
      'Conte o dinheiro em caixa e informe o valor real',
      'O sistema compara com o valor esperado e mostra a diferença',
      'Diferenças positivas = sobrou dinheiro | Negativas = faltou',
      'O fechamento gera um relatório completo do período',
    ],
    color: 'from-indigo-500 to-blue-500',
    tabId: 'fechamento',
    targetSelector: '[data-testid="tab-fechamento"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: ClipboardCheck,
    title: '📊 Aba Fech. Boys — Acerto com Motoboys',
    description: 'Controle quanto cada motoboy tem a receber. O sistema soma todas as taxas de entrega do período e mostra o valor acumulado para fazer o acerto (pagamento) com cada entregador.',
    tips: [
      'Faça o acerto no final de cada turno ou dia',
      'Confira quantidade de entregas x valor acumulado',
      'Após pagar, marque como "acertado" para zerar o saldo',
      'O histórico de acertos fica salvo para consulta futura',
    ],
    color: 'from-teal-500 to-cyan-500',
    tabId: 'fechamento-boys',
    targetSelector: '[data-testid="tab-fechamento-boys"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Warehouse,
    title: '📦 Aba Estoque — Controle de Inventário',
    description: 'Gerencie a quantidade disponível de cada produto. O estoque é descontado automaticamente a cada venda. Quando um produto chega a zero, ele fica indisponível no cardápio para os clientes.',
    tips: [
      'Ajuste o estoque manualmente ao receber mercadorias',
      'Produtos com estoque zerado ficam indisponíveis para pedidos',
      'Fique atento aos alertas de estoque baixo',
      'Faça contagens periódicas para garantir que bate com o sistema',
    ],
    color: 'from-amber-500 to-yellow-500',
    tabId: 'estoque',
    targetSelector: '[data-testid="tab-estoque"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: ScanLine,
    title: '📱 Aba Códigos de Barras',
    description: 'Vincule códigos de barras aos produtos para agilizar vendas no balcão. Basta escanear o código com a câmera do celular e o produto é adicionado automaticamente ao pedido.',
    tips: [
      'Cada produto pode ter um código de barras único',
      'Use o leitor do celular para escanear rapidamente',
      'Ideal para agilizar vendas presenciais no balcão',
      'Funciona com códigos de barras padrão de embalagens',
    ],
    color: 'from-gray-500 to-slate-500',
    tabId: 'barcodes',
    targetSelector: '[data-testid="tab-barcodes"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: BookOpen,
    title: '📒 Aba Caderneta — Fiado Digital',
    description: 'O caderno de fiado digital. Cadastre clientes de confiança e registre compras "na conta". Acompanhe o saldo devedor de cada um e registre pagamentos parciais ou totais.',
    tips: [
      'Cadastre o cliente com nome e WhatsApp',
      'Registre cada compra fiada com produto, quantidade e valor',
      'Acompanhe o saldo devedor total de cada cliente',
      'Registre pagamentos parciais para ir abatendo a dívida',
    ],
    color: 'from-lime-500 to-green-500',
    tabId: 'caderneta',
    targetSelector: '[data-testid="tab-caderneta"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Users,
    title: '👥 Aba Clientes — Base de Usuários',
    description: 'Veja todos os clientes cadastrados no sistema. Consulte histórico de pedidos, dados de contato e gerencie bloqueios. Clientes bloqueados não conseguem fazer pedidos.',
    tips: [
      'Busque clientes por nome ou WhatsApp',
      'Veja o histórico completo de pedidos de cada cliente',
      'Bloqueie clientes problemáticos — eles não conseguem mais pedir',
      'Os dados dos clientes são usados para cupons e promoções',
    ],
    color: 'from-sky-500 to-blue-500',
    tabId: 'clientes',
    targetSelector: '[data-testid="tab-clientes"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Ticket,
    title: '🎟️ Aba Cupons — Promoções e Descontos',
    description: 'Crie cupons de desconto para fidelizar clientes. Defina o percentual, validade e se é para produto específico, categoria ou pedido inteiro. Atribua cupons a clientes específicos ou disponibilize para todos.',
    tips: [
      'Cupons podem ser por percentual com valor máximo de desconto',
      'Atribua a um cliente específico para personalizar promoções',
      'Defina quantidade mínima de itens se necessário',
      'Acompanhe quais cupons já foram utilizados',
    ],
    color: 'from-fuchsia-500 to-pink-500',
    tabId: 'cupons',
    targetSelector: '[data-testid="tab-cupons"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: ShoppingBag,
    title: '🛍️ Aba Produtos — Cardápio Completo',
    description: 'Cadastre e gerencie todos os produtos da loja. Defina nome, preço de venda, preço de custo, descrição, imagem e categoria. Ative ou desative produtos conforme disponibilidade.',
    tips: [
      'Sempre preencha o preço de custo para cálculos de lucro',
      'Use imagens de boa qualidade — elas aparecem no app do cliente',
      'Produtos inativos não aparecem no cardápio para clientes',
      'A margem de lucro é calculada automaticamente (venda - custo)',
    ],
    color: 'from-violet-500 to-purple-500',
    tabId: 'produtos',
    targetSelector: '[data-testid="tab-produtos"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Grid3X3,
    title: '📂 Aba Categorias — Organização do Cardápio',
    description: 'Organize os produtos em categorias (ex: Cervejas, Destilados, Petiscos). A ordem das categorias define como elas aparecem no app. Ative ou desative categorias conforme necessidade.',
    tips: [
      'Arraste para reordenar as categorias no app',
      'Categorias desativadas escondem todos os produtos dela',
      'Use ícones para facilitar a identificação visual',
      'Categorias "especiais" têm comportamentos personalizados',
    ],
    color: 'from-rose-500 to-red-500',
    tabId: 'categorias',
    targetSelector: '[data-testid="tab-categorias"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Image,
    title: '🖼️ Aba Banners — Promoções Visuais',
    description: 'Configure banners promocionais que aparecem no topo do app para os clientes. Use para destacar promoções, novos produtos ou eventos especiais. Defina a ordem e ative/desative conforme necessário.',
    tips: [
      'Use imagens horizontais de boa resolução (1200x400px ideal)',
      'Banners inativos não aparecem para clientes',
      'Arraste para definir a ordem de exibição',
      'Adicione links para direcionar o cliente a produtos específicos',
    ],
    color: 'from-orange-500 to-amber-500',
    tabId: 'banners',
    targetSelector: '[data-testid="tab-banners"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Wine,
    title: '🍹 Aba Monte Drink — Configuração',
    description: 'Configure os tipos de drinks personalizáveis que o cliente pode montar no app. Defina preço base, quantidade de doses, frutas disponíveis e cada etapa do processo de montagem do drink.',
    tips: [
      'Cada tipo de drink tem suas próprias regras de montagem',
      'Configure quais bebidas (garrafas) são permitidas em cada tipo',
      'Defina o preço base e os adicionais por fruta/dose extra',
      'Ative/desative tipos de drink conforme disponibilidade',
    ],
    color: 'from-purple-500 to-violet-500',
    tabId: 'drink-types',
    targetSelector: '[data-testid="tab-drink-types"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Sparkles,
    title: '✨ Aba Drinks Especiais — Receitas',
    description: 'Cadastre receitas de drinks especiais que usam ingredientes do estoque. Quando um drink é vendido, o sistema desconta automaticamente os ingredientes (doses, frutas, etc.) das garrafas abertas.',
    tips: [
      'Vincule cada ingrediente da receita a um produto do estoque',
      'O sistema desconta automaticamente ao vender o drink',
      'Mantenha as receitas atualizadas para controle preciso',
      'Receitas ajudam a calcular o custo real de cada drink',
    ],
    color: 'from-amber-500 to-orange-500',
    tabId: 'drinks-especiais',
    targetSelector: '[data-testid="tab-drinks-especiais"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Bike,
    title: '🏍️ Aba Motoboys — Equipe de Entrega',
    description: 'Cadastre e gerencie seus motoboys. Defina nome, WhatsApp, senha de acesso e número do slot. Os motoboys usam o app para receber pedidos, compartilhar localização e marcar entregas como concluídas.',
    tips: [
      'Cada motoboy tem login próprio com WhatsApp + senha',
      'Motoboys ficam online automaticamente ao abrir o app',
      'Acompanhe quem está online na aba Tracking',
      'Desative motoboys que não trabalham mais com você',
    ],
    color: 'from-emerald-500 to-teal-500',
    tabId: 'motoboys',
    targetSelector: '[data-testid="tab-motoboys"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Store,
    title: '🏪 Aba Plataformas — Integrações',
    description: 'Gerencie vendas por plataformas externas (iFood, Rappi, etc.). Registre vendas manuais dessas plataformas para incluí-las nos relatórios e ter uma visão unificada de todas as vendas da loja.',
    tips: [
      'Registre vendas de plataformas para controle unificado',
      'As vendas aparecem nos relatórios e fechamento de caixa',
      'Mantenha o registro atualizado para conciliação',
      'Use como referência para comparar com extratos das plataformas',
    ],
    color: 'from-blue-500 to-indigo-500',
    tabId: 'plataformas',
    targetSelector: '[data-testid="tab-plataformas"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: HelpCircle,
    title: '🎓 Tour Finalizado!',
    description: 'Parabéns! Agora você conhece todas as funcionalidades do painel administrativo. Lembre-se: Relatórios, Configurações, Backup e Importação ficam no painel financeiro secreto (acesso pela página Financeiro com senha).',
    tips: [
      'Clique no botão "Ajuda" a qualquer momento para rever este tour',
      'O painel financeiro tem: Relatórios, Configurações, BKP e Import',
      'Em caso de dúvida, use o Assistente IA no cabeçalho',
      'Mantenha o caixa sempre aberto durante o expediente!',
    ],
    color: 'from-primary to-purple-600',
    tooltipPosition: 'bottom',
  },
];

export function AdminTutorialModal({ open, onOpenChange, onNavigateToTab }: AdminTutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  const step = tutorialSteps[currentStep];
  const Icon = step.icon;

  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setSpotlightRect(null);
      return;
    }

    if (step.targetSelector) {
      const updateRect = () => {
        const element = document.querySelector(step.targetSelector!);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          setTimeout(() => {
            setSpotlightRect(element.getBoundingClientRect());
          }, 300);
        } else {
          setSpotlightRect(null);
        }
      };

      const timer = setTimeout(updateRect, 100);
      window.addEventListener('resize', updateRect);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateRect);
      };
    } else {
      setSpotlightRect(null);
    }
  }, [open, currentStep, step.targetSelector]);

  const goToNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      const nextStep = tutorialSteps[currentStep + 1];
      if (nextStep.tabId && onNavigateToTab) {
        onNavigateToTab(nextStep.tabId);
      }
      setCurrentStep(prev => prev + 1);
    } else {
      onOpenChange(false);
    }
  };

  const goToPrev = () => {
    if (currentStep > 0) {
      const prevStep = tutorialSteps[currentStep - 1];
      if (prevStep.tabId && onNavigateToTab) {
        onNavigateToTab(prevStep.tabId);
      }
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!open) return null;

  const spotPadding = 8;
  const spotX = spotlightRect ? spotlightRect.left - spotPadding : 0;
  const spotY = spotlightRect ? spotlightRect.top - spotPadding : 0;
  const spotW = spotlightRect ? spotlightRect.width + spotPadding * 2 : 0;
  const spotH = spotlightRect ? spotlightRect.height + spotPadding * 2 : 0;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Dark overlay with spotlight hole */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="admin-tutorial-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.88)"
          mask="url(#admin-tutorial-spotlight-mask)"
        />
      </svg>

      {/* Glowing highlight */}
      {spotlightRect && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute pointer-events-none rounded-lg"
          style={{
            left: spotX,
            top: spotY,
            width: spotW,
            height: spotH,
            border: '2px solid hsl(var(--primary))',
            boxShadow: '0 0 0 4px rgba(168, 85, 247, 0.2), 0 0 20px rgba(168, 85, 247, 0.3)',
          }}
        />
      )}

      {/* Clickable overlay */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={handleClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
        style={{ pointerEvents: 'auto' }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute left-4 right-4 z-20 bottom-4"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-lg mx-auto bg-black/95 backdrop-blur-xl rounded-2xl border border-primary/50 shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1.5 bg-black/50 flex">
              {tutorialSteps.map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 transition-colors duration-300 ${
                    idx <= currentStep ? 'bg-primary' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">
                    {step.title}
                  </h3>
                  <span className="text-white/40 text-xs">
                    Passo {currentStep + 1} de {tutorialSteps.length}
                  </span>
                </div>
              </div>

              <p className="text-white/80 text-sm leading-relaxed mb-3">
                {step.description}
              </p>

              {/* Tips section */}
              {step.tips && step.tips.length > 0 && (
                <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/10">
                  <p className="text-primary text-xs font-semibold mb-1.5">💡 Dicas importantes:</p>
                  <ul className="space-y-1">
                    {step.tips.map((tip, idx) => (
                      <li key={idx} className="text-white/60 text-xs flex items-start gap-1.5">
                        <span className="text-primary/70 mt-0.5">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrev}
                    className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white h-9 px-3"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                )}

                <div className="flex-1" />

                <span className="text-white/30 text-xs mr-2">
                  {currentStep + 1}/{tutorialSteps.length}
                </span>

                <Button
                  size="sm"
                  onClick={goToNext}
                  className="bg-gradient-to-r from-primary to-purple-600 text-white font-bold h-9 px-5 shadow-lg shadow-primary/30"
                >
                  {currentStep === tutorialSteps.length - 1 ? (
                    'Finalizar! ✅'
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  );
}
