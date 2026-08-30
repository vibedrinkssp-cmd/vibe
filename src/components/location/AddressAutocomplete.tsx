import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, Navigation, Search, X, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useGoogleMaps, type PlacePrediction, type AddressComponents } from '@/hooks/use-google-maps';
import { cn } from '@/lib/utils';

interface AddressAutocompleteProps {
  onAddressSelect: (address: AddressComponents) => void;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  showCurrentAddressHint?: boolean;
}

export function AddressAutocomplete({
  onAddressSelect,
  defaultValue = '',
  placeholder = 'Digite seu endereço ou use o GPS...',
  className,
  showCurrentAddressHint = false,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  // If defaultValue is provided, consider address as already selected
  const [isAddressSelected, setIsAddressSelected] = useState(!!defaultValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Track the value that was set when address was confirmed (to avoid resetting on re-render)
  const confirmedValueRef = useRef<string>(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { autocomplete, getPlaceDetails, reverseGeocode, geocodeAddress, isLoading } = useGoogleMaps();

  const requestCurrentPosition = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  // Debounced autocomplete
  useEffect(() => {
    // Only reset if user typed something different from the confirmed address
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
            setErrorMessage('Serviços de geolocalização indisponíveis. Você pode preencher o endereço manualmente abaixo — a taxa de entrega será ajustada pelo operador.');
          }
        } catch (err) {
          console.error('[AddressAutocomplete] Error:', err);
          setErrorMessage('Serviços de geolocalização indisponíveis. Preencha o endereço manualmente — a taxa de entrega será ajustada pelo operador.');
        }
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    }, 700); // 700ms — usuário termina de digitar antes da API ser chamada (economia ~70%)

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
    if (details) {
      confirmedValueRef.current = prediction.description;
      setIsAddressSelected(true);
      onAddressSelect(details);
    } else {
      setErrorMessage('Não foi possível obter detalhes do endereço.');
    }
  };

  const handleGetCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocalização não suportada neste navegador');
      return;
    }

    setIsGettingLocation(true);
    setErrorMessage(null);

    try {
      let position: GeolocationPosition;

      try {
        position = await requestCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      } catch (firstError) {
        const geoError = firstError as GeolocationPositionError;

        if (geoError.code !== 2 && geoError.code !== 3) {
          throw geoError;
        }

        position = await requestCurrentPosition({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 300000,
        });
      }

      const { latitude, longitude } = position.coords;
      const address = await reverseGeocode(latitude, longitude);

      if (address) {
        setInputValue(address.formattedAddress);
        confirmedValueRef.current = address.formattedAddress;
        setIsAddressSelected(true);
        onAddressSelect(address);
      } else if (inputValue.trim().length >= 8) {
        const typedAddress = await geocodeAddress(inputValue.trim());

        if (typedAddress) {
          setInputValue(typedAddress.formattedAddress || inputValue.trim());
          confirmedValueRef.current = typedAddress.formattedAddress || inputValue.trim();
          setIsAddressSelected(true);
          onAddressSelect(typedAddress);
          return;
        }

        setErrorMessage('Não foi possível determinar seu endereço.');
      } else {
        setErrorMessage('Não foi possível determinar seu endereço.');
      }
    } catch (error) {
      console.error('Geolocation error:', error);

      const geoError = error as GeolocationPositionError;
      let message = 'Não foi possível obter sua localização.';

      if (geoError.code === 1) {
        message = 'Permissão de localização negada. Verifique as configurações do navegador.';
      } else if (geoError.code === 2) {
        message = 'GPS não encontrado agora. Você pode buscar o endereço manualmente.';
      } else if (geoError.code === 3) {
        message = 'Tempo esgotado ao buscar localização. Tente novamente.';
      }

      setErrorMessage(message);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const clearInput = () => {
    setInputValue('');
    setPredictions([]);
    setShowDropdown(false);
    setIsAddressSelected(false);
    setErrorMessage(null);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative', className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowDropdown(true)}
            placeholder={placeholder}
            className={cn(
              "pl-10 pr-10 bg-secondary/50 border-primary/20 transition-all",
              isAddressSelected && "border-green-500/50 bg-green-500/10",
              errorMessage && "border-destructive/50"
            )}
            data-testid="input-address-autocomplete"
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
          title="Usar minha localização atual"
          data-testid="button-get-location"
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
        <p className="text-xs text-destructive mt-1 animate-in fade-in">
          {errorMessage}
        </p>
      )}

      {/* Helper text */}
      {!isAddressSelected && !errorMessage && inputValue.length === 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          {showCurrentAddressHint 
            ? 'Busque um novo endereço ou clique no GPS para usar sua localização'
            : 'Digite o endereço ou clique no botão GPS para localização automática'}
        </p>
      )}

      {/* Predictions Dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-card border border-primary/20 rounded-lg shadow-lg max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2"
          data-testid="address-predictions"
        >
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              onClick={() => handleSelectPrediction(prediction)}
              type="button"
              className="w-full flex items-start gap-3 p-3 hover:bg-secondary/50 transition-colors text-left border-b border-primary/10 last:border-0"
              data-testid={`prediction-${prediction.place_id}`}
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
