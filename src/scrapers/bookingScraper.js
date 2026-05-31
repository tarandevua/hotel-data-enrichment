/**
 * bookingScraper.js — Extract hotel name from a Booking.com URL using Playwright.
 *
 * Strategy (in order):
 *   1. <h2 class*="pp-header__title"> (modern Booking structure)
 *   2. [data-testid="property-name"]
 *   3. First <h1> or <h2> on the page
 *   4. OpenGraph og:title meta tag
 */

import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';
import { withRetry, sleep } from '../utils/retry.js';

/** Suffixes injected by Booking.com to strip from names */
const BOOKING_SUFFIXES = [
  /\s*[–—-]\s*booking\.com\s*$/i,
  /\s*[–—-]\s*book now.*$/i,
  /,\s*\w+\s*–.*$/i,
];

/**
 * Clean raw title text extracted from Booking.com page.
 * @param {string} raw
 * @returns {string}
 */
function cleanHotelName(raw) {
  let name = raw.trim();
  for (const pattern of BOOKING_SUFFIXES) {
    name = name.replace(pattern, '').trim();
  }
  return name;
}

/**
 * Scrape a Booking.com hotel page and return the hotel name.
 *
 * @param {string} url - Full Booking.com hotel URL
 * @returns {Promise<{ hotelName: string }>}
 */
export async function scrapeBookingHotel(url) {
  logger.info('booking', `Scraping hotel name`, { url });

  return withRetry(
    async () => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'en-US',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

        // Small delay to let any late JS paint run
        await sleep(1500);

        // ── Selector 1: Modern PP header title ──────────────────────────────
        let hotelName = await page
          .locator('[class*="pp-header__title"], [class*="hotelchains__title"]')
          .first()
          .textContent({ timeout: 3000 })
          .catch(() => null);

        // ── Selector 2: data-testid ──────────────────────────────────────────
        if (!hotelName) {
          hotelName = await page
            .locator('[data-testid="property-name"]')
            .first()
            .textContent({ timeout: 3000 })
            .catch(() => null);
        }

        // ── Selector 3: First H1 / H2 ────────────────────────────────────────
        if (!hotelName) {
          hotelName = await page
            .locator('h1, h2')
            .first()
            .textContent({ timeout: 3000 })
            .catch(() => null);
        }

        // ── Selector 4: OpenGraph fallback ───────────────────────────────────
        if (!hotelName) {
          hotelName = await page
            .locator('meta[property="og:title"]')
            .getAttribute('content', { timeout: 3000 })
            .catch(() => null);
        }

        if (!hotelName) {
          throw new Error(`Could not extract hotel name from: ${url}`);
        }

        const cleaned = cleanHotelName(hotelName);
        logger.info('booking', `Extracted hotel name: "${cleaned}"`);
        return { hotelName: cleaned };
      } finally {
        await browser.close();
      }
    },
    { retries: 3, baseDelayMs: 2000, label: `booking:${url}` },
  );
}

/**
 * Validate that a URL looks like a Booking.com hotel page.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidBookingUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes('booking.com') &&
      parsed.pathname.includes('/hotel/')
    );
  } catch {
    return false;
  }
}
