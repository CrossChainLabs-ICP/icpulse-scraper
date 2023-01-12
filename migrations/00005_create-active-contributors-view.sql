
CREATE MATERIALIZED VIEW IF NOT EXISTS active_contributors_view
AS
    with
        active_contributors as ( SELECT date_trunc('month', commit_date)::date AS month, count(DISTINCT dev_name) as active_contributors FROM commits GROUP BY month)

    SELECT active_contributors.active_contributors, active_contributors.month, to_char(month, 'Mon YY') as display_month FROM active_contributors ORDER BY active_contributors.month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_contributors_view ON active_contributors_view(month);