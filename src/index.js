/**
 * index.js — CLI entry point for the Hotel Data Enrichment Tool.
 *
 * Usage:
 *   node src/index.js <url>                          # Single URL
 *   node src/index.js <url1> <url2> ...              # Multiple URLs
 *   node src/index.js --file urls.txt                # Newline-separated file
 *   node src/index.js --json <url>                   # Also export to JSON
 *   node src/index.js --concurrency 5 <url1> <url2>  # Custom parallelism
 *   node src/index.js --proposal <url>               # Generate tailored outreach
 *   node src/index.js --proposal-only --website <url> # Only generate outreach
 */

import 'dotenv/config';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import pLimit from 'p-limit';

import { isValidBookingUrl } from './scrapers/bookingScraper.js';
import { normalizeBookingUrl } from './utils/normalize.js';
import { processSingleHotel } from './pipeline.js';
import { generateTailoredProposal } from './services/proposalService.js';
import { appendToCSV, appendToJSON } from './export/csvWriter.js';
import { logger } from './utils/logger.js';

// ── Parse CLI arguments ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const flags = {
  json:        args.includes('--json'),
  proposal:    args.includes('--proposal'),
  proposalOnly: args.includes('--proposal-only'),
  concurrency: parseInt(getFlag(args, '--concurrency') ?? '3', 10),
  urlFile:     getFlag(args, '--file'),
  website:      getFlag(args, '--website'),
  hotelName:    getFlag(args, '--hotel-name'),
  email:        getFlag(args, '--email'),
  instagram:    getFlag(args, '--instagram'),
  proposalOffer: getFlag(args, '--proposal-offer') ?? process.env.PROPOSAL_OFFER,
  openRouterModel: getFlag(args, '--openrouter-model') ?? process.env.OPENROUTER_MODEL,
};

if (!Number.isInteger(flags.concurrency) || flags.concurrency < 1) {
  logger.error('cli', '--concurrency must be a positive integer.');
  process.exit(1);
}

const openRouterApiKey = process.env.OPENROUTER_API_KEY;
if ((flags.proposal || flags.proposalOnly) && !openRouterApiKey) {
  logger.warn('cli', 'OPENROUTER_API_KEY is not set — proposal generation will be skipped.');
}

// ── Collect URLs ─────────────────────────────────────────────────────────────

let urls = getPositionalUrls(args);

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

if (flags.proposalOnly && flags.website) {
  urls = [flags.website, ...urls];
}

// ── Proposal-only mode ───────────────────────────────────────────────────────

if (flags.proposalOnly) {
  const validWebsites = urls.filter(isUrl);
  const invalidWebsites = urls.filter((u) => !isUrl(u));

  if (invalidWebsites.length > 0) {
    logger.warn('cli', `Skipping ${invalidWebsites.length} invalid website URL(s)`, {
      invalidWebsites,
    });
  }

  if (validWebsites.length === 0) {
    logger.error('cli', 'No valid website URL provided for --proposal-only.');
    printHelp();
    process.exit(1);
  }

  logger.info('cli', `Generating proposal(s) for ${validWebsites.length} website URL(s)`);

  const limit = pLimit(flags.concurrency);
  const errors = [];
  const results = (await Promise.all(
    validWebsites.map((websiteUrl) =>
      limit(async () => {
        try {
          const record = createProposalOnlyRecord(websiteUrl, flags);
          const proposalData = await generateTailoredProposal(record, {
            apiKey: openRouterApiKey,
            model: flags.openRouterModel ?? undefined,
            offer: flags.proposalOffer ?? undefined,
          });

          return { ...record, ...proposalData };
        } catch (err) {
          logger.error('cli', 'Fatal error generating proposal', {
            website: websiteUrl,
            reason: err.message,
          });
          errors.push({ website: websiteUrl, error: err.message });
          return null;
        }
      }),
    ),
  )).filter(Boolean);

  await appendToCSV(results);
  if (flags.json) {
    await appendToJSON(results);
  }

  console.log('\n');
  logger.info('cli', `✅ Done! ${results.length} proposal record(s) saved to hotels.csv`);
  if (flags.json) {
    logger.info('cli', '   JSON also saved to hotels.json');
  }
  if (errors.length > 0) {
    logger.warn('cli', `⚠️  ${errors.length} website URL(s) failed:`, errors);
  }

  process.exit(0);
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
const errors  = [];

const results = (await Promise.all(
  validUrls.map((url) =>
    limit(async () => {
      try {
        const bookingUrl = normalizeBookingUrl(url);
        return await processSingleHotel(bookingUrl, apiKey, {
          proposal: flags.proposal,
          openRouterApiKey,
          openRouterModel: flags.openRouterModel,
          proposalOffer: flags.proposalOffer,
        });
      } catch (err) {
        logger.error('cli', `Fatal error processing URL`, { url, reason: err.message });
        errors.push({ url, error: err.message });
        return null;
      }
    }),
  ),
)).filter(Boolean);

await appendToCSV(results);
if (flags.json) {
  await appendToJSON(results);
}

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

function getPositionalUrls(argv) {
  const valueFlags = new Set([
    '--concurrency',
    '--file',
    '--website',
    '--hotel-name',
    '--email',
    '--instagram',
    '--proposal-offer',
    '--openrouter-model',
  ]);

  const urls = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (valueFlags.has(arg)) {
      i += 1;
      continue;
    }

    if (!arg.startsWith('--') && isUrl(arg)) {
      urls.push(arg);
    }
  }

  return urls;
}

function createProposalOnlyRecord(websiteUrl, opts) {
  const parsed = new URL(websiteUrl);
  const fallbackName = parsed.hostname.replace(/^www\./, '');
  const safe = (val) => (val ?? '').toString().trim();

  return {
    name: safe(opts.hotelName || fallbackName),
    phone: '',
    website: websiteUrl,
    email: safe(opts.email),
    instagram: safe(opts.instagram),
    source: websiteUrl,
    googleMapsUrl: '',
  };
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
  --proposal            Generate tailored proposal email + Instagram DM
  --proposal-only       Skip Booking/Google/contact scraping; only generate proposal
  --website <url>       Hotel website URL for --proposal-only
  --hotel-name <name>   Hotel/property name for --proposal-only
  --email <email>       Known hotel email for --proposal-only output/context
  --instagram <handle>  Known Instagram for --proposal-only output/context
  --proposal-offer <s>  Offer/service description for proposal copy
  --openrouter-model <m> OpenRouter model (default: OPENROUTER_MODEL or openai/gpt-5)
  -h, --help            Show this help

EXAMPLES:
  node src/index.js https://www.booking.com/hotel/tr/wolf-of-the-city.html
  node src/index.js --json --concurrency 5 <url1> <url2>
  node src/index.js --proposal --proposal-offer "AI booking automation" <url>
  node src/index.js --proposal-only --website https://hotel.example --hotel-name "Example Hotel"
  node src/index.js --file urls.txt --json

OUTPUT:
  hotels.csv  (always)
  hotels.json (with --json flag)

ENV:
  GOOGLE_API_KEY  Required for Google Places enrichment
  OPENROUTER_API_KEY Required for --proposal generation
  OPENROUTER_MODEL Optional model override
  PROPOSAL_OFFER Optional default proposal offer
`);
}
