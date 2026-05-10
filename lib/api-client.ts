export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "X-MedPrice-Client": "web-v1",
    },
  });
}
