const { body, param, query } = require('express-validator');

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
];

const loginValidator = [
  body('email')
    .notEmpty().withMessage('Email wajib diisi')
    .isEmail().withMessage('Email tidak valid'),
  body('password')
    .notEmpty().withMessage('Password wajib diisi'),
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
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit minimal 1 dan maksimal 50'),
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
