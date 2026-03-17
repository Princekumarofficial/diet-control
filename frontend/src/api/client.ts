const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const baseUrl = (configuredBaseUrl || (__DEV__ ? 'http://localhost:8000' : '')).replace(/\/$/, '');

export function apiUrl(path: string) {
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL for release build. Set it in EAS build profile env.');
  }
  if (!path.startsWith('/')) return `${baseUrl}/${path}`;
  return `${baseUrl}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  try {
    const res = await fetch(apiUrl(path), init);
    return res;
  } catch (error) {
    console.error(`[API Error] ${path}:`, error);
    throw error;
  }
}


