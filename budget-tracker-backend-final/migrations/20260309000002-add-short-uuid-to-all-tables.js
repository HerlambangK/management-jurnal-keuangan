'use strict';

const { buildShortUuid, SHORT_UUID_REGEX } = require('../src/utils/shortUuid');

const UUID_TABLES = [
  { table: 'users', pk: 'id', hasUuidColumn: true },
  { table: 'categories', pk: 'id', hasUuidColumn: false },
  { table: 'transactions', pk: 'id', hasUuidColumn: false },
  { table: 'monthly_summaries', pk: 'id', hasUuidColumn: false },
  { table: 'login_sessions', pk: 'id', hasUuidColumn: false },
];

function isShortUuid(value) {
  return SHORT_UUID_REGEX.test(String(value || ''));
}

async function backfillShortUuid(queryInterface, tableName, pkColumn) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT \`${pkColumn}\` AS pk, \`uuid\` FROM \`${tableName}\``
  );

  const used = new Set();

  for (const row of rows) {
    const currentUuid = String(row.uuid || '');
    if (isShortUuid(currentUuid) && !used.has(currentUuid)) {
      used.add(currentUuid);
      continue;
    }

    let candidate = buildShortUuid();
    while (used.has(candidate)) {
      candidate = buildShortUuid();
    }

    used.add(candidate);
    await queryInterface.sequelize.query(
      `UPDATE \`${tableName}\` SET \`uuid\` = :uuid WHERE \`${pkColumn}\` = :pk`,
      {
        replacements: { uuid: candidate, pk: row.pk },
      }
    );
  }
}

async function removeConstraintIfExists(queryInterface, tableName, constraintName) {
  try {
    await queryInterface.removeConstraint(tableName, constraintName);
  } catch (_error) {
    // Ignore missing constraint to keep rollback tolerant across environments.
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const tableConfig of UUID_TABLES) {
      if (!tableConfig.hasUuidColumn) {
        await queryInterface.addColumn(tableConfig.table, 'uuid', {
          type: Sequelize.STRING(6),
          allowNull: true,
        });
      }

      await backfillShortUuid(queryInterface, tableConfig.table, tableConfig.pk);

      await queryInterface.changeColumn(tableConfig.table, 'uuid', {
        type: Sequelize.STRING(6),
        allowNull: false,
      });

      if (tableConfig.table === 'users') {
        await queryInterface.changeColumn('users', 'uuid', {
          type: Sequelize.STRING(6),
          allowNull: false,
          unique: true,
        });
        continue;
      }

      await queryInterface.addConstraint(tableConfig.table, {
        fields: ['uuid'],
        type: 'unique',
        name: `${tableConfig.table}_uuid_unique`,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tablesWithNewUuidColumn = UUID_TABLES.filter((item) => !item.hasUuidColumn);

    for (const tableConfig of tablesWithNewUuidColumn) {
      await removeConstraintIfExists(
        queryInterface,
        tableConfig.table,
        `${tableConfig.table}_uuid_unique`
      );
      await queryInterface.removeColumn(tableConfig.table, 'uuid');
    }

    await queryInterface.changeColumn('users', 'uuid', {
      type: Sequelize.STRING(80),
      allowNull: false,
      unique: true,
    });
  },
};
