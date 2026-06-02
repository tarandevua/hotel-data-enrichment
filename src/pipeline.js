/**
 * pipeline.js — Core enrichment pipeline for a single hotel URL.
 *
 * Orchestrates: Booking → Places → Website → Normalize → Proposal
 */

import { scrapeBookingHotel } from './scrapers/bookingScraper.js';
import { enrichWithGooglePlaces } from './services/googlePlacesService.js';
import { scrapeHotelWebsite } from './scrapers/websiteScraper.js';
import { generateTailoredProposal } from './services/proposalService.js';
import { normalizeHotelRecord } from './utils/normalize.js';
import { logger } from './utils/logger.js';

/**
 * Process a single Booking.com URL through the full enrichment pipeline.
 *
 * @param {string} url           - Booking.com hotel URL
 * @param {string} apiKey        - Google Places API key
 * @param {Object} [opts]
 * @param {boolean} [opts.proposal]
 * @param {string} [opts.openRouterApiKey]
 * @param {string} [opts.openRouterModel]
 * @param {string} [opts.proposalOffer]
 * @returns {Promise<import('./utils/normalize.js').HotelRecord>}
 */
export async function processSingleHotel(
  url,
  apiKey,
  {
    proposal = false,
    openRouterApiKey = null,
    openRouterModel = null,
    proposalOffer = null,
  } = {},
) {
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
  let places = { name: null, phone: null, website: null, googleMapsUrl: null };
  if (booking.hotelName) {
    places = await enrichWithGooglePlaces(booking.hotelName, apiKey);
  } else {
    logger.warn('pipeline', 'Skipping Places — no hotel name available');
  }

  logger.info('pipeline', `[2/3] Places: phone=${places.phone ?? '-'}, website=${places.website ?? '-'}, googleMapsUrl=${places.googleMapsUrl ?? '-'}`);

  // ── Step 4: Website scrape ────────────────────────────────────────────────
  const website = await scrapeHotelWebsite(places.website ?? null);

  logger.info('pipeline', `[3/4] Website: email=${website.email ?? '-'}, instagram=${website.instagram ?? '-'}`);

  // ── Step 5: Normalize ─────────────────────────────────────────────────────
  let record = normalizeHotelRecord(booking, places, website, url);

  // ── Step 6: AI proposal generation ────────────────────────────────────────
  if (proposal) {
    const proposalData = await generateTailoredProposal(record, {
      apiKey: openRouterApiKey,
      model: openRouterModel ?? undefined,
      offer: proposalOffer ?? undefined,
    });

    record = { ...record, ...proposalData };
    logger.info('pipeline', `[4/4] Proposal generated: ${record.proposalEmail ? 'yes' : 'no'}`);
  }

  logger.info('pipeline', `Normalized record`, record);

  logger.info('pipeline', `━━━ DONE  ━━━ ${url}\n`);
  return record;
}
