/* eslint padded-blocks: 0 */
module.exports = wrapRequest

const noop = () => Promise.resolve()

async function wrapRequest (state, emitter, request, options, retries = 0) {
  const jobOptions = retries > 0 ? { weight: 0, priority: 0 } : {}
  const retryRequest = function (retryAfter) {
    return new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      .then(() => wrapRequest(state, emitter, request, options, retries + 1))
  }
  const isWrite = options.method !== 'GET' && options.method !== 'HEAD'

  // Guarantee at least 1000ms between writes
  if (isWrite) {
    await state.writeLimiter.schedule(noop)
  }

  // Guarantee at least 3000ms between requests that trigger notifications
  if (isWrite && state.triggersNotification.includes(options.url)) {
    await state.triggersNotificationLimiter.schedule(noop)
  }

  return state.globalLimiter.schedule(jobOptions, async function () {
    try {
      // Execute request
      return await request(options)
    } catch (error) {
      if (error.status === 403 && /\babuse\b/i.test(error.message)) {
        // The user has hit the abuse rate limit.
        // https://developer.github.com/v3/#abuse-rate-limits

        // The Retry-After header can sometimes be blank when hitting an abuse limit,
        // but is always present after 2-3s, so make sure to set `retryAfter` to at least 5s by default.
        const retryAfter = Math.max(~~error.headers['retry-after'], state.minimumAbuseRetryAfter)
        emitter.trigger('abuse-limit', retryAfter)

        if (retries < state.retries && state.retries > 0) {
          return retryRequest(retryAfter)
        }

      } else if (error.status === 403 && error.headers['x-ratelimit-remaining'] === '0') {
        // The user has used all their allowed calls for the current time period
        // https://developer.github.com/v3/#rate-limiting

        const rateLimitReset = new Date(~~error.headers['x-ratelimit-reset'] * 1000).getTime()
        const retryAfter = Math.max(Math.ceil((rateLimitReset - Date.now()) / 1000), 0)
        emitter.trigger('rate-limit', retryAfter)

        if (retries < state.retries && state.retries > 0) {
          return retryRequest(retryAfter)
        }
      }

      throw error
    }
  })
}
