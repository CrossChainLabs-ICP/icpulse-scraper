CREATE MATERIALIZED VIEW IF NOT EXISTS active_repositories_view
AS
 with
        commits_data as ( SELECT commit_hash, commit_date, commits.repo, commits.organisation, repo_type FROM commits LEFT JOIN repos on commits.repo = repos.repo AND commits.organisation = repos.organisation),
        active_repos_core as (SELECT date_trunc('month', commit_date)::date AS month, count(DISTINCT (repo, organisation)) as active_repos_core FROM commits_data WHERE EXISTS (SELECT 1 FROM repos WHERE repo=commits_data.repo AND organisation=commits_data.organisation AND commits_data.repo_type = 'whitelisted') GROUP BY month),
        active_repos_ecosystem as (SELECT date_trunc('month', commit_date)::date AS month, count(DISTINCT (repo, organisation)) as active_repos_ecosystem FROM commits_data WHERE NOT EXISTS (SELECT 1 FROM repos WHERE repo=commits_data.repo AND organisation=commits_data.organisation AND commits_data.repo_type = 'whitelisted') GROUP BY month)

    SELECT
        active_repos_core.active_repos_core,
        active_repos_ecosystem.active_repos_ecosystem,
        active_repos_core.month,
        to_char(active_repos_core.month, 'Mon YY') as display_month
    FROM active_repos_core
    LEFT JOIN active_repos_ecosystem on active_repos_core.month = active_repos_ecosystem.month
    ORDER BY active_repos_core.month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_repositories_view ON active_repositories_view(month);