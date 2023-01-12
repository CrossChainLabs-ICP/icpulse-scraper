
CREATE MATERIALIZED VIEW IF NOT EXISTS activity_view
AS
with
        active_contributors as ( SELECT date_trunc('month', commit_date)::date AS month, count(DISTINCT dev_name) as active_contributors FROM commits GROUP BY month),
        active_repos as ( SELECT date_trunc('month', commit_date)::date AS month, count(DISTINCT (repo, organisation)) as active_repos FROM commits GROUP BY month)

    SELECT
           active_repos.active_repos,
           active_contributors.active_contributors,
           active_contributors.month,
           to_char(active_contributors.month, 'Mon YY') as display_month
FROM active_contributors
LEFT JOIN active_repos ON active_contributors.month = active_repos.month
ORDER BY active_contributors.month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_view ON activity_view(month);