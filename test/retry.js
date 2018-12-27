const expect = require('chai').expect
const helpers = require('./helpers')

describe('Retry', function () {
  let octokit

  beforeEach(function () {
    const testObjects = helpers.beforeEach()
    octokit = testObjects.octokit
  })

  it('Should retry \'abuse-limit\' and succeed', async function () {
    octokit.throttle.options({ minimumAbuseRetryAfter: 0 })

    let eventCount = 0
    octokit.throttle.on('abuse-limit', function (retryAfter) {
      expect(retryAfter).to.equal(0)
      eventCount++
    })

    const res = await octokit.request(
      { method: 'GET', url: 'route', headers: {} },
      [
        { status: 403, headers: { 'retry-after': '0' }, data: { message: 'You have been rate limited to prevent abuse' } },
        { status: 200, headers: {}, data: { message: 'Success!' } }
      ]
    )

    expect(res.status).to.equal(200)
    expect(res.data).to.include({ message: 'Success!' })
    expect(eventCount).to.equal(1)
  })

  it('Should retry \'abuse-limit\' twice and fail', async function () {
    octokit.throttle.options({ minimumAbuseRetryAfter: 0, retries: 2 })

    let eventCount = 0
    octokit.throttle.on('abuse-limit', function (retryAfter) {
      expect(retryAfter).to.equal(0)
      eventCount++
    })

    const message = 'You have been rate limited to prevent abuse'
    try {
      await octokit.request(
        { method: 'GET', url: 'route', headers: {} },
        [
          { status: 403, headers: { 'retry-after': '0' }, data: { message } },
          { status: 403, headers: { 'retry-after': '0' }, data: { message } },
          { status: 404, headers: { 'retry-after': '0' }, data: { message: 'Nope!' } }
        ]
      )
      throw new Error('Should not reach this point')
    } catch (error) {
      expect(error.status).to.equal(404)
      expect(error.message).to.equal('Nope!')
    }

    expect(eventCount).to.equal(2)
  })

  it('Should retry \'rate-limit\' and succeed', async function () {
    let eventCount = 0
    octokit.throttle.on('rate-limit', function (retryAfter) {
      expect(retryAfter).to.equal(0)
      eventCount++
    })

    const res = await octokit.request(
      { method: 'GET', url: 'route', headers: {} },
      [
        { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `123` }, data: {} },
        { status: 202, headers: {}, data: { message: 'Yay!' } }
      ]
    )

    expect(res.status).to.equal(202)
    expect(res.data).to.include({ message: 'Yay!' })
    expect(eventCount).to.equal(1)
  })
})
