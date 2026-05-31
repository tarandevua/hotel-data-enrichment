/**
 * normalize.js — Merges enriched data into a canonical hotel record.
 */

/**
 * @typedef {Object} HotelRecord
 * @property {string} name
 * @property {string} phone
 * @property {string} website
 * @property {string} email
 * @property {string} instagram
 * @property {string} source
 */

/**
 * Merge scraping results into a single normalized hotel record.
 *
 * Priority: Google Places data > fallbacks from other sources.
 * Empty / null fields are replaced with empty string for CSV safety.
 *
 * @param {Object} booking   - { hotelName }
 * @param {Object} places    - { name, phone, website }
 * @param {Object} website   - { email, instagram }
 * @param {string} sourceUrl - Original Booking.com URL
 * @returns {HotelRecord}
 */
export function normalizeHotelRecord(booking, places, website, sourceUrl) {
  const safe = (val) => (val ?? '').toString().trim();

  return {
    name:      safe(places?.name      || booking?.hotelName),
    phone:     safe(places?.phone),
    website:   safe(places?.website),
    email:     safe(website?.email),
    instagram: safe(website?.instagram),
    source:    sourceUrl ?? 'booking.com',
  };
}

/**
 * Normalize Booking.com URL
 *
 * Removes:
 * - tracking params
 * - search params
 * - fragments
 * @param {string} url
 * @returns {string}
 */
export function normalizeBookingUrl(url) {
  try {
    const parsed = new URL(url);

    parsed.search = '';
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return url;
  }
}
