'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'avatar_url', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'number',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'avatar_url');
  },
};
