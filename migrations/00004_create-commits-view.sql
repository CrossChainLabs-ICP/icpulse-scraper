CREATE MATERIALIZED VIEW IF NOT EXISTS commits_view
AS
    with
        commits_data as ( SELECT commit_hash, commit_date, commits.repo, commits.organisation, repo_type FROM commits LEFT JOIN repos on commits.repo = repos.repo AND commits.organisation = repos.organisation),
        commits_data_core as (SELECT date_trunc('month', commit_date)::date AS commit_month, count(commit_hash) as commits FROM commits_data WHERE EXISTS (SELECT 1 FROM repos WHERE repo=commits_data.repo AND organisation=commits_data.organisation AND commits_data.repo_type = 'whitelisted') GROUP BY commit_month),
        commits_data_ecosystem as (SELECT date_trunc('month', commit_date)::date AS commit_month, count(commit_hash) as commits FROM commits_data WHERE NOT EXISTS (SELECT 1 FROM repos WHERE repo=commits_data.repo AND organisation=commits_data.organisation AND commits_data.repo_type = 'whitelisted') GROUP BY commit_month)

    SELECT
        commits_data_core.commits as commits_core,
        commits_data_ecosystem.commits as commits_ecosystem,
        commits_data_core.commit_month,
        to_char(commits_data_core.commit_month, 'Mon YY') as display_month
    FROM commits_data_core
    LEFT JOIN commits_data_ecosystem on commits_data_core.commit_month = commits_data_ecosystem.commit_month
    ORDER BY commits_data_core.commit_month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commits_view ON commits_view(commit_month);