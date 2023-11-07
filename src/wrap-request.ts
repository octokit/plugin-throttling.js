import type { EndpointDefaults, OctokitResponse } from "@octokit/types";
import type { State } from "./types";

const noop = () => Promise.resolve();

export function wrapRequest(
  state: State,
  request: (
    options: Required<EndpointDefaults>,
  ) => OctokitResponse<any> | Promise<OctokitResponse<any>>,
  options: Required<EndpointDefaults>,
) {
  return state.retryLimiter.schedule(doRequest, state, request, options);
}

async function doRequest(
  state: State,
  request: (
    options: Required<EndpointDefaults>,
  ) => OctokitResponse<any> | Promise<OctokitResponse<any>>,
  options: Required<EndpointDefaults>,
) {
  const isWrite = options.method !== "GET" && options.method !== "HEAD";
  const { pathname } = new URL(options.url, "http://github.test");
  const isSearch = options.method === "GET" && pathname.startsWith("/search/");
  const isGraphQL = pathname.startsWith("/graphql");

  // @ts-expect-errors
  const retryCount = ~~request.retryCount;
  const jobOptions = retryCount > 0 ? { priority: 0, weight: 0 } : {};
  if (state.clustering) {
    // Remove a job from Redis if it has not completed or failed within 60s
    // Examples: Node process terminated, client disconnected, etc.
    // @ts-expect-error
    jobOptions.expiration = 1000 * 60;
  }

  // Guarantee at least 1000ms between writes
  // GraphQL can also trigger writes
  if (isWrite || isGraphQL) {
    await state.write.key(state.id).schedule(jobOptions, noop);
  }

  // Guarantee at least 3000ms between requests that trigger notifications
  if (isWrite && state.triggersNotification(pathname)) {
    await state.notifications.key(state.id).schedule(jobOptions, noop);
  }

  // Guarantee at least 2000ms between search requests
  if (isSearch) {
    await state.search.key(state.id).schedule(jobOptions, noop);
  }

  // @ts-expect-error
  const req = state.global
    .key(state.id)
    .schedule<OctokitResponse<any>, Required<EndpointDefaults>>(
      jobOptions,
      request,
      options,
    );
  if (isGraphQL) {
    const res = await req;

    if (
      res.data.errors != null &&
      // @ts-expect-error
      res.data.errors.some((error) => error.type === "RATE_LIMITED")
    ) {
      const error = Object.assign(new Error("GraphQL Rate Limit Exceeded"), {
        response: res,
        data: res.data,
      });

      throw error;
    }
  }
  return req;
}
