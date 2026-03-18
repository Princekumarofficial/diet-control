const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const configuredFallbackUrls = process.env.EXPO_PUBLIC_API_URL_FALLBACKS?.trim();

function normalizeUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function buildBaseUrls() {
  const urls: string[] = [];

  if (configuredBaseUrl) {
    urls.push(normalizeUrl(configuredBaseUrl));
  }

  if (configuredFallbackUrls) {
    const fallbacks = configuredFallbackUrls
      .split(',')
      .map((url) => normalizeUrl(url))
      .filter(Boolean);
    urls.push(...fallbacks);
  }

  if (urls.length === 0 && __DEV__) {
    urls.push('http://localhost:8000');
  }

  return Array.from(new Set(urls));
}

const baseUrls = buildBaseUrls();

export function apiUrl(path: string, baseUrl = baseUrls[0]) {
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL for release build. Set it in EAS build profile env.');
  }
  if (!path.startsWith('/')) return `${baseUrl}/${path}`;
  return `${baseUrl}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  if (!baseUrls.length) {
    throw new Error('Missing EXPO_PUBLIC_API_URL for release build. Set it in EAS build profile env.');
  }

  let lastError: unknown = null;

  for (let index = 0; index < baseUrls.length; index += 1) {
    const baseUrl = baseUrls[index];
    try {
      const res = await fetch(apiUrl(path, baseUrl), init);
      return res;
    } catch (error) {
      lastError = error;
      const isLastAttempt = index === baseUrls.length - 1;
      console.error(`[API Error] ${path} via ${baseUrl}:`, error);
      if (isLastAttempt) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${path}`);
}


