CREATE MATERIALIZED VIEW IF NOT EXISTS top_contributors_view
AS
    with
         commits as ( SELECT dev_name FROM commits WHERE commit_date > NOW() - INTERVAL '30 days'),
         total_contributions as (SELECT commits.dev_name, COUNT(commits.dev_name) AS contributions FROM commits  GROUP BY  commits.dev_name),
         user_contributions as (SELECT total_contributions.dev_name, avatar_url, contributions FROM total_contributions INNER JOIN devs ON total_contributions.dev_name = devs.dev_name)

    SELECT * FROM user_contributions ORDER BY contributions DESC LIMIT 10
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_top_contributors_view ON top_contributors_view(dev_name);