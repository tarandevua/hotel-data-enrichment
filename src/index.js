/**
 * index.js — CLI entry point for the Hotel Data Enrichment Tool.
 *
 * Usage:
 *   node src/index.js <url>                          # Single URL
 *   node src/index.js <url1> <url2> ...              # Multiple URLs
 *   node src/index.js --file urls.txt                # Newline-separated file
 *   node src/index.js --json <url>                   # Also export to JSON
 *   node src/index.js --concurrency 5 <url1> <url2>  # Custom parallelism
 */

import 'dotenv/config';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import pLimit from 'p-limit';

import { isValidBookingUrl } from './scrapers/bookingScraper.js';
import { normalizeBookingUrl } from './utils/normalize.js';
import { processSingleHotel } from './pipeline.js';
import { logger } from './utils/logger.js';

// ── Parse CLI arguments ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const flags = {
  json:        args.includes('--json'),
  concurrency: parseInt(getFlag(args, '--concurrency') ?? '3', 10),
  urlFile:     getFlag(args, '--file'),
};

// ── Collect URLs ─────────────────────────────────────────────────────────────

let urls = args.filter((a) => !a.startsWith('--') && isUrl(a));

if (flags.urlFile) {
  if (!existsSync(flags.urlFile)) {
    logger.error('cli', `File not found: ${flags.urlFile}`);
    process.exit(1);
  }
  const content = await readFile(flags.urlFile, 'utf-8');
  const fileUrls = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  urls = [...urls, ...fileUrls];
}

// ── Validate URLs ─────────────────────────────────────────────────────────────

const validUrls   = urls.filter((u) => isValidBookingUrl(u));
const invalidUrls = urls.filter((u) => !isValidBookingUrl(u));

if (invalidUrls.length > 0) {
  logger.warn('cli', `Skipping ${invalidUrls.length} invalid URL(s)`, { invalidUrls });
}

if (validUrls.length === 0) {
  logger.error('cli', 'No valid Booking.com hotel URLs provided.');
  printHelp();
  process.exit(1);
}

// ── Run pipeline ─────────────────────────────────────────────────────────────

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  logger.warn('cli', 'GOOGLE_API_KEY is not set — Google Places enrichment will be skipped.');
}

logger.info('cli', `Processing ${validUrls.length} URL(s) with concurrency=${flags.concurrency}`);

const limit   = pLimit(flags.concurrency);
const results = [];
const errors  = [];

await Promise.all(
  validUrls.map((url) =>
    limit(async () => {
      try {
        const bookingUrl = normalizeBookingUrl(url);
        const record = await processSingleHotel(bookingUrl, apiKey, { json: flags.json });
        results.push(record);
      } catch (err) {
        logger.error('cli', `Fatal error processing URL`, { url, reason: err.message });
        errors.push({ url, error: err.message });
      }
    }),
  ),
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n');
logger.info('cli', `✅ Done! ${results.length} record(s) saved to hotels.csv`);
if (flags.json) {
  logger.info('cli', `   JSON also saved to hotels.json`);
}
if (errors.length > 0) {
  logger.warn('cli', `⚠️  ${errors.length} URL(s) failed:`, errors);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFlag(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

function isUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         Hotel Data Enrichment Tool — v1.0.0                 ║
╚══════════════════════════════════════════════════════════════╝

USAGE:
  node src/index.js [options] <url> [url2] ...

OPTIONS:
  --file <path>         Read URLs from a newline-separated text file
  --json                Also export results to hotels.json
  --concurrency <n>     Max parallel pipelines (default: 3)
  -h, --help            Show this help

EXAMPLES:
  node src/index.js https://www.booking.com/hotel/tr/wolf-of-the-city.html
  node src/index.js --json --concurrency 5 <url1> <url2>
  node src/index.js --file urls.txt --json

OUTPUT:
  hotels.csv  (always)
  hotels.json (with --json flag)

ENV:
  GOOGLE_API_KEY  Required for Google Places enrichment
`);
}
