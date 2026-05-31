# Hotel Data Enrichment Tool

A production-ready Node.js pipeline that enriches Booking.com hotel URLs with contact data, social links, and verified business details.

```
Booking.com URL → Hotel Name → Google Places (phone + website) → Website Scrape (email + Instagram) → hotels.csv
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

---

## Output

**`hotels.csv`** (always written):
```csv
name,phone,website,email,instagram,source
Wolf Of The City Hotel & SPA,+905417246010,http://wolfofthecityhotel.com,info@wolfofthecityhotel.com,https://instagram.com/wolfhotel,booking.com
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
    "source": "https://www.booking.com/hotel/tr/wolf-of-the-city.en-gb.html"
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
│   ├── normalize.js          # Merge + null-safe normalization
│   ├── regex.js              # Email & Instagram regex utilities
│   ├── logger.js             # Structured color logger
│   └── retry.js              # Exponential back-off retry wrapper
└── export/
    └── csvWriter.js          # csv-writer + JSON export
```

---

## Environment Variables

| Variable         | Required | Description                  |
|------------------|----------|------------------------------|
| `GOOGLE_API_KEY` | Yes      | Google Places API key        |
| `LOG_LEVEL`      | No       | `debug` / `info` / `warn` / `error` (default: `info`) |

---

## CLI Options

| Flag                  | Default | Description                              |
|-----------------------|---------|------------------------------------------|
| `--file <path>`       | —       | Load URLs from newline-separated file    |
| `--json`              | false   | Also export results to `hotels.json`     |
| `--concurrency <n>`   | 3       | Max parallel hotel pipelines             |
| `-h`, `--help`        | —       | Show help                                |

---

## Reliability

- **3 retries** with exponential back-off on all network operations
- **Graceful degradation**: each stage can fail without breaking the pipeline
- **4-level fallback selectors** for Booking.com (handles HTML structure changes)
- Partial results always exported to CSV even if enrichment is incomplete
