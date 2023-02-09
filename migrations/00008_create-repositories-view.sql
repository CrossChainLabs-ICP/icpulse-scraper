CREATE MATERIALIZED VIEW IF NOT EXISTS repositories_view
AS
    with
        repositories_core as (SELECT date_trunc('month', created_at)::date as month, count(repo) as repositories FROM repos WHERE repo_type = 'whitelisted' GROUP BY month),
        repositories_ecosystem as (SELECT date_trunc('month', created_at)::date as month, count(repo) as repositories FROM repos WHERE repo_type != 'whitelisted' GROUP BY month)
    SELECT
        repositories_core.month,
        COALESCE(SUM(SUM(repositories_core.repositories)) OVER (ORDER BY repositories_core.month ASC), 0) AS repositories_core,
        COALESCE(SUM(SUM(repositories_ecosystem.repositories)) OVER (ORDER BY repositories_core.month ASC), 0) AS repositories_ecosystem
    FROM repositories_core
    LEFT JOIN repositories_ecosystem on repositories_core.month = repositories_ecosystem.month
    GROUP BY repositories_core.month ORDER BY repositories_core.month
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_view_view ON repositories_view(month);