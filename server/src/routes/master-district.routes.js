const express = require('express')
const {
  getMasterDistrict,
  upsertMasterDistrict,
  importMasterDistrict,
  syncMasterDistrictFromSlink,
} = require('../controllers/master-district.controller')

const masterDistrictRouter = express.Router()

masterDistrictRouter.get('/', getMasterDistrict)
masterDistrictRouter.post('/', upsertMasterDistrict)
masterDistrictRouter.post('/import', importMasterDistrict)
masterDistrictRouter.post('/sync-slink', syncMasterDistrictFromSlink)

module.exports = {
  masterDistrictRouter,
}
