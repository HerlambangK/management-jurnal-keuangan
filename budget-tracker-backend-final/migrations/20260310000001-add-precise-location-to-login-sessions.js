'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('login_sessions', 'latitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });

    await queryInterface.addColumn('login_sessions', 'longitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });

    await queryInterface.addColumn('login_sessions', 'location_accuracy_m', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    await queryInterface.addColumn('login_sessions', 'location_source', {
      type: Sequelize.STRING(40),
      allowNull: true,
    });

    await queryInterface.addColumn('login_sessions', 'location_captured_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('login_sessions', ['latitude', 'longitude']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('login_sessions', ['latitude', 'longitude']);
    await queryInterface.removeColumn('login_sessions', 'location_captured_at');
    await queryInterface.removeColumn('login_sessions', 'location_source');
    await queryInterface.removeColumn('login_sessions', 'location_accuracy_m');
    await queryInterface.removeColumn('login_sessions', 'longitude');
    await queryInterface.removeColumn('login_sessions', 'latitude');
  },
};
