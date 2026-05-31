/**
 * pipeline.js — Core enrichment pipeline for a single hotel URL.
 *
 * Orchestrates: Booking → Places → Website → Normalize → Export
 */

import { scrapeBookingHotel } from './scrapers/bookingScraper.js';
import { enrichWithGooglePlaces } from './services/googlePlacesService.js';
import { scrapeHotelWebsite } from './scrapers/websiteScraper.js';
import { normalizeHotelRecord } from './utils/normalize.js';
import { appendToCSV, appendToJSON } from './export/csvWriter.js';
import { logger } from './utils/logger.js';

/**
 * Process a single Booking.com URL through the full enrichment pipeline.
 *
 * @param {string} url           - Booking.com hotel URL
 * @param {string} apiKey        - Google Places API key
 * @param {Object} [opts]
 * @param {boolean} [opts.json]  - Also export to JSON
 * @returns {Promise<import('./utils/normalize.js').HotelRecord>}
 */
export async function processSingleHotel(url, apiKey, { json = false } = {}) {
  logger.info('pipeline', `━━━ START ━━━ ${url}`);

  // ── Step 2: Booking.com scrape ────────────────────────────────────────────
  let booking = { hotelName: null };
  try {
    booking = await scrapeBookingHotel(url);
  } catch (err) {
    logger.error('pipeline', `Booking scrape failed`, { url, reason: err.message });
  }

  logger.info('pipeline', `[1/3] Hotel name: "${booking.hotelName ?? 'unknown'}"`);

  // ── Step 3: Google Places enrichment ─────────────────────────────────────
  let places = { name: null, phone: null, website: null };
  if (booking.hotelName) {
    places = await enrichWithGooglePlaces(booking.hotelName, apiKey);
  } else {
    logger.warn('pipeline', 'Skipping Places — no hotel name available');
  }

  logger.info('pipeline', `[2/3] Places: phone=${places.phone ?? '-'}, website=${places.website ?? '-'}`);

  // ── Step 4: Website scrape ────────────────────────────────────────────────
  const website = await scrapeHotelWebsite(places.website ?? null);

  logger.info('pipeline', `[3/3] Website: email=${website.email ?? '-'}, instagram=${website.instagram ?? '-'}`);

  // ── Step 5: Normalize ─────────────────────────────────────────────────────
  const record = normalizeHotelRecord(booking, places, website, url);

  logger.info('pipeline', `Normalized record`, record);

  // ── Step 6: Export ────────────────────────────────────────────────────────
  await appendToCSV([record]);
  if (json) {
    await appendToJSON([record]);
  }

  logger.info('pipeline', `━━━ DONE  ━━━ ${url}\n`);
  return record;
}
