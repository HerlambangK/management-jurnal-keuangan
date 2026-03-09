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
        this.MAX_LOGIN_HISTORY = 3;
        this.IP_LOOKUP_TIMEOUT_MS = 1500;
        this.REVERSE_GEOCODE_TIMEOUT_MS = 2200;
    }

    sanitizeUser(user) {
        const userJson = user?.toJSON ? user.toJSON() : { ...(user || {}) };
        delete userJson.password;
        return userJson;
    }

    async register({name, email, password, number, client_location}, context = {}) {
        const existingUser = await User.findOne({where: { email }});
        
        if(existingUser) {
            throw new BadRequestError("Email User Sudah Terdaftar")
        }

        const hash = await bcrypt.hash(password, this.SALT_ROUNDS);
        const newUser = await User.create({name, email, password: hash, number});
        const preciseClientLocation = this.requirePreciseClientLocation(
            context.req,
            client_location
        );
        const sessionId = await this.trackLoginSession(
            newUser.id,
            context.req,
            preciseClientLocation
        );
        const tokenPayload = { id: newUser.id, email: newUser.email };
        if (Number.isInteger(Number(sessionId)) && Number(sessionId) > 0) {
            tokenPayload.sid = Number(sessionId);
        }
        const token = JwtService.sign(tokenPayload);

        return { user: this.sanitizeUser(newUser), token }
    }

    async login({email, password, client_location}, context = {}) {
        const user = await User.findOne({where: {email}});
        if(!user) throw new NotFound("Email Tidak Ditemukan");

        const isValid = await bcrypt.compare(password, user.password);
        if(!isValid) throw new BadRequestError("Password nya salah boy");

        const preciseClientLocation = this.requirePreciseClientLocation(
            context.req,
            client_location
        );
        const sessionId = await this.trackLoginSession(
            user.id,
            context.req,
            preciseClientLocation
        );
        const tokenPayload = { id: user.id, email: user.email };
        if (Number.isInteger(Number(sessionId)) && Number(sessionId) > 0) {
            tokenPayload.sid = Number(sessionId);
        }
        const token = JwtService.sign(tokenPayload);

        return { user: this.sanitizeUser(user), token }
    }

    async profile(userId, context = {}){
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] },
        });
        if (!user) {
            throw new NotFound('User tidak ditemukan');
        }

        await this.refreshCurrentSessionLocation(userId, context);

        const sessions = await this.getLoginSessions(
            userId,
            this.MAX_LOGIN_HISTORY,
            context
        );
        return {
            ...this.sanitizeUser(user),
            sessions,
        };
    }

    async updateProfile(userId, payload = {}, context = {}) {
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

        return await this.profile(userId, context);
    }

    async sessions(userId, limit = this.MAX_LOGIN_HISTORY, context = {}) {
        await this.refreshCurrentSessionLocation(userId, context);
        return await this.getLoginSessions(userId, limit, context);
    }

    async deleteSession(userId, sessionId, context = {}) {
        const currentSessionIdRaw =
            context?.currentSessionId ?? context?.auth?.sid;
        const currentSessionId = Number(currentSessionIdRaw);
        if (
            Number.isInteger(currentSessionId) &&
            currentSessionId > 0 &&
            currentSessionId === Number(sessionId)
        ) {
            throw new BadRequestError(
                'Sesi yang sedang dipakai tidak bisa dihapus. Hapus sesi lain atau klik hapus semua.'
            );
        }

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

    async getLoginSessions(userId, limit = this.MAX_LOGIN_HISTORY, context = {}) {
        const safeLimit = Math.min(
            Math.max(Number(limit) || this.MAX_LOGIN_HISTORY, 1),
            this.MAX_LOGIN_HISTORY
        );
        try {
            const rawSessions = await LoginSession.findAll({
                where: {
                    user_id: userId,
                },
                attributes: [
                    'id',
                    'ip_address',
                    'device',
                    'location',
                    'latitude',
                    'longitude',
                    'location_accuracy_m',
                    'location_source',
                    'location_captured_at',
                    'user_agent',
                    'logged_in_at',
                ],
                order: [['logged_in_at', 'DESC']],
                limit: safeLimit,
            });

            const ipLocationCache = new Map();
            const normalizedSessions = await Promise.all(rawSessions.map(async (session) => {
                const base = session?.toJSON ? session.toJSON() : { ...(session || {}) };
                const chromeLocation = this.extractChromeLocationLabel(base.location);
                const ipLocation = await this.resolveSessionIpLocationLabel(
                    base.ip_address,
                    ipLocationCache
                );
                return {
                    ...base,
                    latitude: this.toFiniteNumber(base.latitude),
                    longitude: this.toFiniteNumber(base.longitude),
                    location_accuracy_m: this.toFiniteNumber(base.location_accuracy_m),
                    location_chrome: chromeLocation,
                    location_ip: ipLocation,
                    location: chromeLocation || ipLocation,
                };
            }));
            const currentSessionIndex = this.resolveCurrentSessionIndex(
                normalizedSessions,
                context
            );

            return normalizedSessions.map((session, index) => ({
                ...session,
                is_current: index === currentSessionIndex,
            }));
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('[Auth] failed to get login sessions', error?.message || error);
            }
            return [];
        }
    }

    extractChromeLocationLabel(location) {
        const rawLocation = String(location || '').trim();
        if (!rawLocation || /^tidak diketahui$/i.test(rawLocation)) {
            return '';
        }

        if (/(berdasarkan lokasi perangkat)/i.test(rawLocation)) {
            return rawLocation;
        }

        return '';
    }

    formatIpLocationLabel(rawLocation, ipAddress) {
        const location = String(rawLocation || '').trim();
        const ip = String(ipAddress || '').trim();
        if (!location || /^tidak diketahui$/i.test(location)) {
            return ip && ip !== 'unknown'
                ? `Tidak diketahui (berdasarkan IP ${ip})`
                : 'Tidak diketahui (IP publik tidak tersedia)';
        }

        if (/^local network$/i.test(location)) {
            return ip && ip !== 'unknown'
                ? `Jaringan Lokal (IP privat ${ip})`
                : 'Jaringan Lokal (IP privat/localhost)';
        }

        return /(berdasarkan IP)/i.test(location)
            ? location
            : `${location} (berdasarkan IP${ip && ip !== 'unknown' ? ` ${ip}` : ''})`;
    }

    async resolveSessionIpLocationLabel(ipAddress, cache = new Map()) {
        const cacheKey = String(ipAddress || 'unknown').trim() || 'unknown';
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }

        const resolved = await this.resolveLocationFromIp(cacheKey);
        const label = this.formatIpLocationLabel(resolved, cacheKey);
        cache.set(cacheKey, label);
        return label;
    }

    formatLocationLabel(location, ipAddress) {
        const rawLocation = String(location || '').trim();
        const ip = String(ipAddress || '').trim();
        if (!rawLocation || /^tidak diketahui$/i.test(rawLocation)) {
            return ip && ip !== 'unknown'
                ? `Tidak diketahui (berdasarkan IP ${ip})`
                : 'Tidak diketahui (IP publik tidak tersedia)';
        }

        if (/^local network$/i.test(rawLocation)) {
            return ip && ip !== 'unknown'
                ? `Jaringan Lokal (IP privat ${ip})`
                : 'Jaringan Lokal (IP privat/localhost)';
        }

        if (/(berdasarkan lokasi perangkat)/i.test(rawLocation)) {
            return rawLocation;
        }

        return /(berdasarkan IP)/i.test(rawLocation)
            ? rawLocation
            : `${rawLocation} (berdasarkan IP)`;
    }

    resolveCurrentSessionIndex(sessions = [], context = {}) {
        if (!Array.isArray(sessions) || sessions.length === 0) {
            return -1;
        }

        const currentSessionIdRaw =
            context?.currentSessionId ?? context?.auth?.sid;
        const currentSessionId = Number(currentSessionIdRaw);
        if (Number.isInteger(currentSessionId) && currentSessionId > 0) {
            const bySessionId = sessions.findIndex(
                (session) => Number(session?.id) === currentSessionId
            );
            if (bySessionId >= 0) {
                return bySessionId;
            }
        }

        const req = context?.req;
        if (!req) {
            return -1;
        }

        const currentIp = this.extractClientIp(req);
        const currentUserAgent = String(req?.headers?.['user-agent'] || '').trim();
        if (!currentIp && !currentUserAgent) {
            return -1;
        }

        return sessions.findIndex((session) => {
            const sameIp =
                currentIp && String(session?.ip_address || '') === currentIp;
            const sameUserAgent =
                currentUserAgent &&
                String(session?.user_agent || '').trim() === currentUserAgent;
            return sameIp && sameUserAgent;
        });
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

    extractHeaderValue(req, headerName) {
        const raw = req?.headers?.[headerName];
        if (Array.isArray(raw)) {
            return String(raw[0] || '').trim();
        }
        return String(raw || '').trim();
    }

    toFiniteNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    pickFirstNonEmpty(values = []) {
        for (const value of values) {
            const normalized = this.sanitizeLocationToken(value);
            if (normalized) return normalized;
        }
        return '';
    }

    sanitizeLocationToken(value, maxLength = 120) {
        const normalized = String(value || '').trim();
        if (!normalized) return '';
        return normalized.slice(0, maxLength);
    }

    normalizeClientLocation(rawInput) {
        if (!rawInput || typeof rawInput !== 'object') {
            return null;
        }

        const latitude = this.toFiniteNumber(rawInput.latitude);
        const longitude = this.toFiniteNumber(rawInput.longitude);
        if (latitude === null || longitude === null) {
            return null;
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return null;
        }

        const accuracy = this.toFiniteNumber(rawInput.accuracy);
        const source = this.sanitizeLocationToken(rawInput.source, 40) || 'browser_geolocation';
        const capturedAt = this.sanitizeLocationToken(rawInput.captured_at, 60);
        const timezone = this.sanitizeLocationToken(rawInput.timezone, 60);

        return {
            latitude,
            longitude,
            accuracy: accuracy !== null && accuracy >= 0 ? accuracy : null,
            source,
            captured_at: capturedAt || null,
            timezone: timezone || null,
            village: this.sanitizeLocationToken(rawInput.village),
            district: this.sanitizeLocationToken(rawInput.district),
            province: this.sanitizeLocationToken(rawInput.province),
        };
    }

    extractClientLocation(req, rawLocationInput = null) {
        const normalizedFromBody = this.normalizeClientLocation(
            rawLocationInput || req?.body?.client_location
        );
        if (normalizedFromBody) {
            return normalizedFromBody;
        }

        const latitude = this.toFiniteNumber(this.extractHeaderValue(req, 'x-client-latitude'));
        const longitude = this.toFiniteNumber(this.extractHeaderValue(req, 'x-client-longitude'));
        if (latitude === null || longitude === null) {
            return null;
        }

        const accuracy = this.toFiniteNumber(this.extractHeaderValue(req, 'x-client-accuracy'));
        const source = this.extractHeaderValue(req, 'x-client-location-source');
        const capturedAt = this.extractHeaderValue(req, 'x-client-location-captured-at');
        const timezone = this.extractHeaderValue(req, 'x-client-timezone');

        return this.normalizeClientLocation({
            latitude,
            longitude,
            accuracy,
            source: source || 'browser_geolocation',
            captured_at: capturedAt || null,
            timezone: timezone || null,
        });
    }

    toValidDateOrNull(value) {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    requirePreciseClientLocation(req, rawLocationInput = null) {
        const preciseLocation = this.extractClientLocation(req, rawLocationInput);
        if (!preciseLocation) {
            throw new BadRequestError(
                'Akses lokasi presisi wajib aktif. Izinkan GPS browser agar latitude dan longitude terkirim.'
            );
        }
        return preciseLocation;
    }

    buildSessionLocationPayload(clientLocation = null) {
        if (!clientLocation) {
            return {};
        }

        return {
            latitude: clientLocation.latitude,
            longitude: clientLocation.longitude,
            location_accuracy_m: clientLocation.accuracy,
            location_source: clientLocation.source || 'browser_geolocation',
            location_captured_at:
                this.toValidDateOrNull(clientLocation.captured_at) || new Date(),
        };
    }

    hasSessionFieldDifference(currentSession, updatePayload = {}) {
        const entries = Object.entries(updatePayload);
        for (const [key, nextValue] of entries) {
            if (nextValue === undefined) continue;
            const currentValue = currentSession?.get
                ? currentSession.get(key)
                : currentSession?.[key];

            if (nextValue instanceof Date) {
                const currentEpoch = this.toValidDateOrNull(currentValue)?.getTime() || 0;
                if (currentEpoch !== nextValue.getTime()) {
                    return true;
                }
                continue;
            }

            if (String(currentValue ?? '') !== String(nextValue ?? '')) {
                return true;
            }
        }
        return false;
    }

    buildDeviceLocationLabel({ village, district, province }) {
        const locationParts = [];
        if (village) locationParts.push(`Desa/Kel. ${village}`);
        if (district) locationParts.push(`Kec. ${district}`);
        if (province) locationParts.push(`Prov. ${province}`);

        if (locationParts.length === 0) {
            return '';
        }

        return `${locationParts.join(', ')} (berdasarkan lokasi perangkat)`;
    }

    buildDeviceLocationFromAddress(address = {}) {
        const village = this.pickFirstNonEmpty([
            address.village,
            address.hamlet,
            address.suburb,
            address.neighbourhood,
            address.quarter,
            address.residential,
        ]);
        const district = this.pickFirstNonEmpty([
            address.city_district,
            address.subdistrict,
            address.county,
            address.municipality,
            address.regency,
            address.city,
            address.town,
        ]);
        const province = this.pickFirstNonEmpty([
            address.state,
            address.province,
            address.region,
        ]);

        const detailedLabel = this.buildDeviceLocationLabel({
            village,
            district,
            province,
        });
        if (detailedLabel) {
            return detailedLabel;
        }

        const coarseLabel = [
            this.pickFirstNonEmpty([address.city, address.town, address.county]),
            province,
            this.pickFirstNonEmpty([address.country]),
        ]
            .filter(Boolean)
            .join(', ');

        return coarseLabel
            ? `${coarseLabel} (berdasarkan lokasi perangkat)`
            : '';
    }

    async resolveLocationFromDevice(clientLocation) {
        if (!clientLocation) {
            return '';
        }

        const fromPayload = this.buildDeviceLocationLabel({
            village: this.sanitizeLocationToken(clientLocation.village),
            district: this.sanitizeLocationToken(clientLocation.district),
            province: this.sanitizeLocationToken(clientLocation.province),
        });
        if (fromPayload) {
            return fromPayload;
        }

        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                timeout: this.REVERSE_GEOCODE_TIMEOUT_MS,
                params: {
                    format: 'jsonv2',
                    addressdetails: 1,
                    lat: clientLocation.latitude,
                    lon: clientLocation.longitude,
                    'accept-language': 'id,en',
                },
                headers: {
                    'User-Agent': 'budget-tracker-backend/1.0 (reverse-geocode)',
                    Accept: 'application/json',
                },
            });

            const data = response?.data || {};
            const locationByAddress = this.buildDeviceLocationFromAddress(data.address || {});
            if (locationByAddress) {
                return locationByAddress;
            }

            const displayName = this.sanitizeLocationToken(data.display_name, 180);
            return displayName
                ? `${displayName} (berdasarkan lokasi perangkat)`
                : '';
        } catch (_error) {
            return '';
        }
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
                timeout: this.IP_LOOKUP_TIMEOUT_MS,
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

    async resolveLocationForSession(ipAddress, clientLocation) {
        const deviceLocation = await this.resolveLocationFromDevice(clientLocation);
        if (deviceLocation) {
            return deviceLocation;
        }
        return await this.resolveLocationFromIp(ipAddress);
    }

    async findCurrentSessionRecord(userId, context = {}) {
        const currentSessionIdRaw =
            context?.currentSessionId ?? context?.auth?.sid;
        const currentSessionId = Number(currentSessionIdRaw);
        if (Number.isInteger(currentSessionId) && currentSessionId > 0) {
            return await LoginSession.findOne({
                where: {
                    id: currentSessionId,
                    user_id: userId,
                },
            });
        }

        const req = context?.req;
        if (!req) {
            return null;
        }

        const ipAddress = this.extractClientIp(req);
        const userAgent = String(req?.headers?.['user-agent'] || '').trim();
        if ((!ipAddress || ipAddress === 'unknown') && !userAgent) {
            return null;
        }

        const whereClause = {
            user_id: userId,
        };

        if (ipAddress && ipAddress !== 'unknown') {
            whereClause.ip_address = ipAddress;
        }
        if (userAgent) {
            whereClause.user_agent = userAgent;
        }

        return await LoginSession.findOne({
            where: whereClause,
            order: [
                ['logged_in_at', 'DESC'],
                ['id', 'DESC'],
            ],
        });
    }

    async refreshCurrentSessionLocation(userId, context = {}) {
        const req = context?.req;
        if (!req || !userId) return;

        const clientLocation = this.extractClientLocation(req);
        if (!clientLocation) return;

        try {
            const currentSession = await this.findCurrentSessionRecord(userId, context);
            if (!currentSession) return;

            const ipAddress = this.extractClientIp(req);
            const resolvedLocation = await this.resolveLocationForSession(
                ipAddress,
                clientLocation
            );
            const updatePayload = {
                ...this.buildSessionLocationPayload(clientLocation),
                ...(resolvedLocation ? { location: resolvedLocation } : {}),
            };
            if (
                Object.keys(updatePayload).length === 0 ||
                !this.hasSessionFieldDifference(currentSession, updatePayload)
            ) {
                return;
            }

            await currentSession.update(updatePayload);
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(
                    '[Auth] failed to refresh current session location',
                    error?.message || error
                );
            }
        }
    }

    async trackLoginSession(userId, req, rawClientLocation = null) {
        if (!req || !userId) return null;

        try {
            const ipAddress = this.extractClientIp(req);
            const userAgent = String(req?.headers?.['user-agent'] || 'Unknown');
            const device = this.extractDeviceInfo(userAgent);
            const clientLocation = this.extractClientLocation(req, rawClientLocation);
            const location = await this.resolveLocationForSession(
                ipAddress,
                clientLocation
            );
            const precisePayload = this.buildSessionLocationPayload(clientLocation);

            const loginSession = await LoginSession.create({
                user_id: userId,
                ip_address: ipAddress,
                device,
                location,
                ...precisePayload,
                user_agent: userAgent,
                logged_in_at: new Date(),
            });

            await this.pruneLoginSessions(userId);
            return loginSession?.id || null;
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('[Auth] failed to track login session', error?.message || error);
            }
            return null;
        }
    }

    async pruneLoginSessions(userId) {
        const staleSessions = await LoginSession.findAll({
            where: { user_id: userId },
            attributes: ['id'],
            order: [
                ['logged_in_at', 'DESC'],
                ['id', 'DESC'],
            ],
            offset: this.MAX_LOGIN_HISTORY,
        });

        if (staleSessions.length === 0) {
            return;
        }

        const staleIds = staleSessions.map((session) => session.id);
        await LoginSession.destroy({
            where: {
                id: staleIds,
                user_id: userId,
            },
        });
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
