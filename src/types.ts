import { Octokit } from "@octokit/core";

declare module "@octokit/core/dist-types/types.d" {
  interface OctokitOptions {
    throttle: ThrottlingOptions;
  }
}

type LimitHandler = (
  retryAfter: number,
  options: ThrottlingOptions,
  octokit: Octokit
) => void;

interface ThrottlingOptions {
  enabled?: boolean;
  Bottleneck?: any;
  id?: string;
  timeout?: number;
  connection?: any;
  /**
   * @deprecated The method should not be used
   */
  onAbuseLimit: LimitHandler;
  onSecondaryRateLimit: LimitHandler;
  onRateLimit: LimitHandler;
}
