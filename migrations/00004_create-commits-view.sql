CREATE MATERIALIZED VIEW IF NOT EXISTS commits_view
AS
    with
        commits_data as ( SELECT date_trunc('month', commit_date)::date AS commit_month, count(commit_hash) as commits FROM commits GROUP BY commit_month)

    SELECT commits_data.commits, commit_month, to_char(commits_data.commit_month, 'Mon YY') as display_month FROM commits_data ORDER BY commits_data.commit_month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commits_view ON commits_view(commit_month);