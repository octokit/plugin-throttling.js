import type { EndpointDefaults, OctokitResponse } from "@octokit/types";
import type { State } from "./types.js";

const noop = () => Promise.resolve();

export function wrapRequest(
  state: State,
  request: ((
    options: Required<EndpointDefaults>,
  ) => Promise<OctokitResponse<any>>) & { retryCount: number },
  options: Required<EndpointDefaults>,
) {
  return state.retryLimiter.schedule(doRequest, state, request, options);
}

async function doRequest(
  state: State,
  request: ((
    options: Required<EndpointDefaults>,
  ) => Promise<OctokitResponse<any>>) & { retryCount: number },
  options: Required<EndpointDefaults>,
) {
  const { pathname } = new URL(options.url, "http://github.test");
  const isAuth = isAuthRequest(options.method, pathname);
  const isWrite =
    !isAuth && options.method !== "GET" && options.method !== "HEAD";
  const isSearch = options.method === "GET" && pathname.startsWith("/search/");
  const isGraphQL = pathname.startsWith("/graphql");

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

  const req = (isAuth ? state.auth : state.global)
    .key(state.id)
    .schedule<OctokitResponse<any>>(jobOptions, request, options);
  if (isGraphQL) {
    const res = await req;

    if (
      res.data.errors != null &&
      res.data.errors.some((error: any) => error.type === "RATE_LIMITED")
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

function isAuthRequest(method: string, pathname: string) {
  return (
    (method === "PATCH" &&
      // https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-a-scoped-access-token
      /^\/applications\/[^/]+\/token\/scoped$/.test(pathname)) ||
    (method === "POST" &&
      // https://docs.github.com/en/rest/apps/oauth-applications?apiVersion=2022-11-28#reset-a-token
      (/^\/applications\/[^/]+\/token$/.test(pathname) ||
        // https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app
        /^\/app\/installations\/[^/]+\/access_tokens$/.test(pathname) ||
        // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
        pathname === "/login/oauth/access_token"))
  );
}
