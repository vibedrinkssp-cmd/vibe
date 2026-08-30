import { LogIn, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';

interface AuthRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: () => void;
  onRegister: () => void;
  title?: string;
  description?: string;
}

export function AuthRequiredModal({ 
  open, 
  onOpenChange, 
  onLogin, 
  onRegister,
  title = 'Faça login para continuar',
  description = 'Para acessar esta área, você precisa estar logado na sua conta.'
}: AuthRequiredModalProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] bg-background border-t border-primary/20">
        {/* Handle bar */}
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted my-3" />
        
        <div className="px-6 pb-8 pt-2">
          {/* Close button */}
          <DrawerClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>

          <DrawerHeader className="p-0 text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
            <DrawerTitle className="text-xl font-bold text-foreground">
              {title}
            </DrawerTitle>
            <DrawerDescription className="text-muted-foreground mt-2">
              {description}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3">
            {/* Login button */}
            <Button
              className="w-full h-14 text-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all duration-300"
              onClick={() => {
                onOpenChange(false);
                onLogin();
              }}
            >
              <LogIn className="h-5 w-5 mr-2" />
              Já tenho conta - Entrar
            </Button>

            {/* Register button */}
            <Button
              variant="outline"
              className="w-full h-14 text-lg border-primary/30 hover:bg-primary/10 hover:border-primary/50"
              onClick={() => {
                onOpenChange(false);
                onRegister();
              }}
            >
              <UserPlus className="h-5 w-5 mr-2" />
              Criar minha conta
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Ao criar uma conta, você poderá fazer pedidos, acompanhar entregas e salvar seus endereços.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}