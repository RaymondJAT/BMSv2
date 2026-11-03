/**
 * Converts the frontend's { dateFrom, dateTo } into the backend's
 * date_from / date_to query params. Other params pass through untouched.
 */
export const withDateParams = ({ dateFrom, dateTo, ...rest } = {}) => ({
  ...rest,
  ...(dateFrom ? { date_from: dateFrom } : {}),
  ...(dateTo ? { date_to: dateTo } : {}),
})
