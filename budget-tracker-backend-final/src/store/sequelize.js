const { Sequelize } = require("sequelize");
const config = require("../config/config");

const sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: config.db.dialect,
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry() {
  const maxRetries = Number(process.env.DB_CONNECT_MAX_RETRIES || 15);
  const retryDelayMs = Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 2000);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await sequelize.authenticate();
      console.log(`[DB] Connection established (attempt ${attempt}/${maxRetries}).`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[DB] Connection failed (attempt ${attempt}/${maxRetries}): ${message}`);

      if (attempt >= maxRetries) {
        throw error;
      }

      await wait(retryDelayMs);
    }
  }
}

connectWithRetry().catch((error) => {
  console.error("[DB] Unable to connect after retries:", error);
  process.exit(1);
});

module.exports = sequelize;
