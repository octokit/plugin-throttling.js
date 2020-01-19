export default [
  "/orgs/:org/invitations",
  "/orgs/:org/teams/:team_slug/discussions",
  "/orgs/:org/teams/:team_slug/discussions/:discussion_number/comments",
  "/repos/:owner/:repo/collaborators/:username",
  "/repos/:owner/:repo/commits/:commit_sha/comments",
  "/repos/:owner/:repo/issues",
  "/repos/:owner/:repo/issues/:issue_number/comments",
  "/repos/:owner/:repo/pulls",
  "/repos/:owner/:repo/pulls/:pull_number/comments",
  "/repos/:owner/:repo/pulls/:pull_number/comments/:comment_id/replies",
  "/repos/:owner/:repo/pulls/:pull_number/merge",
  "/repos/:owner/:repo/pulls/:pull_number/requested_reviewers",
  "/repos/:owner/:repo/pulls/:pull_number/reviews",
  "/repos/:owner/:repo/releases",
  "/teams/:team_id/discussions",
  "/teams/:team_id/discussions/:discussion_number/comments"
];
