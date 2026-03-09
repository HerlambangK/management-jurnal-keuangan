const { Op } = require('sequelize');
const { Transaction, User, Category } = require('../../../models');
const NotFound = require('../../errors/NotFoundError');
const BadRequestError = require('../../errors/BadRequestError');

class TransactionService {
    toNumber(value) {
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : 0;
        }

        if (typeof value !== "string") return 0;

        let cleaned = value.trim().replace(/[^\d,.-]/g, "");
        if (!cleaned) return 0;

        const lastComma = cleaned.lastIndexOf(",");
        const lastDot = cleaned.lastIndexOf(".");

        if (lastComma !== -1 && lastDot !== -1) {
            if (lastComma > lastDot) {
                cleaned = cleaned.replace(/\./g, "").replace(",", ".");
            } else {
                cleaned = cleaned.replace(/,/g, "");
            }
        } else if (lastComma !== -1) {
            const parts = cleaned.split(",");
            if (parts.length === 2 && parts[1].length <= 2) {
                cleaned = `${parts[0].replace(/,/g, "")}.${parts[1]}`;
            } else {
                cleaned = cleaned.replace(/,/g, "");
            }
        } else {
            const dotParts = cleaned.split(".");
            if (dotParts.length > 2) {
                cleaned = dotParts.join("");
            } else if (dotParts.length === 2 && dotParts[1].length === 3) {
                cleaned = dotParts.join("");
            }
        }

        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    toStoredAmount(value) {
        const amount = Math.round(this.toNumber(value));
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestError("Jumlah transaksi harus lebih dari 0");
        }

        return String(amount);
    }

    async sumTransactionAmountByType(whereClause, type) {
        const rows = await Transaction.findAll({
            where: {
                ...whereClause,
                type,
            },
            attributes: ["amount"],
            raw: true,
        });

        return rows.reduce((total, row) => total + this.toNumber(row.amount), 0);
    }

    buildRecentMonthKeys(referenceDate, months = 6) {
        const keys = [];
        const targetMonths = Math.max(1, months);

        for (let index = targetMonths - 1; index >= 0; index -= 1) {
            const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - index, 1);
            keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
        }

        return keys;
    }

    normalizeMonthFilter(monthValue) {
        if (typeof monthValue !== "string") return null;

        const trimmedMonth = monthValue.trim();
        if (!trimmedMonth) return null;

        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedMonth)) {
            throw new BadRequestError("Format month harus YYYY-MM");
        }

        return trimmedMonth;
    }

    getMonthBoundaryFromKey(monthKey) {
        const [yearText, monthText] = monthKey.split("-");
        const year = Number(yearText);
        const month = Number(monthText);

        return this.getMonthBoundary(new Date(year, month - 1, 1));
    }

    getMonthBoundary(dateValue) {
        const baseDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
        const year = baseDate.getFullYear();
        const monthIndex = baseDate.getMonth();

        const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
        const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
        const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

        return { start, end, month };
    }

    toValidDate(value, fieldName = "date") {
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestError(`${fieldName} tidak valid`);
        }
        return parsed;
    }

    getEndOfDay(dateValue) {
        const date = this.toValidDate(dateValue);
        return new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            23,
            59,
            59,
            999
        );
    }

    async getAccumulatedBalanceUntil(userId, dateValue, options = {}) {
        const endOfDay = this.getEndOfDay(dateValue);
        const excludeTransactionId = Number(options?.excludeTransactionId) || null;

        const baseWhere = {
            user_id: userId,
            date: {
                [Op.lte]: endOfDay,
            },
        };

        if (excludeTransactionId) {
            baseWhere.id = {
                [Op.ne]: excludeTransactionId,
            };
        }

        const [income, expense] = await Promise.all([
            this.sumTransactionAmountByType(baseWhere, "income"),
            this.sumTransactionAmountByType(baseWhere, "expense"),
        ]);
        return income - expense;
    }

    async resolveActiveMonthRange(userId, monthFilter = null) {
        const normalizedMonth = this.normalizeMonthFilter(monthFilter);
        if (normalizedMonth) {
            const selectedRange = this.getMonthBoundaryFromKey(normalizedMonth);
            return {
                ...selectedRange,
                is_fallback: false,
            };
        }

        const currentRange = this.getMonthBoundary(new Date());

        const currentMonthCount = await Transaction.count({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [currentRange.start, currentRange.end],
                },
            },
        });

        if (currentMonthCount > 0) {
            return {
                ...currentRange,
                is_fallback: false,
            };
        }

        const latestTransaction = await Transaction.findOne({
            where: { user_id: userId },
            attributes: ["date"],
            order: [["date", "DESC"]],
        });

        if (!latestTransaction?.date) {
            return {
                ...currentRange,
                is_fallback: false,
            };
        }

        const latestRange = this.getMonthBoundary(new Date(latestTransaction.date));
        return {
            ...latestRange,
            is_fallback: latestRange.month !== currentRange.month,
        };
    }

    async getAllByUser(userId, page = 1, limit = 10, search = "", monthFilter = null) {
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Number(limit) || 10);
        const offset = (safePage - 1) * safeLimit;
        const whereClause = {
            user_id: userId
        }

        const normalizedMonth = this.normalizeMonthFilter(monthFilter);
        if (normalizedMonth) {
            const monthRange = this.getMonthBoundaryFromKey(normalizedMonth);
            whereClause.date = {
                [Op.between]: [monthRange.start, monthRange.end],
            };
        }

        const searchText = typeof search === "string" ? search.trim() : "";
        if (searchText) {
            const loweredSearch = searchText.toLowerCase();
            const searchClauses = [
                { note: { [Op.like]: `%${searchText}%` } },
                { "$category.name$": { [Op.like]: `%${searchText}%` } },
            ];

            const numericSearch = searchText.replace(/\D/g, "");
            if (numericSearch) {
                searchClauses.push({ amount: { [Op.like]: `%${numericSearch}%` } });
            }

            const typeMatches = [];
            if (
                loweredSearch.includes("income") ||
                loweredSearch.includes("masuk") ||
                loweredSearch.includes("pemasukan")
            ) {
                typeMatches.push("income");
            }
            if (
                loweredSearch.includes("expense") ||
                loweredSearch.includes("keluar") ||
                loweredSearch.includes("pengeluaran")
            ) {
                typeMatches.push("expense");
            }
            if (typeMatches.length > 0) {
                searchClauses.push({ type: { [Op.in]: typeMatches } });
            }

            if (/^\d{4}-\d{2}-\d{2}$/.test(searchText)) {
                const date = new Date(`${searchText}T00:00:00`);
                if (!Number.isNaN(date.getTime())) {
                    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
                    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
                    searchClauses.push({ date: { [Op.between]: [start, end] } });
                }
            }

            whereClause[Op.or] = searchClauses;
        }

        const { count, rows } = await Transaction.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    required: false
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    required: false
                }
            ],
            order: [["date", "DESC"]],
            limit: safeLimit,
            offset,
            distinct: true,
            subQuery: false,
        })

        return {
            data: rows,
            pagination: {
                total: count,
                page: safePage,
                limit: safeLimit,
                totalPage: Math.ceil(count / safeLimit)
            }
        }
    }

    async getById(id){
        const transaction = await Transaction.findOne({
            where: {id},
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    required: false
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    required: false
                }
            ],
        });

        if(!transaction) throw new NotFound("Data Transaksi tidak ditemukan!")
        return transaction
    }

    async create(data) {
        const payload = {
            ...data,
            amount: this.toStoredAmount(data?.amount),
        };
        const txType = payload.type === "income" ? "income" : "expense";
        const txAmount = this.toNumber(payload.amount);
        const txDate = this.toValidDate(data?.date);

        if (txType === "expense") {
            const accumulatedBalance = await this.getAccumulatedBalanceUntil(
                data.user_id,
                txDate
            );

            if (accumulatedBalance < txAmount) {
                throw new BadRequestError(
                    "Saldo akumulasi tidak mencukupi untuk pengeluaran ini"
                );
            }
        }

        return await Transaction.create(payload);
    }

    async update(id, data) {
        const transaction = await Transaction.findByPk(id);
        if(!transaction) throw new NotFound("Transaksi Tidak ditemukan");

        const sanitizedData = { ...data };
        if (Object.prototype.hasOwnProperty.call(data, "amount")) {
            sanitizedData.amount = this.toStoredAmount(data.amount);
        }

        const effectiveType =
            data?.type === "income" || data?.type === "expense"
                ? data.type
                : transaction.type;
        const effectiveAmount = this.toNumber(
            sanitizedData?.amount !== undefined ? sanitizedData.amount : transaction.amount
        );
        const effectiveDate = this.toValidDate(
            data?.date !== undefined ? data.date : transaction.date
        );

        if (effectiveType === "expense") {
            const accumulatedBalance = await this.getAccumulatedBalanceUntil(
                transaction.user_id,
                effectiveDate,
                { excludeTransactionId: transaction.id }
            );

            if (accumulatedBalance < effectiveAmount) {
                throw new BadRequestError(
                    "Saldo akumulasi tidak mencukupi untuk pengeluaran ini"
                );
            }
        }
        return await transaction.update(sanitizedData);
    }

    async delete(id) {
        const transaction = await Transaction.findByPk(id);
        if(!transaction) throw new NotFound("Transaksi Tidak ditemukan");
        await transaction.destroy();
        return true
    }

    async getMonthlySummary(userId, monthFilter = null) {
        const activeRange = await this.resolveActiveMonthRange(userId, monthFilter);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [activeRange.start, activeRange.end]
                }
            }
        });

        let totalIncome = 0;
        let totalExpense = 0;

        for (const tx of transactions){
            const amount = this.toNumber(tx.amount);

            if(tx.type === "income") totalIncome += amount;
            if(tx.type === "expense") totalExpense += amount
        }

        const balance = totalIncome - totalExpense;
        const saving = Math.floor(
            Math.max(0, totalIncome - totalExpense) * 0.3 + totalIncome * 0.05
        );
        
        return {
            income: totalIncome,
            expense: totalExpense,
            balance,
            saving,
            period_month: activeRange.month,
            period_start: activeRange.start,
            period_end: activeRange.end,
            is_fallback: activeRange.is_fallback,
        };
    }

    async getMonthlyChart(userId, monthFilter = null) {
        const activeRange = await this.resolveActiveMonthRange(userId, monthFilter);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [activeRange.start, activeRange.end]
                }
            }
        });

        const daysInMonth = activeRange.end.getDate();
        const chartData = [];

        for (let day = 1; day <= daysInMonth; day++) {
            chartData.push({
                date: `${activeRange.month}-${String(day).padStart(2, "0")}`,
                income: 0,
                expense: 0,
            });
        }

        for (const tx of transactions){
            const date = new Date(tx.date);
            const day = date.getDate();
            const amount = this.toNumber(tx.amount);

            if(chartData[day - 1]) {
                if(tx.type === "income") chartData[day - 1].income += amount;
                if(tx.type === "expense") chartData[day - 1].expense += amount
            }
        }

        return chartData;
    }

    async getFinancialOverview(userId, monthFilter = null) {
        const activeRange = await this.resolveActiveMonthRange(userId, monthFilter);

        const monthlyTransactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [activeRange.start, activeRange.end],
                },
            },
            attributes: ["type", "amount"],
            raw: true,
        });

        let monthlyIncome = 0;
        let monthlyExpense = 0;
        let incomeTransactionCount = 0;
        let expenseTransactionCount = 0;

        for (const transaction of monthlyTransactions) {
            const amount = this.toNumber(transaction.amount);
            if (transaction.type === "income") {
                monthlyIncome += amount;
                incomeTransactionCount += 1;
            } else if (transaction.type === "expense") {
                monthlyExpense += amount;
                expenseTransactionCount += 1;
            }
        }

        const baseAccumulatedWhere = {
            user_id: userId,
            date: {
                [Op.lte]: activeRange.end,
            },
        };

        const [accumulatedIncome, accumulatedExpense] = await Promise.all([
            this.sumTransactionAmountByType(baseAccumulatedWhere, "income"),
            this.sumTransactionAmountByType(baseAccumulatedWhere, "expense"),
        ]);
        const closingBalance = accumulatedIncome - accumulatedExpense;
        const monthlyBalance = monthlyIncome - monthlyExpense;
        const openingBalance = closingBalance - monthlyBalance;
        const ledger = {
            opening_balance: openingBalance,
            debit: monthlyIncome,
            credit: monthlyExpense,
            net_change: monthlyBalance,
            closing_balance: closingBalance,
        };

        const trendStart = new Date(activeRange.start.getFullYear(), activeRange.start.getMonth() - 5, 1, 0, 0, 0, 0);
        const incomeRows = await Transaction.findAll({
            where: {
                user_id: userId,
                type: "income",
                date: {
                    [Op.between]: [trendStart, activeRange.end],
                },
            },
            attributes: ["date", "amount"],
            raw: true,
        });

        const monthKeys = this.buildRecentMonthKeys(activeRange.start, 6);
        const incomeMap = monthKeys.reduce((acc, monthKey) => {
            acc[monthKey] = 0;
            return acc;
        }, {});

        for (const row of incomeRows) {
            const txDate = new Date(row.date);
            if (Number.isNaN(txDate.getTime())) continue;
            const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, "0")}`;
            if (Object.prototype.hasOwnProperty.call(incomeMap, monthKey)) {
                incomeMap[monthKey] += this.toNumber(row.amount);
            }
        }

        return {
            period_month: activeRange.month,
            period_start: activeRange.start,
            period_end: activeRange.end,
            is_fallback: activeRange.is_fallback,
            monthly_income: monthlyIncome,
            monthly_expense: monthlyExpense,
            monthly_debit: monthlyIncome,
            monthly_credit: monthlyExpense,
            monthly_balance: monthlyBalance,
            opening_balance: openingBalance,
            closing_balance: closingBalance,
            ledger,
            monthly_transaction_count: monthlyTransactions.length,
            income_transaction_count: incomeTransactionCount,
            expense_transaction_count: expenseTransactionCount,
            income_trend: monthKeys.map((monthKey) => ({
                month: monthKey,
                income: incomeMap[monthKey] || 0,
            })),
        };
    }

    async getTodayTransactions(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                date: {
                    [Op.between]: [today, endOfDay]
                }
            },
            order: [["date", "DESC"]],
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    required: false
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    required: false
                }
            ],
        });

        return transactions;
    }

    async getTodayExpenseStats(userId){
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await Transaction.findAll({
            where: {
                user_id: userId,
                type: "expense",
                date: {
                    [Op.between]: [today, endOfDay]
                }
            },
            order: [["date", "DESC"]],
        });

        const total = transactions.reduce((sum, tx) => sum + this.toNumber(tx.amount), 0);

        return {
            total_expense: total,
            count: transactions.length
        }
    }
}

module.exports = new TransactionService();
