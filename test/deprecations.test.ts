import { describe, it } from "vitest";
// Linting in `npm run test` complains when this isn't used.
// In the future when conducting deprecation testing, the below
// lines may be uncommented.

// import { Octokit } from "@octokit/core";
// import { throttling } from "../src";

// const TestOctokit = Octokit.plugin(throttling);

describe.skip("deprecations", () => {
  it("No deprecations", () => {});
});
