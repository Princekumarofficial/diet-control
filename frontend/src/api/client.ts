const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export function apiUrl(path: string) {
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


