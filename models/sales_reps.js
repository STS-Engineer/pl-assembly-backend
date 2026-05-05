const { DataTypes } = require('sequelize');
const sequelize = require('../config/SequelizeSales');

const SalesRep = sequelize.define('SalesRep', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  dept: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  full_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: true,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  localisation: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  region: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  attached_plant: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'sales_reps',
  timestamps: false,
});

module.exports = SalesRep;