const MonthlySummaryService = require('./monthlySummary.service');

class MonthlySummaryController {
    async getAll(req, res, next){
        try {
            const data = await MonthlySummaryService.getAll(req.userId);
            res.json({success: true, message: "list daftar summary bulanan", data})
        } catch (error) {
            next(error)
        }
    }

    async getById(req, res, next){
        try {
            const data = await MonthlySummaryService.getById(req.params.id, req.userId);
            res.json({success: true, message: "data summary bulanan", data})
        } catch (error) {
            next(error)
        }
    }

    async create(req, res, next){
        try {
            const data = {
                ...req.body,
                user_id: req.userId
            }
            const result = await MonthlySummaryService.create(data);
            res.status(201).json({success: true, message: "membuat summary bulanan", data: result})
        } catch (error) {
            next(error)
        }
    }

    async generate(req, res, next){
        try {
            const data = await MonthlySummaryService.generate(req.userId, req.body || {});
            res.status(200).json({success: true, message: "berhasil generate summary bulanan", data})
        } catch (error) {
            next(error)
        }
    }

    async forecast(req, res, next){
        try {
            const data = await MonthlySummaryService.getForecast(req.userId);
            res.status(200).json({success: true, message: "berhasil mengambil forecast bulanan", data})
        } catch (error) {
            next(error)
        }
    }

    async update(req, res, next){
        try {
            const data = {
                ...req.body,
                user_id: req.userId
            }
            const result = await MonthlySummaryService.update(req.params.id, data, req.userId);
            res.json({success: true, message: "update summary bulanan", data: result})
        } catch (error) {
            next(error)
        }
    }

    async delete(req, res, next){
        try {
            const data = await MonthlySummaryService.delete(req.params.id, req.userId);
            res.json({success: true, message: "delete summary bulanan", data})
        } catch (error) {
            next(error)
        }
    }
}

module.exports = new MonthlySummaryController()
