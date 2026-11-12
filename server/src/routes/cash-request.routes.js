const express = require('express')
const {
  getCashRequest,
  createCashRequest,
  approveCashRequest,
  rejectCashRequest,
  updateCashRequest,
  completeCashRequest,
  getCashRequestActivity,
  checkCashRequestEligibility,
  getCashRequestWallet,
} = require('../controllers/cash-request.controller')

const cashRequestRouter = express.Router()

cashRequestRouter.get('/', getCashRequest)
cashRequestRouter.get('/activity', getCashRequestActivity)
cashRequestRouter.get('/wallet', getCashRequestWallet)
cashRequestRouter.get('/eligibility', checkCashRequestEligibility)

cashRequestRouter.post('/', createCashRequest)
cashRequestRouter.put('/approve', approveCashRequest)
cashRequestRouter.put('/reject', rejectCashRequest)
cashRequestRouter.put('/update', updateCashRequest)
cashRequestRouter.put('/complete', completeCashRequest)

module.exports = {
  cashRequestRouter,
}
