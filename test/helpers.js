const FakeOctokit = require('./fixtures/octokit')
const retryPlugin = require('@octokit/plugin-retry.js')

exports.beforeEach = function () {
  const tracker = { events: [], timings: [], t0: Date.now() }

  const testPlugin = function (octokit) {
    octokit.hook.wrap('request', async function (request, options) {
      tracker.events.push(`START ${options.method} ${options.url}`)
      tracker.timings.push(Date.now() - tracker.t0)
      const response = await request(options)
      tracker.events.push(`END ${options.method} ${options.url}`)
      tracker.timings.push(Date.now() - tracker.t0)
      return response
    })
    return octokit
  }

  const octokit = new FakeOctokit()
    .plugin(retryPlugin)
    .plugin(require('../lib'))
    .plugin(testPlugin)

  return { tracker, octokit }
}
