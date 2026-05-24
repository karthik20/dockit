declare global {
  interface Window {
    __TAURI__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

export function getApiBase(): string {
  if (isTauri()) {
    const port = import.meta.env.VITE_SERVER_PORT || '3001';
    return `http://localhost:${port}/api`;
  }
  return '/api';
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('Tauri API not available');
  }
  return window.__TAURI__!.invoke(cmd, args) as Promise<T>;
}
