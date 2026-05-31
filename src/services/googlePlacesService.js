/**
 * googlePlacesService.js — Hotel enrichment via Google Places API.
 *
 * Flow:
 *   1. findplacefromtext  → place_id
 *   2. place details      → name, phone, website, place_id
 *
 * ⚠️  This module ONLY uses the official API. No Google Maps scraping.
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

/**
 * Search Google Places by hotel name and return place_id + basic info.
 *
 * @param {string} hotelName
 * @param {string} apiKey
 * @returns {Promise<string|null>} place_id or null
 */
async function findPlaceId(hotelName, apiKey) {
  const url = `${BASE_URL}/findplacefromtext/json`;

  const response = await axios.get(url, {
    params: {
      input: hotelName,
      inputtype: 'textquery',
      fields: 'place_id,name',
      key: apiKey,
    },
    timeout: 10_000,
  });

  const data = response.data;

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places findplacefromtext error: ${data.status} — ${data.error_message ?? ''}`);
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    logger.warn('places', `No Place found for: "${hotelName}"`);
    return null;
  }

  logger.debug('places', `Found place_id: ${candidate.place_id} for "${candidate.name}"`);
  return candidate.place_id;
}

/**
 * Retrieve full place details for a given place_id.
 *
 * @param {string} placeId
 * @param {string} apiKey
 * @returns {Promise<Object>} Raw Google Places result object
 */
async function fetchPlaceDetails(placeId, apiKey) {
  const url = `${BASE_URL}/details/json`;

  const response = await axios.get(url, {
    params: {
      place_id: placeId,
      fields: 'name,formatted_phone_number,website,international_phone_number',
      key: apiKey,
    },
    timeout: 10_000,
  });

  const data = response.data;

  if (data.status !== 'OK') {
    throw new Error(`Places details error: ${data.status} — ${data.error_message ?? ''}`);
  }

  return data.result;
}

/**
 * Enrich hotel data using Google Places API.
 *
 * @param {string} hotelName - Hotel name extracted from Booking.com
 * @param {string} apiKey    - Google Places API key
 * @returns {Promise<{ name: string|null, phone: string|null, website: string|null, googleMapsUrl: string|null }>}
 */
export async function enrichWithGooglePlaces(hotelName, apiKey) {
  if (!apiKey) {
    logger.warn('places', 'GOOGLE_API_KEY not set — skipping Places enrichment');
    return { name: null, phone: null, website: null, googleMapsUrl: null };
  }

  logger.info('places', `Searching Google Places for: "${hotelName}"`);

  try {
    return await withRetry(
      async () => {
        const placeId = await findPlaceId(hotelName, apiKey);

        if (!placeId) {
          return { name: null, phone: null, website: null, googleMapsUrl: null };
        }

        const details = await fetchPlaceDetails(placeId, apiKey);

        const result = {
          name:    details.name                     ?? null,
          phone:   details.formatted_phone_number   ??
                   details.international_phone_number ?? null,
          website: details.website                  ?? null,
          googleMapsUrl: placeId
            ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
            : null,
        };

        logger.info('places', `Enriched: ${JSON.stringify(result)}`);
        return result;
      },
      { retries: 3, baseDelayMs: 1000, label: `places:${hotelName}` },
    );
  } catch (err) {
    logger.error('places', `Google Places enrichment failed — returning empty`, {
      hotel: hotelName,
      reason: err.message,
    });
    return { name: null, phone: null, website: null, googleMapsUrl: null };
  }
}
