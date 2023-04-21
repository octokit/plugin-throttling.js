import Bottleneck from "bottleneck";
import { TestOctokit } from "./octokit";
import { Octokit } from "@octokit/core";
import { throttling } from "../src";
import { AddressInfo } from "net";
import { createServer } from "http";

describe("Retry", function () {
  describe("REST", function () {
    it("Should retry 'secondary-limit' and succeed", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          minimumSecondaryRateRetryAfter: 0,
          retryAfterBaseValue: 50,
          onSecondaryRateLimit: (retryAfter, options) => {
            expect(options).toMatchObject({
              method: "GET",
              url: "/route",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(eventCount + 1);
            eventCount++;
            return true;
          },
          onRateLimit: () => 1,
        },
      });

      const res = await octokit.request("GET /route", {
        request: {
          responses: [
            {
              status: 403,
              headers: { "retry-after": "1" },
              data: { message: "You have exceeded a secondary rate limit" },
            },
            { status: 200, headers: {}, data: { message: "Success!" } },
          ],
        },
      });

      expect(res.status).toEqual(200);
      expect(res.data).toMatchObject({ message: "Success!" });
      expect(eventCount).toEqual(1);
      expect(octokit.__requestLog).toStrictEqual([
        "START GET /route",
        "START GET /route",
        "END GET /route",
      ]);
      const ms = octokit.__requestTimings[1] - octokit.__requestTimings[0];
      expect(ms).toBeLessThan(80);
      expect(ms).toBeGreaterThan(20);
    });

    it("Should retry 'secondary-limit' twice and fail", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          minimumSecondaryRateRetryAfter: 0,
          retryAfterBaseValue: 50,
          onSecondaryRateLimit: (retryAfter, options) => {
            expect(options).toMatchObject({
              method: "GET",
              url: "/route",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(eventCount + 1);
            eventCount++;
            return true;
          },
          onRateLimit: () => 1,
        },
      });

      const message = "You have exceeded a secondary rate limit";
      try {
        await octokit.request("GET /route", {
          request: {
            responses: [
              {
                status: 403,
                headers: { "retry-after": "1" },
                data: { message },
              },
              {
                status: 403,
                headers: { "retry-after": "2" },
                data: { message },
              },
              {
                status: 404,
                headers: { "retry-after": "3" },
                data: { message: "Nope!" },
              },
            ],
          },
        });
        throw new Error("Should not reach this point");
      } catch (error: any) {
        expect(error.status).toEqual(404);
        expect(error.message).toEqual("Nope!");
      }

      expect(eventCount).toEqual(2);
      expect(octokit.__requestLog).toStrictEqual([
        "START GET /route",
        "START GET /route",
        "START GET /route",
      ]);

      const ms1 = octokit.__requestTimings[1] - octokit.__requestTimings[0];
      expect(ms1).toBeLessThan(70);
      expect(ms1).toBeGreaterThan(30);

      const ms2 = octokit.__requestTimings[2] - octokit.__requestTimings[1];
      expect(ms2).toBeLessThan(120);
      expect(ms2).toBeGreaterThan(80);
    });

    it("Should not leak retryCount between requests", async function () {
      let counter = 1;

      const server = createServer((req, res) => {
        if (counter++ % 3 === 0) {
          res
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({ message: "Success!" }));
        } else {
          res
            .writeHead(403, {
              "Content-Type": "application/json",
              "retry-after": "1",
            })
            .end(
              JSON.stringify({
                message: "You have exceeded a secondary rate limit",
              })
            );
        }
      });

      server.listen(0);
      const { port } = server.address() as AddressInfo;

      const ThrottledOctokit = Octokit.plugin(throttling);
      const octokit = new ThrottledOctokit({
        baseUrl: `http://localhost:${port}`,
        throttle: {
          minimumSecondaryRateRetryAfter: 0,
          retryAfterBaseValue: 50,
          onRateLimit: () => true,
          onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
            if (retryCount < 5) {
              return true;
            }
          },
        },
      });

      try {
        await octokit.request("GET /nope-nope-ok");
        await octokit.request("GET /nope-nope-ok");
        await octokit.request("GET /nope-nope-ok");
      } finally {
        server.close();
      }
    });

    it("Should retry 'rate-limit' and succeed", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          onRateLimit: (retryAfter, options) => {
            expect(options).toMatchObject({
              method: "GET",
              url: "/route",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(0);
            eventCount++;
            return true;
          },
          onSecondaryRateLimit: () => 1,
        },
      });

      const res = await octokit.request("GET /route", {
        request: {
          responses: [
            {
              status: 403,
              headers: {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": "123",
              },
              data: {},
            },
            { status: 202, headers: {}, data: { message: "Yay!" } },
          ],
        },
      });

      expect(res.status).toEqual(202);
      expect(res.data).toMatchObject({ message: "Yay!" });
      expect(eventCount).toEqual(1);
      expect(octokit.__requestLog).toStrictEqual([
        "START GET /route",
        "START GET /route",
        "END GET /route",
      ]);
      expect(
        octokit.__requestTimings[1] - octokit.__requestTimings[0]
      ).toBeLessThan(20);
    });
  });

  describe("GraphQL", function () {
    it("Should retry 'rate-limit' and succeed", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: (retryAfter, options) => {
            expect(options).toMatchObject({
              method: "POST",
              url: "/graphql",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(0);
            eventCount++;
            return true;
          },
          onSecondaryRateLimit: () => 1,
        },
      });

      const res = await octokit.request("POST /graphql", {
        request: {
          responses: [
            {
              status: 200,
              headers: {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": "123",
              },
              data: { errors: [{ type: "RATE_LIMITED" }] },
            },
            { status: 200, headers: {}, data: { message: "Yay!" } },
          ],
        },
      });

      expect(res.status).toEqual(200);
      expect(res.data).toMatchObject({ message: "Yay!" });
      expect(eventCount).toEqual(1);
      expect(octokit.__requestLog).toStrictEqual([
        "START POST /graphql",
        "END POST /graphql",
        "START POST /graphql",
        "END POST /graphql",
      ]);

      const ms = octokit.__requestTimings[2] - octokit.__requestTimings[0];
      expect(ms).toBeLessThan(70);
      expect(ms).toBeGreaterThan(30);
    });

    it("Should work with full URL", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: (retryAfter, options) => {
            expect(options).toMatchObject({
              method: "POST",
              url: "https://api.github.com/graphql",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(0);
            eventCount++;
            return true;
          },
          onSecondaryRateLimit: () => 1,
        },
      });

      const res = await octokit.request("POST https://api.github.com/graphql", {
        request: {
          responses: [
            {
              status: 200,
              headers: {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": "123",
              },
              data: { errors: [{ type: "RATE_LIMITED" }] },
            },
            { status: 200, headers: {}, data: { message: "Yay!" } },
          ],
        },
      });

      expect(res.status).toEqual(200);
      expect(res.data).toMatchObject({ message: "Yay!" });
      expect(eventCount).toEqual(1);
      expect(octokit.__requestLog).toStrictEqual([
        "START POST https://api.github.com/graphql",
        "END POST https://api.github.com/graphql",
        "START POST https://api.github.com/graphql",
        "END POST https://api.github.com/graphql",
      ]);

      const ms = octokit.__requestTimings[2] - octokit.__requestTimings[0];
      expect(ms).toBeLessThan(70);
      expect(ms).toBeGreaterThan(30);
    });

    it("Should ignore other error types", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: () => {
            eventCount++;
            return true;
          },
          onSecondaryRateLimit: () => 1,
        },
      });

      const res = await octokit.request("POST /graphql", {
        request: {
          responses: [
            {
              status: 200,
              headers: {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": "123",
              },
              data: { errors: [{ type: "HELLO_WORLD" }] },
            },
            { status: 200, headers: {}, data: { message: "Yay!" } },
          ],
        },
      });

      expect(res.status).toEqual(200);
      expect(res.data).toStrictEqual({ errors: [{ type: "HELLO_WORLD" }] });
      expect(eventCount).toEqual(0);
      expect(octokit.__requestLog).toStrictEqual([
        "START POST /graphql",
        "END POST /graphql",
      ]);
    });

    it("Should ignore 401 Unauthorized errors", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: () => {
            eventCount++;
            return true;
          },
          onSecondaryRateLimit: () => 1,
        },
      });

      try {
        await octokit.request("POST /graphql", {
          request: {
            responses: [
              {
                status: 401,
                headers: {
                  "x-ratelimit-remaining": "0",
                  "x-ratelimit-reset": "123",
                },
                data: {
                  message: "Bad credentials",
                  documentation_url: "https://docs.github.com/graphql",
                },
              },
            ],
          },
        });
        throw new Error("Should not reach this point");
      } catch (error: any) {
        expect(error.status).toEqual(401);
        expect(error.message).toEqual("Bad credentials");
      }

      expect(eventCount).toEqual(0);
      expect(octokit.__requestLog).toStrictEqual(["START POST /graphql"]);
    });

    it("Should retry 403 Forbidden errors on SecondaryRate limit", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onSecondaryRateLimit: () => {
            eventCount++;
            return true;
          },
          onRateLimit: () => 1,
          minimumSecondaryRateRetryAfter: 0,
          retryAfterBaseValue: 50,
        },
      });
      const res = await octokit.request("POST /graphql", {
        request: {
          responses: [
            {
              status: 403,
              headers: {
                "retry-after": 1,
              },
              data: {
                message:
                  "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
                documentation_url:
                  "https://developer.github.com/v3/#secondary-rate-limits",
              },
            },
            { status: 200, headers: {}, data: { message: "Success!" } },
          ],
        },
      });

      expect(res.status).toEqual(200);
      expect(res.data).toMatchObject({ message: "Success!" });
      expect(eventCount).toEqual(1);
      expect(octokit.__requestLog).toStrictEqual([
        "START POST /graphql",
        "START POST /graphql",
        "END POST /graphql",
      ]);

      const ms = octokit.__requestTimings[1] - octokit.__requestTimings[0];
      expect(ms).toBeLessThan(80);
      expect(ms).toBeGreaterThan(20);
    });
  });
});
