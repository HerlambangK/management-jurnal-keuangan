const dotenv = require('dotenv');

dotenv.config({
  path: process.env.DOTENV_PATH || '.env',
});

const defaultPort = Number(process.env.DB_PORT) || 3306;
const baseConfig = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || '127.0.0.1',
  port: defaultPort,
  dialect: 'mysql',
  logging: false,
};

module.exports = {
  development: {
    ...baseConfig,
    database: process.env.DB_DATABASE || 'budget_tracker_dev',
  },
  test: {
    ...baseConfig,
    database: process.env.DB_DATABASE_TEST || process.env.DB_DATABASE || 'budget_tracker_test',
  },
  production: {
    ...baseConfig,
    database: process.env.DB_DATABASE || 'budget_tracker_prod',
  },
};
