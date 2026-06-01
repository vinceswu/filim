import { getActiveProfileIdFromStorage } from "./profile-context";

type RequestOptions = {
    params?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
};

class ApiClient {
    private baseURL: string = "/api/v1";

    private getDeviceToken(): string {
        if (typeof window === "undefined") return "";
        let token = localStorage.getItem("filim_device_token");
        if (!token) {
            token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem("filim_device_token", token);
        }
        return token;
    }

    private async request<T>(
        url: string,
        method: string,
        body?: any,
        options: RequestOptions = {}
    ): Promise<{ data: T }> {
        const profileId = getActiveProfileIdFromStorage();
        const deviceToken = this.getDeviceToken();
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...options.headers,
        };

        if (profileId) {
            headers["X-Profile-Id"] = profileId;
        }

        if (deviceToken) {
            headers["X-Device-Token"] = deviceToken;
        }

        let fullURL = url.startsWith("http") ? url : `${this.baseURL}${url}`;

        if (options.params) {
            const searchParams = new URLSearchParams();
            Object.entries(options.params).forEach(([key, value]) => {
                if (value !== undefined) {
                    searchParams.append(key, String(value));
                }
            });
            const queryString = searchParams.toString();
            if (queryString) {
                fullURL += `${fullURL.includes("?") ? "&" : "?"}${queryString}`;
            }
        }

        const response = await fetch(fullURL, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            keepalive: method !== "GET",
        });

        if (!response.ok) {
            console.error(`API Error [${method} ${fullURL}]:`, response.status, response.statusText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return { data };
    }

    async get<T>(url: string, options?: RequestOptions): Promise<{ data: T }> {
        return this.request<T>(url, "GET", undefined, options);
    }

    async post<T>(url: string, body?: any, options?: RequestOptions): Promise<{ data: T }> {
        return this.request<T>(url, "POST", body, options);
    }

    async patch<T>(url: string, body?: any, options?: RequestOptions): Promise<{ data: T }> {
        return this.request<T>(url, "PATCH", body, options);
    }

    async delete<T>(url: string, options?: RequestOptions): Promise<{ data: T }> {
        return this.request<T>(url, "DELETE", undefined, options);
    }

}

export const api = new ApiClient();
