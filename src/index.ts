// @ts-expect-error No types for "bottleneck/light"
import BottleneckLight from "bottleneck/light.js";
import type TBottleneck from "bottleneck";
import type { Octokit, OctokitOptions } from "@octokit/core";
import type {
  CreateGroupsCommon,
  Groups,
  State,
  ThrottlingOptions,
} from "./types.js";
import { VERSION } from "./version.js";

import { wrapRequest } from "./wrap-request.js";
import triggersNotificationPaths from "./generated/triggers-notification-paths.js";
import { routeMatcher } from "./route-matcher.js";
import type { EndpointDefaults, OctokitResponse } from "@octokit/types";

// Workaround to allow tests to directly access the triggersNotification function.
const regex = routeMatcher(triggersNotificationPaths);
const triggersNotification = regex.test.bind(regex);

const groups: Groups = {};
const groupKeys = ["global", "auth", "search", "write", "notifications"] as const;

const createGroups = function (
  Bottleneck: typeof TBottleneck,
  common: CreateGroupsCommon,
) {
  groups.global = new Bottleneck.Group({
    id: "octokit-global",
    maxConcurrent: 10,
    ...common,
  });
  groups.auth = new Bottleneck.Group({
    id: "octokit-auth",
    maxConcurrent: 1,
    ...common,
  });
  groups.search = new Bottleneck.Group({
    id: "octokit-search",
    maxConcurrent: 1,
    minTime: 2000,
    ...common,
  });
  groups.write = new Bottleneck.Group({
    id: "octokit-write",
    maxConcurrent: 1,
    minTime: 1000,
    ...common,
  });
  groups.notifications = new Bottleneck.Group({
    id: "octokit-notifications",
    maxConcurrent: 1,
    minTime: 3000,
    ...common,
  });
};

export function cleanup() {
  Object.values(groups).forEach((group) => {
    group.removeAllListeners();
    group.disconnect();
    // @ts-expect-error Internal property, but we need to clear the interval to avoid memory leaks
    clearInterval(group.interval);
  });

  for (const key of groupKeys) {
    delete groups[key];
  }
}

export function throttling(octokit: Octokit, octokitOptions: OctokitOptions) {
  const {
    enabled = true,
    Bottleneck = BottleneckLight as typeof TBottleneck,
    id = "no-id",
    timeout = 1000 * 60 * 2, // Redis TTL: 2 minutes
    connection,
  } = octokitOptions.throttle || {};
  if (!enabled) {
    return {};
  }
  const common: CreateGroupsCommon = { timeout };
  if (typeof connection !== "undefined") {
    common.connection = connection;
  }

  const state: State = Object.assign(
    {
      clustering: connection != null,
      triggersNotification,
      fallbackSecondaryRateRetryAfter: 60,
      retryAfterBaseValue: 1000,
      id,
    },
    octokitOptions.throttle,
  ) as State;

  if (
    typeof state.onSecondaryRateLimit !== "function" ||
    typeof state.onRateLimit !== "function"
  ) {
    throw new Error(`octokit/plugin-throttling error:
        You must pass the onSecondaryRateLimit and onRateLimit error handlers.
        See https://octokit.github.io/rest.js/#throttling

        const octokit = new Octokit({
          throttle: {
            onSecondaryRateLimit: (retryAfter, options) => {/* ... */},
            onRateLimit: (retryAfter, options) => {/* ... */}
          }
        })
    `);
  }

  // Bottleneck.Group's constructor schedules a `setInterval` for auto-cleanup,
  // and `new Bottleneck()` / `new Bottleneck.Events()` set up timers too. All
  // three are disallowed in Cloudflare Workers' global scope (and any other
  // environment that bans async I/O at import time). Defer every Bottleneck
  // instantiation to the first request, where execution is guaranteed to be
  // inside a handler.
  // https://github.com/octokit/plugin-throttling.js/issues/794
  let initialized = false;
  const initializeBottleneck = () => {
    if (initialized) {
      return;
    }
    initialized = true;

    if (groups.global == null) {
      createGroups(Bottleneck, common);
    }
    // Defaults from `groups`, but only where the caller didn't already
    // supply a custom Group via `octokitOptions.throttle` (e.g.
    // `throttle: { write: new Bottleneck.Group({ minTime: 50 }) }`).
    state.global = state.global ?? groups.global!;
    state.auth = state.auth ?? groups.auth!;
    state.search = state.search ?? groups.search!;
    state.write = state.write ?? groups.write!;
    state.notifications = state.notifications ?? groups.notifications!;
    state.retryLimiter = state.retryLimiter ?? new Bottleneck();

    const events = {};
    const emitter = new Bottleneck.Events(events);
    // @ts-expect-error
    events.on("secondary-limit", state.onSecondaryRateLimit);
    // @ts-expect-error
    events.on("rate-limit", state.onRateLimit);
    // @ts-expect-error
    events.on("error", (e) =>
      octokit.log.warn("Error in throttling-plugin limit handler", e),
    );

    state.retryLimiter.on("failed", async function (error, info) {
      const [state, request, options] = info.args as [
        State,
        OctokitResponse<any>,
        Required<EndpointDefaults>,
      ];
      const { pathname } = new URL(options.url, "http://github.test");
      const shouldRetryGraphQL =
        pathname.startsWith("/graphql") && error.status !== 401;

      if (
        !(shouldRetryGraphQL || error.status === 403 || error.status === 429)
      ) {
        return;
      }

      const retryCount = ~~request.retryCount;
      request.retryCount = retryCount;

      // backward compatibility
      options.request.retryCount = retryCount;

      const { wantRetry, retryAfter = 0 } = await (async function () {
        if (/\bsecondary rate\b/i.test(error.message)) {
          // The user has hit the secondary rate limit. (REST and GraphQL)
          // https://docs.github.com/en/rest/overview/resources-in-the-rest-api#secondary-rate-limits

          // The Retry-After header can sometimes be blank when hitting a secondary rate limit,
          // but is always present after 2-3s, so make sure to set `retryAfter` to at least 60s by default.
          const retryAfter =
            Number(error.response.headers["retry-after"]) ||
            state.fallbackSecondaryRateRetryAfter;
          const wantRetry = await emitter.trigger(
            "secondary-limit",
            retryAfter,
            options,
            octokit,
            retryCount,
          );
          return { wantRetry, retryAfter };
        }
        if (
          (error.response.headers != null &&
            error.response.headers["x-ratelimit-remaining"] === "0") ||
          (error.response.data?.errors ?? []).some(
            (error: any) => error.type === "RATE_LIMITED",
          )
        ) {
          // The user has used all their allowed calls for the current time period (REST and GraphQL)
          // https://docs.github.com/en/rest/reference/rate-limit (REST)
          // https://docs.github.com/en/graphql/overview/resource-limitations#rate-limit (GraphQL)

          const rateLimitReset = new Date(
            ~~error.response.headers["x-ratelimit-reset"] * 1000,
          ).getTime();
          const retryAfter = Math.max(
            // Add one second so we retry _after_ the reset time
            // https://docs.github.com/en/rest/overview/resources-in-the-rest-api?apiVersion=2022-11-28#exceeding-the-rate-limit
            Math.ceil((rateLimitReset - Date.now()) / 1000) + 1,
            0,
          );
          const wantRetry = await emitter.trigger(
            "rate-limit",
            retryAfter,
            options,
            octokit,
            retryCount,
          );
          return { wantRetry, retryAfter };
        }
        return {};
      })();

      if (wantRetry) {
        request.retryCount++;
        return retryAfter * state.retryAfterBaseValue;
      }
    });
  };

  // The types for `before-after-hook` do not let us only pass through a Promise return value
  // the types expect that the function can return either a Promise of the response, or directly return the response.
  // This is due to the fact that `@octokit/request` uses aysnc functions
  // Also, since we add the custom `retryCount` property to the request argument, the types are not compatible.
  octokit.hook.wrap("request", (request, options) => {
    initializeBottleneck();
    // @ts-ignore We use the ignore instead of expect-error because TypeScript cannot make up it's mind if there is an error or not.
    return wrapRequest(state, request, options);
  });

  return {
    throttle: {
      cleanup: cleanup.bind(null),
    },
  };
}
throttling.VERSION = VERSION;
throttling.triggersNotification = triggersNotification;

declare module "@octokit/core" {
  interface Octokit {
    throttle: {
      cleanup: () => void;
    };
  }

  interface OctokitOptions {
    throttle?: ThrottlingOptions;
  }
}

declare module "@octokit/types" {
  interface OctokitResponse<T, S extends number = number> {
    retryCount: number;
  }
}

export type { ThrottlingOptions };
