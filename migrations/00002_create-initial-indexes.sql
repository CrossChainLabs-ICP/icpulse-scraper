CREATE INDEX IF NOT EXISTS idx_repos_list ON repos_list(repo, organisation);
CREATE INDEX IF NOT EXISTS idx_repos ON repos(repo, organisation);
CREATE INDEX IF NOT EXISTS idx_devs ON devs(dev_name);
CREATE INDEX IF NOT EXISTS idx_branches ON branches(repo, organisation, branch);
CREATE INDEX IF NOT EXISTS idx_commits ON commits(commit_hash);
CREATE INDEX IF NOT EXISTS idx_commits2 ON commits(repo, organisation);
CREATE INDEX IF NOT EXISTS idx_issues ON issues(id);