import { ApiErrorResponse, AxiosErrorLike, ParsedApiError } from "@/interfaces/IErrorHandler";

const isAxiosErrorLike = (error: unknown): error is AxiosErrorLike => {
  return typeof error === "object" && error !== null && ("response" in error || "request" in error);
};

const extractMessageFromData = (data: unknown): string | null => {
  if (typeof data === "string" && data.trim().length > 0) {
    return data;
  }

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const errorData = data as ApiErrorResponse;
    if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
      const msg = errorData.errors[0]?.msg;
      if (typeof msg === "string" && msg.trim().length > 0) {
        return msg;
      }
    }

    if (typeof errorData.message === "string" && errorData.message.trim().length > 0) {
      return errorData.message;
    }
  }

  return null;
};

export class ApiServiceError extends Error {
  status: number | null;
  code?: string;
  isNetworkError: boolean;
  isUnauthorized: boolean;
  raw: unknown;

  constructor(payload: ParsedApiError) {
    super(payload.message);
    this.name = "ApiServiceError";
    this.status = payload.status;
    this.code = payload.code;
    this.isNetworkError = payload.isNetworkError;
    this.isUnauthorized = payload.isUnauthorized;
    this.raw = payload.raw;
  }
}

export const parseApiError = (error: unknown, fallbackMessage: string): ParsedApiError => {
  if (!isAxiosErrorLike(error)) {
    if (error instanceof Error && error.message.trim().length > 0) {
      return {
        message: error.message,
        status: null,
        isNetworkError: false,
        isUnauthorized: false,
        raw: error,
      };
    }

    return {
      message: fallbackMessage,
      status: null,
      isNetworkError: false,
      isUnauthorized: false,
      raw: error,
    };
  }

  const status = typeof error.response?.status === "number" ? error.response.status : null;
  const message =
    extractMessageFromData(error.response?.data) || error.message || fallbackMessage;
  const networkByCode =
    error.code === "ERR_NETWORK" || error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
  const isNetworkError = networkByCode || (!error.response && Boolean(error.request));
  const isUnauthorized = status === 401 || /token.*(kadaluarsa|expired|tidak valid)/i.test(message);

  return {
    message,
    status,
    code: error.code,
    isNetworkError,
    isUnauthorized,
    raw: error,
  };
};

export const toApiServiceError = (error: unknown, fallbackMessage: string): ApiServiceError => {
  if (error instanceof ApiServiceError) {
    return error;
  }
  return new ApiServiceError(parseApiError(error, fallbackMessage));
};

export function handleApiError(error: unknown, fallbackMessage: string): never {
  throw toApiServiceError(error, fallbackMessage);
}
