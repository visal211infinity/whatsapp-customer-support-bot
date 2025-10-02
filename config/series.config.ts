/**
 * Series configuration mapping
 * Maps series codes to Telegram group usernames
 */

import { SeriesMapping } from "../src/types";

export const seriesMapping: SeriesMapping = {
  AB001: "wbsd06",
  AB002: "dfhjuuu",
  AB003: "wbsd08",
  // Add more series mappings here
};

/**
 * Get Telegram group username from series code
 */
export function getTelegramGroup(seriesCode: string): string | null {
  return seriesMapping[seriesCode.toUpperCase()] || null;
}

/**
 * Check if series code exists
 */
export function isValidSeries(seriesCode: string): boolean {
  return seriesCode.toUpperCase() in seriesMapping;
}
