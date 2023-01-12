CREATE MATERIALIZED VIEW IF NOT EXISTS recent_commits_view
AS
    with
         commits_data as ( 
            SELECT 
            dev_name, 
            repo, 
            organisation, 
            commit_hash, 
            commit_date, 
            CASE WHEN length(message) > 150 THEN concat(substring(message, 1, 150), '...') ELSE message END as message
        FROM commits 
        WHERE commit_date > NOW() - INTERVAL '7 days'),
         user_commits as (
            SELECT 
            commits_data.dev_name, 
            repo, 
            organisation, 
            commit_hash, 
            commit_date, 
            avatar_url, 
            message 
        FROM commits_data 
        INNER JOIN devs ON commits_data.dev_name = devs.dev_name)

    SELECT * FROM user_commits ORDER BY commit_date DESC
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recent_commits_view ON recent_commits_view(dev_name, repo, organisation, commit_hash, commit_date, avatar_url, message);