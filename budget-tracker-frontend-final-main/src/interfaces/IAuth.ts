export interface ClientLocationPayload {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source: string;
  captured_at?: string;
  timezone?: string;
  village?: string;
  district?: string;
  province?: string;
}

export interface LoginData {
  email: string;
  password: string;
  client_location: ClientLocationPayload;
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
  location_chrome?: string;
  location_ip?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_source?: string | null;
  location_captured_at?: string | null;
  user_agent?: string;
  logged_in_at: string;
  is_current?: boolean;
}

export interface SessionDeleteData {
  deleted: number;
  remaining?: number;
  require_relogin?: boolean;
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
export type SessionDeleteResponse = ApiResponse<SessionDeleteData>;

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  number?: string | null;
  avatar_base64?: string | null;
}
