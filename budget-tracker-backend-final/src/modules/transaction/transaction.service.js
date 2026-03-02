const { Op } = require('sequelize');
const { Transaction, User, Category } = require('../../../models');
const NotFound = require('../../errors/NotFoundError');
const BadRequestError = require('../../errors/BadRequestError');

class TransactionService {
    toNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
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

        const [incomeRaw, expenseRaw] = await Promise.all([
            Transaction.sum("amount", {
                where: {
                    ...baseWhere,
                    type: "income",
                },
            }),
            Transaction.sum("amount", {
                where: {
                    ...baseWhere,
                    type: "expense",
                },
            }),
        ]);

        const income = this.toNumber(incomeRaw);
        const expense = this.toNumber(expenseRaw);
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
        const offset = (page - 1) * limit;
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

        if(search){
            whereClause[Op.or] = [
                {note: { [Op.like]: `%${search}%`}},
                {desc: { [Op.like]: `%${search}%`}},
            ]
        }

        const { count, rows } = await Transaction.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: Category,
                    attributes: ["name", "description"],
                    as: "category",
                    require: false
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false
                }
            ],
            order: [["date", "DESC"]],
            limit,
            offset,
            distinct: true,
        })

        return {
            data: rows,
            pagination: {
                total: count,
                page,
                limit,
                totalPage: Math.ceil(count / limit)
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
                    require: false
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false
                }
            ],
        });

        if(!transaction) throw new NotFound("Data Transaksi tidak ditemukan!")
        return transaction
    }

    async create(data) {
        const txType = data?.type === "income" ? "income" : "expense";
        const txAmount = this.toNumber(data?.amount);
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

        return await Transaction.create(data);
    }

    async update(id, data) {
        const transaction = await Transaction.findByPk(id);
        if(!transaction) throw new NotFound("Transaksi Tidak ditemukan");

        const effectiveType =
            data?.type === "income" || data?.type === "expense"
                ? data.type
                : transaction.type;
        const effectiveAmount = this.toNumber(
            data?.amount !== undefined ? data.amount : transaction.amount
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
        return await transaction.update(data);
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
            const amount = parseInt(tx.amount);

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
            const amount = parseInt(tx.amount);

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

        const [accumulatedIncomeRaw, accumulatedExpenseRaw] = await Promise.all([
            Transaction.sum("amount", {
                where: {
                    user_id: userId,
                    type: "income",
                    date: {
                        [Op.lte]: activeRange.end,
                    },
                },
            }),
            Transaction.sum("amount", {
                where: {
                    user_id: userId,
                    type: "expense",
                    date: {
                        [Op.lte]: activeRange.end,
                    },
                },
            }),
        ]);

        const accumulatedIncome = this.toNumber(accumulatedIncomeRaw);
        const accumulatedExpense = this.toNumber(accumulatedExpenseRaw);
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
                    require: false
                },
                {
                    model: User,
                    attributes: ["id", "name", "email", "number"],
                    as: "user",
                    require: false
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

        const total = transactions.reduce((sum, tx) => sum + parseInt(tx.amount), 0);

        return {
            total_expense: total,
            count: transactions.length
        }
    }
}

module.exports = new TransactionService();
