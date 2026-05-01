/**
 * utils/mpesaConfig.js
 *
 * Centralised reader for M-Pesa paybill credentials.  Pulls from
 * process.env so the production values never live in source.
 *
 * In production NODE_ENV the helper throws if either MPESA_PAYBILL or
 * MPESA_ACCOUNT is missing — surfacing a clear 500 instead of silently
 * shipping "XXXXXX" to a customer's payment screen.  In development
 * NODE_ENV the placeholders are returned so a fresh `npm start` still
 * boots without forcing a Railway env-var setup.
 */

const PROD = process.env.NODE_ENV === 'production';

export function getMpesaConfig() {
  const paybill = process.env.MPESA_PAYBILL;
  const account = process.env.MPESA_ACCOUNT;

  if (PROD && (!paybill || !account)) {
    throw new Error(
      'FATAL: MPESA_PAYBILL and MPESA_ACCOUNT must be set in production. ' +
      'Configure them on Railway before serving /api/wallet/mpesa-info or /api/payment.'
    );
  }

  return {
    paybillNumber: paybill || 'XXXXXX',
    accountNumber: account || 'XXXXXX',
  };
}
