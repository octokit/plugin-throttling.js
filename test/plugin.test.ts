import Bottleneck from "bottleneck";
import { TestOctokit } from "./octokit";
import { throttling } from "../src";

describe("General", function () {
  it("Should be possible to disable the plugin", async function () {
    const octokit = new TestOctokit({ throttle: { enabled: false } });

    const req1 = octokit.request("GET /route1", {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }],
      },
    });

    const req2 = octokit.request("GET /route2", {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }],
      },
    });

    const req3 = octokit.request("GET /route3", {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }],
      },
    });

    await Promise.all([req1, req2, req3]);
    expect(octokit.__requestLog).toStrictEqual([
      "START GET /route1",
      "START GET /route2",
      "START GET /route3",
      "END GET /route1",
      "END GET /route2",
      "END GET /route3",
    ]);
  });

  it("Should require the user to pass both limit handlers", function () {
    const message =
      "You must pass the onAbuseLimit and onRateLimit error handlers";

    expect(() => new TestOctokit()).toThrow(message);
    expect(() => new TestOctokit({ throttle: {} })).toThrow(message);
    expect(
      () => new TestOctokit({ throttle: { onAbuseLimit: 5, onRateLimit: 5 } })
    ).toThrow(message);
    expect(
      () =>
        new TestOctokit({ throttle: { onAbuseLimit: 5, onRateLimit: () => 1 } })
    ).toThrow(message);
    expect(
      () => new TestOctokit({ throttle: { onAbuseLimit: () => 1 } })
    ).toThrow(message);
    expect(
      () => new TestOctokit({ throttle: { onRateLimit: () => 1 } })
    ).toThrow(message);
    expect(
      () =>
        new TestOctokit({
          throttle: { onAbuseLimit: () => 1, onRateLimit: () => 1 },
        })
    ).not.toThrow();
  });
});

describe("Github API best practices", function () {
  it("Should linearize requests", async function () {
    const octokit = new TestOctokit({
      throttle: { onAbuseLimit: () => 1, onRateLimit: () => 1 },
    });
    const req1 = octokit.request("GET /route1", {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }],
      },
    });

    const req2 = octokit.request("GET /route2", {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }],
      },
    });

    const req3 = octokit.request("GET /route3", {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }],
      },
    });

    await Promise.all([req1, req2, req3]);
    expect(octokit.__requestLog).toStrictEqual([
      "START GET /route1",
      "END GET /route1",
      "START GET /route2",
      "END GET /route2",
      "START GET /route3",
      "END GET /route3",
    ]);
  });

  it("Should maintain 1000ms between mutating or GraphQL requests", async function () {
    const octokit = new TestOctokit({
      throttle: {
        write: new Bottleneck.Group({ minTime: 50 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1,
      },
    });

    const req1 = octokit.request("POST /route1", {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }],
      },
    });
    const req2 = octokit.request("GET /route2", {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }],
      },
    });
    const req3 = octokit.request("POST /route3", {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }],
      },
    });
    const req4 = octokit.request("POST /graphql", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });

    await Promise.all([req1, req2, req3, req4]);
    expect(octokit.__requestLog).toStrictEqual([
      "START GET /route2",
      "END GET /route2",
      "START POST /route1",
      "END POST /route1",
      "START POST /route3",
      "END POST /route3",
      "START POST /graphql",
      "END POST /graphql",
    ]);
    expect(
      octokit.__requestTimings[4] - octokit.__requestTimings[0]
    ).toBeLessThan(70);
    expect(
      octokit.__requestTimings[6] - octokit.__requestTimings[4]
    ).toBeLessThan(70);
  });

  it("Should maintain 3000ms between requests that trigger notifications", async function () {
    const octokit = new TestOctokit({
      throttle: {
        write: new Bottleneck.Group({ minTime: 50 }),
        notifications: new Bottleneck.Group({ minTime: 100 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1,
      },
    });

    const req1 = octokit.request("POST /orgs/{org}/invitations", {
      org: "org",
      request: {
        responses: [{ status: 201, headers: {}, data: {} }],
      },
    });
    const req2 = octokit.request("POST /route2", {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }],
      },
    });
    const req3 = octokit.request(
      "POST /repos/{owner}/{repo}/commits/{sha}/comments",
      {
        request: {
          responses: [{ status: 302, headers: {}, data: {} }],
        },
      }
    );

    await Promise.all([req1, req2, req3]);
    expect(octokit.__requestLog).toStrictEqual([
      "START POST /orgs/{org}/invitations",
      "END POST /orgs/{org}/invitations",
      "START POST /route2",
      "END POST /route2",
      "START POST /repos/{owner}/{repo}/commits/{sha}/comments",
      "END POST /repos/{owner}/{repo}/commits/{sha}/comments",
    ]);
    expect(
      octokit.__requestTimings[5] - octokit.__requestTimings[0]
    ).toBeLessThan(120);
  });

  it("Should match custom routes when checking notification triggers", function () {
    expect(throttling.triggersNotification("/abc/def")).toEqual(false);
    expect(throttling.triggersNotification("/orgs/abc/invitation")).toEqual(
      false
    );
    expect(throttling.triggersNotification("/repos/abc/releases")).toEqual(
      false
    );
    expect(throttling.triggersNotification("/repos/abc/def/pulls/5")).toEqual(
      false
    );

    expect(throttling.triggersNotification("/repos/abc/def/pulls")).toEqual(
      true
    );
    expect(
      throttling.triggersNotification("/repos/abc/def/pulls/5/comments")
    ).toEqual(true);
    expect(throttling.triggersNotification("/repos/foo/bar/issues")).toEqual(
      true
    );

    expect(
      throttling.triggersNotification("/repos/{owner}/{repo}/pulls")
    ).toEqual(true);
    expect(
      throttling.triggersNotification("/repos/{owner}/{repo}/pulls/5/comments")
    ).toEqual(true);
    expect(
      throttling.triggersNotification("/repos/{foo}/{bar}/issues")
    ).toEqual(true);
  });

  it("Should maintain 2000ms between search requests", async function () {
    const octokit = new TestOctokit({
      throttle: {
        search: new Bottleneck.Group({ minTime: 50 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1,
      },
    });

    const req1 = octokit.request("GET /search/route1", {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }],
      },
    });
    const req2 = octokit.request("GET /route2", {
      request: {
        responses: [{ status: 202, headers: {}, data: {} }],
      },
    });
    const req3 = octokit.request("GET /search/route3", {
      request: {
        responses: [{ status: 203, headers: {}, data: {} }],
      },
    });

    await Promise.all([req1, req2, req3]);
    expect(octokit.__requestLog).toStrictEqual([
      "START GET /route2",
      "END GET /route2",
      "START GET /search/route1",
      "END GET /search/route1",
      "START GET /search/route3",
      "END GET /search/route3",
    ]);
    expect(
      octokit.__requestTimings[4] - octokit.__requestTimings[2]
    ).toBeLessThan(70);
  });

  it("Should optimize throughput rather than maintain ordering", async function () {
    const octokit = new TestOctokit({
      throttle: {
        write: new Bottleneck.Group({ minTime: 50 }),
        notifications: new Bottleneck.Group({ minTime: 150 }),
        onAbuseLimit: () => 1,
        onRateLimit: () => 1,
      },
    });

    const req1 = octokit.request("POST /orgs/abc/invitations", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });
    const req2 = octokit.request("GET /route2", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });
    const req3 = octokit.request("GET /route3", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });
    const req4 = octokit.request("POST /route4", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });
    const req5 = octokit.request("POST /repos/abc/def/commits/12345/comments", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });
    const req6 = octokit.request("PATCH /orgs/abc/invitations", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });

    await Promise.all([req1, req2, req3, req4, req5, req6]);
    await octokit.request("GET /route6", {
      request: {
        responses: [{ status: 200, headers: {}, data: {} }],
      },
    });
    expect(octokit.__requestLog).toStrictEqual([
      "START GET /route2",
      "END GET /route2",
      "START GET /route3",
      "END GET /route3",
      "START POST /orgs/abc/invitations",
      "END POST /orgs/abc/invitations",
      "START POST /route4",
      "END POST /route4",
      "START POST /repos/abc/def/commits/12345/comments",
      "END POST /repos/abc/def/commits/12345/comments",
      "START PATCH /orgs/abc/invitations",
      "END PATCH /orgs/abc/invitations",
      "START GET /route6",
      "END GET /route6",
    ]);

    expect(
      octokit.__requestTimings[2] - octokit.__requestTimings[0]
    ).toBeLessThan(20);
    expect(
      octokit.__requestTimings[4] - octokit.__requestTimings[2]
    ).toBeLessThan(20);
    expect(
      octokit.__requestTimings[6] - octokit.__requestTimings[4]
    ).toBeLessThan(70);
    expect(
      octokit.__requestTimings[8] - octokit.__requestTimings[6]
    ).toBeLessThan(120);
    expect(
      octokit.__requestTimings[10] - octokit.__requestTimings[8]
    ).toBeLessThan(170);
    expect(
      octokit.__requestTimings[12] - octokit.__requestTimings[10]
    ).toBeLessThan(30);
  });
});
