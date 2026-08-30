import { useState, useEffect } from 'react';
import { MapPin, Navigation, Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AddressAutocomplete } from './AddressAutocomplete';
import { DeliveryMap } from './DeliveryMap';
import { useGoogleMaps, type AddressComponents } from '@/hooks/use-google-maps';
import { cn } from '@/lib/utils';

interface SmartAddressFormProps {
  onAddressChange: (address: AddressFormData) => void;
  initialValues?: Partial<AddressFormData>;
  className?: string;
  showMap?: boolean;
  storeLocation?: { lat: number; lng: number };
}

export interface AddressFormData {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}

export function SmartAddressForm({
  onAddressChange,
  initialValues,
  className,
  showMap = true,
  storeLocation = { lat: -23.5505, lng: -46.6333 },
}: SmartAddressFormProps) {
  const [formData, setFormData] = useState<AddressFormData>({
    street: initialValues?.street || '',
    number: initialValues?.number || '',
    complement: initialValues?.complement || '',
    neighborhood: initialValues?.neighborhood || '',
    city: initialValues?.city || '',
    state: initialValues?.state || '',
    zipCode: initialValues?.zipCode || '',
    notes: initialValues?.notes || '',
    latitude: initialValues?.latitude || null,
    longitude: initialValues?.longitude || null,
  });
  
  const [isNumberConfirmed, setIsNumberConfirmed] = useState(!!initialValues?.number);

  const handleAutocompleteSelect = (address: AddressComponents) => {
    const updatedData = {
      ...formData,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood || '',
      city: address.city,
      state: address.state.length === 2 ? address.state : 'SP',
      zipCode: address.zipCode,
      latitude: address.latitude,
      longitude: address.longitude,
    };
    
    setFormData(updatedData);
    onAddressChange(updatedData);
    
    if (address.number) {
      setIsNumberConfirmed(true);
    }
  };

  const handleFieldChange = (field: keyof AddressFormData, value: string) => {
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    onAddressChange(updatedData);
  };

  const deliveryLocation = formData.latitude && formData.longitude 
    ? { lat: formData.latitude, lng: formData.longitude } 
    : undefined;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Smart Address Search */}
      <div>
        <Label className="text-foreground mb-2 block">Buscar endereço</Label>
        <AddressAutocomplete
          onAddressSelect={handleAutocompleteSelect}
          defaultValue={formData.street ? `${formData.street}, ${formData.number}` : ''}
          placeholder="Digite o endereço ou use sua localização..."
        />
      </div>

      {/* Street and Number */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Label className="text-foreground text-sm">Rua</Label>
          <Input
            value={formData.street}
            onChange={(e) => handleFieldChange('street', e.target.value)}
            className="bg-secondary/50 border-primary/20"
            placeholder="Nome da rua"
          />
        </div>
        <div>
          <Label className="text-foreground text-sm">Número</Label>
          <div className="relative">
            <Input
              value={formData.number}
              onChange={(e) => {
                handleFieldChange('number', e.target.value);
                setIsNumberConfirmed(false);
              }}
              className={cn(
                "bg-secondary/50 border-primary/20",
                isNumberConfirmed && "border-green-500/50 bg-green-500/5"
              )}
              placeholder="Nº"
            />
            {isNumberConfirmed && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
          </div>
        </div>
      </div>

      {/* Complement */}
      <div>
        <Label className="text-foreground text-sm">Complemento (opcional)</Label>
        <Input
          value={formData.complement}
          onChange={(e) => handleFieldChange('complement', e.target.value)}
          className="bg-secondary/50 border-primary/20"
          placeholder="Apto, bloco, casa..."
        />
      </div>

      {/* Neighborhood */}
      <div>
        <Label className="text-foreground text-sm">Bairro</Label>
        <Input
          value={formData.neighborhood}
          onChange={(e) => handleFieldChange('neighborhood', e.target.value)}
          className="bg-secondary/50 border-primary/20"
          placeholder="Bairro"
        />
      </div>

      {/* City and State */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-foreground text-sm">Cidade</Label>
          <Input
            value={formData.city}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            className="bg-secondary/50 border-primary/20"
            placeholder="Cidade"
          />
        </div>
        <div>
          <Label className="text-foreground text-sm">Estado</Label>
          <Input
            value={formData.state}
            onChange={(e) => handleFieldChange('state', e.target.value)}
            className="bg-secondary/50 border-primary/20"
            placeholder="SP"
            maxLength={2}
          />
        </div>
      </div>

      {/* CEP */}
      <div>
        <Label className="text-foreground text-sm">CEP</Label>
        <Input
          value={formData.zipCode}
          onChange={(e) => handleFieldChange('zipCode', e.target.value)}
          className="bg-secondary/50 border-primary/20"
          placeholder="00000-000"
        />
      </div>

      {/* Notes */}
      <div>
        <Label className="text-foreground text-sm">Observações de entrega (opcional)</Label>
        <Input
          value={formData.notes}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          className="bg-secondary/50 border-primary/20"
          placeholder="Ponto de referência, instruções..."
        />
      </div>

      {/* Mini Map Preview */}
      {showMap && deliveryLocation && (
        <div className="pt-2">
          <Label className="text-foreground text-sm mb-2 block">Localização no mapa</Label>
          <DeliveryMap
            storeLocation={storeLocation}
            deliveryLocation={deliveryLocation}
            className="h-[150px]"
          />
        </div>
      )}
    </div>
  );
}
