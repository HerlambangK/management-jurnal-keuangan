module.exports = (sequelize, DataTypes) => {
    const LoginSession = sequelize.define(
        'LoginSession',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
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
