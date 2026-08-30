import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, Navigation, Search, X, CheckCircle, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useGoogleMaps, type PlacePrediction, type AddressComponents } from '@/hooks/use-google-maps';
import { cn } from '@/lib/utils';

interface StoreAddressFormProps {
  defaultAddress?: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
  onAddressChange: (data: { address: string; lat: number; lng: number }) => void;
  className?: string;
}

export function StoreAddressForm({
  defaultAddress = '',
  defaultLat,
  defaultLng,
  onAddressChange,
  className,
}: StoreAddressFormProps) {
  const [inputValue, setInputValue] = useState(defaultAddress);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isAddressSelected, setIsAddressSelected] = useState(!!defaultAddress && !!defaultLat);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(
    defaultLat && defaultLng ? { lat: defaultLat, lng: defaultLng } : null
  );
  const confirmedValueRef = useRef<string>(defaultAddress);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { autocomplete, getPlaceDetails, reverseGeocode, isLoading } = useGoogleMaps();

  // Sync with defaultAddress when it changes
  useEffect(() => {
    if (defaultAddress && defaultAddress !== inputValue && defaultAddress !== confirmedValueRef.current) {
      setInputValue(defaultAddress);
      confirmedValueRef.current = defaultAddress;
      if (defaultLat && defaultLng) {
        setSelectedCoords({ lat: defaultLat, lng: defaultLng });
        setIsAddressSelected(true);
      }
    }
  }, [defaultAddress, defaultLat, defaultLng]);

  // Debounced autocomplete
  useEffect(() => {
    if (inputValue !== confirmedValueRef.current) {
      setIsAddressSelected(false);
    }
    
    const timer = setTimeout(async () => {
      // Debounce maior + mínimo de 5 chars para reduzir chamadas ao Google
      if (inputValue.length >= 5 && !isAddressSelected) {
        setErrorMessage(null);
        try {
          const results = await autocomplete(inputValue);
          setPredictions(results);
          setShowDropdown(results.length > 0);
          
          if (results.length === 0 && inputValue.length >= 8) {
            setErrorMessage('Nenhum endereço encontrado. Tente ser mais específico.');
          }
        } catch (err) {
          console.error('[StoreAddressForm] Error:', err);
          setErrorMessage('Erro ao buscar endereços. Tente novamente.');
        }
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [inputValue, autocomplete, isAddressSelected]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setInputValue(prediction.description);
    setShowDropdown(false);
    setPredictions([]);
    setErrorMessage(null);
    
    const details = await getPlaceDetails(prediction.place_id);
    if (details && details.latitude && details.longitude) {
      confirmedValueRef.current = details.formattedAddress;
      setIsAddressSelected(true);
      setSelectedCoords({ lat: details.latitude, lng: details.longitude });
      onAddressChange({
        address: details.formattedAddress,
        lat: details.latitude,
        lng: details.longitude,
      });
    } else {
      setErrorMessage('Não foi possível obter as coordenadas do endereço.');
    }
  };

  const handleGetCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocalização não suportada neste navegador');
      return;
    }

    setIsGettingLocation(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const address = await reverseGeocode(latitude, longitude);
          if (address) {
            setInputValue(address.formattedAddress);
            confirmedValueRef.current = address.formattedAddress;
            setIsAddressSelected(true);
            setSelectedCoords({ lat: latitude, lng: longitude });
            onAddressChange({
              address: address.formattedAddress,
              lat: latitude,
              lng: longitude,
            });
          } else {
            setErrorMessage('Não foi possível determinar o endereço.');
          }
        } catch (err) {
          console.error('[StoreAddressForm] Reverse geocode error:', err);
          setErrorMessage('Erro ao buscar endereço. Tente novamente.');
        }
        
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        let message = 'Não foi possível obter a localização.';
        if (error.code === 1) {
          message = 'Permissão de localização negada.';
        } else if (error.code === 2) {
          message = 'GPS indisponível.';
        } else if (error.code === 3) {
          message = 'Tempo esgotado. Tente novamente.';
        }
        setErrorMessage(message);
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const clearInput = () => {
    setInputValue('');
    setPredictions([]);
    setShowDropdown(false);
    setIsAddressSelected(false);
    setSelectedCoords(null);
    setErrorMessage(null);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('space-y-3 relative', className)}>
      <Label className="flex items-center gap-2">
        <Store className="h-4 w-4 text-primary" />
        Endereço da Loja
      </Label>
      
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowDropdown(true)}
            placeholder="Buscar endereço da loja..."
            className={cn(
              "pl-10 pr-10 bg-secondary/50 border-primary/20 transition-all",
              isAddressSelected && "border-green-500/50 bg-green-500/10",
              errorMessage && "border-destructive/50"
            )}
            data-testid="input-store-address"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
          )}
          {!isLoading && isAddressSelected && (
            <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
          )}
          {!isLoading && !isAddressSelected && inputValue && (
            <button
              onClick={clearInput}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleGetCurrentLocation}
          disabled={isGettingLocation}
          className={cn(
            "border-primary/20 hover:bg-primary/10 transition-all",
            isGettingLocation && "animate-pulse"
          )}
          title="Usar localização atual"
          data-testid="button-get-store-location"
        >
          {isGettingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4 text-primary" />
          )}
        </Button>
      </div>

      {/* Error message */}
      {errorMessage && (
        <p className="text-xs text-destructive animate-in fade-in">
          {errorMessage}
        </p>
      )}

      {/* Coordinates display */}
      {isAddressSelected && selectedCoords && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded p-2">
          <MapPin className="h-3 w-3 text-green-500" />
          <span>Coordenadas: {selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}</span>
        </div>
      )}

      {/* Helper text */}
      {!isAddressSelected && !errorMessage && inputValue.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Busque o endereço da loja para calcular taxas de entrega corretamente
        </p>
      )}

      {/* Predictions Dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-card border border-primary/20 rounded-lg shadow-lg max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2"
          data-testid="store-address-predictions"
        >
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              onClick={() => handleSelectPrediction(prediction)}
              type="button"
              className="w-full flex items-start gap-3 p-3 hover:bg-secondary/50 transition-colors text-left border-b border-primary/10 last:border-0"
            >
              <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {prediction.structured_formatting.main_text}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {prediction.structured_formatting.secondary_text}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}