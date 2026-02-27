export interface AxiosErrorLike {
  message?: string;
  code?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
  request?: unknown;
}

export interface ApiErrorResponse {
  errors?: ValidationError[];
  message?: string;
  [key: string]: unknown;
}

export interface ValidationError {
  msg: string;
}

export interface ParsedApiError {
  message: string;
  status: number | null;
  code?: string;
  isNetworkError: boolean;
  isUnauthorized: boolean;
  raw: unknown;
}
