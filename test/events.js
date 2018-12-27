const expect = require('chai').expect
const helpers = require('./helpers')

describe('Events', function () {
  let octokit, tracker

  beforeEach(function () {
    const testObjects = helpers.beforeEach()
    octokit = testObjects.octokit
    tracker = testObjects.tracker
  })

  describe('\'abuse-limit\'', function () {
    it('Should detect abuse limit and broadcast event', async function () {
      octokit.throttle.options({ retries: 0 })

      let eventCount = 0
      octokit.throttle.on('abuse-limit', function (retryAfter) {
        expect(retryAfter).to.equal(60)
        eventCount++
      })

      await octokit.request(
        { method: 'GET', url: 'route1', headers: {} }, { status: 201, headers: {}, data: {} }
      )
      try {
        await octokit.request(
          { method: 'GET', url: 'route2', headers: {} },
          { status: 403, headers: { 'retry-after': '60' }, data: { message: 'You have been rate limited to prevent abuse' } }
        )
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })

    it('Should ensure retryAfter is a minimum of 5s', async function () {
      octokit.throttle.options({ retries: 0 })

      let eventCount = 0
      octokit.throttle.on('abuse-limit', function (retryAfter) {
        expect(retryAfter).to.equal(5)
        eventCount++
      })

      await octokit.request(
        { method: 'GET', url: 'route1', headers: {} }, { status: 201, headers: {}, data: {} }
      )
      try {
        await octokit.request(
          { method: 'GET', url: 'route2', headers: {} },
          { status: 403, headers: { 'retry-after': '2' }, data: { message: 'You have been rate limited to prevent abuse' } }
        )
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })

    it('Should broadcast retryAfter of 5s even when the header is missing', async function () {
      octokit.throttle.options({ retries: 0 })

      let eventCount = 0
      octokit.throttle.on('abuse-limit', function (retryAfter) {
        expect(retryAfter).to.equal(5)
        eventCount++
      })

      await octokit.request(
        { method: 'GET', url: 'route1', headers: {} }, { status: 201, headers: {}, data: {} }
      )
      try {
        await octokit.request(
          { method: 'GET', url: 'route2', headers: {} },
          { status: 403, headers: {}, data: { message: 'You have been rate limited to prevent abuse' } }
        )
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })
  })

  describe('\'rate-limit\'', function () {
    it('Should detect rate limit exceeded and broadcast event', async function () {
      octokit.throttle.options({ retries: 0 })

      let eventCount = 0
      octokit.throttle.on('rate-limit', function (retryAfter) {
        expect(retryAfter).to.be.closeTo(30, 1)
        eventCount++
      })

      await octokit.request(
        { method: 'GET', url: 'route1', headers: {} }, { status: 201, headers: {}, data: {} }
      )
      try {
        await octokit.request(
          { method: 'GET', url: 'route2', headers: {} },
          { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `${Math.round(tracker.t0 / 1000) + 30}` }, data: {} }
        )
        throw new Error('Should not reach this point')
      } catch (error) {
        expect(error.status).to.equal(403)
      }

      expect(eventCount).to.equal(1)
    })
  })
})
