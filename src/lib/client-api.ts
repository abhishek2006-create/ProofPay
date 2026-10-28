export async function api(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    headers:
      data instanceof FormData
        ? undefined
        : data
          ? { 'Content-Type': 'application/json' }
          : undefined,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
