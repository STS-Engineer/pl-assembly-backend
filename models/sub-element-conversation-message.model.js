const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

const SubElementConversationMessage = sequelize.define(
  'SubElementConversationMessage',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    rfq_costing_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'rfq_costing',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    sub_element_key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mentions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: 'sub_element_conversation_messages',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        // Keep a short explicit name to avoid PostgreSQL truncation collisions during sync({ alter: true }).
        name: 'idx_secm_costing_step',
        fields: ['rfq_costing_id', 'sub_element_key'],
      },
      {
        name: 'idx_secm_user_id',
        fields: ['user_id'],
      },
      {
        name: 'idx_secm_created_at',
        fields: ['created_at'],
      },
    ],
  },
)

module.exports = SubElementConversationMessage
