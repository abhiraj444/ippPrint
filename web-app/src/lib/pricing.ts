export interface PricingRates {
  bwSimplex: number; // e.g. 2.0
  bwDuplex: number;  // e.g. 3.0
  colorSimplex: number; // e.g. 10.0
  colorDuplex: number;  // e.g. 15.0
}

export const DEFAULT_RATES: PricingRates = {
  bwSimplex: 2.0,
  bwDuplex: 3.0,
  colorSimplex: 10.0,
  colorDuplex: 15.0,
};

/**
 * Calculate rate per sheet based on color and duplex settings
 */
export function getRatePerSheet(isColor: boolean, isDuplex: boolean, rates?: PricingRates): number {
  const activeRates = rates || DEFAULT_RATES;
  if (isColor) {
    return isDuplex ? activeRates.colorDuplex : activeRates.colorSimplex;
  }
  return isDuplex ? activeRates.bwDuplex : activeRates.bwSimplex;
}

/**
 * Calculate total price for a given number of printed sheets
 */
export function calculatePrintPrice(totalSheets: number, isColor: boolean, isDuplex: boolean, rates?: PricingRates): number {
  const rate = getRatePerSheet(isColor, isDuplex, rates);
  return Math.max(1, Math.round(totalSheets * rate));
}
