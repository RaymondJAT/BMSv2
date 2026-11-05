'use strict'

/**  @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cash_request', {
      cr_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
      },
      cr_reference_id: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      cr_cv_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      cr_purpose: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      cr_project: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      cr_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      cr_revolving_fund_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'revolving_fund',
          key: 'rf_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        allowNull: true,
      },
      cr_employee_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'master_employee',
          key: 'me_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        allowNull: false,
      },
      cr_department_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'master_department',
          key: 'md_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        allowNull: false,
      },
      cr_team_lead: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      cr_request_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      cr_request_type: {
        type: Sequelize.ENUM('BUDGET', 'TRAVEL EXPENSES'),
        allowNull: false,
      },
      cr_status: {
        type: Sequelize.ENUM('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'),
        defaultValue: 'PENDING',
        allowNull: false,
      },
      cr_createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      cr_updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('cash_request')
  },
}
