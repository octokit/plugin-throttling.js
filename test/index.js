const Bottleneck = require('bottleneck')
const expect = require('chai').expect
const Octokit = require('./octokit')

describe('Github API best practices', function () {
  it('Should not allow more than 1 request concurrently', async function () {
    const octokit = new Octokit()
    const req1 = octokit.request('GET /route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })

    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })

    const req3 = octokit.request('GET /route3', {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }]
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

  it('Should maintain 1000ms between mutating requests', async function () {
    const octokit = new Octokit({
      throttle: {
        writeLimiter: new Bottleneck({ minTime: 50 })
      }
    })

    const req1 = octokit.request('POST /route1', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('POST /route3', {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route2',
      'END GET /route2',
      'START POST /route1',
      'END POST /route1',
      'START POST /route3',
      'END POST /route3'
    ])
    expect(octokit.__requestTimings[4] - octokit.__requestTimings[2]).to.be.closeTo(50, 20)
  })

  it('Should maintain 3000ms between requests that trigger notifications', async function () {
    const octokit = new Octokit({
      throttle: {
        writeLimiter: new Bottleneck({ minTime: 50 }),
        triggersNotificationLimiter: new Bottleneck({ minTime: 100 })
      }
    })

    const req1 = octokit.request('POST /orgs/:org/invitations', {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('POST /route2', {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('POST /repos/:owner/:repo/commits/:sha/comments', {
      request: {
        responses: [{ status: 302, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3])
    expect(octokit.__requestLog).to.deep.equal([
      'START POST /orgs/:org/invitations',
      'END POST /orgs/:org/invitations',
      'START POST /route2',
      'END POST /route2',
      'START POST /repos/:owner/:repo/commits/:sha/comments',
      'END POST /repos/:owner/:repo/commits/:sha/comments'
    ])
    expect(octokit.__requestTimings[5] - octokit.__requestTimings[0]).to.be.closeTo(100, 20)
  })

  it('Should optimize throughput rather than maintain ordering', async function () {
    const octokit = new Octokit({
      throttle: {
        writeLimiter: new Bottleneck({ minTime: 50 }),
        triggersNotificationLimiter: new Bottleneck({ minTime: 100 })
      }
    })

    const req1 = octokit.request('POST /orgs/:org/invitations', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req2 = octokit.request('GET /route2', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req3 = octokit.request('POST /route3', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req4 = octokit.request('GET /route4', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req5 = octokit.request('POST /repos/:owner/:repo/commits/:sha/comments', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    const req6 = octokit.request('PATCH /orgs/:org/invitations', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })

    await Promise.all([req1, req2, req3, req4, req5, req6])
    await octokit.request('GET /route6', {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }]
      }
    })
    expect(octokit.__requestLog).to.deep.equal([
      'START GET /route2',
      'END GET /route2',
      'START GET /route4',
      'END GET /route4',
      'START POST /orgs/:org/invitations',
      'END POST /orgs/:org/invitations',
      'START POST /route3',
      'END POST /route3',
      'START POST /repos/:owner/:repo/commits/:sha/comments',
      'END POST /repos/:owner/:repo/commits/:sha/comments',
      'START PATCH /orgs/:org/invitations',
      'END PATCH /orgs/:org/invitations',
      'START GET /route6',
      'END GET /route6'
    ])

    expect(octokit.__requestTimings[2] - octokit.__requestTimings[0]).to.be.closeTo(0, 20)
    expect(octokit.__requestTimings[4] - octokit.__requestTimings[2]).to.be.closeTo(0, 20)
    expect(octokit.__requestTimings[6] - octokit.__requestTimings[4]).to.be.closeTo(50, 20)
    expect(octokit.__requestTimings[8] - octokit.__requestTimings[6]).to.be.closeTo(50, 20)
    expect(octokit.__requestTimings[10] - octokit.__requestTimings[8]).to.be.closeTo(100, 20)
    expect(octokit.__requestTimings[12] - octokit.__requestTimings[10]).to.be.closeTo(0, 20)
  })
})
