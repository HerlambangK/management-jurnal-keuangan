const cors = require('cors');
const helmet = require('helmet');

const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const enableCORS = cors(corsOptions);
const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  frameguard: { action: 'deny' },
  noSniff: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

const setSecurityHeaders = (req, res, next) => {
  helmetMiddleware(req, res, next);
};

module.exports = {enableCORS, setSecurityHeaders};
