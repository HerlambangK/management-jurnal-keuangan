const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { User, LoginSession } = require('../../../models');
const JwtService = require('./jwt.service');
const bcrypt = require('bcrypt');
const config = require('../../config/config');
const BadRequestError = require('../../errors/BadRequestError');
const NotFound = require('../../errors/NotFoundError');

class AuthService {
    constructor() {
        this.SALT_ROUNDS = 10;
        this.MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
    }

    sanitizeUser(user) {
        const userJson = user?.toJSON ? user.toJSON() : { ...(user || {}) };
        delete userJson.password;
        return userJson;
    }

    async register({name, email, password, number}, context = {}) {
        const existingUser = await User.findOne({where: { email }});
        
        if(existingUser) {
            throw new BadRequestError("Email User Sudah Terdaftar")
        }

        const hash = await bcrypt.hash(password, this.SALT_ROUNDS);
        const newUser = await User.create({name, email, password: hash, number});
        const token = JwtService.sign({ id: newUser.id, email: newUser.email });
        await this.trackLoginSession(newUser.id, context.req);

        return { user: this.sanitizeUser(newUser), token }
    }

    async login({email, password}, context = {}) {
        const user = await User.findOne({where: {email}});
        if(!user) throw new NotFound("Email Tidak Ditemukan");

        const isValid = await bcrypt.compare(password, user.password);
        if(!isValid) throw new BadRequestError("Password nya salah boy");

        const token = JwtService.sign({ id: user.id, email: user.email });
        await this.trackLoginSession(user.id, context.req);

        return { user: this.sanitizeUser(user), token }
    }

    async profile(userId){
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] },
        });
        if (!user) {
            throw new NotFound('User tidak ditemukan');
        }

        const sessions = await this.getLoginSessions(userId, 10);
        return {
            ...this.sanitizeUser(user),
            sessions,
        };
    }

    async updateProfile(userId, payload = {}) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new NotFound('User tidak ditemukan');
        }

        const updates = {};

        if (payload.name !== undefined) {
            const name = String(payload.name || '').trim();
            if (!name) {
                throw new BadRequestError('Nama wajib diisi');
            }
            if (name.length > 50) {
                throw new BadRequestError('Nama maksimal 50 karakter');
            }
            updates.name = name;
        }

        if (payload.email !== undefined) {
            const email = String(payload.email || '')
                .trim()
                .toLowerCase();
            const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!isEmailValid) {
                throw new BadRequestError('Email tidak valid');
            }

            if (email !== user.email) {
                const existingEmail = await User.findOne({
                    where: { email },
                });
                if (existingEmail) {
                    throw new BadRequestError('Email User Sudah Terdaftar');
                }
            }
            updates.email = email;
        }

        if (payload.number !== undefined) {
            const number = String(payload.number || '').trim();
            if (number && !/^\+?[0-9]{8,20}$/.test(number)) {
                throw new BadRequestError('Nomor telepon tidak valid');
            }
            updates.number = number || null;
        }

        if (payload.avatar_base64 !== undefined) {
            updates.avatar_url = await this.saveAvatarFromPayload(
                user,
                payload.avatar_base64
            );
        }

        if (Object.keys(updates).length > 0) {
            await user.update(updates);
        }

        return await this.profile(userId);
    }

    async sessions(userId, limit = 15) {
        return await this.getLoginSessions(userId, limit);
    }

    async deleteSession(userId, sessionId) {
        const totalSessions = await LoginSession.count({
            where: {
                user_id: userId,
            },
        });

        if (totalSessions <= 1) {
            throw new BadRequestError(
                'Sesi terakhir tidak dapat dihapus. Gunakan hapus semua untuk login ulang.'
            );
        }

        const deleted = await LoginSession.destroy({
            where: {
                id: sessionId,
                user_id: userId,
            },
        });

        if (!deleted) {
            throw new NotFound('Sesi login tidak ditemukan');
        }

        return { deleted, remaining: Math.max(totalSessions - deleted, 0) };
    }

    async clearSessions(userId) {
        const deleted = await LoginSession.destroy({
            where: {
                user_id: userId,
            },
        });

        return { deleted, require_relogin: true };
    }

    async getLoginSessions(userId, limit = 15) {
        const safeLimit = Math.min(Math.max(Number(limit) || 15, 1), 50);
        try {
            return await LoginSession.findAll({
                where: {
                    user_id: userId,
                },
                attributes: [
                    'id',
                    'ip_address',
                    'device',
                    'location',
                    'user_agent',
                    'logged_in_at',
                ],
                order: [['logged_in_at', 'DESC']],
                limit: safeLimit,
            });
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('[Auth] failed to get login sessions', error?.message || error);
            }
            return [];
        }
    }

    extractClientIp(req) {
        const forwardedRaw = req?.headers?.['x-forwarded-for'];
        const forwarded = Array.isArray(forwardedRaw)
            ? forwardedRaw[0]
            : forwardedRaw;
        const forwardedIp =
            typeof forwarded === 'string'
                ? forwarded.split(',')[0].trim()
                : '';
        const socketIp = req?.socket?.remoteAddress || req?.ip || '';
        const ip = String(forwardedIp || socketIp || '')
            .replace(/^::ffff:/, '')
            .trim();
        return ip || 'unknown';
    }

    extractDeviceInfo(userAgentRaw) {
        const userAgent = String(userAgentRaw || '').toLowerCase();
        const isMobile = /mobile|iphone|android|ipad/.test(userAgent);
        const device = isMobile ? 'Mobile' : 'Desktop';

        let browser = 'Unknown Browser';
        if (userAgent.includes('edg/')) browser = 'Edge';
        else if (userAgent.includes('chrome/')) browser = 'Chrome';
        else if (userAgent.includes('firefox/')) browser = 'Firefox';
        else if (userAgent.includes('safari/') && !userAgent.includes('chrome/'))
            browser = 'Safari';

        let os = 'Unknown OS';
        if (userAgent.includes('windows')) os = 'Windows';
        else if (userAgent.includes('mac os')) os = 'macOS';
        else if (userAgent.includes('android')) os = 'Android';
        else if (userAgent.includes('iphone') || userAgent.includes('ipad')) os = 'iOS';
        else if (userAgent.includes('linux')) os = 'Linux';

        return `${device} - ${browser} (${os})`;
    }

    isPrivateIp(ip) {
        if (!ip || ip === 'unknown') return true;
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('fe80:')) return true;
        return (
            ip.startsWith('10.') ||
            ip.startsWith('192.168.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
        );
    }

    async resolveLocationFromIp(ip) {
        if (!ip || ip === 'unknown') {
            return 'Tidak diketahui';
        }
        if (this.isPrivateIp(ip)) {
            return 'Local Network';
        }

        try {
            const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
                timeout: 1500,
            });
            const data = response?.data || {};
            const city = data.city || '';
            const region = data.region || data.region_name || '';
            const country = data.country_name || data.country || '';
            const location = [city, region, country].filter(Boolean).join(', ');
            return location || 'Tidak diketahui';
        } catch (error) {
            return 'Tidak diketahui';
        }
    }

    async trackLoginSession(userId, req) {
        if (!req || !userId) return;

        try {
            const ipAddress = this.extractClientIp(req);
            const userAgent = String(req?.headers?.['user-agent'] || 'Unknown');
            const device = this.extractDeviceInfo(userAgent);
            const location = await this.resolveLocationFromIp(ipAddress);

            await LoginSession.create({
                user_id: userId,
                ip_address: ipAddress,
                device,
                location,
                user_agent: userAgent,
                logged_in_at: new Date(),
            });
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('[Auth] failed to track login session', error?.message || error);
            }
        }
    }

    getUploadsBaseUrl() {
        const baseUrl = config?.server?.baseUrl || 'http://localhost:5001';
        return String(baseUrl).replace(/\/$/, '');
    }

    async removeOldAvatarFile(avatarUrl) {
        const value = String(avatarUrl || '');
        const match = value.match(/\/uploads\/avatars\/([^/?#]+)/);
        if (!match) {
            return;
        }

        const oldFile = path.join(process.cwd(), 'uploads', 'avatars', match[1]);
        try {
            await fs.unlink(oldFile);
        } catch (error) {
            // ignore missing file
        }
    }

    async saveAvatarFromPayload(user, avatarBase64) {
        if (avatarBase64 === null || avatarBase64 === '') {
            await this.removeOldAvatarFile(user.avatar_url);
            return null;
        }

        if (typeof avatarBase64 !== 'string') {
            throw new BadRequestError('Format avatar tidak valid');
        }

        const payload = avatarBase64.trim();
        const match = payload.match(/^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!match) {
            throw new BadRequestError('Avatar harus berupa data URL gambar valid (png/jpeg/webp)');
        }

        const mimeType = match[1];
        const encoded = match[3];
        const imageBuffer = Buffer.from(encoded, 'base64');

        if (!imageBuffer.length) {
            throw new BadRequestError('Avatar kosong');
        }

        if (imageBuffer.length > this.MAX_AVATAR_SIZE_BYTES) {
            throw new BadRequestError('Ukuran avatar maksimal 2MB');
        }

        const extMap = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/webp': 'webp',
        };
        const extension = extMap[mimeType] || 'png';

        const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
        await fs.mkdir(uploadDir, { recursive: true });

        const filename = `${user.uuid || user.id}-${Date.now()}-${crypto
            .randomBytes(4)
            .toString('hex')}.${extension}`;
        const filepath = path.join(uploadDir, filename);
        await fs.writeFile(filepath, imageBuffer);

        await this.removeOldAvatarFile(user.avatar_url);
        return `${this.getUploadsBaseUrl()}/uploads/avatars/${filename}`;
    }
}

module.exports = new AuthService();
