module.exports = {
  scraper: {
    github_api: process.env.GITHUB_API || "",
    github_token: process.env.GITHUB_TOKEN?.split(", ") || [],
    whitelisted_organizations:
      process.env.WHITELISTED_ORGANIZATIONS?.split(", ") || [],
    whitelisted_repos: process.env.WHITELISTED_REPOS?.split(", ") || [],
    blacklisted_organizations:
      process.env.BLACKLIST_ORGANIZATIONS?.split(", ") || [],
    blacklisted_repos: process.env.BLACKLIST_REPOS?.split(", ") || [],
    recent_commits_days: process.env.RECENT_COMMITS_DAYS || 365,
  },
  database: {
    user: process.env.DB_USER || "",
    host: process.env.DB_HOST || "",
    database: process.env.DB_NAME || "",
    password: process.env.DB_PASSWORD || "",
    port: process.env.DB_PORT || 5432,
  },
};
