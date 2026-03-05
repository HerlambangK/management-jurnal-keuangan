const express = require('express');
const path = require('path');
const app = express();
const { enableCORS, setSecurityHeaders } = require('./middlewares/security.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');
const routes = require('./routes');
const sequelize = require('./store/sequelize');

app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(enableCORS);
app.use(setSecurityHeaders);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/v1/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/v1/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    return res.status(200).json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'degraded',
      message: 'Database connection unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/v1', routes);
app.use(errorHandler);
app.use((err, req, res, next) => {
  const status = err.status || 500;

  res.status(status).json({
    success: false,
    message: err.message || 'Terjadi kesalahan pada server',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

module.exports = app;
