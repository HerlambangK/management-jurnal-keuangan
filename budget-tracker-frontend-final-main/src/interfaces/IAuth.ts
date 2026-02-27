export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData extends LoginData {
  name: string;
  number: string;
}

export interface AuthUser {
  id: number;
  uuid?: string;
  name: string;
  email: string;
  number: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LoginSessionItem {
  id: number;
  ip_address: string;
  device: string;
  location: string;
  user_agent?: string;
  logged_in_at: string;
}

export interface ProfileData extends AuthUser {
  sessions?: LoginSessionItem[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface LoginResult {
  user: AuthUser;
  token: string;
}

export type LoginResponse = ApiResponse<LoginResult>;
export type RegisterResponse = ApiResponse<LoginResult>;
export type ProfileResponse = ApiResponse<ProfileData>;
export type SessionListResponse = ApiResponse<LoginSessionItem[]>;

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  number?: string | null;
  avatar_base64?: string | null;
}
