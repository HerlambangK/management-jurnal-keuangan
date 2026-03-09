import { ClientLocationPayload } from "@/interfaces/IAuth";

type ResolveClientLocationOptions = {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
};

const DEFAULT_TIMEOUT_MS = 4500;

const isBrowserRuntime = (): boolean =>
  typeof window !== "undefined" && typeof navigator !== "undefined";

export const resolveClientLocation = async (
  options: ResolveClientLocationOptions = {}
): Promise<ClientLocationPayload | null> => {
  if (!isBrowserRuntime()) {
    return null;
  }

  if (!navigator.geolocation) {
    return null;
  }

  const timeoutMs = Math.max(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 1200);
  const enableHighAccuracy = options.enableHighAccuracy ?? true;

  return await new Promise<ClientLocationPayload | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = position?.coords;
        if (!coords) {
          resolve(null);
          return;
        }

        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";

        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
          source: "browser_geolocation",
          captured_at: new Date().toISOString(),
          timezone,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
};

export const buildClientLocationHeaders = (
  payload?: ClientLocationPayload | null
): Record<string, string> => {
  if (!payload) {
    return {};
  }

  return {
    "x-client-latitude": String(payload.latitude),
    "x-client-longitude": String(payload.longitude),
    ...(payload.accuracy !== undefined && payload.accuracy !== null
      ? { "x-client-accuracy": String(payload.accuracy) }
      : {}),
    ...(payload.source ? { "x-client-location-source": payload.source } : {}),
    ...(payload.captured_at
      ? { "x-client-location-captured-at": payload.captured_at }
      : {}),
    ...(payload.timezone ? { "x-client-timezone": payload.timezone } : {}),
  };
};
