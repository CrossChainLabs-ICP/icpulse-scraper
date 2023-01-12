CREATE MATERIALIZED VIEW IF NOT EXISTS overview_view
AS
    with
        all_contributors as (
            with
                contributors as ( SELECT DISTINCT dev_name FROM issues),
                devs as ( SELECT DISTINCT dev_name FROM devs)
                SELECT * FROM contributors  UNION ALL
                SELECT * FROM devs),

            all_commits as (SELECT dev_name, commit_date as date FROM commits),
            first_contribution as (SELECT all_commits.dev_name as dev_name, MIN(all_commits.date) as date FROM all_commits GROUP BY all_commits.dev_name),
            new_contributors_last_week as (SELECT COUNT(dev_name) as new_contributors_last_week FROM first_contribution WHERE date > NOW() - INTERVAL '7 days'),
            new_contributors_last_month as (SELECT COUNT(dev_name) as new_contributors_last_month FROM first_contribution WHERE date > NOW() - INTERVAL '30 days'),
            new_commits_last_week as (SELECT COUNT(commit_hash) as new_commits_last_week FROM commits WHERE commit_date > NOW() - INTERVAL '7 days'),
            new_commits_last_month as (SELECT COUNT(commit_hash) as new_commits_last_month FROM commits WHERE commit_date > NOW() - INTERVAL '30 days'),
            new_prs_last_week as (SELECT COUNT(id) as new_prs_last_week FROM issues WHERE (created_at > NOW() - INTERVAL '7 days') AND (is_pr = true)),
            new_prs_last_month as (SELECT COUNT(id) as new_prs_last_month FROM issues WHERE (created_at > NOW() - INTERVAL '30 days') AND (is_pr = true)),
            new_repos_last_week as (SELECT COUNT(repo) as new_repos_last_week FROM repos WHERE created_at > NOW() - INTERVAL '7 days'),
            new_repos_last_month as (SELECT COUNT(repo) as new_repos_last_month FROM repos WHERE created_at > NOW() - INTERVAL '30 days'),

            commits_data as ( SELECT sum(contributions) as commits FROM devs_contributions),
            repos_data as (SELECT count(repo) as repos FROM repos),
            contributors_data as (SELECT count(DISTINCT dev_name) as contributors FROM all_contributors),
            prs_data as (SELECT count(id) as prs FROM issues WHERE is_pr = true),
            issues_open as (SELECT COUNT(id) as issues_open FROM issues WHERE (issue_state = 'open') AND (is_pr = false) ),
            issues_closed as (SELECT COUNT(id) as issues_closed FROM issues WHERE (issue_state = 'closed') AND (is_pr = false))

    SELECT
        commits_data.commits,
        new_commits_last_week.new_commits_last_week,
        new_commits_last_month.new_commits_last_month,
        repos_data.repos,
        new_repos_last_week.new_repos_last_week,
        new_repos_last_month.new_repos_last_month,
        contributors_data.contributors,
        new_contributors_last_week.new_contributors_last_week,
        new_contributors_last_month.new_contributors_last_month,
        prs_data.prs,
        new_prs_last_week.new_prs_last_week,
        new_prs_last_month.new_prs_last_month,
        issues_open.issues_open,
        issues_closed.issues_closed
    FROM commits_data,
        new_commits_last_week,
        new_commits_last_month,
        repos_data,
        new_repos_last_week,
        new_repos_last_month,
        contributors_data,
        new_contributors_last_week,
        new_contributors_last_month,
        prs_data,
        new_prs_last_week,
        new_prs_last_month,
        issues_open,
        issues_closed
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_overview_view ON overview_view(commits, repos, contributors, prs, issues_open, issues_closed);