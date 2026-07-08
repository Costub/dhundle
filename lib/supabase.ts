// Server-only Supabase REST helpers. Keep clients lazy/build-safe so `next build`
// still works before production env vars exist.

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  // Treat template values (e.g. "https://<project-ref>.supabase.co") as
  // unconfigured so local dev falls back to JSON instead of crashing.
  try {
    new URL(url);
  } catch {
    return null;
  }
  if (url.includes("<") || serviceRoleKey.includes("<")) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

function headers(config: SupabaseConfig): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function supabaseGet<T>(path: string): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: headers(config),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase GET failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

export async function supabasePost<T>(
  path: string,
  body: unknown,
  prefer = "resolution=merge-duplicates,return=representation"
): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "POST",
    headers: { ...headers(config), Prefer: prefer },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase POST failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

export async function supabasePatch<T>(
  path: string,
  body: unknown,
  prefer = "return=representation"
): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers(config), Prefer: prefer },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase PATCH failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

export async function supabaseDelete(path: string): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "DELETE",
    headers: headers(config),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase DELETE failed (${res.status}) for ${path}`);
  }
  return true;
}

/** Upload a file into the public `stems` storage bucket. Returns the storage path. */
export async function supabaseUploadStem(
  storagePath: string,
  data: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");
  const res = await fetch(`${config.url}/storage/v1/object/stems/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(data),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return storagePath;
}

export function publicStorageUrl(storagePath: string): string {
  const config = getSupabaseConfig();
  if (!config || storagePath.startsWith("/") || storagePath.startsWith("http")) {
    return storagePath;
  }
  return `${config.url}/storage/v1/object/public/stems/${storagePath}`;
}
