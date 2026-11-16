const { Query, Transaction, SQLQueryBuilder } = require('../database/utilities/queries.util')
const { Master } = require('../database/models/Master')

const SQL = new SQLQueryBuilder()
const District = Master.District

// ==========================================
// SHARED HELPERS
// ==========================================

const getUserId = (req) => req.user?.id || req.user?.userId || req.body?.userId || null

const normalizeText = (value) => String(value ?? '').trim()

/** Builds an INSERT for master_district from { store_number, store_name, region, city_province, status }. */
const buildDistrictInsert = (fields, userId) => {
  const built = SQL.model(District)
    .insert({
      [District.cols.store_number]: fields.store_number,
      [District.cols.store_name]: fields.store_name,
      [District.cols.region]: fields.region,
      [District.cols.city_province]: fields.city_province,
      [District.cols.status]: fields.status,
      ...(District.cols.createdBy && userId ? { [District.cols.createdBy]: userId } : {}),
      ...(District.cols.createdAt ? { [District.cols.createdAt]: new Date() } : {}),
    })
    .build()

  return { sql: built.sql, values: built.bindings }
}

// ==========================================
// CRUD
// ==========================================

const UPSERT_FIELDS = ['store_number', 'store_name', 'region', 'city_province', 'status']

/**
 * @name UpsertMasterDistrict
 * @description Update and insert District
 */
const upsertMasterDistrict = async (req, res) => {
  // #swagger.tags = ['Master District']
  // #swagger.description = 'Upsert District'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded']

  const userId = getUserId(req)
  const { id, store_number, store_name, region, city_province, status } = req.body

  try {
    let sql
    let values

    if (id) {
      const updateData = {}
      for (const field of UPSERT_FIELDS) {
        if (req.body[field] !== undefined) updateData[District.cols[field]] = req.body[field]
      }

      if (District.cols.updatedAt) updateData[District.cols.updatedAt] = new Date()
      if (District.cols.updatedBy && userId) updateData[District.cols.updatedBy] = userId

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data to update' })
      }

      const built = SQL.model(District).update(updateData).where(District.pk, id).build()
      sql = built.sql
      values = built.bindings
    } else {
      if (!store_number) {
        return res.status(400).json({ message: 'Missing required fields' })
      }

      ;({ sql, values } = buildDistrictInsert(
        { store_number, store_name, region, city_province, status: status || 'ACTIVE' },
        userId,
      ))
    }

    const result = await Query(sql, values)

    if (id && result.affectedRows === 0) {
      return res.status(404).json({ message: 'District not found' })
    }

    return res.status(200).json({
      message: id ? 'Updated successfully' : 'Created successfully',
    })
  } catch (error) {
    console.error('Error in upsertMasterDistrict:', error)
    return res.status(500).json({ message: 'Error processing District' })
  }
}

/**
 * @name getMasterDistrict
 * @description Get District records. Supports optional server-side
 *              search-on-type for the Liquidation form's Store field
 *              (~4.5k rows — too many to ever load or render as a full
 *              <select>):
 *                - `search`: matches store_name or store_number
 *                  (case-insensitive substring), with store names that
 *                  START WITH the term ranked above ones that merely
 *                  contain it.
 *                - `limit`: caps the result count (1–50). Omitted →
 *                  no limit, preserving the original "return everything"
 *                  behavior for existing callers (e.g. the Districts
 *                  admin page) that don't pass it.
 *                - `status`: optional exact-match filter (e.g. ACTIVE),
 *                  also opt-in — omitted keeps every status, as before.
 *              With no query params at all, this returns exactly what it
 *              always did.
 */
const getMasterDistrict = async (req, res) => {
  // #swagger.tags = ['Master District']
  // #swagger.description = 'Get District records, optionally filtered/limited for search-on-type.'
  /*
    #swagger.parameters['search'] = { in: 'query', type: 'string', required: false, description: 'Search store_name/store_number' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer', required: false, description: 'Max rows (1-50). Omit for no limit.' }
    #swagger.parameters['status'] = { in: 'query', type: 'string', required: false, description: 'Exact status filter, e.g. ACTIVE' }
  */

  const { search, limit, status } = req.query
  const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 50) : null
  const trimmedSearch = search ? String(search).trim() : ''

  try {
    const conditions = []
    const params = []

    if (status) {
      conditions.push('mdt_status = ?')
      params.push(status)
    }

    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`
      conditions.push('(mdt_store_name LIKE ? OR mdt_store_number LIKE ?)')
      params.push(term, term)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Only impose an explicit order when searching, so a plain no-params
    // call keeps the original implicit DB order for existing consumers.
    let orderClause = ''
    if (trimmedSearch) {
      orderClause = 'ORDER BY CASE WHEN mdt_store_name LIKE ? THEN 0 ELSE 1 END, mdt_store_name ASC'
      params.push(`${trimmedSearch}%`)
    }

    const limitClause = parsedLimit ? 'LIMIT ?' : ''
    if (parsedLimit) params.push(parsedLimit)

    const rows = await Query(
      `SELECT
         mdt_id AS id,
         mdt_store_number AS store_number,
         mdt_store_name AS store_name,
         mdt_region AS region,
         mdt_city_province AS city_province,
         mdt_status AS status,
         mdt_createdAt AS createdAt
       FROM master_district
       ${whereClause}
       ${orderClause}
       ${limitClause}`,
      params,
    )

    return res.status(200).json(rows)
  } catch (error) {
    console.error('Error in getMasterDistrict:', error)
    return res.status(500).json({ message: 'Error retrieving District records' })
  }
}

/**
 * @name importMasterDistrict
 * @description Bulk insert district records inside a transaction
 */
const importMasterDistrict = async (req, res) => {
  // #swagger.tags = ['Master District']
  // #swagger.description = 'Import District records from array payload'

  const userId = getUserId(req)
  const items = Array.isArray(req.body) ? req.body : req.body?.items

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty items array provided' })
  }

  try {
    const queries = []

    for (const item of items) {
      const storeNumber = item.store_number || item.storeNumber || item.mdt_store_number
      if (!storeNumber) continue

      queries.push(
        buildDistrictInsert(
          {
            store_number: storeNumber,
            store_name: item.store_name || item.storeName || item.mdt_store_name,
            region: item.region || item.mdt_region || '',
            city_province: item.city_province || item.cityProvince || item.mdt_city_province || '',
            status: item.status || item.mdt_status || 'ACTIVE',
          },
          userId,
        ),
      )
    }

    if (queries.length === 0) {
      return res.status(400).json({ message: 'No valid district records found to import' })
    }

    await Transaction(queries)

    return res.status(200).json({
      message: 'District records imported successfully',
      count: queries.length,
    })
  } catch (error) {
    console.error('Error in importMasterDistrict:', error)
    return res.status(500).json({ message: 'Error importing District records' })
  }
}

// ==========================================
// SLINK SYNC (Slink GET /bms/stores -> align master_district)
// ==========================================

const SLINK_DEFAULT_BASE_URL = 'https://slink-api.5lsolutions.com/api-bms'
const SLINK_PAGE_SIZE = 500 // Slink allows 1–1000; 500 is its default
const SLINK_REQUEST_TIMEOUT_MS = 60 * 1000
const SLINK_MAX_RETRIES = 2 // retries per page, so up to 3 attempts
const SLINK_MAX_PAGES = 200 // safety stop so a bad cursor can never loop forever
const SYNC_SAMPLE_LIMIT = 20 // how many example changes / missing stores to report back

// Fields the sync aligns with Slink (the store number is the matching key).
const DISTRICT_SYNC_FIELDS = ['store_name', 'region', 'city_province', 'status']

// Only one sync may run at a time (in this server process).
let isDistrictSyncRunning = false

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isTrueFlag = (value) => value === true || value === 'true'

/**
 * Read at call time (not at module load) so the .env file is always
 * loaded first. The API key lives ONLY in the server's environment —
 * never in code, and never sent to the browser.
 *   SLINK_API_KEY       (required)
 *   SLINK_API_BASE_URL  (optional, defaults to the documented base URL)
 * The old VITE_SLINK_* names are still accepted as a fallback.
 */
const getSlinkConfig = () => ({
  baseUrl: (
    process.env.SLINK_API_BASE_URL ||
    process.env.VITE_SLINK_API ||
    SLINK_DEFAULT_BASE_URL
  ).replace(/\/+$/, ''),
  apiKey: process.env.SLINK_API_KEY || process.env.VITE_SLINK_API_KEY,
})

/**
 * Fetches ONE page of Slink stores. `afterId` is the cursor: null for the
 * first page, otherwise the previous page's `next_after_id`. The text
 * "null" is never sent — Slink rejects it with a 400 — so the parameter
 * is simply left out when there is no cursor. No filters are sent, so
 * ACTIVE and INACTIVE stores both come back.
 *
 * A failed page is retried (same cursor) a couple of times for timeouts
 * and server errors. A 401/403 (bad API key) is not retried.
 */
const fetchSlinkStoresPage = async (afterId) => {
  const { baseUrl, apiKey } = getSlinkConfig()

  const params = new URLSearchParams({ limit: String(SLINK_PAGE_SIZE) })
  if (afterId !== null) params.set('after_id', String(afterId))
  const url = `${baseUrl}/bms/stores?${params.toString()}`

  let lastError
  for (let attempt = 0; attempt <= SLINK_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SLINK_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      })

      if (response.status === 401 || response.status === 403) {
        const authError = new Error(`Slink rejected the API key (HTTP ${response.status}).`)
        authError.nonRetryable = true
        throw authError
      }
      if (!response.ok) {
        throw new Error(`Slink responded with HTTP ${response.status} for ${url}`)
      }

      const body = await response.json()
      if (!body?.data || !Array.isArray(body.data.customers)) {
        throw new Error('Slink returned an unexpected response shape.')
      }
      return body.data
    } catch (error) {
      lastError = error
      if (error.nonRetryable) break
      if (attempt < SLINK_MAX_RETRIES) await sleep(1000 * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError
}

/** Matching key for a store number: trimmed and case-insensitive. */
const toStoreKey = (storeNumber) => normalizeText(storeNumber).toLowerCase()

/**
 * Slink store -> master_district fields.
 *   store_no   -> store_number (the key used to match our stores)
 *   store_name -> store_name
 *   region     -> region
 *   province   -> city_province
 *   status     -> status (ACTIVE / INACTIVE)
 * A store with no store_no can't be matched and is skipped. Slink's
 * nullable fields become '' so they never write NULL.
 */
const toDistrictFields = (store) => {
  const storeNumber = normalizeText(store?.store_no)
  if (!storeNumber) return null

  return {
    store_number: storeNumber,
    store_name: normalizeText(store.store_name),
    region: normalizeText(store.region),
    city_province: normalizeText(store.province),
    status: normalizeText(store.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  }
}

/** All current districts, grouped by store key (one number may map to several rows). */
const loadExistingDistrictsByKey = async () => {
  const rows = await Query(
    `SELECT
       mdt_id AS id,
       mdt_store_number AS store_number,
       mdt_store_name AS store_name,
       mdt_region AS region,
       mdt_city_province AS city_province,
       mdt_status AS status
     FROM master_district`,
  )

  const byKey = new Map()
  for (const row of rows) {
    const key = toStoreKey(row.store_number)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(row)
  }
  return byKey
}

/**
 * The fields where our stored row differs from Slink, as
 * [{ field, from, to }]. Empty array = already aligned.
 */
const describeDistrictChanges = (existing, next) =>
  DISTRICT_SYNC_FIELDS.reduce((changes, field) => {
    const current =
      field === 'status'
        ? normalizeText(existing[field]).toUpperCase()
        : normalizeText(existing[field])

    if (current !== next[field]) {
      changes.push({ field, from: normalizeText(existing[field]), to: next[field] })
    }
    return changes
  }, [])

/** Updates ONLY the fields that actually differ (see describeDistrictChanges). */
const buildDistrictUpdate = (id, changes, userId) => {
  const updateData = {}
  for (const { field, to } of changes) {
    updateData[District.cols[field]] = to
  }
  if (District.cols.updatedAt) updateData[District.cols.updatedAt] = new Date()
  if (District.cols.updatedBy && userId) updateData[District.cols.updatedBy] = userId

  const built = SQL.model(District).update(updateData).where(District.pk, id).build()
  return { sql: built.sql, values: built.bindings }
}

/**
 * @name syncMasterDistrictFromSlink
 * @description ALIGNS master_district with Slink's stores. It reads every
 *              Slink store through the paginated GET /bms/stores (cursor
 *              pagination: limit + after_id) and matches each one to our
 *              store by STORE NUMBER (trimmed, case-insensitive):
 *                - found, fields differ -> UPDATE only the differing fields
 *                                          (name, region, city/province, status)
 *                - found, identical     -> left alone
 *                - not found            -> INSERTED as a new store
 *
 *              Body option (defaults to false):
 *                - dry_run: true -> PREVIEW. Reads Slink and reports what
 *                                   WOULD change, saves nothing.
 *
 *              Each page is written in ONE transaction, so a page is either
 *              saved completely or not at all.
 *
 *              Slink is the source of truth for the aligned fields. Nothing
 *              is ever deleted: stores we have that Slink doesn't are only
 *              counted (not_in_slink) and left untouched. Running it again
 *              is safe — already-aligned stores are skipped.
 */
const syncMasterDistrictFromSlink = async (req, res) => {
  // #swagger.tags = ['Master District']
  // #swagger.description = 'Align master_district with Slink GET /bms/stores (paginated), matching by store number. Updates differing fields of existing stores and adds stores not found here. Option: dry_run (preview, saves nothing). Never deletes. Safe to re-run.'

  const userId = getUserId(req)
  const dryRun = isTrueFlag(req.body?.dry_run)

  if (typeof fetch !== 'function') {
    return res.status(500).json({ message: 'This server needs Node.js 18+ to call Slink.' })
  }

  const { apiKey } = getSlinkConfig()
  if (!apiKey) {
    return res
      .status(500)
      .json({ message: 'SLINK_API_KEY (or VITE_SLINK_API_KEY) is not configured on the server.' })
  }

  if (isDistrictSyncRunning) {
    return res.status(409).json({ message: 'A district sync is already running. Please wait.' })
  }
  isDistrictSyncRunning = true

  const summary = {
    dry_run: dryRun,
    pages: 0,
    received: 0,
    matched: 0,
    updated: 0,
    unchanged: 0,
    missing_in_master: 0,
    inserted: 0,
    skipped_no_store_no: 0,
    skipped_duplicates: 0,
  }
  const sampleChanges = []
  const sampleMissing = []
  let totalFromSlink = null

  try {
    const existingByKey = await loadExistingDistrictsByKey()
    const seenKeys = new Set()
    let afterId = null

    while (true) {
      if (summary.pages >= SLINK_MAX_PAGES) {
        throw new Error(`Stopped after ${SLINK_MAX_PAGES} pages (safety limit).`)
      }

      const page = await fetchSlinkStoresPage(afterId)

      // total_customers is only sent on the first page (null afterwards).
      if (page.total_customers !== null && page.total_customers !== undefined) {
        totalFromSlink = page.total_customers
      }

      const queries = []
      const pageCounts = {
        matched: 0,
        updated: 0,
        unchanged: 0,
        missing: 0,
        inserted: 0,
        noStoreNo: 0,
        duplicates: 0,
      }
      const pageSampleChanges = []
      const pageSampleMissing = []

      for (const store of page.customers) {
        const fields = toDistrictFields(store)
        if (!fields) {
          pageCounts.noStoreNo += 1
          continue
        }

        const key = toStoreKey(fields.store_number)
        if (seenKeys.has(key)) {
          pageCounts.duplicates += 1
          continue
        }
        seenKeys.add(key)

        const existingRows = existingByKey.get(key)

        // Not one of our stores yet: add it.
        if (!existingRows) {
          pageCounts.missing += 1
          pageCounts.inserted += 1
          pageSampleMissing.push({
            store_number: fields.store_number,
            store_name: fields.store_name,
          })
          if (!dryRun) queries.push(buildDistrictInsert(fields, userId))
          continue
        }

        // One of our stores: align only the fields that differ.
        pageCounts.matched += 1
        let touched = false
        for (const row of existingRows) {
          const changes = describeDistrictChanges(row, fields)
          if (changes.length === 0) continue

          touched = true
          if (!dryRun) queries.push(buildDistrictUpdate(row.id, changes, userId))
          pageSampleChanges.push({
            store_number: fields.store_number,
            store_name: fields.store_name,
            changes,
          })
        }

        if (touched) pageCounts.updated += 1
        else pageCounts.unchanged += 1
      }

      // One transaction per page: all of this page's changes, or none.
      // A preview (dry_run) never writes.
      if (!dryRun && queries.length > 0) await Transaction(queries)

      // Counted only after the page was handled successfully.
      summary.pages += 1
      summary.received += page.customers.length
      summary.matched += pageCounts.matched
      summary.updated += pageCounts.updated
      summary.unchanged += pageCounts.unchanged
      summary.missing_in_master += pageCounts.missing
      summary.inserted += pageCounts.inserted
      summary.skipped_no_store_no += pageCounts.noStoreNo
      summary.skipped_duplicates += pageCounts.duplicates
      sampleChanges.push(...pageSampleChanges)
      sampleMissing.push(...pageSampleMissing)

      const nextAfterId = page.next_after_id
      if (!page.has_more || nextAfterId === null || nextAfterId === undefined) break

      if (afterId !== null && Number(nextAfterId) <= Number(afterId)) {
        throw new Error('Slink cursor did not advance — stopping to avoid an endless loop.')
      }
      afterId = nextAfterId
    }

    // Our stores that Slink never returned. Left untouched (never deleted).
    let notInSlink = 0
    for (const key of existingByKey.keys()) {
      if (!seenKeys.has(key)) notInSlink += 1
    }

    const response = {
      message: dryRun
        ? 'Preview complete — nothing was saved.'
        : 'District sync from Slink completed successfully',
      synced_at: new Date().toISOString(),
      total_from_slink: totalFromSlink,
      ...summary,
      not_in_slink: notInSlink,
      sample_changes: sampleChanges.slice(0, SYNC_SAMPLE_LIMIT),
      sample_missing: sampleMissing.slice(0, SYNC_SAMPLE_LIMIT),
    }
    if (totalFromSlink !== null && summary.received !== totalFromSlink) {
      response.warning = `Slink reported ${totalFromSlink} stores but ${summary.received} were received.`
    }

    return res.status(200).json(response)
  } catch (error) {
    console.error('Error in syncMasterDistrictFromSlink:', error)
    return res.status(500).json({
      message: dryRun
        ? 'Preview failed. Nothing was saved.'
        : 'District sync from Slink failed. Pages already saved are kept — run it again.',
      error: error.message,
      total_from_slink: totalFromSlink,
      ...summary,
    })
  } finally {
    isDistrictSyncRunning = false
  }
}

module.exports = {
  getMasterDistrict,
  upsertMasterDistrict,
  importMasterDistrict,
  syncMasterDistrictFromSlink,
}
