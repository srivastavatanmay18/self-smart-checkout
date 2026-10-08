import { Platform } from 'react-native';
import Constants from 'expo-constants';

const apiRequestTimeoutMs = 15_000;

export type ApiHealth = {
  status: string;
  service: string;
  database: 'connected' | 'disconnected' | 'connecting';
  timestamp: string;
};

const expoHost = Constants.expoConfig?.hostUri?.replace(/:\d+$/, '');
const expoGoApiUrl = expoHost ? `http://${expoHost}:4000` : undefined;
const localApiUrl = expoGoApiUrl ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
// Expo Go keeps its existing LAN/emulator fallback. Standalone release builds must
// be given a reachable API origin at build time instead of shipping 10.0.2.2.
export const API_URL = configuredApiUrl || (__DEV__ ? localApiUrl : '');

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError('The server address is not configured for this app. Please contact the store administrator.', 0);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), apiRequestTimeoutMs);
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      const message = response.status === 429
        ? 'Too many attempts. Please wait a moment and try again.'
        : response.status >= 500
          ? 'The service is temporarily unavailable. Please try again shortly.'
          : payload.error ?? 'Your request could not be completed. Please review the details and try again.';
      throw new ApiError(message, response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError('The server did not respond in time. Check your connection and try again.', 0);
    }
    throw new ApiError('Unable to connect to server. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function fetchApiHealth(): Promise<ApiHealth> {
  return apiRequest<ApiHealth>('/api/health');
}
