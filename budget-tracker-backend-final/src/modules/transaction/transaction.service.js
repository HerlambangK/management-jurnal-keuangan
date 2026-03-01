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
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactions = await Transaction.findAll({
            where: {
                user_id: data.user_id,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth]
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

        const amountToAdd = parseInt(data.amount);

        if(
            data.type === "expense" &&
            totalIncome < totalExpense + amountToAdd
        ) {
            throw new BadRequestError("Income Bulan ini tidak mencukupi");
        }

        return await Transaction.create(data);
    }

    async update(id, data) {
        const transaction = await Transaction.findByPk(id);
        if(!transaction) throw new NotFound("Transaksi Tidak ditemukan");
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const transactions = await Transaction.findAll({
            where: {
                user_id: transaction.user_id,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth]
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

        const amountToAdd = parseInt(data.amount);

        if(
            data.type === "expense" &&
            totalIncome < totalExpense + amountToAdd
        ) {
            throw new BadRequestError("Income Bulan ini tidak mencukupi");
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
            monthly_balance: monthlyBalance,
            opening_balance: openingBalance,
            closing_balance: closingBalance,
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
