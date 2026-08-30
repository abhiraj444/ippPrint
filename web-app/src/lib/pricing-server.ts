import fs from 'fs';
import path from 'path';
import { PricingRates, DEFAULT_RATES } from './pricing';

const PRICING_FILE_PATH = path.join(process.cwd(), 'pricing-config.json');

/**
 * Server-only: Load pricing rates from:
 * 1. Runtime saved pricing-config.json file
 * 2. Server Environment variables
 * 3. Default fallback rates
 */
export function getPricingRates(): PricingRates {
  // 1. Check runtime json file
  try {
    if (fs.existsSync(PRICING_FILE_PATH)) {
      const raw = fs.readFileSync(PRICING_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.bwSimplex === 'number' &&
        typeof parsed.bwDuplex === 'number' &&
        typeof parsed.colorSimplex === 'number' &&
        typeof parsed.colorDuplex === 'number'
      ) {
        return {
          bwSimplex: parsed.bwSimplex,
          bwDuplex: parsed.bwDuplex,
          colorSimplex: parsed.colorSimplex,
          colorDuplex: parsed.colorDuplex,
        };
      }
    }
  } catch (err) {
    console.warn('[PricingServer] Could not read pricing-config.json:', err);
  }

  // 2. Check environment variables
  const envBwSimplex = process.env.PRINT_RATE_BW_SIMPLEX ? parseFloat(process.env.PRINT_RATE_BW_SIMPLEX) : undefined;
  const envBwDuplex = process.env.PRINT_RATE_BW_DUPLEX ? parseFloat(process.env.PRINT_RATE_BW_DUPLEX) : undefined;
  const envColorSimplex = process.env.PRINT_RATE_COLOR_SIMPLEX ? parseFloat(process.env.PRINT_RATE_COLOR_SIMPLEX) : undefined;
  const envColorDuplex = process.env.PRINT_RATE_COLOR_DUPLEX ? parseFloat(process.env.PRINT_RATE_COLOR_DUPLEX) : undefined;

  return {
    bwSimplex: envBwSimplex && !isNaN(envBwSimplex) ? envBwSimplex : DEFAULT_RATES.bwSimplex,
    bwDuplex: envBwDuplex && !isNaN(envBwDuplex) ? envBwDuplex : DEFAULT_RATES.bwDuplex,
    colorSimplex: envColorSimplex && !isNaN(envColorSimplex) ? envColorSimplex : DEFAULT_RATES.colorSimplex,
    colorDuplex: envColorDuplex && !isNaN(envColorDuplex) ? envColorDuplex : DEFAULT_RATES.colorDuplex,
  };
}

/**
 * Server-only: Save new pricing rates to persistent storage
 */
export function savePricingRates(rates: Partial<PricingRates>): PricingRates {
  const current = getPricingRates();
  const updated: PricingRates = {
    bwSimplex: typeof rates.bwSimplex === 'number' && rates.bwSimplex >= 0 ? rates.bwSimplex : current.bwSimplex,
    bwDuplex: typeof rates.bwDuplex === 'number' && rates.bwDuplex >= 0 ? rates.bwDuplex : current.bwDuplex,
    colorSimplex: typeof rates.colorSimplex === 'number' && rates.colorSimplex >= 0 ? rates.colorSimplex : current.colorSimplex,
    colorDuplex: typeof rates.colorDuplex === 'number' && rates.colorDuplex >= 0 ? rates.colorDuplex : current.colorDuplex,
  };

  try {
    fs.writeFileSync(PRICING_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    console.log('[PricingServer] Saved updated pricing rates:', updated);
  } catch (err) {
    console.error('[PricingServer] Failed to write pricing-config.json:', err);
  }

  return updated;
}
