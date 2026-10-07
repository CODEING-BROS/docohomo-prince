/** Calls the backend through this app's own /api path (see next.config.ts). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined | null>;

/**
 * The doctor dashboard and the patient's account are separate sign-ins. Requests made from a doctor
 * page carry this header so the backend uses the doctor sign-in; everything else is the patient's.
 */
export const panelHeaders = (): Record<string, string> =>
  typeof window !== "undefined" && /^\/doctor(\/|$)/.test(window.location.pathname) ? { "X-Panel": "doctor" } : {};

const toQueryString = (query?: Query) => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
};

export async function api<T>(path: string, options: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const response = await fetch(`/api${path}${toQueryString(options.query)}`, {
    method: options.method ?? "GET",
    headers: { ...panelHeaders(), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  const here = typeof window === "undefined" ? "" : window.location.pathname;
  if (response.status === 401 && here.startsWith("/admin") && !here.startsWith("/admin/login")) {
    // a full page load on purpose: it drops everything held in memory from the expired session
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin/login";
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.message ?? "Something went wrong");
  return data as T;
}
