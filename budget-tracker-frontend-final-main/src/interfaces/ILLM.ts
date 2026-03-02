export interface LLMResponse {
    summary: string;
    recommendations: string[];
    trend_analysis: string;
    source?: string | null;
    is_ai_generated?: boolean;
    ai_skipped_reason?: string | null;
}
