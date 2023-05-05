import { Octokit } from "@octokit/core";
import Bottleneck from "bottleneck";

type LimitHandler = (
  retryAfter: number,
  options: object,
  octokit: Octokit,
  retryCount: number
) => void;

export type AbuseLimitHandler = {
  /**
   * @deprecated "[@octokit/plugin-throttling] `onAbuseLimit()` is deprecated and will be removed in a future release of `@octokit/plugin-throttling`, please use the `onSecondaryRateLimit` handler instead"
   */
  onAbuseLimit: LimitHandler;
  onSecondaryRateLimit?: never;
};

export type SecondaryLimitHandler = {
  /**
   * @deprecated "[@octokit/plugin-throttling] `onAbuseLimit()` is deprecated and will be removed in a future release of `@octokit/plugin-throttling`, please use the `onSecondaryRateLimit` handler instead"
   */
  onAbuseLimit?: never;
  onSecondaryRateLimit: LimitHandler;
};

export type ThrottlingOptionsBase = {
  enabled?: boolean;
  Bottleneck?: typeof Bottleneck;
  id?: string;
  timeout?: number;
  connection?: Bottleneck.RedisConnection | Bottleneck.IORedisConnection;
  minimumSecondaryRateRetryAfter?: number;
  retryAfterBaseValue?: number;
  write?: Bottleneck.Group;
  search?: Bottleneck.Group;
  notifications?: Bottleneck.Group;
  onRateLimit: LimitHandler;
};

export type ThrottlingOptions = ThrottlingOptionsBase &
  (AbuseLimitHandler | SecondaryLimitHandler);

export type Groups = {
  global?: Bottleneck.Group;
  write?: Bottleneck.Group;
  search?: Bottleneck.Group;
  notifications?: Bottleneck.Group;
};
