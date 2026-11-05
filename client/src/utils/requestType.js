// The backend decides request_type from the purpose (see TRAVEL_REGEX in
// cash-request.controller.js). The frontend only maps it to a form:
//   'TRAVEL EXPENSES' -> 'TRAVEL'        (TRAVEL_GRID_COLS)
//   anything else     -> 'MISCELLANEOUS' (MISC_GRID_COLS)
export const getLiquidationTypeForRequest = (request) =>
  String(request?.request_type || '').toUpperCase() === 'TRAVEL EXPENSES'
    ? 'TRAVEL'
    : 'MISCELLANEOUS'
