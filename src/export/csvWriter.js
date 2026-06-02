/**
 * csvWriter.js — Append hotel records to a CSV file using csv-writer.
 */

import { createObjectCsvWriter } from 'csv-writer';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/** Output CSV path (relative to project root) */
export const CSV_PATH = path.resolve(process.cwd(), 'hotels.csv');

/** Column definitions — order matches the spec */
const CSV_COLUMNS = [
  { id: 'name',              title: 'name'              },
  { id: 'phone',             title: 'phone'             },
  { id: 'website',           title: 'website'           },
  { id: 'email',             title: 'email'             },
  { id: 'instagram',         title: 'instagram'         },
  { id: 'source',            title: 'source'            },
  { id: 'googleMapsUrl',     title: 'googleMapsUrl'     },
  { id: 'websiteStyleNotes', title: 'websiteStyleNotes' },
  { id: 'uniqueAngles',      title: 'uniqueAngles'      },
  { id: 'proposalEmail',     title: 'proposalEmail'     },
  { id: 'instagramMessage',  title: 'instagramMessage'  },
];

/**
 * Append one or more hotel records to hotels.csv.
 * Creates the file with a header row on first write.
 *
 * @param {import('../utils/normalize.js').HotelRecord[]} records
 * @returns {Promise<void>}
 */
export async function appendToCSV(records) {
  const fileExists = existsSync(CSV_PATH);

  const writer = createObjectCsvWriter({
    path: CSV_PATH,
    header: CSV_COLUMNS,
    append: fileExists,     // Write header only on first run
  });

  await writer.writeRecords(records);
  logger.info('csv', `Wrote ${records.length} record(s) → ${CSV_PATH}`);
}

/**
 * Export records as a JSON file (bonus feature).
 *
 * @param {import('../utils/normalize.js').HotelRecord[]} records
 * @param {string} [outputPath]
 * @returns {Promise<void>}
 */
export async function appendToJSON(records, outputPath) {
  const { writeFile, readFile } = await import('fs/promises');
  const filePath = outputPath ?? path.resolve(process.cwd(), 'hotels.json');

  let existing = [];
  try {
    const raw = await readFile(filePath, 'utf-8');
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist yet — start fresh
  }

  const merged = [...existing, ...records];
  await writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  logger.info('json', `Wrote ${records.length} record(s) → ${filePath}`);
}
