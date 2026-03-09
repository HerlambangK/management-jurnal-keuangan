const { buildShortUuid } = require('../../utils/shortUuid');

module.exports = (sequelize, DataTypes) => {
    const Category = sequelize.define('Category', {
        id: {
            type: DataTypes.INTEGER, 
            primaryKey: true, 
            autoIncrement: true
        },
        uuid: {
            type: DataTypes.STRING(6),
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        created_at: {
            allowNull: false,
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            allowNull: false,
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'categories',
        timestamp: true,
        underscored: true,
        hooks: {
            beforeValidate: (category) => {
                if (!category.uuid) {
                    category.uuid = buildShortUuid();
                }
            },
        },
    });

    Category.associate = (models) => {
        Category.hasMany(models.Transaction, { foreignKey: 'category_id', as: 'transaction'})
    };

    return Category;
}
