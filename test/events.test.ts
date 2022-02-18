import { TestOctokit } from "./octokit";

describe("Events", function () {
  it("Should support non-limit 403s", async function () {
    const octokit = new TestOctokit({
      throttle: { onSecondaryRateLimit: () => 1, onRateLimit: () => 1 },
    });
    let caught = false;

    await octokit.request("GET /route1", {
      request: {
        responses: [{ status: 201, headers: {}, data: {} }],
      },
    });

    try {
      await octokit.request("GET /route2", {
        request: {
          responses: [{ status: 403, headers: {}, data: {} }],
        },
      });
    } catch (error: any) {
      expect(error.message).toEqual("Test failed request (403)");
      caught = true;
    }

    expect(caught).toEqual(true);
    expect(octokit.__requestLog).toStrictEqual([
      "START GET /route1",
      "END GET /route1",
      "START GET /route2",
    ]);
  });

  describe.each(["onSecondaryRateLimit", "onAbuseLimit"])(
    "secondary-limit",
    function (eventHandlerName) {
      it("Should detect SecondaryRate limit and broadcast event", async function () {
        let eventCount = 0;

        const octokit = new TestOctokit({
          throttle: {
            [eventHandlerName]: (
              retryAfter: number,
              options: object,
              octokitFromOptions: InstanceType<typeof TestOctokit>
            ) => {
              expect(octokit).toBe(octokitFromOptions);
              expect(retryAfter).toEqual(60);
              expect(options).toMatchObject({
                method: "GET",
                url: "/route2",
                request: { retryCount: 0 },
              });
              eventCount++;
            },
            onRateLimit: () => 1,
          },
        });

        await octokit.request("GET /route1", {
          request: {
            responses: [{ status: 201, headers: {}, data: {} }],
          },
        });
        try {
          await octokit.request("GET /route2", {
            request: {
              responses: [
                {
                  status: 403,
                  headers: { "retry-after": "60" },
                  data: {
                    message: "You have exceeded a secondary rate limit",
                  },
                },
              ],
            },
          });
          throw new Error("Should not reach this point");
        } catch (error: any) {
          expect(error.status).toEqual(403);
        }

        expect(eventCount).toEqual(1);
      });

      it("Should ensure retryAfter is a minimum of 5s", async function () {
        let eventCount = 0;
        const octokit = new TestOctokit({
          throttle: {
            [eventHandlerName]: (retryAfter: number, options: object) => {
              expect(retryAfter).toEqual(5);
              expect(options).toMatchObject({
                method: "GET",
                url: "/route2",
                request: { retryCount: 0 },
              });
              eventCount++;
            },
            onRateLimit: () => 1,
          },
        });

        await octokit.request("GET /route1", {
          request: {
            responses: [{ status: 201, headers: {}, data: {} }],
          },
        });
        try {
          await octokit.request("GET /route2", {
            request: {
              responses: [
                {
                  status: 403,
                  headers: { "retry-after": "2" },
                  data: {
                    message: "You have exceeded a secondary rate limit",
                  },
                },
              ],
            },
          });
          throw new Error("Should not reach this point");
        } catch (error: any) {
          expect(error.status).toEqual(403);
        }

        expect(eventCount).toEqual(1);
      });

      it("Should broadcast retryAfter of 5s even when the header is missing", async function () {
        let eventCount = 0;
        const octokit = new TestOctokit({
          throttle: {
            [eventHandlerName]: (retryAfter: number, options: object) => {
              expect(retryAfter).toEqual(5);
              expect(options).toMatchObject({
                method: "GET",
                url: "/route2",
                request: { retryCount: 0 },
              });
              eventCount++;
            },
            onRateLimit: () => 1,
          },
        });

        await octokit.request("GET /route1", {
          request: {
            responses: [{ status: 201, headers: {}, data: {} }],
          },
        });
        try {
          await octokit.request("GET /route2", {
            request: {
              responses: [
                {
                  status: 403,
                  headers: {},
                  data: {
                    message: "You have exceeded a secondary rate limit",
                  },
                },
              ],
            },
          });
          throw new Error("Should not reach this point");
        } catch (error: any) {
          expect(error.status).toEqual(403);
        }

        expect(eventCount).toEqual(1);
      });
    }
  );

  describe("'rate-limit'", function () {
    it("Should detect rate limit exceeded and broadcast event", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          onRateLimit: (
            retryAfter: number,
            options: object,
            octokitFromOptions: InstanceType<typeof TestOctokit>
          ) => {
            expect(octokit).toBe(octokitFromOptions);
            expect(retryAfter).toBeLessThan(32);
            expect(retryAfter).toBeGreaterThan(28);
            expect(options).toMatchObject({
              method: "GET",
              url: "/route2",
              request: { retryCount: 0 },
            });
            eventCount++;
          },
          onSecondaryRateLimit: () => 1,
        },
      });
      const t0 = Date.now();

      await octokit.request("GET /route1", {
        request: {
          responses: [{ status: 201, headers: {}, data: {} }],
        },
      });
      try {
        await octokit.request("GET /route2", {
          request: {
            responses: [
              {
                status: 403,
                headers: {
                  "x-ratelimit-remaining": "0",
                  "x-ratelimit-reset": `${Math.round(t0 / 1000) + 30}`,
                },
                data: {},
              },
            ],
          },
        });
        throw new Error("Should not reach this point");
      } catch (error: any) {
        expect(error.status).toEqual(403);
      }

      expect(eventCount).toEqual(1);
    });
  });
});
