import type { ThrottlingOptions } from "../src/index.ts";
import type { Octokit } from "@octokit/core";

describe("Exports", function () {
  it("Should export ThrottlingOptions", function () {
    const options: ThrottlingOptions = {
      enabled: true,
      onRateLimit: () => {},
      onSecondaryRateLimit: () => {},
    };

    options.enabled = false;
    // @ts-expect-error
    options.onRateLimit(10, {}, {} as Octokit, 0);
    // @ts-expect-error
    options.onSecondaryRateLimit(10, {}, {} as Octokit, 0);
  });
});
