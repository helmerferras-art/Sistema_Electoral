/**
 * Ubicación bajo demanda, cuidando la batería:
 *  - Nunca se deja el GPS encendido (no hay watchPosition): solo lecturas puntuales.
 *  - Se reutiliza la última lectura si es reciente (por defecto 2 min).
 *  - Si dos pantallas piden ubicación a la vez, comparten la misma lectura.
 */
export type Fix = { lat: number; lng: number; acc: number; at: number };

let last: Fix | null = null;
let inFlight: Promise<Fix> | null = null;

export const lastKnownFix = (maxAgeMs = 120000): Fix | null =>
    last && Date.now() - last.at <= maxAgeMs ? last : null;

export const getPositionOnce = (opts: { maxAgeMs?: number; timeoutMs?: number; highAccuracy?: boolean } = {}): Promise<Fix> => {
    const { maxAgeMs = 120000, timeoutMs = 15000, highAccuracy = true } = opts;
    const cached = lastKnownFix(maxAgeMs);
    if (cached) return Promise.resolve(cached);
    if (inFlight) return inFlight;
    if (!('geolocation' in navigator)) return Promise.reject(new Error('Este dispositivo no tiene GPS disponible'));

    inFlight = new Promise<Fix>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (p) => {
                last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: Date.now() };
                resolve(last);
            },
            (err) => reject(err),
            // maximumAge deja que el sistema entregue una lectura reciente sin volver a encender el GPS
            { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maxAgeMs }
        );
    }).finally(() => { inFlight = null; });
    return inFlight;
};

/** Mensaje entendible para el error de geolocalización. */
export const locationErrorText = (e: unknown) => {
    const code = (e as GeolocationPositionError)?.code;
    if (code === 1) return 'Sin permiso de ubicación. Actívalo en Ajustes > Apps > permisos.';
    if (code === 3) return 'El GPS tardó demasiado. Intenta al aire libre.';
    return 'No se pudo obtener la ubicación. Revisa que el GPS esté encendido.';
};

/** ¿Corre dentro de la app móvil (Capacitor) y no en el navegador o la PC? */
export const isNativeApp = () => !!(window as any).Capacitor?.isNativePlatform?.();
