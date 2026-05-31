/**
 * retry.js — Generic retry wrapper with exponential back-off.
 */

import { logger } from './logger.js';

/**
 * Execute an async function with retry and exponential back-off.
 *
 * @param {() => Promise<any>} fn         - Async function to execute
 * @param {Object}             [opts]
 * @param {number}             [opts.retries=3]        - Max attempts
 * @param {number}             [opts.baseDelayMs=1000] - Base delay (doubles each retry)
 * @param {string}             [opts.label='']         - Label for log output
 * @returns {Promise<any>}
 */
export async function withRetry(fn, { retries = 3, baseDelayMs = 1000, label = '' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === retries;
      logger.warn('retry', `Attempt ${attempt}/${retries} failed${label ? ` [${label}]` : ''}`, {
        message: err.message,
      });

      if (!isLast) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.debug('retry', `Waiting ${delay}ms before next attempt…`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Promisified sleep.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
