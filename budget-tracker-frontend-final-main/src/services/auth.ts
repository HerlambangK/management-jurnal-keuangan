import api from "@/api";
import {
    LoginData,
    LoginResponse,
    ProfileResponse,
    RegisterData,
    RegisterResponse,
    SessionListResponse,
    UpdateProfilePayload,
} from "@/interfaces/IAuth";
import getTokenHeader from "@/utils/getTokenHeader";
import { ApiServiceError, handleApiError, toApiServiceError } from "@/utils/handleApiError";

export const login = async (userDataLogin: LoginData): Promise<LoginResponse> => {
    try {
        const response = await api.post("/auth/login", userDataLogin);
        return response.data;
    } catch (error) {
        handleApiError(error, "Login Failed");
    }
};

export const register = async (userDataRegist: RegisterData): Promise<RegisterResponse> => {
    try {
        const response = await api.post("/auth/register", userDataRegist);
        return response.data;
    } catch (error) {
        handleApiError(error, "Register Failed");
    }
};

export const profile = async (token: string): Promise<ProfileResponse> => {
    try {
        const response = await api.get("/auth/profile", {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        handleApiError(error, "Get Profile Failed");
    }
};

export const profileSafe = async (
    token: string
): Promise<{ data: ProfileResponse | null; error: ApiServiceError | null }> => {
    try {
        const data = await profile(token);
        return { data, error: null };
    } catch (error) {
        return { data: null, error: toApiServiceError(error, "Get Profile Failed") };
    }
};

export const updateProfile = async (payload: UpdateProfilePayload): Promise<ProfileResponse> => {
    try {
        const response = await api.put("/auth/profile", payload, {
            headers: getTokenHeader(),
        });
        return response.data;
    } catch (error) {
        handleApiError(error, "Update Profile Failed");
    }
};

export const fetchLoginSessions = async (limit = 15): Promise<SessionListResponse> => {
    try {
        const response = await api.get("/auth/sessions", {
            headers: getTokenHeader(),
            params: { limit },
        });
        return response.data;
    } catch (error) {
        handleApiError(error, "Get Login Session Failed");
    }
};

export const logout = () => {
    localStorage.removeItem("token");
};
