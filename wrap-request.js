module.exports = wrapRequest

const noop = () => Promise.resolve()

function wrapRequest (octokit, emitter, globalLimiter, writeLimiter, request, options) {
  console.log(Object.keys(octokit))
  return {}

  return globalLimiter.schedule(async function () {
    if (options.method !== 'GET') {
      // Assuming all non-GET calls are WRITEs
      await writeLimiter.schedule(noop)
    }

    try {
      const response = await request(options)
      return response
    } catch (error) {
      if (error.status === 403 && error.message.toLowerCase().includes('abuse')) {
        // The user has hit the abuse rate limit.
        // https://developer.github.com/v3/#abuse-rate-limits

        // Due to know issues with replication lag, the Retry-After header can sometimes be blank
        // for a few seconds after entering 'abuse limited mode'.
        // We ensure the Retry-After is always at least 5 seconds.
        const retryAfter = Math.max(~~error.headers['retry-after'], 5)
        emitter.trigger('abuse-limit', retryAfter)

      } else if (error.status === 403 && error.headers['x-ratelimit-remaining'] === '0') {
        // The user has used all their allowed calls for the current time period
        // https://developer.github.com/v3/#rate-limiting

        const rateLimitReset = new Date(~~error.headers['x-ratelimit-reset'] * 1000).getTime()
        const retryAfter = Math.ceil((rateLimitReset - Date.now()) / 1000)
        emitter.trigger('rate-limit', retryAfter)
      }

      throw error
    }
  })
}
