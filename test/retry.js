const expect = require('chai').expect
const Octokit = require('./octokit')

describe('Retry', function () {
  it('Should retry \'abuse-limit\' and succeed', async function () {
    const octokit = new Octokit()
    octokit.throttle.options({ minimumAbuseRetryAfter: 0 })

    let eventCount = 0
    octokit.throttle.on('abuse-limit', function (retryAfter) {
      expect(retryAfter).to.equal(0)
      eventCount++
    })

    const res = await octokit.request('GET /route', {
      request: {
        responses: [
          { status: 403, headers: { 'retry-after': '0' }, data: { message: 'You have been rate limited to prevent abuse' } },
          { status: 200, headers: {}, data: { message: 'Success!' } }
        ]
      }
    })

    expect(res.status).to.equal(200)
    expect(res.data).to.include({ message: 'Success!' })
    expect(eventCount).to.equal(1)
  })

  it('Should retry \'abuse-limit\' twice and fail', async function () {
    const octokit = new Octokit()
    octokit.throttle.options({ minimumAbuseRetryAfter: 0, maxRetries: 2 })

    let eventCount = 0
    octokit.throttle.on('abuse-limit', function (retryAfter) {
      expect(retryAfter).to.equal(0)
      eventCount++
    })

    const message = 'You have been rate limited to prevent abuse'
    try {
      await octokit.request('GET /route', {
        request: {
          responses: [
            { status: 403, headers: { 'retry-after': '0' }, data: { message } },
            { status: 403, headers: { 'retry-after': '0' }, data: { message } },
            { status: 404, headers: { 'retry-after': '0' }, data: { message: 'Nope!' } }
          ]
        }
      })
      throw new Error('Should not reach this point')
    } catch (error) {
      expect(error.status).to.equal(404)
      expect(error.message).to.equal('Nope!')
    }

    expect(eventCount).to.equal(2)
  })

  it('Should retry \'rate-limit\' and succeed', async function () {
    const octokit = new Octokit()
    let eventCount = 0
    octokit.throttle.on('rate-limit', function (retryAfter) {
      expect(retryAfter).to.equal(0)
      eventCount++
    })

    const res = await octokit.request('GET /route', {
      request: {
        responses: [
          { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': `123` }, data: {} },
          { status: 202, headers: {}, data: { message: 'Yay!' } }
        ]
      }
    })

    expect(res.status).to.equal(202)
    expect(res.data).to.include({ message: 'Yay!' })
    expect(eventCount).to.equal(1)
  })
})
