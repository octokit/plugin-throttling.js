module.exports = throttlingPlugin

const Bottleneck = require('bottleneck/light')
const wrapRequest = require('./wrap-request')

const triggersNotificationRoutes = [
  '/repos/:owner/:repo/issues',
  '/repos/:owner/:repo/issues/:number/comments',
  '/orgs/:org/invitations',
  '/repos/:owner/:repo/pulls',
  '/repos/:owner/:repo/pulls',
  '/repos/:owner/:repo/pulls/:number/merge',
  '/repos/:owner/:repo/pulls/:number/reviews',
  '/repos/:owner/:repo/pulls/:number/comments',
  '/repos/:owner/:repo/pulls/:number/comments',
  '/repos/:owner/:repo/pulls/:number/requested_reviewers',
  '/repos/:owner/:repo/collaborators/:username',
  '/repos/:owner/:repo/commits/:sha/comments',
  '/repos/:owner/:repo/releases',
  '/teams/:team_id/discussions',
  '/teams/:team_id/discussions/:discussion_number/comments'
]

function buildLookup (arr) {
  return arr.reduce(function (acc, elem) {
    acc[elem] = true
    return acc
  }, {})
}

function throttlingPlugin (octokit) {
  const state = {
    triggersNotification: buildLookup(triggersNotificationRoutes),
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
    options: (options = {}) => Object.assign(state, options)
  }
  const emitter = new Bottleneck.Events(octokit.throttle)

  octokit.hook.wrap('request', wrapRequest.bind(null, state, emitter))
}
