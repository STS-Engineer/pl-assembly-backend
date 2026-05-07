const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

const ProductDevelopmentProduct = sequelize.define(
  'ProductDevelopmentProduct',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    product_ref: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    product_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    deadline: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    created_by_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'product_development_products',
    timestamps: true,
    underscored: true,
  },
)

module.exports = ProductDevelopmentProduct
