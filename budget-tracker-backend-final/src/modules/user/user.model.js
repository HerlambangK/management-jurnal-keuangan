const SHORT_UUID_LENGTH = 6;

const crypto = require('crypto');

function normalizeUsername(name) {
    const normalized = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized.slice(0, 30) || 'user';
}

function buildShortUuid() {
    return crypto
        .randomUUID()
        .replace(/-/g, '')
        .slice(0, SHORT_UUID_LENGTH);
}

function buildUserPublicId(name) {
    return `${normalizeUsername(name)}-${buildShortUuid()}`;
}

module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        uuid: {
            type: DataTypes.STRING(80),
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        number: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        avatar_url: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        password: {
            type: DataTypes.STRING(255),
            allowNull: false
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
        sequelize,
        modelName: 'User',
        tableName: 'users',
        timestamp: false,
        underscored: true,
        hooks: {
            beforeValidate: (user) => {
                if (!user.uuid) {
                    user.uuid = buildUserPublicId(user.name);
                }
            },
        },
    });

    User.associate = (models) => {
        User.hasMany(models.Transaction, {
            foreignKey: 'user_id',
            as: 'transaction'
        });
        User.hasMany(models.MonthlySummary, {
            foreignKey: 'user_id',
            as: 'summary_user'
        });
        User.hasMany(models.LoginSession, {
            foreignKey: 'user_id',
            as: 'login_sessions',
        });
    }
    
    return User;
}
