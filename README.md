# Hotel Data Enrichment Tool

A production-ready Node.js pipeline that enriches Booking.com hotel URLs with contact data, social links, and verified business details.

```
Booking.com URL → Hotel Name → Google Places (phone + website) → Website Scrape (email + Instagram) → hotels.csv
```

With proposal generation enabled:

```
Hotel Website → Style/brand analysis → OpenRouter model request → tailored email + Instagram DM
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser (Chromium)
npx playwright install chromium

# 3. Configure environment
cp .env.example .env
# Edit .env and set GOOGLE_API_KEY
```

---

## Usage

### Single URL

```bash
node src/index.js https://www.booking.com/hotel/tr/wolf-of-the-city.en-gb.html
```

### Multiple URLs

```bash
node src/index.js <url1> <url2> <url3>
```

### From a file (`urls.txt` — one URL per line)

```bash
node src/index.js --file urls.txt
```

### With JSON export + custom concurrency

```bash
node src/index.js --json --concurrency 5 --file urls.txt
```

### With tailored proposal generation

```bash
node src/index.js --proposal --proposal-offer "AI booking automation and website conversion improvements" <url>
```

### Proposal generation only

Skip Booking.com scraping, Google Places, and contact scraping when you already know the hotel website:

```bash
node src/index.js --proposal-only --website https://hotel.example --hotel-name "Example Hotel" --json
```

You can also pass website URLs positionally or from a file:

```bash
node src/index.js --proposal-only https://hotel-a.example https://hotel-b.example
node src/index.js --proposal-only --file hotel-websites.txt
```

---

## Output

**`hotels.csv`** (always written):

```csv
name,phone,website,email,instagram,source,googleMapsUrl
Wolf Of The City Hotel & SPA,+905417246010,http://wolfofthecityhotel.com,info@wolfofthecityhotel.com,https://instagram.com/wolfhotel,booking.com,https://www.google.com/maps/place/?q=place_id:ChIJETabBByQwxQRfIBQYLkVckA
```

**`hotels.json`** (with `--json` flag):

```json
[
  {
    "name": "Wolf Of The City Hotel & SPA",
    "phone": "+905417246010",
    "website": "http://wolfofthecityhotel.com",
    "email": "info@wolfofthecityhotel.com",
    "instagram": "https://instagram.com/wolfhotel",
    "source": "https://www.booking.com/hotel/tr/wolf-of-the-city.en-gb.html",
    "googleMapsUrl": "https://www.google.com/maps/place/?q=place_id:ChIJETabBByQwxQRfIBQYLkVckA",
    "websiteStyleNotes": "Modern wellness-led positioning with spa imagery and direct booking cues.",
    "uniqueAngles": "spa focus | Antalya location | direct booking CTA",
    "proposalEmail": "Subject: ...",
    "instagramMessage": "Hi ..."
  }
]
```

---

## Architecture

```
src/
├── index.js                  # CLI entry point (p-limit concurrency)
├── pipeline.js               # Single-hotel pipeline orchestrator
├── scrapers/
│   ├── bookingScraper.js     # Playwright — Booking.com hotel name extraction
│   └── websiteScraper.js     # Axios + Cheerio — email & Instagram extraction
├── services/
│   └── googlePlacesService.js # Google Places API (findplacefromtext → details)
├── utils/
│   ├── cloudflare.js         # Decode Cloudflare Email
│   ├── instagram.js          # Extract Instagram handle from any Instagram URL
│   ├── normalize.js          # Merge + null-safe normalization
│   ├── regex.js              # Email & Instagram regex utilities
│   ├── logger.js             # Structured color logger
│   └── retry.js              # Exponential back-off retry wrapper
└── export/
    └── csvWriter.js          # csv-writer + JSON export
```

---

## Environment Variables

| Variable         | Required | Description                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| `GOOGLE_API_KEY` | Yes      | Google Places API key                                 |
| `OPENROUTER_API_KEY` | For `--proposal` | OpenRouter API key for model requests |
| `OPENROUTER_MODEL` | No | OpenRouter model id (default: `openai/gpt-5`) |
| `PROPOSAL_OFFER` | No | Default offer/service description for generated outreach |
| `LOG_LEVEL`      | No       | `debug` / `info` / `warn` / `error` (default: `info`) |

---

## CLI Options

| Flag                | Default | Description                           |
| ------------------- | ------- | ------------------------------------- |
| `--file <path>`     | —       | Load URLs from newline-separated file |
| `--json`            | false   | Also export results to `hotels.json`  |
| `--concurrency <n>` | 3       | Max parallel hotel pipelines          |
| `--proposal`        | false   | Analyze the hotel website and generate tailored outreach |
| `--proposal-only`   | false   | Skip Booking/Google/contact scraping and only generate outreach from website URLs |
| `--website <url>`   | —       | Hotel website URL for `--proposal-only` |
| `--hotel-name <name>` | hostname | Hotel/property name for `--proposal-only` |
| `--email <email>`   | —       | Known email for proposal-only output/context |
| `--instagram <handle>` | —    | Known Instagram for proposal-only output/context |
| `--proposal-offer <text>` | `PROPOSAL_OFFER` | Service/offer used in the generated copy |
| `--openrouter-model <id>` | `OPENROUTER_MODEL` / `openai/gpt-5` | Model used through OpenRouter |
| `-h`, `--help`      | —       | Show help                             |

---

## Reliability

- **3 retries** with exponential back-off on all network operations
- **Graceful degradation**: each stage can fail without breaking the pipeline
- **4-level fallback selectors** for Booking.com (handles HTML structure changes)
- Partial results always exported to CSV even if enrichment is incomplete
- Proposal generation is optional and returns empty proposal fields if OpenRouter or the target website fails
- `--proposal-only` avoids all scraping/enrichment services except opening the hotel website for proposal context
