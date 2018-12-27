const expect = require('chai').expect
const throttlingPlugin = require('..')

const Octokit = require('@octokit/rest')
  .plugin((octokit) => {
    octokit.__requestLog = []
    octokit.hook.wrap('request', async (request, options) => {
      octokit.__requestLog.push(`START ${options.method} ${options.url}`)
      await new Promise(resolve => setTimeout(resolve, 100))
      octokit.__requestLog.push(`END ${options.method} ${options.url}`)
      return options.request.response
    })
  })
  .plugin(throttlingPlugin)

describe('Github API best practices', function () {
  it('Should not allow more than 1 request concurrently', async function () {
    const octokit = new Octokit()
    const req1 = octokit.request('GET /route1', {
      request: {
        response: { status: 201, headers: {}, data: {} }
      }
    })

    const req2 = octokit.request('GET /route2', {
      request: {
        response: { status: 202, headers: {}, data: {} }
      }
    })

    const req3 = octokit.request('GET /route3', {
      request: {
        response: { status: 203, headers: {}, data: {} }
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route1',
      'END GET /route1',
      'START GET /route2',
      'END GET /route2',
      'START GET /route3',
      'END GET /route3'
    ])
  })

  // it('Should maintain 1000ms between mutating requests', async function () {
  //   octokit.throttle.options({
  //     writeLimiter: new Bottleneck({ minTime: 50 })
  //   })
  //
  //   const req1 = octokit.request(
  //     { method: 'POST', url: 'route1', headers: {} }, { status: 201, headers: {}, data: {} }
  //   )
  //   const req2 = octokit.request(
  //     { method: 'GET', url: 'route2', headers: {} }, { status: 202, headers: {}, data: {} }
  //   )
  //   const req3 = octokit.request(
  //     { method: 'POST', url: 'route3', headers: {} }, { status: 203, headers: {}, data: {} }
  //   )
  //
  //   await Promise.all([req1, req2, req3])
  //   expect(tracker.events).to.deep.equal([
  //     'START GET route2',
  //     'END GET route2',
  //     'START POST route1',
  //     'END POST route1',
  //     'START POST route3',
  //     'END POST route3'
  //   ])
  //   // Start of request 3 - Start of request 1 must be within 10ms of 50ms
  //   expect(tracker.timings[4] - tracker.timings[2]).to.be.closeTo(50, 10)
  // })
  //
  // it('Should maintain 3000ms between requests that trigger notifications', async function () {
  //   octokit.throttle.options({
  //     writeLimiter: new Bottleneck({ minTime: 50 }),
  //     triggersNotificationLimiter: new Bottleneck({ minTime: 100 })
  //   })
  //   const req1 = octokit.request(
  //     { method: 'POST', url: '/orgs/:org/invitations', headers: {} }, { status: 201, headers: {}, data: {} }
  //   )
  //   const req2 = octokit.request(
  //     { method: 'POST', url: 'route2', headers: {} }, { status: 202, headers: {}, data: {} }
  //   )
  //   const req3 = octokit.request(
  //     { method: 'POST', url: '/repos/:owner/:repo/commits/:sha/comments', headers: {} }, { status: 302, headers: {}, data: {} }
  //   )
  //
  //   await Promise.all([req1, req2, req3])
  //   expect(tracker.events).to.deep.equal([
  //     'START POST /orgs/:org/invitations',
  //     'END POST /orgs/:org/invitations',
  //     'START POST route2',
  //     'END POST route2',
  //     'START POST /repos/:owner/:repo/commits/:sha/comments',
  //     'END POST /repos/:owner/:repo/commits/:sha/comments'
  //   ])
  //   // Start of request 3 - Start of request 1 must be within 10ms of 100ms
  //   expect(tracker.timings[5] - tracker.timings[0]).to.be.closeTo(100, 10)
  // })
  //
  // it('Should optimize throughput rather than maintain ordering', async function () {
  //   octokit.throttle.options({
  //     writeLimiter: new Bottleneck({ minTime: 50 }),
  //     triggersNotificationLimiter: new Bottleneck({ minTime: 100 })
  //   })
  //   const req1 = octokit.request(
  //     { method: 'POST', url: '/orgs/:org/invitations', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //   const req2 = octokit.request(
  //     { method: 'GET', url: 'route2', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //   const req3 = octokit.request(
  //     { method: 'POST', url: 'route3', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //   const req4 = octokit.request(
  //     { method: 'GET', url: 'route4', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //   const req5 = octokit.request(
  //     { method: 'POST', url: '/repos/:owner/:repo/commits/:sha/comments', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //   const req6 = octokit.request(
  //     { method: 'PATCH', url: '/orgs/:org/invitations', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //
  //   await Promise.all([req1, req2, req3, req4, req5, req6])
  //   await octokit.request(
  //     { method: 'GET', url: 'route6', headers: {} }, { status: 200, headers: {}, data: {} }
  //   )
  //   expect(tracker.events).to.deep.equal([
  //     'START GET route2',
  //     'END GET route2',
  //     'START GET route4',
  //     'END GET route4',
  //     'START POST /orgs/:org/invitations',
  //     'END POST /orgs/:org/invitations',
  //     'START POST route3',
  //     'END POST route3',
  //     'START POST /repos/:owner/:repo/commits/:sha/comments',
  //     'END POST /repos/:owner/:repo/commits/:sha/comments',
  //     'START PATCH /orgs/:org/invitations',
  //     'END PATCH /orgs/:org/invitations',
  //     'START GET route6',
  //     'END GET route6'
  //   ])
  //
  //   expect(tracker.timings[2] - tracker.timings[0]).to.be.closeTo(0, 10)
  //   expect(tracker.timings[4] - tracker.timings[2]).to.be.closeTo(0, 10)
  //   expect(tracker.timings[6] - tracker.timings[4]).to.be.closeTo(50, 10)
  //   expect(tracker.timings[8] - tracker.timings[6]).to.be.closeTo(50, 10)
  //   expect(tracker.timings[10] - tracker.timings[8]).to.be.closeTo(100, 10)
  //   expect(tracker.timings[12] - tracker.timings[10]).to.be.closeTo(0, 10)
  // })
})
