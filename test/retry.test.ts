import Bottleneck from "bottleneck";
import { TestOctokit } from "./octokit";
import { throttling } from "../src";

describe("Retry", function () {
  describe("REST", function () {
    it("Should retry 'abuse-limit' and succeed", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          minimumAbuseRetryAfter: 0,
          retryAfterBaseValue: 50,
          onAbuseLimit: (retryAfter: number, options: object) => {
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
              data: { message: "You have been rate limited to prevent abuse" },
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

    it("Should retry 'abuse-limit' twice and fail", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          minimumAbuseRetryAfter: 0,
          retryAfterBaseValue: 50,
          onAbuseLimit: (retryAfter: number, options: object) => {
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

      const message = "You have been rate limited to prevent abuse";
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
      } catch (error) {
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

    it("Should retry 'rate-limit' and succeed", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          onRateLimit: (retryAfter: number, options: object) => {
            expect(options).toMatchObject({
              method: "GET",
              url: "/route",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(0);
            eventCount++;
            return true;
          },
          onAbuseLimit: () => 1,
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
          onRateLimit: (retryAfter: number, options: object) => {
            expect(options).toMatchObject({
              method: "POST",
              url: "/graphql",
              request: { retryCount: eventCount },
            });
            expect(retryAfter).toEqual(0);
            eventCount++;
            return true;
          },
          onAbuseLimit: () => 1,
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

    it("Should ignore other error types", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onRateLimit: (retryAfter: number, options: object) => {
            eventCount++;
            return true;
          },
          onAbuseLimit: () => 1,
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
          onRateLimit: (retryAfter: number, options: object) => {
            eventCount++;
            return true;
          },
          onAbuseLimit: () => 1,
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
      } catch (error) {
        expect(error.status).toEqual(401);
        expect(error.message).toEqual("Bad credentials");
      }

      expect(eventCount).toEqual(0);
      expect(octokit.__requestLog).toStrictEqual(["START POST /graphql"]);
    });

    it("Should retry 403 Forbidden errors on abuse limit", async function () {
      let eventCount = 0;
      const octokit = new TestOctokit({
        throttle: {
          write: new Bottleneck.Group({ minTime: 50 }),
          onAbuseLimit: (retryAfter: number, options: object) => {
            eventCount++;
            return true;
          },
          onRateLimit: () => 1,
          minimumAbuseRetryAfter: 0,
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
                  "You have triggered an abuse detection mechanism. Please wait a few minutes before you try again.",
                documentation_url:
                  "https://developer.github.com/v3/#abuse-rate-limits",
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
