/**
 * Repository:
 * https://github.com/octokit/plugin-throttling.js
 *
 * Resources:
 * https://octokit.github.io/rest.js/#throttling
 * https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-rate-limits
 */

declare module '@octokit/plugin-throttling' {
    import Octokit from '@octokit/rest';

    /**
     * More context provided to your limit callback function.
     */
    interface LimitCallbackParams {
        request: {
            /*
             * If this request has been retried,
             * which retry attempt is being limited.
             * Use this to determine how many retries
             * you want to attempt before giving up
             * due to being rate limited.
             */
            retryCount: number;
        };
    }

    /**
     * When you have been limited, you need to slow down your requests.
     *
     * Use the "Retry-After" response header to know how many seconds
     * to wait before your next request.
     *
     * The value of the "Retry-After" header will always be an integer,
     * representing the number of seconds you should wait before making
     * requests again.
     *
     * For example, "Retry-After: 30" means you should wait
     * 30 seconds before sending more requests.
     *
     * @param {number} retryAfter - number of seconds to wait
     * @param {LimitCallbackParams} params - context about retry attempts
     *
     * @returns `true` to retry the request after waiting, `false` to not retry
     */
    type RateLimitCallback = (
        retryAfter: number,
        params: LimitCallbackParams,
    ) => boolean;

    interface ThrottleOptions extends Octokit.Options {
        throttle: {
            /*
             * Called when your app exceeds the normal rate limit
             * for an API endpoint. Slow down.
             */
            onRateLimit: RateLimitCallback;
            /*
             * GitHub has detected potential abuse of an API endpoint.
             * Slow down or risk having access denied from your app.
             */
            onAbuseLimit: RateLimitCallback;
        };
    }

    /**
     * This module is an Octokit plugin.
     * Required for the Octokit.plugin(..) method to accept this type.
     */
    export default function plugin(
        octokit: Octokit,
        options: Octokit.Options,
    ): void;
}
