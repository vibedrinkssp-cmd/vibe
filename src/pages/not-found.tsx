import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">404 Página não encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            A página que você está procurando não existe ou foi movida.
          </p>
          
          <Link to="/">
            <Button className="mt-6 w-full" data-testid="button-go-home">
              Voltar para o início
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
