// @ts-ignore
import BottleneckLight from "bottleneck/light";
import { Octokit } from "@octokit/core";

import { VERSION } from "./version";

import { wrapRequest } from "./wrap-request";
import triggersNotificationPaths from "./generated/triggers-notification-paths";
import { routeMatcher } from "./route-matcher";

// Workaround to allow tests to directly access the triggersNotification function.
const regex = routeMatcher(triggersNotificationPaths);
const triggersNotification = regex.test.bind(regex);

const groups = {};

// @ts-ignore
const createGroups = function (Bottleneck, common) {
  // @ts-ignore
  groups.global = new Bottleneck.Group({
    id: "octokit-global",
    maxConcurrent: 10,
    ...common,
  });
  // @ts-ignore
  groups.search = new Bottleneck.Group({
    id: "octokit-search",
    maxConcurrent: 1,
    minTime: 2000,
    ...common,
  });
  // @ts-ignore
  groups.write = new Bottleneck.Group({
    id: "octokit-write",
    maxConcurrent: 1,
    minTime: 1000,
    ...common,
  });
  // @ts-ignore
  groups.notifications = new Bottleneck.Group({
    id: "octokit-notifications",
    maxConcurrent: 1,
    minTime: 3000,
    ...common,
  });
};

export function throttling(octokit: Octokit, octokitOptions = {}) {
  const {
    enabled = true,
    Bottleneck = BottleneckLight,
    id = "no-id",
    timeout = 1000 * 60 * 2, // Redis TTL: 2 minutes
    connection,
    // @ts-ignore
  } = octokitOptions.throttle || {};
  if (!enabled) {
    return {};
  }
  const common = { connection, timeout };

  // @ts-ignore
  if (groups.global == null) {
    createGroups(Bottleneck, common);
  }

  const state = Object.assign(
    {
      clustering: connection != null,
      triggersNotification,
      minimumAbuseRetryAfter: 5,
      retryAfterBaseValue: 1000,
      retryLimiter: new Bottleneck(),
      id,
      ...groups,
    },
    // @ts-ignore
    octokitOptions.throttle
  );

  if (
    typeof state.onAbuseLimit !== "function" ||
    typeof state.onRateLimit !== "function"
  ) {
    throw new Error(`octokit/plugin-throttling error:
        You must pass the onAbuseLimit and onRateLimit error handlers.
        See https://github.com/octokit/rest.js#throttling

        const octokit = new Octokit({
          throttle: {
            onAbuseLimit: (retryAfter, options) => {/* ... */},
            onRateLimit: (retryAfter, options) => {/* ... */}
          }
        })
    `);
  }

  const events = {};
  const emitter = new Bottleneck.Events(events);
  // @ts-ignore
  events.on("abuse-limit", state.onAbuseLimit);
  // @ts-ignore
  events.on("rate-limit", state.onRateLimit);
  // @ts-ignore
  events.on("error", (e) =>
    console.warn("Error in throttling-plugin limit handler", e)
  );

  // @ts-ignore
  state.retryLimiter.on("failed", async function (error, info) {
    const options = info.args[info.args.length - 1];
    const { pathname } = new URL(options.url, "http://github.test");
    const shouldRetryGraphQL =
      pathname.startsWith("/graphql") && error.status !== 401;

    if (!(shouldRetryGraphQL || error.status === 403)) {
      return;
    }

    const retryCount = ~~options.request.retryCount;
    options.request.retryCount = retryCount;

    const { wantRetry, retryAfter } = await (async function () {
      if (/\babuse\b/i.test(error.message)) {
        // The user has hit the abuse rate limit. (REST and GraphQL)
        // https://docs.github.com/en/rest/overview/resources-in-the-rest-api#abuse-rate-limits

        // The Retry-After header can sometimes be blank when hitting an abuse limit,
        // but is always present after 2-3s, so make sure to set `retryAfter` to at least 5s by default.
        const retryAfter = Math.max(
          ~~error.response.headers["retry-after"],
          state.minimumAbuseRetryAfter
        );
        const wantRetry = await emitter.trigger(
          "abuse-limit",
          retryAfter,
          options,
          octokit
        );
        return { wantRetry, retryAfter };
      }
      if (
        error.response.headers != null &&
        error.response.headers["x-ratelimit-remaining"] === "0"
      ) {
        // The user has used all their allowed calls for the current time period (REST and GraphQL)
        // https://docs.github.com/en/rest/reference/rate-limit (REST)
        // https://docs.github.com/en/graphql/overview/resource-limitations#rate-limit (GraphQL)

        const rateLimitReset = new Date(
          ~~error.response.headers["x-ratelimit-reset"] * 1000
        ).getTime();
        const retryAfter = Math.max(
          Math.ceil((rateLimitReset - Date.now()) / 1000),
          0
        );
        const wantRetry = await emitter.trigger(
          "rate-limit",
          retryAfter,
          options,
          octokit
        );
        return { wantRetry, retryAfter };
      }
      return {};
    })();

    if (wantRetry) {
      options.request.retryCount++;
      // @ts-ignore
      return retryAfter * state.retryAfterBaseValue;
    }
  });

  octokit.hook.wrap("request", wrapRequest.bind(null, state));

  return {};
}
throttling.VERSION = VERSION;
throttling.triggersNotification = triggersNotification;
