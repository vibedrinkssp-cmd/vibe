import { Check, Clock, ChefHat, Package, Bike, MapPin, PartyPopper, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { OrderStatus } from '@/shared/schema';

interface OrderTrackingTimelineProps {
  status: OrderStatus;
  orderType: 'delivery' | 'pickup' | 'local' | 'counter' | 'totem';
  timestamps?: {
    createdAt?: string | null;
    acceptedAt?: string | null;
    preparingAt?: string | null;
    readyAt?: string | null;
    dispatchedAt?: string | null;
    arrivedAt?: string | null;
    deliveredAt?: string | null;
  };
}

const deliveryStages = [
  { key: 'pending', label: 'Recebido', icon: Clock },
  { key: 'accepted', label: 'Confirmado', icon: Check },
  { key: 'preparing', label: 'Preparando', icon: ChefHat },
  { key: 'ready', label: 'Pronto', icon: Package },
  { key: 'dispatched', label: 'A Caminho', icon: Bike },
  { key: 'arrived', label: 'Chegou', icon: MapPin },
  { key: 'delivered', label: 'Entregue', icon: PartyPopper },
];

const pickupStages = [
  { key: 'pending', label: 'Recebido', icon: Clock },
  { key: 'accepted', label: 'Confirmado', icon: Check },
  { key: 'preparing', label: 'Preparando', icon: ChefHat },
  { key: 'ready', label: 'Pronto', icon: Package },
  { key: 'delivered', label: 'Retirado', icon: PartyPopper },
];

export function OrderTrackingTimeline({ status, orderType, timestamps }: OrderTrackingTimelineProps) {
  const isCancelled = status === 'cancelled';
  const stages = orderType === 'delivery' ? deliveryStages : pickupStages;
  
  // Find current stage index
  const currentIndex = stages.findIndex(s => s.key === status);
  const progressIndex = isCancelled ? -1 : currentIndex;
  
  // Calculate progress percentage (center each dot)
  const stageWidth = 100 / stages.length;
  const progressPercent = isCancelled 
    ? 0 
    : Math.max(0, (progressIndex * stageWidth) + (stageWidth / 2));

  if (isCancelled) {
    return (
      <div className="py-6">
        <div className="flex items-center justify-center gap-3 text-destructive">
          <motion.div 
            className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <X className="w-6 h-6" />
          </motion.div>
          <span className="text-lg font-semibold">Pedido Cancelado</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 px-3 sm:px-4">
      {/* Progress Bar Container */}
      <div className="relative">
        {/* Background track */}
        <div className="absolute top-3.5 left-3 right-3 h-1 bg-muted/50 rounded-full">
          {/* Animated progress bar */}
          <motion.div
            className="absolute top-0 left-0 h-full rounded-full"
            style={{ 
              background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))',
              boxShadow: '0 0 16px hsl(var(--primary) / 0.6)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
        
        {/* Stage indicators */}
        <div className="relative flex justify-between px-0">
          {stages.map((stage, index) => {
            const isCompleted = index < progressIndex;
            const isCurrent = index === progressIndex;
            const isPending = index > progressIndex;
            const Icon = stage.icon;
            
            return (
              <motion.div 
                key={stage.key} 
                className="flex flex-col items-center flex-1 min-w-0"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
              >
                {/* Icon circle */}
                <motion.div
                  className={`
                    relative z-10 w-7 h-7 rounded-full flex items-center justify-center
                    transition-all duration-500 border-2
                    ${isCompleted 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : isCurrent 
                        ? 'bg-primary border-primary text-primary-foreground' 
                        : 'bg-card border-muted text-muted-foreground'
                    }
                  `}
                  style={{
                    boxShadow: isCompleted 
                      ? '0 0 20px hsl(var(--primary) / 0.5), 0 0 40px hsl(var(--primary) / 0.3)'
                      : isCurrent 
                        ? '0 0 25px hsl(var(--primary) / 0.6), 0 0 50px hsl(var(--primary) / 0.4)'
                        : 'none'
                  }}
                  animate={isCurrent ? { 
                    scale: [1, 1.15, 1],
                    boxShadow: [
                      '0 0 20px hsl(var(--primary) / 0.6), 0 0 40px hsl(var(--primary) / 0.4)',
                      '0 0 30px hsl(var(--primary) / 0.8), 0 0 60px hsl(var(--primary) / 0.5)',
                      '0 0 20px hsl(var(--primary) / 0.6), 0 0 40px hsl(var(--primary) / 0.4)'
                    ]
                  } : {}}
                  transition={isCurrent ? { 
                    duration: 2, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  } : {}}
                >
                  {isCompleted ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </motion.div>
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </motion.div>
                
                {/* Label */}
                <motion.span 
                  className={`
                    mt-1 text-[9px] sm:text-[10px] font-medium text-center leading-tight px-0 truncate w-full
                    transition-colors duration-300
                    ${isCompleted ? 'text-primary' : isCurrent ? 'text-primary font-semibold' : 'text-muted-foreground'}
                  `}
                >
                  {stage.label}
                </motion.span>
                
                {/* Timestamp */}
                {(isCompleted || isCurrent) && timestamps && (
                  <motion.span 
                    className="text-[9px] text-muted-foreground/70 mt-0.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {getTimestamp(stage.key, timestamps)}
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      
      {/* Current status message */}
      <motion.div 
        className="mt-6 text-center px-4"
        key={status}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          {getStatusMessage(status, orderType)}
        </p>
      </motion.div>
    </div>
  );
}

function getTimestamp(stageKey: string, timestamps: NonNullable<OrderTrackingTimelineProps['timestamps']>): string {
  const timestampMap: Record<string, string | null | undefined> = {
    pending: timestamps.createdAt,
    accepted: timestamps.acceptedAt,
    preparing: timestamps.preparingAt,
    ready: timestamps.readyAt,
    dispatched: timestamps.dispatchedAt,
    arrived: timestamps.arrivedAt,
    delivered: timestamps.deliveredAt,
  };
  
  const ts = timestampMap[stageKey];
  if (!ts) return '';
  
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getStatusMessage(status: OrderStatus, orderType: string): string {
  const messages: Record<string, string> = {
    pending: 'Aguardando confirmação do estabelecimento...',
    accepted: 'Seu pedido foi confirmado e será preparado em breve!',
    preparing: 'Nossos especialistas estão preparando seu pedido com carinho.',
    ready: orderType === 'delivery' 
      ? 'Pedido pronto! Aguardando entregador.' 
      : 'Pedido pronto! Pode vir retirar.',
    dispatched: 'Seu pedido saiu para entrega! 🛵',
    arrived: 'O entregador chegou no local! 📍',
    delivered: 'Pedido entregue! Aproveite! 🎉',
  };
  return messages[status] || '';
}
