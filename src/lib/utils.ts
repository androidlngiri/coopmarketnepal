import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data: unknown = {};
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const errMsg =
    typeof data === 'object' && data !== null && 'error' in data
      ? String((data as { error: unknown }).error)
      : undefined;

  return {
    ok: res.ok,
    status: res.status,
    data: data as T,
    error: !res.ok ? errMsg || 'अनुरोध असफल भयो।' : undefined,
  };
}
