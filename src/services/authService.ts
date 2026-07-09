/**
 * Authentication Service
 * Handles API calls for user authentication and user management
 */

const USER_MGMT_API_URL = import.meta.env.VITE_USER_MGMT_API;

if (!USER_MGMT_API_URL || USER_MGMT_API_URL.trim() === "") {
  console.error(
    "VITE_USER_MGMT_API is not configured! Check your .env file."
  );
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  sap_user_id: string;
  designation: string;
  department: string;
  project_id: string;
  approval_limit_usd: number;
  is_active: boolean;
  role_code: string;
  full_name: string;
  access_level?: string;
}

export interface FPSORole {
  role_code: string;
  role_name: string;
  can_create_ds: boolean;
  can_approve_ds: boolean;
  can_create_pr: boolean;
  can_approve_pr: boolean;
  can_view_cost: boolean;
  can_modify_user: boolean;
}

export interface CreateUserRequest {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role_code: string;
  access_level?: string;
  password: string;
  department?: string;
  designation?: string;
  project_id?: string;
}

export interface UpdateUserRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  department?: string;
  designation?: string;
  project_id?: string;
  role_code?: string;
  access_level?: string;
  is_active?: boolean;
}

export interface LoginResponse {
  user: User;
  token: string;
  refresh_token?: string;
  access_token?: string;
}

export interface ProfileUpdatePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile_number?: string;
  department?: string;
  designation?: string;
}

export interface PasswordResetRequestItem {
  id: number;
  email: string;
  user_id: string | null;
  requested_at: string;
  status: "pending" | "resolved" | "dismissed";
  resolved_at?: string | null;
  resolved_by?: string | null;
  notes?: string | null;
}

class AuthService {
  private refreshPromise: Promise<string | null> | null = null;

  private createHeaders(headers?: HeadersInit, token?: string): Headers {
    const mergedHeaders = new Headers(headers);

    if (!mergedHeaders.has("Content-Type")) {
      mergedHeaders.set("Content-Type", "application/json");
    }

    if (token) {
      mergedHeaders.set("Authorization", `Bearer ${token}`);
    } else {
      mergedHeaders.delete("Authorization");
    }

    return mergedHeaders;
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("auth_token");
    return this.createHeaders(undefined, token);
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        this.logout();
        return null;
      }

      try {
        const response = await fetch(`${USER_MGMT_API_URL}/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        const data = await this.handleResponse<{
          token?: string;
          access_token?: string;
          refresh_token?: string;
        }>(response);

        const token = data.token || data.access_token;
        if (!token) {
          throw new Error("Refresh response missing access token");
        }

        localStorage.setItem("auth_token", token);
        localStorage.setItem("auth_timestamp", new Date().toISOString());

        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }

        return token;
      } catch {
        this.logout();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem("auth_token");
    const response = await fetch(input, {
      ...init,
      headers: this.createHeaders(init.headers, token || undefined),
    });

    if (response.status !== 401) {
      return response;
    }

    const refreshedToken = await this.refreshAccessToken();
    if (!refreshedToken) {
      // Refresh failed → tell the AuthProvider so it can bounce to /login.
      void import("@/lib/authBus").then((m) =>
        m.notifyUnauthorized("Session expired"),
      );
      return response;
    }

    const retry = await fetch(input, {
      ...init,
      headers: this.createHeaders(init.headers, refreshedToken),
    });
    // Refreshed token still rejected → token is bad / user revoked
    if (retry.status === 401) {
      void import("@/lib/authBus").then((m) =>
        m.notifyUnauthorized("Session expired"),
      );
    }
    return retry;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        if (typeof errorData === "string") {
          errorMessage = errorData;
        } else if (errorData) {
          if (typeof errorData.message === "string") {
            errorMessage = errorData.message;
          } else if (Array.isArray(errorData.detail)) {
            const messages = errorData.detail
              .map((detail: { msg?: string; message?: string }) => detail.msg || detail.message)
              .filter(Boolean);
            if (messages.length > 0) {
              errorMessage = messages.join("; ");
            }
          } else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          }
        }
      } catch {
        // Fall back to status text.
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async login(email: string, password: string): Promise<User> {
    const response = await fetch(`${USER_MGMT_API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await this.handleResponse<LoginResponse>(response);
    const { user } = data;
    const token = data.token || data.access_token;
    const refreshToken = data.refresh_token;

    if (!token) {
      throw new Error("Login response missing access token");
    }

    if (!user.is_active) {
      throw new Error("User account is inactive. Please contact your administrator.");
    }

    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("auth_token", token);
    if (refreshToken) {
      localStorage.setItem("refresh_token", refreshToken);
    }
    localStorage.setItem("auth_timestamp", new Date().toISOString());

    return user;
  }

  async updateProfile(payload: ProfileUpdatePayload): Promise<User> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/auth/me`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const user = await this.handleResponse<User>(response);
    localStorage.setItem("user", JSON.stringify(user));
    return user;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<string> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/auth/change-password`, {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });
    const data = await this.handleResponse<{ message: string; user_id: string }>(response);
    return data.message;
  }

  async requestPasswordReset(email: string): Promise<string> {
    const response = await fetch(`${USER_MGMT_API_URL}/auth/request-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await this.handleResponse<{ message: string }>(response);
    return data.message;
  }

  async listPasswordResetRequests(statusFilter?: string): Promise<PasswordResetRequestItem[]> {
    const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
    const response = await this.authenticatedFetch(
      `${USER_MGMT_API_URL}/auth/password-reset-requests${query}`,
      { method: "GET" },
    );
    return this.handleResponse<PasswordResetRequestItem[]>(response);
  }

  async resolvePasswordResetRequest(
    requestId: number,
    payload: { new_password?: string; notes?: string },
  ): Promise<PasswordResetRequestItem> {
    const response = await this.authenticatedFetch(
      `${USER_MGMT_API_URL}/auth/password-reset-requests/${requestId}/resolve`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return this.handleResponse<PasswordResetRequestItem>(response);
  }

  logout(): void {
    localStorage.removeItem("user");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_timestamp");
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem("user");
    if (!userStr) return null;

    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }

  async getAllUsers(): Promise<User[]> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/users`, {
      method: "GET",
    });

    return this.handleResponse<User[]>(response);
  }

  async getUserByEmail(email: string): Promise<User> {
    const response = await this.authenticatedFetch(
      `${USER_MGMT_API_URL}/users?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
      }
    );

    if (response.ok) {
      const data = await response.json();
      const user = Array.isArray(data) ? data[0] : data;
      if (!user) throw new Error("User not found");
      return user as User;
    }

    const users = await this.getAllUsers();
    const user = users.find((item) => item.email === email);
    if (!user) throw new Error("User not found");
    return user;
  }

  async getUserById(userId: string): Promise<User & { roles?: unknown[] }> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/users/${userId}`, {
      method: "GET",
    });

    return this.handleResponse<User & { roles?: unknown[] }>(response);
  }

  async getUserRoles(userId: string): Promise<unknown[]> {
    try {
      const userData = await this.getUserById(userId);
      return userData.roles || [];
    } catch (error) {
      if (error instanceof Error && error.message.includes("Insufficient permissions")) {
        return [];
      }
      console.error("Failed to get user roles:", error);
      return [];
    }
  }

  async getRoles(): Promise<FPSORole[]> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/roles`, {
      method: "GET",
    });

    return this.handleResponse<FPSORole[]>(response);
  }

  async getRoleByCode(roleCode: string): Promise<FPSORole> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/roles/${roleCode}`, {
      method: "GET",
    });

    return this.handleResponse<FPSORole>(response);
  }

  async createUser(payload: CreateUserRequest): Promise<User> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/users`, {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        // Default to Creator. "Viewer" is currently disabled in the UI
        // (see DISABLED_ACCESS_LEVELS in lib/roles.ts); set Creator so a
        // mis-submitted form without access_level still produces a usable
        // account rather than a permission-less one.
        access_level: payload.access_level ?? "Creator",
      }),
    });

    return this.handleResponse<User>(response);
  }

  async updateUser(userId: string, payload: UpdateUserRequest): Promise<User> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    return this.handleResponse<User>(response);
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await this.authenticatedFetch(`${USER_MGMT_API_URL}/users/${userId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      await this.handleResponse(response);
    }
  }
}

export const authService = new AuthService();
