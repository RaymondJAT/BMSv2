'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('master_wallet_activity', {
      mwa_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
      },
      mwa_wallet_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'master_wallet',
          key: 'mw_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        allowNull: false,
      },
      mwa_type: {
        type: Sequelize.ENUM('CREDIT', 'DEBIT'),
        allowNull: false,
      },
      mwa_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      mwa_previous_balance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      mwa_new_balance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      mwa_reference_type: {
        type: Sequelize.STRING(50), // CASH_DISBURSEMENT | LIQUIDATION | OPENING_BALANCE
        allowNull: false,
      },
      mwa_reference_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      mwa_remarks: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      mwa_createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex(
      'master_wallet_activity',
      ['mwa_wallet_id', 'mwa_reference_type', 'mwa_reference_id'],
      { unique: true, name: 'uq_mwa_posting' },
    )
    await queryInterface.addIndex('master_wallet_activity', ['mwa_wallet_id', 'mwa_createdAt'], {
      name: 'idx_mwa_wallet_created',
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('master_wallet_activity')
  },
}
