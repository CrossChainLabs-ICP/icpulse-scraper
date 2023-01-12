CREATE MATERIALIZED VIEW IF NOT EXISTS repositories_view
AS
    with repositories as (SELECT date_trunc('month', created_at)::date as month, count(repo) as repositories FROM repos GROUP BY month)
    SELECT month,  SUM(SUM(repositories)) OVER (ORDER BY month ASC) AS repositories FROM repositories GROUP BY month ORDER BY month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_view_view ON repositories_view(month);