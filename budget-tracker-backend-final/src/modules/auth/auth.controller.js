const AuthService = require('./auth.service');

class AuthController {
    async register(req, res, next) {
        try {
            const data = req.body;
            const result = await AuthService.register(data, { req });
            res.status(201).json({
                success: true,
                message: 'Register berhasil',
                data: result
            });
        } catch (error) {
            next(error)
        }
    }

    async login(req, res, next) {
        try {
            const data = req.body;
            const result = await AuthService.login(data, { req });
            res.status(200).json({
                success: true,
                message: 'Login berhasil',
                data: result
            });
        } catch (error) {
            next(error)
        }
    }

    async profile(req, res, next) {
        try {
            const userId = req.userId;
            const user = await AuthService.profile(userId);

            res.status(200).json({
                success: true,
                message: 'Profile berhasil di ambil',
                data: user
            });
        } catch (error) {
            next(error)
        }
    }

    async updateProfile(req, res, next) {
        try {
            const userId = req.userId;
            const result = await AuthService.updateProfile(userId, req.body || {});

            res.status(200).json({
                success: true,
                message: 'Profil berhasil diperbarui',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async sessions(req, res, next) {
        try {
            const userId = req.userId;
            const limit = Number(req.query.limit) || 15;
            const result = await AuthService.sessions(userId, limit);

            res.status(200).json({
                success: true,
                message: 'Data sesi login berhasil diambil',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();
