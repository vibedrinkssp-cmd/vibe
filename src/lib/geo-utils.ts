// Utilidades geográficas locais — evitam custo da API Google Maps
// para cálculos simples de distância e ETA.

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Calcula distância em metros entre dois pontos usando fórmula de Haversine.
 * Precisão suficiente para entregas urbanas (erro < 0.5%).
 * Custo: ZERO (cálculo local).
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371000; // raio da Terra em metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Estima duração em segundos baseado em distância e velocidade média urbana.
 * Considera trânsito de moto em centros urbanos brasileiros (~25 km/h).
 * Custo: ZERO.
 */
export function estimateDuration(distanceMeters: number, avgSpeedKmh = 25): number {
  const speedMs = (avgSpeedKmh * 1000) / 3600;
  return distanceMeters / speedMs;
}

/**
 * Distância de Manhattan (mais realista em malha viária urbana).
 * Útil para ETA mais preciso em centros urbanos com ruas em grade.
 */
export function urbanDistance(a: LatLng, b: LatLng): number {
  // Aproxima distância real em ruas (~1.3x distância em linha reta)
  return haversineDistance(a, b) * 1.3;
}

/**
 * Formata distância em texto legível.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formata duração em texto legível.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
}
