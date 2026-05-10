import type { Entry, EntryDetail, Source, SourceConfig, BuildStatusResponse, SearchResult } from '../types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  entries: {
    list: () => request<Entry[]>('/entries'),
    get: (id: string) => request<EntryDetail>(`/entries/${id}`),
    create: (data: { name: string; version: string; description?: string }) =>
      request<Entry>('/entries', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; version?: string; description?: string }) =>
      request<Entry>(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
  },

  sources: {
    create: (entryId: string, data: { type: string; label: string; config: SourceConfig }) =>
      request<Source>(`/entries/${entryId}/sources`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { label?: string; config?: SourceConfig }) =>
      request<Source>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/sources/${id}`, { method: 'DELETE' }),
  },

  build: {
    trigger: (entryId: string) =>
      request<{ buildId: string; status: string }>(`/entries/${entryId}/build`, { method: 'POST' }),
    status: (entryId: string) =>
      request<BuildStatusResponse>(`/entries/${entryId}/build-status`),
    cliScript: (entryId: string) =>
      fetch(`${BASE}/entries/${entryId}/cli-script`).then((r) => r.text()),
  },

  search: (entryId: string, q: string) =>
    request<SearchResult[]>(`/entries/${entryId}/search?q=${encodeURIComponent(q)}`),

  bundleUrl: (entryId: string) => `${BASE}/bundle/${entryId}/`,
};
