"use client";

const ADMIN_TOKEN_KEY = "filim.adminToken";

export function getAdminToken(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminFetch<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAdminToken();
    const res = await fetch(`/api/v1/admin${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw Object.assign(new Error(err.detail ?? res.statusText), { status: res.status });
    }
    return res.json() as Promise<T>;
}
