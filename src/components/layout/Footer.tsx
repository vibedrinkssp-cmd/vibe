import { MessageCircle, Phone, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { STORE_INFO } from '@/lib/business-hours';
import { usePublicStoreInfo } from '@/hooks/use-public-data';

export function Footer() {
  const { data: storeInfo } = usePublicStoreInfo();
  const isOpen = storeInfo?.isOpen !== false;

  return (
    <footer className="bg-gradient-to-b from-black/50 to-black purple-frame rounded-t-2xl mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-8"
        >
          {/* Horário */}
          <div className="text-center md:text-left space-y-3">
            <div className="flex items-center gap-3 md:justify-start justify-center">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-white">Horário</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {isOpen ? 'Aberto agora' : 'Fechado no momento'}
            </p>
            <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              isOpen
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {isOpen ? '● Aberto' : '● Fechado'}
            </div>
          </div>

          {/* WhatsApp */}
          <div className="text-center space-y-3">
            <div className="flex items-center gap-3 justify-center">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-white">WhatsApp</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Fale conosco!
            </p>
            <Button
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold"
              asChild
              data-testid="button-whatsapp"
            >
              <a 
                href={STORE_INFO.WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Phone className="h-4 w-4 mr-2" />
                {STORE_INFO.WHATSAPP}
              </a>
            </Button>
          </div>

          {/* Status */}
          <div className="text-center md:text-right space-y-3">
            <div className="flex items-center gap-3 md:justify-end justify-center">
              <div className={`h-2 w-2 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <h3 className="font-semibold text-white">Status</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {isOpen ? `Atendimento ativo | WhatsApp: ${STORE_INFO.WHATSAPP}` : `Fechado. WhatsApp: ${STORE_INFO.WHATSAPP}`}
            </p>
          </div>
        </motion.div>

        {/* Divider */}
        <div className="border-t border-primary/10 my-8" />

        {/* Copyright */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs text-muted-foreground"
        >
          <p className="font-medium text-white/80">{STORE_INFO.STORE_NAME}</p>
          <p className="mt-1">{STORE_INFO.ADDRESS}</p>
          <p className="mt-2">© 2025 Todos os direitos reservados.</p>
        </motion.div>
      </div>
    </footer>
  );
}
