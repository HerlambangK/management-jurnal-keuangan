const { buildShortUuid } = require('../../utils/shortUuid');

module.exports = (sequelize, DataTypes) => {
    const LoginSession = sequelize.define(
        'LoginSession',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uuid: {
                type: DataTypes.STRING(6),
                allowNull: false,
                unique: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            ip_address: {
                type: DataTypes.STRING(64),
                allowNull: false,
            },
            device: {
                type: DataTypes.STRING(120),
                allowNull: false,
            },
            location: {
                type: DataTypes.STRING(180),
                allowNull: true,
            },
            latitude: {
                type: DataTypes.DECIMAL(10, 7),
                allowNull: true,
            },
            longitude: {
                type: DataTypes.DECIMAL(10, 7),
                allowNull: true,
            },
            location_accuracy_m: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
            },
            location_source: {
                type: DataTypes.STRING(40),
                allowNull: true,
            },
            location_captured_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            user_agent: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            logged_in_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            sequelize,
            modelName: 'LoginSession',
            tableName: 'login_sessions',
            timestamps: false,
            underscored: true,
            hooks: {
                beforeValidate: (session) => {
                    if (!session.uuid) {
                        session.uuid = buildShortUuid();
                    }
                },
            },
        }
    );

    LoginSession.associate = (models) => {
        LoginSession.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user',
        });
    };

    return LoginSession;
};
