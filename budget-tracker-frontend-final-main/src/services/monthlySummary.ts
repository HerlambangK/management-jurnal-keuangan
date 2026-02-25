import api from "@/api";
import { FinancialAIGenerateRequestPayload } from "@/interfaces/IFinancialPayload";
import { LLMResponse } from "@/interfaces/ILLM";
import { MonthlySummaryForecast, SummaryItem } from "@/interfaces/ISummary";
import { handleApiError } from "@/utils/handleApiError";
import getTokenHeader from "@/utils/getTokenHeader";

const stripDangerousTags = (value: string): string =>
    value
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
        .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, "")
        .replace(/javascript:/gi, "")
        .trim();

export const sanitizeHtmlContent = (value: unknown, fallback = ""): string => {
    if (typeof value !== "string") return fallback;
    return stripDangerousTags(value);
}

const splitRecommendationText = (value: string): string[] =>
    value
        .replace(/<br\s*\/?>/gi, "\n")
        .split(/\n+/)
        .map((line) => sanitizeHtmlContent(line))
        .filter((line) => line.trim().length > 0);

const extractRecommendations = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value
            .map((item) => sanitizeHtmlContent(item))
            .filter((item) => item.trim().length > 0);
    }

    if (typeof value !== "string") return [];

    const listItems = value.match(/<li[\s\S]*?<\/li>/gi);
    if (listItems && listItems.length > 0) {
        return listItems
            .map((item) =>
                sanitizeHtmlContent(item)
                    .replace(/^<li[^>]*>/i, "")
                    .replace(/<\/li>$/i, "")
                    .trim()
            )
            .filter((item) => item.trim().length > 0);
    }

    return splitRecommendationText(value);
}

export const normalizeGeneratedSummaryPayload = (rawPayload: unknown): LLMResponse => {
    const payload =
        typeof rawPayload === "object" && rawPayload !== null
            ? (rawPayload as Record<string, unknown>)
            : {};

    const summary = sanitizeHtmlContent(payload.summary ?? payload.ai_summary, "Tidak ada ringkasan.");
    const recommendations = extractRecommendations(
        payload.recommendations ?? payload.ai_recomendation
    );
    const trendAnalysis = sanitizeHtmlContent(
        payload.trend_analysis ?? payload.trendAnalysis,
        "Belum ada analisis tren."
    );

    return {
        summary,
        recommendations,
        trend_analysis: trendAnalysis,
    };
}

const normalizeSummaryRecord = (record: unknown): unknown => {
    if (typeof record !== "object" || record === null) return record;

    const item = record as Record<string, unknown>;
    return {
        ...item,
        ai_summary: sanitizeHtmlContent(item.ai_summary),
        ai_recomendation: sanitizeHtmlContent(item.ai_recomendation),
    };
}

export const normalizeStoredSummaryRecordToLLMResponse = (
    rawRecord: unknown
): LLMResponse | null => {
    if (typeof rawRecord !== "object" || rawRecord === null) return null;

    const record = rawRecord as Partial<SummaryItem> & Record<string, unknown>;
    const summary = sanitizeHtmlContent(record.ai_summary, "Tidak ada ringkasan.");
    const rawRecommendation = sanitizeHtmlContent(record.ai_recomendation, "");

    if (!rawRecommendation) {
        return {
            summary,
            recommendations: [],
            trend_analysis: "Belum ada analisis tren.",
        };
    }

    const parsedFromJson = (() => {
        try {
            return JSON.parse(rawRecommendation);
        } catch {
            return null;
        }
    })();
    if (parsedFromJson) {
        return normalizeGeneratedSummaryPayload(parsedFromJson);
    }

    const lines = rawRecommendation
        .replace(/<br\s*\/?>/gi, "\n")
        .split(/\n+/)
        .map((line) => sanitizeHtmlContent(line))
        .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
        return {
            summary,
            recommendations: [],
            trend_analysis: "Belum ada analisis tren.",
        };
    }

    const trendIndex = lines.findIndex((line) =>
        /\b(tren|trend|proyeksi|forecast)\b/i.test(line)
    );
    const pickedTrendIndex = trendIndex >= 0 ? trendIndex : lines.length - 1;
    const trendAnalysis = lines[pickedTrendIndex];
    const recommendations = lines.filter((_, idx) => idx !== pickedTrendIndex);

    return {
        summary,
        recommendations: recommendations.length > 0 ? recommendations : [trendAnalysis],
        trend_analysis: trendAnalysis,
    };
}

const normalizeForecastPayload = (rawPayload: unknown): MonthlySummaryForecast | null => {
    if (typeof rawPayload !== "object" || rawPayload === null) return null;
    const payload = rawPayload as Record<string, unknown>;
    const toNumber = (value: unknown, fallback = 0): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const toString = (value: unknown, fallback = ""): string =>
        typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
    const toRange = (value: unknown, fallback: [number, number]): [number, number] => {
        if (Array.isArray(value) && value.length >= 2) {
            const min = toNumber(value[0], fallback[0]);
            const max = toNumber(value[1], fallback[1]);
            return min <= max ? [Math.round(min), Math.round(max)] : [Math.round(max), Math.round(min)];
        }

        if (typeof value === "object" && value !== null) {
            const rangeObj = value as Record<string, unknown>;
            const min = toNumber(rangeObj.min, fallback[0]);
            const max = toNumber(rangeObj.max, fallback[1]);
            return min <= max ? [Math.round(min), Math.round(max)] : [Math.round(max), Math.round(min)];
        }

        return fallback;
    };

    const predictedIncome = Math.round(
        Math.max(0, toNumber(payload.predicted_income ?? payload.predictedIncome))
    );
    const predictedExpense = Math.round(
        Math.max(0, toNumber(payload.predicted_expense ?? payload.predictedExpense))
    );
    const predictedBalance = Math.round(
        toNumber(payload.predicted_balance ?? payload.predictedBalance, predictedIncome - predictedExpense)
    );

    const incomeRange = toRange(payload.income_range ?? payload.incomeRange, [
        predictedIncome,
        predictedIncome,
    ]);
    const expenseRange = toRange(payload.expense_range ?? payload.expenseRange, [
        predictedExpense,
        predictedExpense,
    ]);
    const balanceRange = toRange(payload.balance_range ?? payload.balanceRange, [
        predictedBalance,
        predictedBalance,
    ]);

    const confidence = Math.max(0, Math.min(100, Math.round(toNumber(payload.confidence))));
    const confidenceLabelRaw = toString(payload.confidence_label ?? payload.confidenceLabel).toLowerCase();
    const confidenceLabel: "tinggi" | "menengah" | "rendah" =
        confidenceLabelRaw === "tinggi" || confidenceLabelRaw === "menengah" || confidenceLabelRaw === "rendah"
            ? confidenceLabelRaw
            : confidence >= 80
            ? "tinggi"
            : confidence >= 60
            ? "menengah"
            : "rendah";

    const rawActionItems = payload.action_items ?? payload.actionItems;
    const actionItems = Array.isArray(rawActionItems)
        ? rawActionItems
              .map((item) => toString(item))
              .filter((item) => item.length > 0)
        : [];

    return {
        nextMonthLabel: toString(payload.next_month_label ?? payload.nextMonthLabel, "-"),
        predictedIncome,
        predictedExpense,
        predictedBalance,
        incomeRange,
        expenseRange,
        balanceRange,
        confidence,
        confidenceLabel,
        sampleSize: Math.max(0, Math.round(toNumber(payload.sample_size ?? payload.sampleSize))),
        insight: toString(payload.insight),
        actionItems,
        source: toString(payload.source, "statistical"),
        model: toString(payload.model) || null,
    };
}

export const fetchAllMonthlySummaries = async () => {
    try {
        const res = await api.get('/monthly-summary', {
            headers: getTokenHeader()
        });
        return {
            ...res.data,
            data: Array.isArray(res.data?.data)
                ? res.data.data.map((item: unknown) => normalizeSummaryRecord(item))
                : normalizeSummaryRecord(res.data?.data)
        };
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}

export const fetchMonthlySummaryForecast = async () => {
    try {
        const res = await api.get('/monthly-summary/forecast', {
            headers: getTokenHeader()
        });
        return {
            ...res.data,
            data: normalizeForecastPayload(res.data?.data)
        };
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}

export const fetchAllMonthlySummaryById = async (id: number) => {
    try {
        const res = await api.get(`/monthly-summary/${id}`, {
            headers: getTokenHeader()
        });
        return {
            ...res.data,
            data: normalizeSummaryRecord(res.data?.data)
        };
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}
export const createMonthlySummary = async (data: Record<string, unknown>) => {
    try {
        const res = await api.post('/monthly-summary', data, {
            headers: getTokenHeader()
        });
        return {
            ...res.data,
            data: normalizeSummaryRecord(res.data?.data)
        };
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}
export const updateMonthlySummary = async (id: number, data: Record<string, unknown>) => {
    try {
        const res = await api.put(`/monthly-summary/${id}`, data, {
            headers: getTokenHeader()
        });
        return {
            ...res.data,
            data: normalizeSummaryRecord(res.data?.data)
        };
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}
export const deleteMonthlySummary = async (id: number) => {
    try {
        const res = await api.delete(`/monthly-summary/${id}`, {
            headers: getTokenHeader()
        });
        return res.data;
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}

export const generateMonthlySummary = async (
    payload?: FinancialAIGenerateRequestPayload
) => {
    try {
        const requestBody = payload || {};
        const res = await api.post('/monthly-summary/generate', requestBody, {
            headers: getTokenHeader()
        });
        return {
            ...res.data,
            data: normalizeGeneratedSummaryPayload(res.data?.data)
        };
    } catch (error) {
        handleApiError(error, "Monthly Summary Error");
    }
}
