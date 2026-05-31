/**
 * websiteScraper.js
 *
 * Hotel website enrichment:
 * - Email
 * - Instagram
 *
 * Strategy:
 * 1. Axios request
 * 2. Playwright fallback for blocked sites
 * 3. Parse homepage
 * 4. Parse contact pages
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

import { logger } from '../utils/logger.js';
import { withRetry, sleep } from '../utils/retry.js';
import { extractEmails, extractInstagram } from '../utils/regex.js';
import { decodeCloudflareEmail } from '../utils/cloudflare.js';
import { extractInstagramHandle } from '../utils/instagram.js';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.google.com/',
};

const CONTACT_KEYWORDS = [
  'contact',
  'contact-us',
  'contactus',
  'reach-us',
  'reach',
  'about',
];

async function fetchWithAxios(url) {
  const response = await axios.get(url, {
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
  });

  if ([403, 429, 503].includes(response.status)) {
    throw new Error(`BLOCKED_${response.status}`);
  }

  if (response.status >= 400) {
    throw new Error(`HTTP_${response.status}`);
  }

  return response.data;
}

async function fetchWithPlaywright(url) {
  logger.info('website', 'Using Playwright fallback', { url });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      userAgent: HEADERS['User-Agent'],
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    return await page.content();
  } finally {
    await browser.close();
  }
}

async function fetchHtml(url) {
  try {
    return await fetchWithAxios(url);
  } catch (err) {
    logger.warn('website', 'Axios failed, switching to Playwright', {
      url,
      reason: err.message,
    });

    return await fetchWithPlaywright(url);
  }
}

function normalizeUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parsePage(html) {
  const $ = cheerio.load(html);

  let cloudflareEmails = [];
  let email = null;
  let instagram = null;
  
  const mailtoEmails = [];

  $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
    const span = $(el).find('.__cf_email__');
    const encoded = span.attr('data-cfemail');

    if (encoded) {
      try {
        const decoded = decodeCloudflareEmail(encoded);
        cloudflareEmails.push(decoded.toLowerCase());
      } catch (e) {}
    }
  });

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';

    const extracted = href
      .replace(/^mailto:/i, '')
      .split('?')[0]
      .trim()
      .toLowerCase();

    if (extracted) {
      mailtoEmails.push(extracted);
    }
  });

  // --------------------------------------------------
  // EMAILS FROM PAGE TEXT
  // --------------------------------------------------

  const bodyText = $('body').text();

  const textEmails = extractEmails(bodyText);

  const allEmails = [
    ...new Set([
      ...mailtoEmails,
      ...textEmails,
      ...cloudflareEmails,
    ]),
  ];

  email = allEmails[0] || null;

  // --------------------------------------------------
  // INSTAGRAM FROM LINKS
  // --------------------------------------------------

  $('a[href*="instagram.com"]').each((_, el) => {
    if (instagram) return;

    const href = $(el).attr('href');

    const handle = extractInstagramHandle(href);

    if (handle) {
      instagram = handle;
    }
  });

  // --------------------------------------------------
  // JSON-LD
  // --------------------------------------------------

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();

      if (!raw) return;

      const json = JSON.parse(raw);

      const objects = Array.isArray(json)
        ? json
        : [json];

      for (const obj of objects) {
        if (!email && obj.email) {
          email = obj.email;
        }

        if (
          !instagram &&
          Array.isArray(obj.sameAs)
        ) {
          const ig = obj.sameAs.find((link) =>
            link.includes('instagram.com')
          );

          if (ig) {
            instagram = ig;
          }
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });

  // --------------------------------------------------
  // REGEX FALLBACK
  // --------------------------------------------------

  if (!instagram) {
    instagram = extractInstagram(html);
  }

  // --------------------------------------------------
  // CONTACT LINKS
  // --------------------------------------------------

  const contactLinks = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href');

    if (!href) return;

    const lower = href.toLowerCase();

    const matches = CONTACT_KEYWORDS.some(
      (keyword) => lower.includes(keyword)
    );

    if (matches) {
      contactLinks.push(href);
    }
  });

  return {
    email,
    instagram,
    contactLinks,
  };
}

export async function scrapeHotelWebsite(websiteUrl) {
  if (!websiteUrl) {
    return {
      email: null,
      instagram: null,
    };
  }

  logger.info('website', 'Starting website scrape', {
    url: websiteUrl,
  });

  try {
    return await withRetry(
      async () => {
        await sleep(800);

        const homepageHtml = await fetchHtml(
          websiteUrl
        );

        const homepageData =
          parsePage(homepageHtml);

        let email = homepageData.email;
        let instagram =
          homepageData.instagram;

        // --------------------------------------------------
        // CRAWL CONTACT PAGES IF NEEDED
        // --------------------------------------------------

        if (!email || !instagram) {
          const links = homepageData.contactLinks
            .slice(0, 3)
            .map((href) =>
              normalizeUrl(websiteUrl, href)
            )
            .filter(Boolean);

          for (const link of links) {
            try {
              const html = await fetchHtml(link);
              const pageData = parsePage(html);

              if (!email && pageData.email) {
                email = pageData.email;
              }

              if (
                !instagram &&
                pageData.instagram
              ) {
                instagram =
                  pageData.instagram;
              }

              if (email && instagram) {
                break;
              }
            } catch (err) {
              logger.warn(
                'website',
                'Contact page scrape failed',
                {
                  url: link,
                  reason: err.message,
                }
              );
            }
          }
        }

        logger.info(
          'website',
          'Website scrape completed',
          {
            email:
              email || 'not found',
            instagram:
              instagram || 'not found',
          }
        );

        return {
          email,
          instagram,
        };
      },
      {
        retries: 2,
        baseDelayMs: 1500,
        label: `website:${websiteUrl}`,
      }
    );
  } catch (err) {
    logger.warn(
      'website',
      'Website scrape failed',
      {
        url: websiteUrl,
        reason: err.message,
      }
    );

    return {
      email: null,
      instagram: null,
    };
  }
}