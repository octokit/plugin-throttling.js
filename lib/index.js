module.exports = throttlingPlugin

const Bottleneck = require('bottleneck/light')
const wrapRequest = require('./wrap-request')

const triggersNotificationPaths = require('./triggers-notification-paths')

function throttlingPlugin (octokit) {
  const state = {
    triggersNotification: triggersNotificationPaths,
    minimumAbuseRetryAfter: 5,
    retryAfterBaseValue: 1000,
    globalLimiter: new Bottleneck({
      maxConcurrent: 1
    }),
    writeLimiter: new Bottleneck({
      maxConcurrent: 1,
      minTime: 1000
    }),
    triggersNotificationLimiter: new Bottleneck({
      maxConcurrent: 1,
      minTime: 3000
    }),
    retryLimiter: new Bottleneck()
  }

  octokit.throttle = {
    _options: (options = {}) => Object.assign(state, options)
  }
  const emitter = new Bottleneck.Events(octokit.throttle)

  state.retryLimiter.on('failed', async function (error, info) {
    const options = info.args[info.args.length - 1]
    const retryCount = ~~options.request.retryCount
    options.request.retryCount = retryCount

    if (error.status === 403 && /\babuse\b/i.test(error.message)) {
      // The user has hit the abuse rate limit.
      // https://developer.github.com/v3/#abuse-rate-limits

      // The Retry-After header can sometimes be blank when hitting an abuse limit,
      // but is always present after 2-3s, so make sure to set `retryAfter` to at least 5s by default.
      const retryAfter = Math.max(~~error.headers['retry-after'], state.minimumAbuseRetryAfter)
      const wantRetry = await emitter.trigger('abuse-limit', retryAfter, options)

      if (wantRetry) {
        options.request.retryCount++
        return retryAfter * state.retryAfterBaseValue
      }
    } else if (error.status === 403 && error.headers['x-ratelimit-remaining'] === '0') {
      // The user has used all their allowed calls for the current time period
      // https://developer.github.com/v3/#rate-limiting

      const rateLimitReset = new Date(~~error.headers['x-ratelimit-reset'] * 1000).getTime()
      const retryAfter = Math.max(Math.ceil((rateLimitReset - Date.now()) / 1000), 0)
      const wantRetry = await emitter.trigger('rate-limit', retryAfter, options)

      if (wantRetry) {
        options.request.retryCount++
        return retryAfter * state.retryAfterBaseValue
      }
    }
  })

  octokit.hook.wrap('request', wrapRequest.bind(null, state))
}
