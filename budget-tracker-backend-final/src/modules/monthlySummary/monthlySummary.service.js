const axios = require('axios');
const { Op } = require('sequelize');
const { MonthlySummary, Transaction, Category } = require('../../../models');
const config = require('../../config/config');
const BadRequestError = require('../../errors/BadRequestError');
const NotFound = require('../../errors/NotFoundError');

class MonthlySummaryService {
    async getAll(userId) {
        return await MonthlySummary.findAll({
            where: {
                user_id: userId,
            },
            order: [
                ['year', 'ASC'],
                ['created_at', 'ASC'],
            ],
        });
    }

    async getById(id, userId) {
        const summary = await MonthlySummary.findOne({
            where: {
                id,
                user_id: userId,
            },
        });
        if(!summary) throw new NotFound('Summary Bulanan Tidak ditemukan!');
        return summary
    }

    async create(data) {
        return await MonthlySummary.create(data);
    }

    async getForecast(userId) {
        const historyRows = await this.getForecastHistory(userId);
        const historyPoints = this.normalizeSummaryHistoryForForecast(historyRows);

        if (historyPoints.length === 0) {
            throw new BadRequestError(
                'Belum ada data summary bulanan untuk membuat forecast.'
            );
        }

        const baselineForecast = this.buildStatisticalForecast(historyPoints);
        const aiForecast = await this.requestForecastFromLLM(
            historyPoints,
            baselineForecast
        );
        const finalForecast = aiForecast || baselineForecast;
        const confidenceLabel = this.getConfidenceLabel(finalForecast.confidence);

        return {
            ...finalForecast,
            confidence_label: confidenceLabel,
            sample_size: historyPoints.length,
            source: aiForecast ? 'ai+statistical' : 'statistical',
            model: aiForecast ? this.getOpenRouterModel() : null,
            history_points: historyPoints.slice(-12).map((point) => ({
                month: this.formatMonthYearLabel(point.monthIndex, point.year),
                year: point.year,
                total_income: point.income,
                total_expense: point.expense,
                balance: point.balance,
            })),
        };
    }

    async getForecastHistory(userId) {
        return await MonthlySummary.findAll({
            where: {
                user_id: userId,
            },
            order: [['created_at', 'ASC']],
        });
    }

    normalizeSummaryHistoryForForecast(rows) {
        if (!Array.isArray(rows)) {
            return [];
        }

        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const toEpoch = (value) => {
            const time = new Date(value || '').getTime();
            return Number.isFinite(time) ? time : 0;
        };

        const dedupMap = new Map();

        for (const row of rows) {
            const monthIndex = this.getMonthIndexFromLabel(row?.month);
            const year = toNumber(row?.year);
            if (!Number.isFinite(year) || monthIndex < 0) {
                continue;
            }

            const point = {
                year,
                monthIndex,
                sortKey: year * 12 + monthIndex,
                income: toNumber(row?.total_income),
                expense: toNumber(row?.total_expense),
                balance: toNumber(row?.balance),
                createdAt: toEpoch(row?.created_at || row?.updated_at),
            };

            const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
            const existing = dedupMap.get(key);
            if (!existing || point.createdAt >= existing.createdAt) {
                dedupMap.set(key, point);
            }
        }

        return [...dedupMap.values()].sort((a, b) => a.sortKey - b.sortKey);
    }

    getMonthIndexFromLabel(monthValue) {
        if (typeof monthValue !== 'string') {
            return -1;
        }

        const key = monthValue.trim().toLowerCase();
        if (!key) {
            return -1;
        }

        const monthMap = {
            januari: 0,
            jan: 0,
            january: 0,
            februari: 1,
            feb: 1,
            february: 1,
            maret: 2,
            mar: 2,
            march: 2,
            april: 3,
            apr: 3,
            mei: 4,
            may: 4,
            juni: 5,
            jun: 5,
            june: 5,
            juli: 6,
            jul: 6,
            july: 6,
            agustus: 7,
            agu: 7,
            august: 7,
            september: 8,
            sep: 8,
            oktober: 9,
            okt: 9,
            october: 9,
            november: 10,
            nov: 10,
            desember: 11,
            des: 11,
            december: 11,
        };

        return Object.prototype.hasOwnProperty.call(monthMap, key)
            ? monthMap[key]
            : -1;
    }

    formatMonthYearLabel(monthIndex, year) {
        if (!Number.isFinite(monthIndex) || !Number.isFinite(year)) {
            return '-';
        }

        return new Date(year, monthIndex, 1).toLocaleString('id-ID', {
            month: 'long',
            year: 'numeric',
        });
    }

    calculateStdDev(values) {
        if (!Array.isArray(values) || values.length <= 1) {
            return 0;
        }

        const mean =
            values.reduce((acc, value) => acc + value, 0) / values.length;
        const variance =
            values.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
            values.length;
        return Math.sqrt(Math.max(0, variance));
    }

    forecastMetric(values, allowNegative = false) {
        if (!Array.isArray(values) || values.length === 0) {
            return 0;
        }

        if (values.length === 1) {
            return values[0];
        }

        const recent = values.slice(-Math.min(4, values.length));
        const totalWeight = recent.reduce((acc, _, idx) => acc + idx + 1, 0);
        const weightedAverage =
            recent.reduce((acc, value, idx) => acc + value * (idx + 1), 0) /
            totalWeight;

        const momentum = values[values.length - 1] - values[values.length - 2];
        const slope =
            values.length >= 3
                ? (values[values.length - 1] - values[values.length - 3]) / 2
                : momentum;

        let prediction = weightedAverage + momentum * 0.35 + slope * 0.2;
        if (!allowNegative) {
            prediction = Math.max(0, prediction);
        }

        return prediction;
    }

    buildForecastRange(prediction, values, allowNegative = false) {
        const recent = Array.isArray(values)
            ? values.slice(-Math.min(6, values.length))
            : [];
        const std = this.calculateStdDev(recent);
        const momentum =
            recent.length >= 2
                ? recent[recent.length - 1] - recent[recent.length - 2]
                : 0;
        const band = Math.max(
            std * 0.85,
            Math.abs(momentum) * 0.35,
            Math.abs(prediction) * 0.08
        );

        let min = prediction - band;
        let max = prediction + band;
        if (!allowNegative) {
            min = Math.max(0, min);
            max = Math.max(0, max);
        }

        return {
            min: Math.round(min),
            max: Math.round(max),
        };
    }

    buildStatisticalForecast(historyPoints) {
        const incomeSeries = historyPoints.map((point) => point.income);
        const expenseSeries = historyPoints.map((point) => point.expense);
        const balanceSeries = historyPoints.map((point) => point.balance);

        const predictedIncome = Math.round(
            this.forecastMetric(incomeSeries, false)
        );
        const predictedExpense = Math.round(
            this.forecastMetric(expenseSeries, false)
        );
        const predictedBalance = Math.round(
            this.forecastMetric(balanceSeries, true)
        );

        const incomeRange = this.buildForecastRange(
            predictedIncome,
            incomeSeries,
            false
        );
        const expenseRange = this.buildForecastRange(
            predictedExpense,
            expenseSeries,
            false
        );
        const balanceRange = this.buildForecastRange(
            predictedBalance,
            balanceSeries,
            true
        );

        const recentBalance = balanceSeries.slice(
            -Math.min(6, balanceSeries.length)
        );
        const recentBalanceAbsMean =
            recentBalance.length > 0
                ? recentBalance.reduce((acc, value) => acc + Math.abs(value), 0) /
                  recentBalance.length
                : 0;
        const balanceVolatility =
            recentBalanceAbsMean > 0
                ? this.calculateStdDev(recentBalance) / recentBalanceAbsMean
                : 0;
        const sampleScore = Math.min(1, historyPoints.length / 6);
        const stabilityScore = Math.max(
            0,
            1 - Math.min(balanceVolatility, 1)
        );
        const confidence = Math.max(
            40,
            Math.min(
                95,
                Math.round((sampleScore * 0.6 + stabilityScore * 0.4) * 100)
            )
        );

        const lastPoint = historyPoints[historyPoints.length - 1];
        const nextDate = new Date(lastPoint.year, lastPoint.monthIndex + 1, 1);
        const nextMonthLabel = nextDate.toLocaleString('id-ID', {
            month: 'long',
            year: 'numeric',
        });

        const baseline = {
            next_month_label: nextMonthLabel,
            predicted_income: predictedIncome,
            predicted_expense: predictedExpense,
            predicted_balance: predictedBalance,
            income_range: incomeRange,
            expense_range: expenseRange,
            balance_range: balanceRange,
            confidence,
            insight: this.buildStatisticalForecastInsight({
                nextMonthLabel,
                predictedIncome,
                predictedExpense,
                predictedBalance,
            }),
            action_items: this.buildDefaultForecastActionItems({
                predictedIncome,
                predictedExpense,
                predictedBalance,
            }),
        };

        return baseline;
    }

    buildStatisticalForecastInsight({
        nextMonthLabel,
        predictedIncome,
        predictedExpense,
        predictedBalance,
    }) {
        const incomeText = this.formatRupiah(predictedIncome);
        const expenseText = this.formatRupiah(predictedExpense);
        const balanceText = this.formatRupiah(predictedBalance);

        if (predictedBalance >= 0) {
            return `Forecast ${nextMonthLabel}: pemasukan ${incomeText}, pengeluaran ${expenseText}, dan saldo berpotensi surplus ${balanceText}. Prioritas utama adalah menjaga disiplin pengeluaran agar surplus tetap konsisten.`;
        }

        return `Forecast ${nextMonthLabel}: pemasukan ${incomeText}, pengeluaran ${expenseText}, dan saldo berpotensi defisit ${this.formatRupiah(
            Math.abs(predictedBalance)
        )}. Fokuskan kontrol biaya variabel dan perkuat buffer kas sejak awal bulan.`;
    }

    buildDefaultForecastActionItems({
        predictedIncome,
        predictedExpense,
        predictedBalance,
    }) {
        const budgetLimit = Math.max(0, Math.round(predictedExpense * 0.95));
        const weeklyBudget = Math.round(budgetLimit / 4);

        if (predictedBalance >= 0) {
            return [
                `Pasang batas pengeluaran bulanan maksimal ${this.formatRupiah(
                    budgetLimit
                )} agar saldo tetap aman.`,
                `Kunci alokasi tabungan otomatis minimal ${this.formatRupiah(
                    Math.max(Math.round(predictedIncome * 0.2), 0)
                )} pada awal bulan.`,
                `Pantau realisasi mingguan dengan batas sekitar ${this.formatRupiah(
                    weeklyBudget
                )} per minggu.`,
            ];
        }

        return [
            `Turunkan pengeluaran ke kisaran ${this.formatRupiah(
                budgetLimit
            )} untuk mengurangi risiko defisit.`,
            `Tetapkan plafon belanja mingguan maksimal ${this.formatRupiah(
                Math.max(0, weeklyBudget)
            )} sampai arus kas kembali positif.`,
            'Tunda pengeluaran non-prioritas selama 30 hari untuk mempercepat pemulihan saldo.',
        ];
    }

    getOpenRouterModel() {
        return (
            process.env.OPENROUTER_MODEL ||
            'meta-llama/llama-3.3-8b-instruct:free'
        );
    }

    getConfidenceLabel(confidence) {
        if (confidence >= 80) return 'tinggi';
        if (confidence >= 60) return 'menengah';
        return 'rendah';
    }

    async requestForecastFromLLM(historyPoints, baselineForecast) {
        const apiKey = config.llm?.openRouter;
        if (!apiKey) {
            return null;
        }

        const model = this.getOpenRouterModel();
        const prompt = this.buildForecastPrompt(historyPoints, baselineForecast);

        return await this.callForecastLLMOnce({
            apiKey,
            model,
            prompt,
            timeout: 30000,
            baselineForecast,
        });
    }

    async callForecastLLMOnce({
        apiKey,
        model,
        prompt,
        timeout,
        baselineForecast,
    }) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model,
                    temperature: 0.2,
                    max_tokens: 900,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'Kamu adalah analis forecasting keuangan pribadi yang ketat pada angka dan memberikan output JSON valid.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                },
                {
                    timeout,
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': config.server?.baseUrl || 'http://localhost:5001',
                        'X-Title': 'Budget Tracker Backend',
                    },
                }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                return null;
            }

            const parsedJson = this.parseLLMResponse(content);
            return this.normalizeForecastLLMResponse(parsedJson, baselineForecast);
        } catch (error) {
            const status = error?.response?.status || '-';
            const message =
                error?.response?.data?.error?.message ||
                error?.message ||
                'Unknown error';
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[AI] Forecast request failed (${status}): ${message}`);
            }
            return null;
        }
    }

    buildForecastPrompt(historyPoints, baselineForecast) {
        const historyText = historyPoints
            .slice(-12)
            .map(
                (point, index) =>
                    `${index + 1}. ${this.formatMonthYearLabel(
                        point.monthIndex,
                        point.year
                    )} | income ${this.formatRupiah(point.income)} | expense ${this.formatRupiah(
                        point.expense
                    )} | balance ${this.formatRupiah(point.balance)}`
            )
            .join('\n');

        return [
            'Berikut data histori summary bulanan user (maksimal 12 bulan terakhir):',
            historyText || '-',
            '',
            'Baseline forecast statistik internal (boleh kamu koreksi jika ada alasan kuat):',
            `- Prediksi income: ${this.formatRupiah(
                baselineForecast.predicted_income
            )}`,
            `- Prediksi expense: ${this.formatRupiah(
                baselineForecast.predicted_expense
            )}`,
            `- Prediksi balance: ${this.formatRupiah(
                baselineForecast.predicted_balance
            )}`,
            `- Range income: ${this.formatRupiah(
                baselineForecast.income_range.min
            )} - ${this.formatRupiah(baselineForecast.income_range.max)}`,
            `- Range expense: ${this.formatRupiah(
                baselineForecast.expense_range.min
            )} - ${this.formatRupiah(baselineForecast.expense_range.max)}`,
            `- Range balance: ${this.formatRupiah(
                baselineForecast.balance_range.min
            )} - ${this.formatRupiah(baselineForecast.balance_range.max)}`,
            '',
            'Tugas:',
            '1) Buat forecast bulan depan dalam angka (income, expense, balance) yang masuk akal.',
            '2) Semua nilai uang wajib angka murni (tanpa Rp, tanpa titik pemisah).',
            '3) Berikan confidence 0-100.',
            '4) Berikan insight singkat maksimal 2 kalimat.',
            '5) Berikan 3 action_items yang konkret.',
            '',
            'Balas HANYA JSON valid tanpa markdown:',
            '{',
            '  "predicted_income": 0,',
            '  "predicted_expense": 0,',
            '  "predicted_balance": 0,',
            '  "income_range": {"min": 0, "max": 0},',
            '  "expense_range": {"min": 0, "max": 0},',
            '  "balance_range": {"min": 0, "max": 0},',
            '  "confidence": 0,',
            '  "insight": "string",',
            '  "action_items": ["string", "string", "string"]',
            '}',
        ].join('\n');
    }

    normalizeForecastLLMResponse(payload, baselineForecast) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const toFiniteNumber = (value, fallback) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const toText = (value, fallback = '') =>
            typeof value === 'string' && value.trim().length > 0
                ? this.stripHtml(this.sanitizeAndNormalizeHtml(value)).trim()
                : fallback;
        const parseRange = (rangeValue, minValue, maxValue, fallbackRange, allowNegative) => {
            let min = fallbackRange.min;
            let max = fallbackRange.max;

            if (Array.isArray(rangeValue) && rangeValue.length >= 2) {
                min = toFiniteNumber(rangeValue[0], min);
                max = toFiniteNumber(rangeValue[1], max);
            } else if (rangeValue && typeof rangeValue === 'object') {
                min = toFiniteNumber(rangeValue.min, min);
                max = toFiniteNumber(rangeValue.max, max);
            }

            min = toFiniteNumber(minValue, min);
            max = toFiniteNumber(maxValue, max);

            if (!allowNegative) {
                min = Math.max(0, min);
                max = Math.max(0, max);
            }

            if (min > max) {
                const temp = min;
                min = max;
                max = temp;
            }

            return {
                min: Math.round(min),
                max: Math.round(max),
            };
        };

        const predictedIncome = Math.round(
            Math.max(
                0,
                toFiniteNumber(
                    payload.predicted_income ?? payload.predictedIncome,
                    baselineForecast.predicted_income
                )
            )
        );
        const predictedExpense = Math.round(
            Math.max(
                0,
                toFiniteNumber(
                    payload.predicted_expense ?? payload.predictedExpense,
                    baselineForecast.predicted_expense
                )
            )
        );
        const predictedBalance = Math.round(
            toFiniteNumber(
                payload.predicted_balance ?? payload.predictedBalance,
                predictedIncome - predictedExpense
            )
        );

        const incomeRange = parseRange(
            payload.income_range ?? payload.incomeRange,
            payload.income_range_min,
            payload.income_range_max,
            baselineForecast.income_range,
            false
        );
        const expenseRange = parseRange(
            payload.expense_range ?? payload.expenseRange,
            payload.expense_range_min,
            payload.expense_range_max,
            baselineForecast.expense_range,
            false
        );
        const balanceRange = parseRange(
            payload.balance_range ?? payload.balanceRange,
            payload.balance_range_min,
            payload.balance_range_max,
            baselineForecast.balance_range,
            true
        );

        const confidence = clamp(
            Math.round(
                toFiniteNumber(payload.confidence, baselineForecast.confidence)
            ),
            35,
            95
        );

        const insight = toText(payload.insight, baselineForecast.insight);
        const actionItemsRaw = Array.isArray(payload.action_items)
            ? payload.action_items
            : typeof payload.action_items === 'string'
            ? payload.action_items.split('\n')
            : [];
        const actionItems = actionItemsRaw
            .map((item) => toText(item))
            .filter(Boolean)
            .slice(0, 4);

        return {
            next_month_label: baselineForecast.next_month_label,
            predicted_income: predictedIncome,
            predicted_expense: predictedExpense,
            predicted_balance: predictedBalance,
            income_range: incomeRange,
            expense_range: expenseRange,
            balance_range: balanceRange,
            confidence,
            insight,
            action_items:
                actionItems.length > 0
                    ? actionItems
                    : baselineForecast.action_items,
        };
    }

    async generate(userId, requestBody = {}) {
        const monthlyStats = await this.getCurrentMonthStats(userId);
        const normalizedFrontendFinancialData = this.normalizeFinancialPayload(
            requestBody?.data_keuangan
        );
        const frontendPayloadEvaluation = this.evaluateFrontendPayload(
            monthlyStats,
            normalizedFrontendFinancialData
        );
        const frontendFinancialData = frontendPayloadEvaluation.usableData
            ? {
                  ...frontendPayloadEvaluation.usableData,
                  payload_status: frontendPayloadEvaluation.status,
                  backend_gap: frontendPayloadEvaluation.gap,
              }
            : null;
        const currentSummary = await this.getCurrentMonthSummary(
            userId,
            monthlyStats.month,
            monthlyStats.year
        );

        if (monthlyStats.transactionCount === 0 && !frontendFinancialData) {
            throw new BadRequestError('Belum ada transaksi bulan ini untuk dibuatkan ringkasan.');
        }

        let llmResponse = await this.requestInsightFromLLM(
            monthlyStats,
            frontendFinancialData
        );
        if (!llmResponse) {
            llmResponse = {
                ...this.buildFallbackInsight(monthlyStats),
                key_numbers: this.buildFallbackKeyNumbers(monthlyStats),
            };
        }

        const enrichedSummary = this.appendKeyNumbersToSummary(
            llmResponse.summary,
            llmResponse.key_numbers
        );

        const aiRecommendation = [
            ...llmResponse.recommendations,
            llmResponse.trend_analysis,
        ]
            .filter(Boolean)
            .join('\n');

        const useFrontendAsPrimarySource =
            monthlyStats.transactionCount === 0 &&
            frontendPayloadEvaluation.hasSummaryNumbers;

        const incomeToSave = useFrontendAsPrimarySource
            ? frontendFinancialData?.summary?.income
            : monthlyStats.total_income;
        const expenseToSave = useFrontendAsPrimarySource
            ? frontendFinancialData?.summary?.expense
            : monthlyStats.total_expense;
        const balanceToSave = useFrontendAsPrimarySource
            ? frontendFinancialData?.summary?.balance
            : monthlyStats.balance;

        const summaryPayload = {
            month: monthlyStats.month,
            year: monthlyStats.year,
            total_income: String(Number(incomeToSave) || 0),
            total_expense: String(Number(expenseToSave) || 0),
            balance: String(Number(balanceToSave) || 0),
            ai_summary: enrichedSummary,
            ai_recomendation: aiRecommendation,
            user_id: userId,
        };

        if (currentSummary) {
            await currentSummary.update(summaryPayload);
        } else {
            await MonthlySummary.create(summaryPayload);
        }

        return {
            ...llmResponse,
            summary: enrichedSummary,
            sumber_data: useFrontendAsPrimarySource
                ? 'frontend'
                : frontendFinancialData
                ? 'frontend+backend'
                : 'backend',
            frontend_payload_status: frontendPayloadEvaluation.status,
            frontend_backend_gap: frontendPayloadEvaluation.gap,
            data_keuangan_dipakai: frontendFinancialData,
        };
    }

    evaluateFrontendPayload(monthlyStats, frontendFinancialData) {
        if (!frontendFinancialData) {
            return {
                usableData: null,
                status: 'not_provided',
                gap: null,
                hasSummaryNumbers: false,
            };
        }

        const referenceMonth =
            frontendFinancialData?.period?.reference_month || '';
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(
            now.getMonth() + 1
        ).padStart(2, '0')}`;

        if (referenceMonth && referenceMonth !== currentMonth) {
            return {
                usableData: null,
                status: `stale_period_${referenceMonth}`,
                gap: null,
                hasSummaryNumbers: false,
            };
        }

        const summary = frontendFinancialData.summary || {};
        const income = Number(summary.income) || 0;
        const expense = Number(summary.expense) || 0;
        const balance = Number(summary.balance) || 0;

        const hasSummaryNumbers = income > 0 || expense > 0 || balance !== 0;
        const hasActivity =
            (Number(frontendFinancialData?.transactions?.total_count) || 0) > 0 ||
            (Number(frontendFinancialData?.daily?.total_points) || 0) > 0 ||
            (Number(frontendFinancialData?.weekly?.total_points) || 0) > 0;

        if (!hasSummaryNumbers && !hasActivity) {
            return {
                usableData: null,
                status: 'empty_payload',
                gap: null,
                hasSummaryNumbers: false,
            };
        }

        return {
            usableData: frontendFinancialData,
            status: 'accepted',
            gap: this.buildFrontendBackendGap(monthlyStats, frontendFinancialData),
            hasSummaryNumbers,
        };
    }

    buildFrontendBackendGap(monthlyStats, frontendFinancialData) {
        if (!frontendFinancialData || !monthlyStats) {
            return null;
        }

        const summary = frontendFinancialData.summary || {};
        const incomeGap = (Number(summary.income) || 0) - (Number(monthlyStats.total_income) || 0);
        const expenseGap = (Number(summary.expense) || 0) - (Number(monthlyStats.total_expense) || 0);
        const balanceGap = (Number(summary.balance) || 0) - (Number(monthlyStats.balance) || 0);

        return {
            income_gap: incomeGap,
            expense_gap: expenseGap,
            balance_gap: balanceGap,
            income_gap_percent:
                monthlyStats.total_income > 0
                    ? Number(((incomeGap / monthlyStats.total_income) * 100).toFixed(2))
                    : 0,
            expense_gap_percent:
                monthlyStats.total_expense > 0
                    ? Number(((expenseGap / monthlyStats.total_expense) * 100).toFixed(2))
                    : 0,
        };
    }

    async update(id, data, userId) {
        const summary = await MonthlySummary.findOne({
            where: {
                id,
                user_id: userId,
            },
        });
        if(!summary) throw new NotFound('Summary Bulanan Tidak ditemukan!');
        await summary.update(data);
        return summary
    }

    async delete(id, userId) {
        const summary = await MonthlySummary.findOne({
            where: {
                id,
                user_id: userId,
            },
        });
        if(!summary) throw new NotFound('Summary Bulanan Tidak ditemukan!');
        await summary.destroy();
        return true
    }

    async getCurrentMonthSummary(userId, month, year) {
        return await MonthlySummary.findOne({
            where: {
                user_id: userId,
                month,
                year,
            },
            order: [['created_at', 'DESC']],
        });
    }

    async getCurrentMonthStats(userId) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth],
                },
            },
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['name'],
                    required: false,
                },
            ],
            order: [['date', 'ASC']],
        });

        let totalIncome = 0;
        let totalExpense = 0;
        let incomeCount = 0;
        let expenseCount = 0;
        let firstHalfExpense = 0;
        let secondHalfExpense = 0;

        const activeDays = new Set();
        const expenseByCategory = {};
        const weeklyExpense = [0, 0, 0, 0, 0];
        const transactionsForAi = [];

        let maxIncomeTx = null;
        let maxExpenseTx = null;

        for (const tx of transactions) {
            const amount = Number(tx.amount) || 0;
            const txDate = tx.date ? new Date(tx.date) : null;
            const isValidDate =
                txDate instanceof Date && !Number.isNaN(txDate.getTime());
            const dayOfMonth = isValidDate ? txDate.getDate() : null;
            const dateLabel =
                isValidDate ? txDate.toISOString().slice(0, 10) : '-';

            if (isValidDate) {
                activeDays.add(dateLabel);
            }

            transactionsForAi.push({
                date: dateLabel,
                type: tx.type,
                amount_number: amount,
                amount_rupiah: this.formatRupiah(amount),
                category: tx.category?.name || (tx.type === 'income' ? 'Pemasukan Lainnya' : 'Pengeluaran Lainnya'),
                note: tx.note ? String(tx.note).trim().slice(0, 60) : '-',
            });

            if (tx.type === 'income') {
                totalIncome += amount;
                incomeCount += 1;

                if (!maxIncomeTx || amount > maxIncomeTx.amount) {
                    maxIncomeTx = {
                        amount,
                        date: dateLabel,
                        category: tx.category?.name || 'Tanpa kategori',
                    };
                }
            }

            if (tx.type === 'expense') {
                totalExpense += amount;
                expenseCount += 1;

                const categoryName = tx.category?.name || 'Lainnya';
                expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + amount;

                if (dayOfMonth !== null) {
                    const weekIndex = Math.min(4, Math.floor((dayOfMonth - 1) / 7));
                    weeklyExpense[weekIndex] += amount;

                    if (dayOfMonth <= 15) {
                        firstHalfExpense += amount;
                    } else {
                        secondHalfExpense += amount;
                    }
                }

                if (!maxExpenseTx || amount > maxExpenseTx.amount) {
                    maxExpenseTx = {
                        amount,
                        date: dateLabel,
                        category: categoryName,
                    };
                }
            }
        }

        const balance = totalIncome - totalExpense;
        const expenseToIncomeRatio =
            totalIncome > 0 ? (totalExpense / totalIncome) * 100 : null;
        const savingRate =
            totalIncome > 0 ? (balance / totalIncome) * 100 : null;

        const topExpenseCategories = Object.entries(expenseByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([category, amount]) => ({ category, amount }));

        const elapsedDays = Math.max(1, Math.min(now.getDate(), endOfMonth.getDate()));
        const projectedExpense = (totalExpense / elapsedDays) * endOfMonth.getDate();
        const projectedBalance = totalIncome - projectedExpense;
        const topExpenseCategoryShare =
            totalExpense > 0 && topExpenseCategories[0]
                ? (topExpenseCategories[0].amount / totalExpense) * 100
                : null;

        const weeklyWithActivity = weeklyExpense.filter((amount) => amount > 0);
        let recentExpenseTrend = 'stabil';
        if (weeklyWithActivity.length >= 2) {
            const previous = weeklyWithActivity[weeklyWithActivity.length - 2];
            const latest = weeklyWithActivity[weeklyWithActivity.length - 1];
            if (latest > previous * 1.1) recentExpenseTrend = 'naik';
            if (latest < previous * 0.9) recentExpenseTrend = 'turun';
        }

        const healthScore = this.calculateHealthScore({
            balance,
            expenseToIncomeRatio,
            savingRate,
            projectedBalance,
        });
        const healthStatus = healthScore >= 75 ? 'sehat' : healthScore >= 50 ? 'waspada' : 'kritis';

        return {
            month: now.toLocaleString('id-ID', { month: 'long' }),
            year: String(now.getFullYear()),
            total_income: totalIncome,
            total_expense: totalExpense,
            balance,
            transactionCount: transactions.length,
            incomeCount,
            expenseCount,
            activeDaysCount: activeDays.size,
            weeklyExpense,
            firstHalfExpense,
            secondHalfExpense,
            expenseToIncomeRatio,
            savingRate,
            averageIncome:
                incomeCount > 0 ? totalIncome / incomeCount : 0,
            averageExpense:
                expenseCount > 0 ? totalExpense / expenseCount : 0,
            maxIncomeTx,
            maxExpenseTx,
            topExpenseCategories,
            daysInMonth: endOfMonth.getDate(),
            currentDay: now.getDate(),
            transactionsForAi: transactionsForAi.slice(-60),
            elapsedDays,
            projectedExpense,
            projectedBalance,
            topExpenseCategoryShare,
            recentExpenseTrend,
            healthScore,
            healthStatus,
        };
    }

    async requestInsightFromLLM(monthlyStats, frontendFinancialData = null) {
        const apiKey = config.llm?.openRouter;
        if (!apiKey) {
            return null;
        }

        const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-8b-instruct:free';

        const prompts = [
            this.buildDeepInsightPrompt(monthlyStats, frontendFinancialData),
            this.buildCompactInsightPrompt(monthlyStats, frontendFinancialData),
        ];

        for (let i = 0; i < prompts.length; i += 1) {
            const result = await this.callLLMOnce({
                apiKey,
                model,
                prompt: prompts[i],
                timeout: i === 0 ? 45000 : 30000,
            });

            if (result) {
                return result;
            }
        }

        return null;
    }

    async callLLMOnce({ apiKey, model, prompt, timeout }) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model,
                    temperature: 0.15,
                    max_tokens: 1400,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'Kamu adalah penasihat keuangan pribadi yang teliti, konkret, dan fokus pada rencana aksi yang bisa dijalankan.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                },
                {
                    timeout,
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': config.server?.baseUrl || 'http://localhost:5001',
                        'X-Title': 'Budget Tracker Backend',
                    },
                }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                return null;
            }

            const parsedJson = this.parseLLMResponse(content);
            return this.normalizeInsightResponse(parsedJson);
        } catch (error) {
            const status = error?.response?.status || '-';
            const message = error?.response?.data?.error?.message || error?.message || 'Unknown error';
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[AI] OpenRouter request failed (${status}): ${message}`);
            }
            return null;
        }
    }

    parseLLMResponse(content) {
        const raw = String(content || '').trim();
        if (!raw) {
            return null;
        }

        const withoutCodeFence = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            return JSON.parse(withoutCodeFence);
        } catch (error) {
            const start = withoutCodeFence.indexOf('{');
            const end = withoutCodeFence.lastIndexOf('}');
            if (start < 0 || end < 0 || end <= start) {
                return null;
            }

            try {
                return JSON.parse(withoutCodeFence.slice(start, end + 1));
            } catch (secondError) {
                try {
                    const cleaned = withoutCodeFence
                        .slice(start, end + 1)
                        .replace(/,\s*([}\]])/g, '$1');
                    return JSON.parse(cleaned);
                } catch (thirdError) {
                    return null;
                }
            }
        }
    }

    normalizeInsightResponse(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const summary =
            typeof payload.summary === 'string'
                ? this.sanitizeAndNormalizeHtml(payload.summary)
                : '';

        const recommendationsRaw = Array.isArray(payload.recommendations)
            ? payload.recommendations
            : typeof payload.recommendations === 'string'
            ? payload.recommendations.split('\n')
            : [];

        const recommendations = recommendationsRaw
            .map((item) => this.sanitizeAndNormalizeHtml(String(item)))
            .filter(Boolean)
            .slice(0, 6);

        const keyNumbersRaw = Array.isArray(payload.key_numbers)
            ? payload.key_numbers
            : [];

        const key_numbers = keyNumbersRaw
            .map((item) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }

                const label = this.sanitizeAndNormalizeHtml(
                    String(item.label || item.metric || item.name || '')
                );
                const value = this.sanitizeAndNormalizeHtml(
                    String(item.value || item.amount || '')
                );
                const insight = this.sanitizeAndNormalizeHtml(
                    String(item.insight || item.note || item.reason || '')
                );

                if (!label || !value) {
                    return null;
                }

                return { label, value, insight };
            })
            .filter(Boolean)
            .slice(0, 8);

        let trendAnalysis =
            typeof payload.trend_analysis === 'string'
                ? this.sanitizeAndNormalizeHtml(payload.trend_analysis)
                : '';

        if (!trendAnalysis && summary) {
            trendAnalysis = summary;
        }

        const normalizedRecommendations = [...recommendations];
        if (normalizedRecommendations.length === 0 && trendAnalysis) {
            normalizedRecommendations.push(trendAnalysis);
        }
        if (normalizedRecommendations.length < 3 && summary) {
            const summarySentences = this.stripHtml(summary)
                .split(/[.!?]\s+/)
                .map((part) => part.trim())
                .filter(Boolean);

            for (const sentence of summarySentences) {
                if (normalizedRecommendations.length >= 3) break;
                normalizedRecommendations.push(this.sanitizeAndNormalizeHtml(sentence));
            }
        }

        if (!summary || normalizedRecommendations.length === 0 || !trendAnalysis) {
            return null;
        }

        return {
            summary,
            recommendations: normalizedRecommendations.slice(0, 6),
            trend_analysis: trendAnalysis,
            key_numbers,
        };
    }

    buildFallbackInsight(monthlyStats) {
        const {
            month,
            total_income,
            total_expense,
            balance,
            expenseToIncomeRatio,
            savingRate,
            topExpenseCategories,
            firstHalfExpense,
            secondHalfExpense,
        } = monthlyStats;

        const incomeText = this.formatRupiah(total_income);
        const expenseText = this.formatRupiah(total_expense);
        const balanceText = this.formatRupiah(balance);
        const firstHalfText = this.formatRupiah(firstHalfExpense);
        const secondHalfText = this.formatRupiah(secondHalfExpense);
        const ratioText = this.formatPercentage(expenseToIncomeRatio);
        const savingRateText = this.formatPercentage(savingRate);
        const topCategory = topExpenseCategories[0];

        const recommendations = [];

        if (total_income > 0 && total_expense > total_income * 0.8) {
            recommendations.push(
                `<strong>Kurangi pengeluaran variabel</strong> minimal <u>15%</u> selama <u>30 hari</u> agar rasio pengeluaran turun dari <strong>${ratioText}</strong>.`
            );
        } else {
            recommendations.push(
                `<strong>Pertahankan tabungan otomatis</strong> minimal <u>20%</u> dari pemasukan bulanan untuk menjaga saving rate di atas <strong>${savingRateText}</strong>.`
            );
        }

        recommendations.push(
            `<strong>Terapkan batas belanja mingguan</strong> dan lakukan evaluasi realisasi setiap akhir pekan agar risiko <em>overbudget</em> menurun.`
        );

        if (topCategory) {
            recommendations.push(
                `<strong>Prioritaskan efisiensi kategori ${topCategory.category}</strong> karena porsinya paling besar (${this.formatRupiah(
                    topCategory.amount
                )}). Targetkan penghematan bertahap <u>10%-15%</u> di kategori ini.`
            );
        }

        recommendations.push(
            balance >= 0
                ? `<strong>Alokasikan minimal 40%</strong> dari surplus (${balanceText}) ke dana darurat atau instrumen berisiko rendah.`
                : `<strong>Lakukan recovery arus kas</strong> dengan target menutup defisit ${this.formatRupiah(
                      Math.abs(balance)
                  )} dalam <u>1 bulan</u> berikutnya.`
        );

        const summary =
            balance >= 0
                ? `<p>Pada <strong>${month}</strong>, kondisi keuangan kamu <strong>positif</strong>.</p><p>Total pemasukan <strong>${incomeText}</strong>, total pengeluaran <strong>${expenseText}</strong>, sehingga saldo akhir <strong>${balanceText}</strong>.</p><p>Rasio pengeluaran terhadap pemasukan berada di <strong>${ratioText}</strong> dengan saving rate <strong>${savingRateText}</strong>.</p>`
                : `<p>Pada <strong>${month}</strong>, kondisi keuangan kamu sedang <strong>tertekan</strong>.</p><p>Total pemasukan <strong>${incomeText}</strong>, total pengeluaran <strong>${expenseText}</strong>, dan terjadi defisit <strong>${this.formatRupiah(
                      Math.abs(balance)
                  )}</strong>.</p><p>Rasio pengeluaran mencapai <strong>${ratioText}</strong>, menandakan kebutuhan kontrol biaya yang lebih ketat.</p>`;

        const trend_analysis =
            balance >= 0
                ? `<p>Pengeluaran paruh awal tercatat <strong>${firstHalfText}</strong> dan paruh akhir <strong>${secondHalfText}</strong>.</p><p>Tren masih sehat, namun disiplin eksekusi anggaran tetap diperlukan agar surplus konsisten di bulan berikutnya.</p>`
                : `<p>Pengeluaran paruh awal tercatat <strong>${firstHalfText}</strong> dan paruh akhir <strong>${secondHalfText}</strong>.</p><p>Tren menunjukkan tekanan arus kas, sehingga prioritas utama adalah memangkas pengeluaran variabel dan meningkatkan porsi tabungan.</p>`;

        return {
            summary,
            recommendations,
            trend_analysis,
        };
    }

    buildDeepInsightPrompt(monthlyStats, frontendFinancialData = null) {
        const topCategoriesText =
            monthlyStats.topExpenseCategories.length > 0
                ? monthlyStats.topExpenseCategories
                      .map(
                          (item, index) =>
                              `${index + 1}. ${item.category}: ${this.formatRupiah(item.amount)}`
                      )
                      .join('\n')
                : 'Tidak ada kategori pengeluaran tercatat.';

        const weeklyExpenseText = monthlyStats.weeklyExpense
            .map((amount, index) => `- Minggu ${index + 1}: ${this.formatRupiah(amount)}`)
            .join('\n');

        const maxExpenseText = monthlyStats.maxExpenseTx
            ? `${this.formatRupiah(monthlyStats.maxExpenseTx.amount)} (${monthlyStats.maxExpenseTx.category}, ${monthlyStats.maxExpenseTx.date})`
            : '-';

        const maxIncomeText = monthlyStats.maxIncomeTx
            ? `${this.formatRupiah(monthlyStats.maxIncomeTx.amount)} (${monthlyStats.maxIncomeTx.category}, ${monthlyStats.maxIncomeTx.date})`
            : '-';

        const transactionDataText =
            monthlyStats.transactionsForAi.length > 0
                ? monthlyStats.transactionsForAi
                      .map(
                          (tx, index) =>
                              `${index + 1}. ${tx.date} | ${tx.type} | ${tx.amount_rupiah} | ${tx.category} | catatan: ${tx.note || '-'}`
                      )
                      .join('\n')
                : 'Tidak ada transaksi.';

        const dynamicContext = this.buildDynamicPromptContext(monthlyStats);
        const frontendFinancialBlock =
            this.buildFrontendFinancialPromptBlock(frontendFinancialData);

        return [
            `Data keuangan pengguna untuk ${monthlyStats.month} ${monthlyStats.year}.`,
            `- Total pemasukan: ${this.formatRupiah(monthlyStats.total_income)}`,
            `- Total pengeluaran: ${this.formatRupiah(monthlyStats.total_expense)}`,
            `- Saldo bersih: ${this.formatRupiah(monthlyStats.balance)}`,
            `- Jumlah transaksi: ${monthlyStats.transactionCount} (income: ${monthlyStats.incomeCount}, expense: ${monthlyStats.expenseCount})`,
            `- Hari berjalan bulan ini: ${monthlyStats.currentDay} dari ${monthlyStats.daysInMonth} hari`,
            `- Hari aktif transaksi: ${monthlyStats.activeDaysCount} hari`,
            `- Rata-rata pemasukan per transaksi: ${this.formatRupiah(monthlyStats.averageIncome)}`,
            `- Rata-rata pengeluaran per transaksi: ${this.formatRupiah(monthlyStats.averageExpense)}`,
            `- Rasio pengeluaran terhadap pemasukan: ${this.formatPercentage(monthlyStats.expenseToIncomeRatio)}`,
            `- Saving rate: ${this.formatPercentage(monthlyStats.savingRate)}`,
            `- Proyeksi total pengeluaran akhir bulan: ${this.formatRupiah(monthlyStats.projectedExpense)}`,
            `- Proyeksi saldo akhir bulan: ${this.formatRupiah(monthlyStats.projectedBalance)}`,
            `- Share kategori pengeluaran terbesar: ${this.formatPercentage(monthlyStats.topExpenseCategoryShare)}`,
            `- Arah tren pengeluaran terbaru: ${monthlyStats.recentExpenseTrend}`,
            `- Skor kesehatan finansial internal: ${monthlyStats.healthScore}/100 (${monthlyStats.healthStatus})`,
            `- Pengeluaran paruh awal bulan: ${this.formatRupiah(monthlyStats.firstHalfExpense)}`,
            `- Pengeluaran paruh akhir bulan: ${this.formatRupiah(monthlyStats.secondHalfExpense)}`,
            `- Transaksi pemasukan terbesar: ${maxIncomeText}`,
            `- Transaksi pengeluaran terbesar: ${maxExpenseText}`,
            '',
            'Top 3 kategori pengeluaran:',
            topCategoriesText,
            '',
            'Tren pengeluaran mingguan:',
            weeklyExpenseText,
            '',
            'Data transaksi mentah (gunakan ini untuk hitung dan validasi angka final):',
            transactionDataText,
            '',
            ...frontendFinancialBlock,
            '',
            'Temuan prioritas berbasis data (wajib kamu tanggapi):',
            ...dynamicContext.findings.map((item, index) => `${index + 1}. ${item}`),
            '',
            'Arah kritik dan saran (wajib diikuti):',
            ...dynamicContext.directives.map((item, index) => `${index + 1}. ${item}`),
            '',
            'Instruksi:',
            '1) Buat analisis mendalam, jelas, dan mudah dipahami untuk pengguna non-teknis.',
            '2) Wajib gunakan format Rupiah (contoh: Rp1.250.000) untuk SEMUA nominal uang.',
            '3) Dilarang menyebut mata uang lain seperti USD, dollar, euro, yen, atau symbol non-rupiah.',
            '4) Berikan saran yang sangat konkret, bisa dieksekusi, dan sertakan target angka/persentase serta rentang waktu.',
            '5) Fokus pada kualitas arus kas, efisiensi pengeluaran, prioritas perbaikan, dan proyeksi bulan depan.',
            '6) Gunakan format HTML sederhana agar mudah ditampilkan di UI.',
            '7) Tag yang diizinkan hanya: <p>, <strong>, <b>, <u>, <em>, <i>, <br>, <ul>, <ol>, <li>.',
            '8) Jangan gunakan tag/atribut lain (tidak boleh script, style, class, id, onclick, href, src).',
            '9) Hitung sendiri angka-angka utama dari data mentah, lalu tulis angka final secara eksplisit.',
            '10) Di setiap rekomendasi WAJIB ada target angka yang jelas (Rp, %, atau jumlah hari/minggu).',
            '11) Berikan kritik rasional: jelaskan masalah inti, akar penyebab, dampak 30 hari, dan tindakan korektif.',
            '12) Prioritaskan perbaikan berdampak tertinggi (prinsip 80/20), maksimal 3 fokus utama.',
            '13) Setiap item recommendations harus berformat: <strong>Aksi</strong> | target | tenggat | dampak.',
            '',
            'Balas HANYA dengan JSON valid tanpa markdown, format persis:',
            '{',
            '  "summary": "HTML string minimal 4-6 kalimat, gunakan <p> dan <strong> untuk highlight utama",',
            '  "recommendations": ["HTML string saran 1", "HTML string saran 2", "HTML string saran 3", "HTML string saran 4"],',
            '  "trend_analysis": "HTML string minimal 3-4 kalimat tentang arah tren, risiko utama, dan prioritas tindak lanjut",',
            '  "key_numbers": [',
            '    {"label":"string", "value":"string", "insight":"string"},',
            '    {"label":"string", "value":"string", "insight":"string"},',
            '    {"label":"string", "value":"string", "insight":"string"}',
            '  ]',
            '}',
        ].join('\n');
    }

    buildCompactInsightPrompt(monthlyStats, frontendFinancialData = null) {
        const dynamicContext = this.buildDynamicPromptContext(monthlyStats);
        const frontendFinancialBlock =
            this.buildFrontendFinancialPromptBlock(frontendFinancialData);

        return [
            `Buat analisis keuangan bulanan untuk ${monthlyStats.month} ${monthlyStats.year}.`,
            `Pemasukan: ${this.formatRupiah(monthlyStats.total_income)}.`,
            `Pengeluaran: ${this.formatRupiah(monthlyStats.total_expense)}.`,
            `Saldo: ${this.formatRupiah(monthlyStats.balance)}.`,
            `Rasio pengeluaran/pemasukan: ${this.formatPercentage(monthlyStats.expenseToIncomeRatio)}.`,
            `Saving rate: ${this.formatPercentage(monthlyStats.savingRate)}.`,
            `Proyeksi saldo akhir bulan: ${this.formatRupiah(monthlyStats.projectedBalance)}.`,
            `Kategori pengeluaran terbesar: ${this.formatPercentage(monthlyStats.topExpenseCategoryShare)} dari total expense.`,
            `Status kesehatan finansial: ${monthlyStats.healthStatus} (${monthlyStats.healthScore}/100).`,
            `Total transaksi: ${monthlyStats.transactionCount}.`,
            '',
            'Fokus masalah prioritas:',
            ...dynamicContext.findings.map((item, index) => `${index + 1}. ${item}`),
            '',
            ...frontendFinancialBlock,
            '',
            'Ketentuan jawaban:',
            '- Gunakan Bahasa Indonesia.',
            '- Semua nominal pakai Rupiah.',
            '- Gunakan HTML sederhana: <p>, <strong>, <u>, <em>, <br>, <ul>, <li>.',
            '- Rekomendasi harus spesifik, ada target angka dan waktu.',
            '- Berikan kritik rasional berdasarkan data, bukan saran umum.',
            '- Setiap rekomendasi format: Aksi | target | tenggat | dampak.',
            '',
            'Balas JSON valid tanpa markdown:',
            '{',
            '  "summary": "HTML string",',
            '  "recommendations": ["HTML string", "HTML string", "HTML string"],',
            '  "trend_analysis": "HTML string",',
            '  "key_numbers": [',
            '    {"label":"string", "value":"string", "insight":"string"},',
            '    {"label":"string", "value":"string", "insight":"string"}',
            '  ]',
            '}',
        ].join('\n');
    }

    normalizeFinancialPayload(rawPayload) {
        if (!rawPayload || typeof rawPayload !== 'object') {
            return null;
        }

        const payload = rawPayload;
        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const toString = (value, fallback = '-') =>
            typeof value === 'string' && value.trim().length > 0
                ? value.trim()
                : fallback;
        const toObject = (value) =>
            value && typeof value === 'object' ? value : {};

        const summary = toObject(payload.summary);
        const chart = toObject(payload.chart);
        const transactions = toObject(payload.transactions);
        const insights = toObject(payload.insights);
        const period = toObject(payload.period);
        const daily = toObject(payload.daily);
        const weekly = toObject(payload.weekly);
        const monthly = toObject(payload.monthly);

        const chartPointsRaw = Array.isArray(chart.points) ? chart.points : [];
        const chartPoints = chartPointsRaw
            .slice(-20)
            .map((point) => {
                const item = toObject(point);
                return {
                    date: toString(item.date),
                    income: toNumber(item.income),
                    expense: toNumber(item.expense),
                    net: toNumber(item.net),
                };
            });

        const txItemsRaw = Array.isArray(transactions.items)
            ? transactions.items
            : [];
        const txItems = txItemsRaw
            .slice(-80)
            .map((tx) => {
                const item = toObject(tx);
                return {
                    id: toNumber(item.id),
                    date: toString(item.date),
                    category: toString(item.category, 'Lainnya'),
                    type: item.type === 'income' ? 'income' : 'expense',
                    amount: toNumber(item.amount),
                    note: toString(item.note, '-').slice(0, 80),
                };
            });

        const dailyPointsRaw = Array.isArray(daily.points) ? daily.points : [];
        const dailyPoints = dailyPointsRaw
            .slice(-45)
            .map((point) => {
                const item = toObject(point);
                return {
                    date: toString(item.date),
                    income: toNumber(item.income),
                    expense: toNumber(item.expense),
                    net: toNumber(item.net),
                    transaction_count: toNumber(item.transaction_count),
                };
            });

        const weeklyPointsRaw = Array.isArray(weekly.points) ? weekly.points : [];
        const weeklyPoints = weeklyPointsRaw
            .slice(-12)
            .map((point) => {
                const item = toObject(point);
                return {
                    week_label: toString(item.week_label),
                    start_date: toString(item.start_date),
                    end_date: toString(item.end_date),
                    income: toNumber(item.income),
                    expense: toNumber(item.expense),
                    net: toNumber(item.net),
                    transaction_count: toNumber(item.transaction_count),
                };
            });

        const monthlyPointsRaw = Array.isArray(monthly.points) ? monthly.points : [];
        const monthlyPoints = monthlyPointsRaw
            .slice(-12)
            .map((point) => {
                const item = toObject(point);
                return {
                    month: toString(item.month),
                    income: toNumber(item.income),
                    expense: toNumber(item.expense),
                    net: toNumber(item.net),
                    transaction_count: toNumber(item.transaction_count),
                };
            });

        return {
            generated_at: toString(payload.generated_at),
            source: toString(payload.source),
            period: {
                reference_month: toString(period.reference_month, ''),
                start_date: toString(period.start_date, ''),
                end_date: toString(period.end_date, ''),
            },
            summary: {
                balance: toNumber(summary.balance),
                income: toNumber(summary.income),
                expense: toNumber(summary.expense),
                saving: toNumber(summary.saving),
                remaining_money: toNumber(summary.remaining_money),
                expense_ratio_percent: toNumber(summary.expense_ratio_percent),
            },
            chart: {
                total_points: toNumber(chart.total_points),
                total_income: toNumber(chart.total_income),
                total_expense: toNumber(chart.total_expense),
                net_flow: toNumber(chart.net_flow),
                peak_income: toNumber(chart.peak_income),
                peak_expense: toNumber(chart.peak_expense),
                points: chartPoints,
            },
            transactions: {
                total_count: toNumber(transactions.total_count),
                income_count: toNumber(transactions.income_count),
                expense_count: toNumber(transactions.expense_count),
                total_amount: toNumber(transactions.total_amount),
                average_amount: toNumber(transactions.average_amount),
                items: txItems,
            },
            insights: {
                recommended_saving: toNumber(insights.recommended_saving),
                saving_gap: toNumber(insights.saving_gap),
                saving_status:
                    insights.saving_status === 'good' ? 'good' : 'warning',
            },
            daily: {
                total_points: toNumber(daily.total_points),
                total_income: toNumber(daily.total_income),
                total_expense: toNumber(daily.total_expense),
                net_flow: toNumber(daily.net_flow),
                points: dailyPoints,
            },
            weekly: {
                total_points: toNumber(weekly.total_points),
                total_income: toNumber(weekly.total_income),
                total_expense: toNumber(weekly.total_expense),
                net_flow: toNumber(weekly.net_flow),
                points: weeklyPoints,
            },
            monthly: {
                total_points: toNumber(monthly.total_points),
                total_income: toNumber(monthly.total_income),
                total_expense: toNumber(monthly.total_expense),
                net_flow: toNumber(monthly.net_flow),
                points: monthlyPoints,
            },
        };
    }

    buildFrontendFinancialPromptBlock(frontendFinancialData) {
        if (!frontendFinancialData) {
            return ['Data data_keuangan dari FE: tidak tersedia.'];
        }

        const summary = frontendFinancialData.summary || {};
        const chart = frontendFinancialData.chart || {};
        const transactions = frontendFinancialData.transactions || {};
        const insights = frontendFinancialData.insights || {};
        const period = frontendFinancialData.period || {};
        const daily = frontendFinancialData.daily || {};
        const weekly = frontendFinancialData.weekly || {};
        const monthly = frontendFinancialData.monthly || {};
        const payloadStatus = frontendFinancialData.payload_status || 'unknown';
        const backendGap = frontendFinancialData.backend_gap || null;

        const txItems = Array.isArray(transactions.items)
            ? transactions.items
            : [];
        const dailyPoints = Array.isArray(daily.points) ? daily.points : [];
        const weeklyPoints = Array.isArray(weekly.points) ? weekly.points : [];
        const monthlyPoints = Array.isArray(monthly.points) ? monthly.points : [];

        const expenseByCategory = {};
        for (const tx of txItems) {
            if (tx.type !== 'expense') continue;
            const key = tx.category || 'Lainnya';
            expenseByCategory[key] = (expenseByCategory[key] || 0) + (Number(tx.amount) || 0);
        }

        const topExpenseCategories = Object.entries(expenseByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, amount], index) => `${index + 1}. ${name}: ${this.formatRupiah(amount)}`)
            .join('\n');

        const txSample = txItems
            .slice(-8)
            .map(
                (tx, index) =>
                    `${index + 1}. ${tx.date} | ${tx.type} | ${this.formatRupiah(tx.amount)} | ${tx.category} | ${tx.note || '-'}`
            )
            .join('\n');

        const dailySample = dailyPoints
            .slice(-7)
            .map(
                (item, index) =>
                    `${index + 1}. ${item.date} | in ${this.formatRupiah(item.income)} | out ${this.formatRupiah(item.expense)} | net ${this.formatRupiah(item.net)} | tx ${item.transaction_count}`
            )
            .join('\n');

        const weeklySample = weeklyPoints
            .slice(-4)
            .map(
                (item, index) =>
                    `${index + 1}. ${item.week_label} (${item.start_date} s/d ${item.end_date}) | in ${this.formatRupiah(item.income)} | out ${this.formatRupiah(item.expense)} | net ${this.formatRupiah(item.net)} | tx ${item.transaction_count}`
            )
            .join('\n');

        const monthlySample = monthlyPoints
            .slice(-4)
            .map(
                (item, index) =>
                    `${index + 1}. ${item.month} | in ${this.formatRupiah(item.income)} | out ${this.formatRupiah(item.expense)} | net ${this.formatRupiah(item.net)} | tx ${item.transaction_count}`
            )
            .join('\n');

        const maxWeeklyExpense = weeklyPoints.length
            ? [...weeklyPoints].sort((a, b) => b.expense - a.expense)[0]
            : null;
        const maxMonthlyExpense = monthlyPoints.length
            ? [...monthlyPoints].sort((a, b) => b.expense - a.expense)[0]
            : null;

        return [
            'Data data_keuangan dari FE (prioritaskan ini untuk kesimpulan jika ada selisih dengan data backend):',
            `- Source FE: ${frontendFinancialData.source}`,
            `- Generated at FE: ${frontendFinancialData.generated_at}`,
            `- FE Period -> reference month: ${period.reference_month || '-'}, range: ${period.start_date || '-'} s/d ${period.end_date || '-'}`,
            `- FE Payload Status: ${payloadStatus}`,
            `- FE Summary -> income: ${this.formatRupiah(summary.income)}, expense: ${this.formatRupiah(summary.expense)}, balance: ${this.formatRupiah(summary.balance)}, saving: ${this.formatRupiah(summary.saving)}, expense ratio: ${this.formatPercentage(summary.expense_ratio_percent)}`,
            backendGap
                ? `- FE vs Backend Gap -> income: ${this.formatRupiah(backendGap.income_gap)} (${this.formatPercentage(backendGap.income_gap_percent)}), expense: ${this.formatRupiah(backendGap.expense_gap)} (${this.formatPercentage(backendGap.expense_gap_percent)}), balance: ${this.formatRupiah(backendGap.balance_gap)}`
                : '- FE vs Backend Gap: N/A',
            `- FE Chart -> total income: ${this.formatRupiah(chart.total_income)}, total expense: ${this.formatRupiah(chart.total_expense)}, net flow: ${this.formatRupiah(chart.net_flow)}, peak income: ${this.formatRupiah(chart.peak_income)}, peak expense: ${this.formatRupiah(chart.peak_expense)}`,
            `- FE Transactions -> total: ${transactions.total_count}, income count: ${transactions.income_count}, expense count: ${transactions.expense_count}, avg amount: ${this.formatRupiah(transactions.average_amount)}`,
            `- FE Insights -> recommended saving: ${this.formatRupiah(insights.recommended_saving)}, saving gap: ${this.formatRupiah(insights.saving_gap)}, status: ${insights.saving_status}`,
            `- FE Daily -> points: ${daily.total_points || dailyPoints.length}, total income: ${this.formatRupiah(daily.total_income)}, total expense: ${this.formatRupiah(daily.total_expense)}, net flow: ${this.formatRupiah(daily.net_flow)}`,
            `- FE Weekly -> points: ${weekly.total_points || weeklyPoints.length}, total income: ${this.formatRupiah(weekly.total_income)}, total expense: ${this.formatRupiah(weekly.total_expense)}, net flow: ${this.formatRupiah(weekly.net_flow)}`,
            `- FE Monthly -> points: ${monthly.total_points || monthlyPoints.length}, total income: ${this.formatRupiah(monthly.total_income)}, total expense: ${this.formatRupiah(monthly.total_expense)}, net flow: ${this.formatRupiah(monthly.net_flow)}`,
            `- Puncak pengeluaran mingguan FE: ${maxWeeklyExpense ? `${maxWeeklyExpense.week_label} (${this.formatRupiah(maxWeeklyExpense.expense)})` : '-'}`,
            `- Puncak pengeluaran bulanan FE: ${maxMonthlyExpense ? `${maxMonthlyExpense.month} (${this.formatRupiah(maxMonthlyExpense.expense)})` : '-'}`,
            'Top kategori pengeluaran versi FE:',
            topExpenseCategories || 'Tidak ada.',
            '',
            'Sampel transaksi FE terbaru:',
            txSample || 'Tidak ada.',
            '',
            'Ringkasan harian FE (7 data terbaru):',
            dailySample || 'Tidak ada.',
            '',
            'Ringkasan mingguan FE:',
            weeklySample || 'Tidak ada.',
            '',
            'Ringkasan bulanan FE:',
            monthlySample || 'Tidak ada.',
        ];
    }

    buildDynamicPromptContext(monthlyStats) {
        const findings = [];
        const directives = [];

        if (monthlyStats.balance < 0) {
            findings.push(
                `Defisit arus kas sebesar ${this.formatRupiah(Math.abs(monthlyStats.balance))}.`
            );
            directives.push(
                'Kritik utama harus menyorot pola belanja yang membuat defisit dan langkah pemulihan paling realistis dalam 30 hari.'
            );
        } else {
            findings.push(
                `Surplus kas saat ini ${this.formatRupiah(monthlyStats.balance)}.`
            );
            directives.push(
                'Evaluasi apakah surplus ini berkelanjutan atau hanya efek sementara dari pola pemasukan musiman.'
            );
        }

        if (
            monthlyStats.expenseToIncomeRatio !== null &&
            monthlyStats.expenseToIncomeRatio >= 90
        ) {
            findings.push(
                `Rasio pengeluaran terhadap pemasukan sangat tinggi (${this.formatPercentage(monthlyStats.expenseToIncomeRatio)}).`
            );
            directives.push(
                'Wajib berikan strategi pengurangan pengeluaran variabel dengan target minimal 10%-20% dalam 4 minggu.'
            );
        }

        if (
            monthlyStats.topExpenseCategoryShare !== null &&
            monthlyStats.topExpenseCategoryShare >= 40 &&
            monthlyStats.topExpenseCategories[0]
        ) {
            findings.push(
                `Pengeluaran terkonsentrasi di kategori ${monthlyStats.topExpenseCategories[0].category} sebesar ${this.formatPercentage(monthlyStats.topExpenseCategoryShare)} dari total expense.`
            );
            directives.push(
                `Saran harus memprioritaskan efisiensi kategori ${monthlyStats.topExpenseCategories[0].category} karena dampaknya paling besar.`
            );
        }

        if (monthlyStats.recentExpenseTrend === 'naik') {
            findings.push('Tren pengeluaran mingguan terbaru menunjukkan kenaikan.');
            directives.push(
                'Jelaskan pemicu kenaikan terbaru dan pasang kontrol batas mingguan untuk menahan tren naik.'
            );
        }

        if (monthlyStats.projectedBalance < 0) {
            findings.push(
                `Proyeksi saldo akhir bulan berisiko negatif (${this.formatRupiah(monthlyStats.projectedBalance)}).`
            );
            directives.push(
                'Sertakan rencana mitigasi cepat dengan prioritas mingguan agar proyeksi saldo kembali positif.'
            );
        }

        if (findings.length === 0) {
            findings.push('Kondisi relatif stabil namun tetap perlu optimasi efisiensi.');
        }

        if (directives.length === 0) {
            directives.push(
                'Fokus pada peningkatan kualitas tabungan dan disiplin alokasi cashflow.'
            );
        }

        return {
            findings,
            directives,
        };
    }

    calculateHealthScore({
        balance,
        expenseToIncomeRatio,
        savingRate,
        projectedBalance,
    }) {
        let score = 70;

        if (balance < 0) score -= 25;
        if (projectedBalance < 0) score -= 20;

        if (expenseToIncomeRatio !== null) {
            if (expenseToIncomeRatio > 100) score -= 25;
            else if (expenseToIncomeRatio > 90) score -= 18;
            else if (expenseToIncomeRatio > 80) score -= 12;
            else if (expenseToIncomeRatio < 60) score += 8;
        }

        if (savingRate !== null) {
            if (savingRate >= 20) score += 12;
            else if (savingRate >= 10) score += 6;
            else if (savingRate < 0) score -= 10;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    buildFallbackKeyNumbers(monthlyStats) {
        const ratio = this.formatPercentage(monthlyStats.expenseToIncomeRatio);
        const savingRate = this.formatPercentage(monthlyStats.savingRate);

        return [
            {
                label: 'Total Pemasukan',
                value: this.formatRupiah(monthlyStats.total_income),
                insight: 'menjadi basis kapasitas belanja dan tabungan',
            },
            {
                label: 'Total Pengeluaran',
                value: this.formatRupiah(monthlyStats.total_expense),
                insight: `rasio terhadap pemasukan saat ini ${ratio}`,
            },
            {
                label: 'Saldo Bersih',
                value: this.formatRupiah(monthlyStats.balance),
                insight:
                    monthlyStats.balance >= 0
                        ? `saving rate ${savingRate}`
                        : 'arus kas negatif, perlu koreksi pengeluaran',
            },
        ];
    }

    normalizeCurrencyToRupiah(text) {
        return String(text || '')
            .replace(/\b(usd|dollar|dolar|eur|euro|sgd|myr|jpy|yen|gbp|pound)\b/gi, 'rupiah')
            .replace(/[$€£¥]/g, 'Rp ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    sanitizeAndNormalizeHtml(text) {
        let value = this.normalizeCurrencyToRupiah(text);

        // Remove high-risk tags and their contents first.
        value = value
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
            .replace(/<object[\s\S]*?<\/object>/gi, '')
            .replace(/<embed[\s\S]*?>/gi, '');

        // Remove inline event handlers and javascript: payloads.
        value = value
            .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
            .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
            .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '');

        // Keep only allowed tags and strip attributes.
        value = value
            .replace(/<(strong|b|u|em|i|p|ul|ol|li)\b[^>]*>/gi, '<$1>')
            .replace(/<br\b[^>]*>/gi, '<br>')
            .replace(/<(?!\/?(strong|b|u|em|i|p|br|ul|ol|li)\b)[^>]*>/gi, '');

        return value.trim();
    }

    stripHtml(text) {
        return String(text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    appendKeyNumbersToSummary(summaryHtml, keyNumbers) {
        const safeSummary = this.sanitizeAndNormalizeHtml(summaryHtml);
        if (!Array.isArray(keyNumbers) || keyNumbers.length === 0) {
            return safeSummary;
        }

        const safeItems = keyNumbers
            .map((item) => {
                const label = this.sanitizeAndNormalizeHtml(item.label || '');
                const value = this.sanitizeAndNormalizeHtml(item.value || '');
                const insight = this.sanitizeAndNormalizeHtml(item.insight || '');

                if (!label || !value) {
                    return '';
                }

                return `<li><strong>${label}:</strong> ${value}${insight ? ` <em>(${insight})</em>` : ''}</li>`;
            })
            .filter(Boolean)
            .join('');

        if (!safeItems) {
            return safeSummary;
        }

        return `${safeSummary}<p><strong>Angka Kunci Dari AI</strong></p><ul>${safeItems}</ul>`;
    }

    formatRupiah(value) {
        const numeric = Number(value) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
        }).format(Math.round(numeric));
    }

    formatPercentage(value) {
        if (value === null || value === undefined) {
            return 'N/A';
        }

        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
            return 'N/A';
        }

        return `${numeric.toFixed(1)}%`;
    }

}

module.exports = new MonthlySummaryService();
