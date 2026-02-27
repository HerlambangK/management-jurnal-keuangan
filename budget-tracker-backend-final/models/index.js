'use strict';

const Sequelize = require('sequelize');
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/sequelize-cli.js')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

const TransactionModel = require('../src/modules/transaction/transaction.model');
const CategoryModel = require('../src/modules/category/category.model');
const UserModel = require('../src/modules/user/user.model');
const MonthlySummaryModel = require('../src/modules/monthlySummary/monthlySummary.model');
const LoginSessionModel = require('../src/modules/loginSession/loginSession.model');

const Transaction = TransactionModel(sequelize, Sequelize.DataTypes);
const Category = CategoryModel(sequelize, Sequelize.DataTypes);
const User = UserModel(sequelize, Sequelize.DataTypes);
const MonthlySummary = MonthlySummaryModel(sequelize, Sequelize.DataTypes);
const LoginSession = LoginSessionModel(sequelize, Sequelize.DataTypes);

db.sequelize = sequelize;
db.Sequelize = Sequelize;
db.Transaction = Transaction;
db.Category = Category;
db.User = User;
db.MonthlySummary = MonthlySummary;
db.LoginSession = LoginSession;

Object.values(db).forEach(model => {
  if (typeof model.associate === 'function') {
    model.associate(db);
  }
});

module.exports = db;
