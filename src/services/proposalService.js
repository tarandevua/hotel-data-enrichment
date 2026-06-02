/**
 * proposalService.js — Website style analysis + OpenRouter outreach copy.
 */

import { OpenRouter } from '@openrouter/sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';

import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const DEFAULT_MODEL = 'openai/gpt-5';
const DEFAULT_OFFER =
  'a high-converting hotel website and guest acquisition improvement service';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const PROPOSAL_OFFER = {
  name: "Janzu",

  shortDescription:
    "A guided aquatic meditation and relaxation experience combining floating, gentle movement, conscious breathing, and mindfulness in water.",

  facilitator: {
    name: "Andre Ram",
    specialties: ["Janzu", "Breathwork"],
  },

  guestBenefits: [
    "Deep relaxation",
    "Stress reduction",
    "Physical tension release",
    "Mindfulness",
    "Unique memorable experience",
  ],

  collaborationOptions: [
    "Private on-demand sessions",
    "Revenue sharing",
    "Wellness packages",
    "Retreat partnerships",
    "Couples experiences",
  ],

  operationalNotes: [
    "Can manage bookings directly",
    "Minimal hotel staff involvement",
    "Operates in hotel pool",
  ],

  contact: {
    whatsapp: "+52 998 213 1167",
    instagram: "@nomadmao",
    website: "https://janzu.nomadmao.com",
  },
};

async function fetchWebsiteHtml(url) {
  const response = await axios.get(url, {
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new Error(`HTTP_${response.status}`);
  }

  return response.data;
}

function unique(values, limit = 12) {
  return [...new Set(values.map((v) => v?.trim()).filter(Boolean))].slice(0, limit);
}

function extractColors(html) {
  return unique(html.match(/#[0-9a-f]{3,8}\b/gi) ?? [], 10);
}

function extractWebsiteProfile(html, url) {
  const $ = cheerio.load(html);

  $('script, style, noscript, svg').remove();

  const headings = unique(
    $('h1, h2, h3')
      .map((_, el) => $(el).text())
      .get(),
    16,
  );

  const navLabels = unique(
    $('nav a, header a')
      .map((_, el) => $(el).text())
      .get(),
    12,
  );

  const imageAlts = unique(
    $('img[alt]')
      .map((_, el) => $(el).attr('alt'))
      .get(),
    12,
  );

  const pageText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  return {
    url,
    title: $('title').first().text().trim(),
    description: $('meta[name="description"]').attr('content')?.trim() ?? '',
    headings,
    navLabels,
    imageAlts,
    colors: extractColors(html),
    textSample: pageText,
  };
}

function buildPrompt(record, profile, offer) {
  const promt = [
    {
      role: 'system',
      content: `
        You are a luxury hospitality partnership consultant specializing in wellness experiences.

        Your goal is NOT to write generic outreach.

        First analyze the property and determine:

        * hotelType
        * targetAudience
        * emotionalValue
        * strongestJanzuAngle

        Examples of strongestJanzuAngle:

        * luxury experience
        * wellness enhancement
        * spa enhancement
        * guest experience
        * couples experience
        * travel recovery
        * stress reduction
        * retreat activity
        * corporate wellness
        * signature experience

        Rules:

        * Use ONLY information found in websiteProfile.
        * Never invent amenities.
        * Never make unverifiable claims.
        * Avoid generic wellness language.
        * The outreach must feel written specifically for this hotel.
        * Mention 1-2 concrete details from the website.
        * Explain Janzu as: "a guided aquatic meditation and relaxation experience"
        * Focus on benefits relevant to this property's guests.

        Return STRICT JSON only.
        `
    },
    {
      role: 'user',
      content: JSON.stringify(
      {
        task: 'Analyze the hotel profile and create highly personalized outreach.',
        hotel: {
          name: record.name,
          website: record.website,
          email: record.email,
          instagram: record.instagram,
        },
        offer,
        websiteProfile: profile,
        outputSchema: {
          hotelType: 'Short classification of the property.',
          targetAudience: 'Primary guest types.',
          emotionalValue: 'What guests are really buying emotionally.',
          strongestJanzuAngle: 'Most compelling positioning for this specific property.',
          styleNotes: 'One sentence about branding, tone, design, and positioning.',
          uniqueAngles: [
            '3 highly specific personalization opportunities derived from website content.'
          ],
          winningHook: 'One sentence that should open the email.',
          proposalEmail: 'Subject line + 180-300 word email. Professional, warm, highly tailored.',
          instagramMessage: 'Friendly DM under 450 characters.',
          salesInsight: {
            guestPainPoint: 'What problem Janzu solves for their guests.',
            likelyObjection: 'Most likely manager objection.',
            objectionResponse: 'How to address that objection.',
            recommendedModel: 'Best collaboration model.'
          }
        }
    },
    null,
    2
  )
    }
  ];



return promt;
}

function emptyProposal() {
  return {
    websiteStyleNotes: '',
    uniqueAngles: '',
    proposalEmail: '',
    instagramMessage: '',
  };
}

function parseModelJson(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part.text ?? '').join('')
    : String(content ?? '');

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(objectMatch ? objectMatch[0] : cleaned);
  return {
    websiteStyleNotes: parsed.styleNotes ?? '',
    uniqueAngles: Array.isArray(parsed.uniqueAngles)
      ? parsed.uniqueAngles.join(' | ')
      : parsed.uniqueAngles ?? '',
    proposalEmail: parsed.proposalEmail ?? '',
    instagramMessage: parsed.instagramMessage ?? '',
  };
}

/**
 * Analyze a hotel website and generate tailored outreach copy through OpenRouter.
 *
 * @param {import('../utils/normalize.js').HotelRecord} record
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} [opts.model]
 * @param {string} [opts.offer]
 * @returns {Promise<Object>}
 */
export async function generateTailoredProposal(record, {
  apiKey,
  model = DEFAULT_MODEL,
  offer = DEFAULT_OFFER,
} = {}) {
  if (!apiKey) {
    logger.warn('proposal', 'OPENROUTER_API_KEY not set — skipping proposal generation');
    return emptyProposal();
  }

  if (!record.website) {
    logger.warn('proposal', 'No hotel website available — skipping proposal generation');
    return emptyProposal();
  }

  try {
    return await withRetry(
      async () => {
        logger.info('proposal', 'Analyzing website style', { url: record.website });
        const html = await fetchWebsiteHtml(record.website);
        const profile = extractWebsiteProfile(html, record.website);

        const client = new OpenRouter({ apiKey });
        const response = await client.chat.send({
          chatRequest: {
            model,
            messages: buildPrompt(record, profile, PROPOSAL_OFFER), // hardcoded offer for now, could be dynamic in the future
            temperature: 0.7,
            maxTokens: 900,
          }
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('OpenRouter returned an empty response');
        }

        const proposal = parseModelJson(content);
        logger.info('proposal', 'Generated tailored outreach copy');
        return proposal;
      },
      { retries: 2, baseDelayMs: 1500, label: `proposal:${record.website}` },
    );
  } catch (err) {
    logger.warn('proposal', 'Proposal generation failed — returning empty fields', {
      url: record.website,
      reason: err.message,
    });
    return emptyProposal();
  }
}
