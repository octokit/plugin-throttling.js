module.exports = throttlingPlugin

const Bottleneck = require('bottleneck/light')
const wrapRequest = require('./wrap-request')

function throttlingPlugin (octokit) {
  const globalLimiter = new Bottleneck({
    maxConcurrent: 1
  })
  const writeLimiter = new Bottleneck({
    minTime: 1000
  })

  octokit.throttle = {}
  const emitter = new Bottleneck.Events(octokit.throttle)

  octokit.hook.wrap('request', wrapRequest.bind(null, emitter, globalLimiter, writeLimiter))
}
