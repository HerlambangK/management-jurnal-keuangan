const { body, param, query } = require('express-validator');

const optionalClientLocationMetaValidator = [
  body('client_location.accuracy')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('Akurasi lokasi tidak valid'),
  body('client_location.source')
    .optional()
    .isString()
    .isLength({ min: 2, max: 40 })
    .withMessage('Sumber lokasi tidak valid'),
  body('client_location.captured_at')
    .optional()
    .isISO8601()
    .withMessage('Waktu lokasi tidak valid'),
  body('client_location.village')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .withMessage('Nama desa terlalu panjang'),
  body('client_location.district')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .withMessage('Nama kecamatan terlalu panjang'),
  body('client_location.province')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .withMessage('Nama provinsi terlalu panjang'),
];

const requiredClientLocationValidator = [
  body('client_location')
    .exists({ checkNull: true })
    .withMessage('Akses lokasi presisi wajib diaktifkan')
    .bail()
    .isObject()
    .withMessage('client_location harus berupa object'),
  body('client_location.latitude')
    .exists({ checkNull: true })
    .withMessage('Latitude wajib dikirim')
    .bail()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude tidak valid'),
  body('client_location.longitude')
    .exists({ checkNull: true })
    .withMessage('Longitude wajib dikirim')
    .bail()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude tidak valid'),
  ...optionalClientLocationMetaValidator,
];

const registerValidator = [
  body('name')
    .notEmpty().withMessage('Nama wajib diisi')
    .isLength({ max: 50 }).withMessage('Nama maksimal 50 karakter'),
  body('email')
    .notEmpty().withMessage('Email wajib diisi')
    .isEmail().withMessage('Email tidak valid'),
  body('password')
    .notEmpty().withMessage('Password wajib diisi')
    .isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
  body('number')
    .optional()
    .isMobilePhone('id-ID').withMessage('Nomor telepon tidak valid'),
  ...requiredClientLocationValidator,
];

const loginValidator = [
  body('email')
    .notEmpty().withMessage('Email wajib diisi')
    .isEmail().withMessage('Email tidak valid'),
  body('password')
    .notEmpty().withMessage('Password wajib diisi'),
  ...requiredClientLocationValidator,
];

const updateProfileValidator = [
  body('name')
    .optional()
    .isString().withMessage('Nama harus berupa teks')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Nama maksimal 50 karakter'),
  body('email')
    .optional()
    .isEmail().withMessage('Email tidak valid')
    .normalizeEmail(),
  body('number')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (/^\+?[0-9]{8,20}$/.test(String(value))) return true;
      throw new Error('Nomor telepon tidak valid');
    }),
  body('avatar_base64')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (typeof value !== 'string') {
        throw new Error('Format avatar tidak valid');
      }
      if (!value.startsWith('data:image/')) {
        throw new Error('Avatar harus berupa data URL gambar');
      }
      return true;
    }),
];

const sessionsQueryValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Limit minimal 1 dan maksimal 3'),
];

const sessionIdParamValidator = [
  param('sessionId')
    .isInt({ min: 1 })
    .withMessage('ID sesi login tidak valid'),
];

module.exports = {
  registerValidator,
  loginValidator,
  updateProfileValidator,
  sessionsQueryValidator,
  sessionIdParamValidator,
};
