/**
 * Authentication Types
 */

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
  roles?: UserRole[];
}

export interface UserRole {
  role_code: string;
  role_name: string;
  module_name: string;
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
  remarks?: string;
  created_date: string;
  is_active: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  access_token?: string;
  token_type?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: keyof FPSORole) => boolean;
  hasRole: (roleCode: string) => boolean;
}
