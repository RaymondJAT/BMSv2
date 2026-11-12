export const getLiquidationTypeForRequest = (request) =>
  String(request?.request_type || '').toUpperCase() === 'TRAVEL EXPENSES'
    ? 'TRAVEL'
    : 'MISCELLANEOUS'
