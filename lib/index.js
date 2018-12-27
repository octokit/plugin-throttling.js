module.exports = throttlingPlugin

const Bottleneck = require('bottleneck/light')
const wrapRequest = require('./wrap-request')

const triggersNotificationPaths = require('./triggers-notification-paths')

function throttlingPlugin (octokit) {
  const state = {
    triggersNotification: triggersNotificationPaths,
    minimumAbuseRetryAfter: 5,
    maxRetries: 1,
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
    })
  }

  octokit.throttle = {
    _options: (options = {}) => Object.assign(state, options)
  }
  const emitter = new Bottleneck.Events(octokit.throttle)

  octokit.hook.wrap('request', wrapRequest.bind(null, state, emitter))
}
