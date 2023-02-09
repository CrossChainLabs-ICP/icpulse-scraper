const config = require("./config");
const axios = require("axios");
const cliProgress = require("cli-progress");
const { subDays } = require("date-fns");
const { INFO, ERROR, WARNING, STATUS } = require("./logs");
const { DB } = require("./db");

var search = require('./search.json');
let db = new DB();

const PER_PAGE = 100;
const SCRAPE_LIMIT = 1;
const REPOS_LIST_UPDATE = 24 * 3600 * 1000;

const blacklisted_organizations = config.scraper.blacklisted_organizations;
const blacklisted_repos = config.scraper.blacklisted_repos;
const whitelisted_organizations = config.scraper.whitelisted_organizations;
const whitelisted_repos = config.scraper.whitelisted_repos;

const pause = (timeout) =>
  new Promise((res) => setTimeout(res, timeout * 1000));

class Scraper {
  constructor(api, token_list) {
    this.api = api;
    this.token_list = token_list;
    this.token_list_index = 0;

    this.remaining_requests = 0;
    this.search_remaining_requests = 0;
    this.reset_time = 0;
    this.stop = false;
    this.lastReposListUpdate = 0;

    if (token_list?.length) {
      this.token = token_list[0];
    }
  }

  getNextToken() {
    if (this.token_list_index < this.token_list.length - 1) {
      this.token_list_index++;
    } else {
      this.token_list_index = 0;
    }

    INFO(`getNextToken index ${this.token_list_index}`);

    this.token = this.token_list[this.token_list_index];
  }

  async get(url, params, verbose = false) {
    let response = undefined;
    let should_pause = false;

    try {
      if (this.token) {
        response = await axios.get(url, {
          headers: {
            Accept: "application/vnd.github.v3+json",
            Authorization: `token ${this.token}`,
          },
          timeout: 10000,
          params,
        });
      } else {
        response = await axios.get(url, { timeout: 10000, params });
      }

      if (verbose) {
        INFO(`get ${url} -> ${JSON.stringify(params)}`);
      }
    } catch (e) {
      if (e?.response?.status == 403) {
        should_pause = true;
      }
      ERROR(
        `get ${url} -> ${JSON.stringify(params)} [${
          e?.response?.status
        }] error: ${e}`
      );
    }

    if (should_pause) {
      INFO(`get ${url} -> ${JSON.stringify(params)} pause for 60 seconds`);
      await pause(60);
      this.remaining_requests = 0;
    }

    return response;
  }

  async UpdateSearchRateLimit() {
    if (this.search_remaining_requests < SCRAPE_LIMIT) {
      this.getNextToken();
      const resp = await this.get(this.api + "rate_limit");

      if (resp?.data?.resources?.search) {
        const resetTime = new Date(resp?.data?.resources?.search?.reset * 1000);
        this.search_remaining_requests =
          resp?.data?.resources?.search?.remaining;
        this.reset_time = Math.round(resetTime.getTime() / 1000);

        INFO(
          `UpdateSearchRateLimit: search_remaining_requests ${this.search_remaining_requests}`
        );
      } else {
        ERROR(`UpdateSearchRateLimit: get rate limit status ${resp?.status}`);
      }

      if (this.search_remaining_requests < SCRAPE_LIMIT) {
        const now = new Date();
        const secondsSinceEpoch = Math.round(now.getTime() / 1000);

        const sleep_duration_sec = this.reset_time - secondsSinceEpoch + 1;
        const pause = (timeout) =>
          new Promise((res) => setTimeout(res, timeout * 1000));

        INFO(`UpdateSearchRateLimit: sleep for ${sleep_duration_sec} seconds`);
        await pause(sleep_duration_sec);

        const resp = await this.get(this.api + "rate_limit");

        if (resp?.data?.resources?.search) {
          this.search_remaining_requests =
            resp?.data?.resources?.search?.remaining;
          this.reset_time = resp?.data?.resources?.search?.reset;

          INFO(
            `UpdateSearchRateLimit: remaining_requests ${this.search_remaining_requests}`
          );
        } else {
          ERROR(`UpdateSearchRateLimit: get rate limit status ${resp?.status}`);
        }
      }
    }
  }

  async updateRateLimit() {
    if (this.remaining_requests < SCRAPE_LIMIT + 5) {
      this.getNextToken();
      const resp = await this.get(this.api + "rate_limit");

      if (resp?.data?.rate) {
        const resetTime = new Date(resp?.data?.rate?.reset * 1000);
        this.remaining_requests = resp?.data?.rate?.remaining;
        this.reset_time = Math.round(resetTime.getTime() / 1000);

        INFO(`updateRateLimit: remaining_requests ${this.remaining_requests}`);
      } else {
        ERROR(`updateRateLimit: get rate limit status ${resp?.status}`);
      }

      if (this.remaining_requests < SCRAPE_LIMIT + 5) {
        const now = new Date();
        const secondsSinceEpoch = Math.round(now.getTime() / 1000);

        const sleep_duration_sec = this.reset_time - secondsSinceEpoch + 1;
        const pause = (timeout) =>
          new Promise((res) => setTimeout(res, timeout * 1000));

        INFO(`updateRateLimit: sleep for ${sleep_duration_sec} seconds`);
        await pause(sleep_duration_sec);

        const resp = await this.get(this.api + "rate_limit");

        if (resp?.data?.rate) {
          this.remaining_requests = resp?.data?.rate?.remaining;
          this.reset_time = resp?.data?.rate?.reset;

          INFO(
            `updateRateLimit: remaining_requests ${this.remaining_requests}`
          );
        } else {
          ERROR(`UpdateRateLimit: get rate limit status ${resp?.status}`);
        }
      }
    }
  }

  async getWithRateLimitCheck(url, params, verbose = false) {
    await this.updateRateLimit();

    if (this.remaining_requests < 1) {
      return undefined;
    }

    this.remaining_requests -= 1;

    return await this.get(url, params, verbose);
  }

  async GetWithSearchRateLimitCheck(url, params, verbose = false) {
    await this.UpdateSearchRateLimit();

    if (this.search_remaining_requests < 1) {
      return undefined;
    }

    this.search_remaining_requests -= 1;

    return await this.get(url, params, verbose);
  }

  async getOrganizationRepos(org) {
    let result = [];

    if (!org) {
      return;
    }

    INFO(`getOrganizationRepos[${org}]`);

    try {
      let have_items = false;
      let page = 1;

      do {
        const respRepos = await this.getWithRateLimitCheck(
          this.api + "orgs/" + org + "/repos",
          {
            per_page: PER_PAGE,
            page: page,
          }
        );

        if (respRepos?.data.length === PER_PAGE) {
          have_items = true;
          page++;
        } else {
          have_items = false;
        }

        respRepos?.data.forEach((repo) => {
          result.push(repo.name);
        });
      } while (have_items);
    } catch (e) {
      ERROR(`getOrganizationRepos: ${e}`);
    }

    return result;
  }

  isBlacklisted(repo, org) {
    let result = false;

    if (
      blacklisted_organizations &&
      blacklisted_organizations.find((o) => o == org)
    ) {
      result = true;
    } else {
      if (
        blacklisted_repos &&
        blacklisted_repos.find((r) => r == org + "/" + repo)
      ) {
        result = true;
      }
    }

    if (result) {
      WARNING(`isBlacklisted: ${org}/${repo}`);
    }

    return result;
  }

  async isValidRepo(repo, org) {
    let result = false;
    let repo_full_name = org + "/" + repo;

    try {
      const respGeneralInfo = await this.getWithRateLimitCheck(
        this.api + "repos/" + repo_full_name
      );

      if (respGeneralInfo?.data?.id) {
        result = true;
      }
    } catch (e) {
      ERROR(`IsValidRepo: ${repo_full_name} -> ${e}`);
    }

    return result;
  }

  async getRepoParent(repo, org) {
    let result = undefined;
    let repo_full_name = org + "/" + repo;

    try {
      const respGeneralInfo = await this.getWithRateLimitCheck(
        this.api + "repos/" + repo_full_name
      );

      result = respGeneralInfo?.data?.parent?.full_name;
    } catch (e) {
      ERROR(`IsValidRepo: ${repo_full_name} -> ${e}`);
    }

    return result;
  }

  async getWhitelistedRepos() {
    let repos = [];

    try {
      for (let i = 0; i < whitelisted_organizations.length; i++) {
        let org = whitelisted_organizations[i];
        let org_repos = await this.getOrganizationRepos(org);
        org_repos.forEach((repo) => {
          if (!this.isBlacklisted(repo, org)) {
            repos.push({
              repo: repo,
              organisation: org,
              repo_type: "whitelisted",
              dependencies: "[]",
            });
          }
        });
      }

      if (whitelisted_repos?.length > 0) {
        for (let i = 0; i < whitelisted_repos.length; i++) {
          let repo_full_name = whitelisted_repos[i];
          let split = repo_full_name.split("/");
          let org = split[0];
          let repo = split[1];

          if (org && repo && !this.isBlacklisted(repo, org)) {
            let isValidRepo = await this.isValidRepo(repo, org);

            if (isValidRepo) {
              repos.push({
                repo: repo,
                organisation: org,
                repo_type: "whitelisted",
                dependencies: "[]",
              });
            }
          }
        }
      }

      await db.saveRepos(repos);
    } catch (e) {
      console.log(e);
      ERROR(`getWhitelistedRepos: ${e}`);
    }
  }

  async getRepoInfo(repo, org, dependencies, repo_type) {
    let saved = false;
    let result = undefined;
    let repo_full_name = org + "/" + repo;
    let requests = this.remaining_requests;

    INFO(`getRepoInfo [${org}/${repo}]`);

    try {
      const respGeneralInfo = await this.getWithRateLimitCheck(
        this.api + "repos/" + repo_full_name
      );

      result = {
        repo: repo,
        organisation: org,
        repo_type: repo_type,
        stars: respGeneralInfo?.data?.stargazers_count,
        default_branch: respGeneralInfo?.data?.default_branch,
        created_at: respGeneralInfo?.data?.created_at,
        updated_at: respGeneralInfo?.data?.updated_at,
        pushed_at: respGeneralInfo?.data?.pushed_at,
        owner_type: respGeneralInfo?.data?.owner?.type,
        dependencies: JSON.stringify(dependencies),
        forks: respGeneralInfo?.data?.forks,
      };

      await db.saveRepoInfo(result);
      saved = true;
    } catch (e) {
      ERROR(`getRepoInfo: ${e}`);
    }

    requests = requests - this.remaining_requests;

    INFO(`getRepoInfo [${org}/${repo}] done (used requests: ${requests})`);
    return saved;
  }

  async getRepoContributors(repo, org) {
    let contributors = 0;
    let repo_full_name = org + "/" + repo;
    let requests = this.remaining_requests;

    INFO(`getRepoContributors [${org}/${repo}]`);

    try {
      let have_items = false;
      let page = 1;

      do {
        let result = [];

        const respContributors = await this.getWithRateLimitCheck(
          this.api + "repos/" + repo_full_name + "/contributors",
          {
            per_page: PER_PAGE,
            page: page,
          }
        );

        if (respContributors?.data.length === PER_PAGE) {
          have_items = true;
          page++;
        } else {
          have_items = false;
        }

        respContributors?.data.forEach((contributor) => {
          if (contributor?.type === "User") {
            result.push({
              id: contributor?.id,
              dev_name: contributor?.login,
              repo: repo,
              organisation: org,
              avatar_url: contributor?.avatar_url,
              contributions: contributor?.contributions,
            });
          }
        });

        await db.saveDevs(result);
        await db.saveContributions(result);

        contributors += respContributors?.data?.length;
      } while (have_items);
    } catch (e) {
      ERROR(`getRepoContributors: ${e}`);
    }

    requests = requests - this.remaining_requests;

    INFO(
      `getRepoContributors [${org}/${repo}] done (used requests: ${requests})`
    );

    return contributors;
  }

  async getRepoBranches(repo, org, default_branch) {
    let result = [];
    let repo_full_name = org + "/" + repo;

    let requests = this.remaining_requests;

    INFO(`getRepoBranches [${org}/${repo}]`);

    if (default_branch) {
      result.push(default_branch);
    }

    try {
      let have_items = false;
      let page = 1;

      do {
        const respBranches = await this.getWithRateLimitCheck(
          this.api + "repos/" + repo_full_name + "/branches",
          {
            per_page: PER_PAGE,
            page: page,
          }
        );

        if (respBranches?.data.length === PER_PAGE) {
          have_items = true;
          page++;
        } else {
          have_items = false;
        }

        respBranches?.data.forEach((branch) => {
          if (branch.name != default_branch) {
            result.push(branch.name);
          }
        });
      } while (have_items);
    } catch (e) {
      ERROR(`getRepoBranches: ${e}`);
    }

    requests = requests - this.remaining_requests;

    INFO(`getRepoBranches [${org}/${repo}] done (used requests: ${requests})`);

    return result;
  }

  async getRepoCommits(repo, org) {
    let commits = 0;
    let commitsSet = new Set();
    let repo_full_name = org + "/" + repo;
    let requests = this.remaining_requests;

    let recent_commits_date = subDays(
      new Date(),
      config.scraper.recent_commits_days
    );

    const default_branch_result = await db.query(
      `SELECT default_branch FROM repos WHERE repo='${repo}' AND organisation='${org}';`
    );
    const default_branch = default_branch_result?.rows[0]?.default_branch;

    let branches = await this.getRepoBranches(repo, org, default_branch);

    INFO(`getRepoCommits [${org}/${repo}] branches ${branches.length}`);

    let progress = 0;
    let total_progress = branches.length;
    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progressBar.start(branches.length, 0);

    if (branches.length) {
      var branchesSlice = branches;
      while (branchesSlice.length) {
        await Promise.all(
          branchesSlice.splice(0, SCRAPE_LIMIT).map(async (branch) => {
            try {
              let since = undefined;
              let have_items = false;
              let page = 1;

              const latest_commit_date_result = await db.query(
                `SELECT latest_commit_date FROM branches WHERE repo='${repo}' AND organisation='${org}' AND branch='${branch}';`
              );
              if (latest_commit_date_result?.rows[0]?.latest_commit_date) {
                let latest_commit_date_from_db = new Date(
                  latest_commit_date_result?.rows[0]?.latest_commit_date
                );
                since = latest_commit_date_from_db.toISOString();
              } else {
                since = recent_commits_date.toISOString();
              }

              let latest_commit_timestamp = undefined;
              let latest_commit_date = null;
              if (since) {
                latest_commit_timestamp = new Date(since);
                latest_commit_date = since;
              }

              do {
                let result = [];

                let params = {
                  per_page: PER_PAGE,
                  page: page,
                  sha: branch,
                };

                if (since) {
                  params.since = since;
                }

                const respCommits = await this.getWithRateLimitCheck(
                  this.api + "repos/" + repo_full_name + "/commits",
                  params
                );

                if (respCommits?.data.length === PER_PAGE) {
                  have_items = true;
                  page++;
                } else {
                  have_items = false;
                }

                respCommits?.data.forEach((commit) => {
                  if (!latest_commit_timestamp) {
                    if (commit?.commit?.committer?.date) {
                      latest_commit_timestamp = new Date(
                        commit?.commit?.committer?.date
                      );
                      latest_commit_date = commit?.commit?.committer?.date;
                    }
                  } else {
                    if (commit?.commit?.committer?.date) {
                      const new_commit_timestamp = new Date(
                        commit?.commit?.committer?.date
                      );
                      if (new_commit_timestamp > latest_commit_timestamp) {
                        latest_commit_timestamp = new_commit_timestamp;
                        latest_commit_date = commit?.commit?.committer?.date;
                      }
                    }
                  }

                  if (commit.sha && !commitsSet.has(commit.sha)) {
                    commitsSet.add(commit.sha);
                    result.push({
                      commit_hash: commit.sha,
                      dev_id: commit?.author?.id ? commit?.author?.id : null,
                      dev_name: commit?.author?.login
                        ? commit?.author?.login
                        : null,
                      repo: repo,
                      organisation: org,
                      branch: branch,
                      commit_date: commit?.commit?.committer?.date,
                      message: commit?.commit?.message,
                    });
                  }
                });

                await db.saveCommits(result);
                commits += result.length;
              } while (have_items);

              await db.saveBranch({
                repo: repo,
                organisation: org,
                branch: branch,
                latest_commit_date: latest_commit_date,
              });
            } catch (e) {
              ERROR(`getRepoCommits: ${e}`);
            }
          })
        );

        progress += SCRAPE_LIMIT;
        if (progress > total_progress) {
          progress = total_progress;
        }

        progressBar.update(progress);
      }
    }

    progressBar.stop();

    requests = requests - this.remaining_requests;

    INFO(`getRepoCommits [${org}/${repo}] done (used requests: ${requests})`);

    return commits;
  }

  async getRepoIssues(repo, org) {
    let issues = 0;
    let repo_full_name = org + "/" + repo;
    let requests = this.remaining_requests;
    let since = undefined;

    const latest_issue_date = await db.query(
      `SELECT MAX(updated_at) FROM issues WHERE repo='${repo}' AND organisation='${org}';`
    );
    if (latest_issue_date?.rows[0]?.max) {
      since = new Date(latest_issue_date?.rows[0]?.max).toISOString();
    }

    if (since) {
      INFO(`getRepoIssues [${org}/${repo}] updated since ${since}`);
    } else {
      INFO(`getRepoIssues [${org}/${repo}]`);
    }

    try {
      let have_items = false;
      let page = 1;

      do {
        let result = [];
        let params = {
          per_page: PER_PAGE,
          page: page,
          state: "all",
        };

        if (since) {
          params.since = since;
        }

        const respIssues = await this.getWithRateLimitCheck(
          this.api + "repos/" + repo_full_name + "/issues",
          params
        );

        if (respIssues?.data.length === PER_PAGE) {
          have_items = true;
          page++;
        } else {
          have_items = false;
        }

        respIssues?.data.forEach((issue) => {
          let is_pr = false;
          if (issue?.pull_request) {
            is_pr = true;
          }
          result.push({
            id: issue?.id,
            issue_number: issue?.number,
            title: issue?.title,
            html_url: issue?.html_url,
            is_pr: is_pr,
            issue_state: issue?.state,
            created_at: issue?.created_at,
            updated_at: issue?.updated_at,
            closed_at: issue?.closed_at,
            repo: repo,
            organisation: org,
            dev_name: issue?.user?.login,
          });
        });

        await db.saveIssues(result);

        issues += result.length;
      } while (have_items);
    } catch (e) {
      ERROR(`getRepoIssues: ${e}`);
    }

    requests = requests - this.remaining_requests;

    INFO(`getRepoIssues [${org}/${repo}] done (used requests: ${requests})`);

    return issues;
  }

  async getReposList() {
    let result = [];
    try {
      let repo_list = await db.query("SELECT * FROM repos_list;");
      if (repo_list?.rows) {
        result = repo_list?.rows;
      }
    } catch (e) {
      ERROR(`getReposList: ${e}`);
    }

    return result;
  }

  async getRepoStatus(repo, org) {
    let repo_full_name = org + "/" + repo;

    INFO(`getRepoStatus [${org}/${repo}]`);

    let result = {
      updated: true,
      pushed: true,
    };

    try {
      let repo_list = await db.query(
        `SELECT updated_at,pushed_at FROM repos WHERE repo='${repo}' AND organisation='${org}'`
      );
      if (repo_list?.rows) {
        const updated_at = repo_list?.rows[0]?.updated_at;
        const pushed_at = repo_list?.rows[0]?.pushed_at;

        if (updated_at && pushed_at) {
          const respGeneralInfo = await this.getWithRateLimitCheck(
            this.api + "repos/" + repo_full_name
          );

          let updated_timestamp_db = new Date(updated_at);
          let pushed_timestamp_db = new Date(pushed_at);
          let updated_timestamp_api = new Date(
            respGeneralInfo?.data?.updated_at
          );
          let pushed_timestamp_api = new Date(respGeneralInfo?.data?.pushed_at);

          if (
            updated_timestamp_db.getTime() === updated_timestamp_api.getTime()
          ) {
            result.updated = false;
          }

          if (
            pushed_timestamp_db.getTime() === pushed_timestamp_api.getTime()
          ) {
            result.pushed = false;
          }
        }
      }
    } catch (e) {
      ERROR(`getRepoStatus: ${e}`);
    }

    return result;
  }

  updateDependencies(repo_item, dep) {
    if (!repo_item || !repo_item.dependencies) {
        ERROR(`UpdateDependencies: invalid repo item ${repo_item}`);
        return undefined;
    }

    let dependencies = repo_item.dependencies;

    let have_dep = false;

    for ( const d of dependencies ) {
        if (d === dep ) {
            have_dep = true;
        }
    }

    if (!have_dep) {
        dependencies.push(dep);
    }

    let updated_repo_item = {
        repo: repo_item.repo,
        organisation: repo_item.organisation,
        repo_type: repo_item.repo_type,
        dependencies: dependencies,
    }

    return updated_repo_item;
}

  async searchProjects() {
    const pause = (timeout) =>
      new Promise((res) => setTimeout(res, timeout * 1000));
    let queries = [];
    let reposMap = new Map();

    for (const item of search) {
      if (item?.filename) {
        for (const file of item?.filename) {
          let search_item = {
            repo: item.repo,
            organisation: item.organisation,
            q: `${item.search_tag}+filename:${file}`,
          };
          queries.push(search_item);
        }
      }

      if (item?.languages) {
        for (const language of item?.languages) {
          let search_item = {
            repo: item.repo,
            organisation: item.organisation,
            q: `${item.search_tag}+language:${language}`,
          };
          queries.push(search_item);
        }
      }
    }

    INFO(`SearchProjects with ${queries.length} queries`);

    for (const q of queries) {
      let have_items = false;
      let page = 1;
      let consecutive_retries = 0;

      do {
        try {
          const respSearch = await this.GetWithSearchRateLimitCheck(
            this.api + "search/code?q=" + q.q,
            {
              per_page: PER_PAGE,
              page: page,
            },
            true
          );

          if (respSearch?.status != 200) {
            await pause(120);
            consecutive_retries++;

            if (consecutive_retries > 3) {
              break;
            } else {
              continue;
            }
          }

          consecutive_retries = 0;

          let total_count = respSearch?.data?.total_count;

          INFO(
            `SearchProjects ${q.q} -> total items: ${total_count} , current items: ${respSearch?.data?.items?.length}, page: ${page}`
          );

          if (total_count > PER_PAGE * page) {
            have_items = true;
            page++;
          } else {
            have_items = false;
          }

          if (respSearch?.data?.items?.length) {
            for (const item of respSearch?.data?.items) {
              if (item?.repository?.full_name && item?.repository?.name) {
                let full_name = item.repository.full_name;
                let repo = item.repository.name;
                let organisation = full_name.split("/")[0];
                let dep = `${q.organisation}/${q.repo}`;

                if (reposMap.has(full_name)) {
                  //update dependencies
                  let repo_item = reposMap.get(full_name);
                  reposMap.set(
                    full_name,
                    this.updateDependencies(repo_item, dep)
                  );
                } else {
                  let repo_item = {
                    repo: repo,
                    organisation: organisation,
                    repo_type: "dependent",
                    dependencies: [`${dep}`],
                  };

                  reposMap.set(full_name, repo_item);
                }
              }
            }
          }

          await pause(60);
        } catch (e) {
          ERROR(`SearchProjects: ${e}`);
        }
      } while (have_items);
    }

    let repos = [];
    for (const r of reposMap.values()) {
      let repo = {
        repo: r.repo,
        organisation: r.organisation,
        repo_type: r.repo_type,
        dependencies: JSON.stringify(r.dependencies),
      };

      repos.push(repo);
    }

    INFO(`SearchProjects found ${repos.length} repos`);
    await db.saveRepos(repos);
  }

  async getForks() {
    let whitelisted_repos = [];
    let requests = this.remaining_requests;
    
    let whitelisted_repos_result = await db.query(`SELECT * FROM repos_list WHERE repo_type = 'whitelisted';`);
    if (whitelisted_repos_result?.rows) {
        whitelisted_repos = whitelisted_repos_result?.rows;
    }

    INFO(`GetForks for ${whitelisted_repos.length} whitelisted repos`);

    for (let i = 0; i < whitelisted_repos.length; i++) {
        try {
            let repo = whitelisted_repos[i].repo;
            let org = whitelisted_repos[i].organisation;

            let repo_full_name = org + '/' + repo;

            let have_items = false;
            let page = 1;

            do {
                let repos = [];
                const respForks = await this.getWithRateLimitCheck(
                    this.api + 'repos/' + repo_full_name + '/forks',
                    {
                        per_page: PER_PAGE,
                        page: page,
                    });

                if (respForks?.data.length === PER_PAGE) {
                    have_items = true;
                    page++;
                } else {
                    have_items = false;
                }

                respForks?.data.forEach(fork => {
                    let fields = fork?.full_name.split('/');
                    let dep = [`${org}/${repo}`];
                    
                    repos.push({
                        repo: fields[1],
                        organisation: fields[0],
                        repo_type: 'fork',
                        dependencies: JSON.stringify(dep),
                        created_at: fork?.created_at,
                        default_branch: fork?.default_branch,
                    });
                });

                for (const r of repos) {
                    let branches = await this.getRepoBranches(r.repo, r.organisation, r.default_branch);

                    for (const branch in branches) {
                        await db.saveBranch({
                            repo: r.repo,
                            organisation: r.organisation,
                            branch: branch,
                            latest_commit_date: r.created_at
                        });
                    }
                };

                await db.saveRepos(repos);
            } while (have_items);

        } catch (e) {
            ERROR(`GetForks: ${e}`);
        }

    }

    requests = requests - this.remaining_requests;

    INFO(`GetForks for ${whitelisted_repos.length} whitelisted repos done (used requests: ${requests})`);
}

  async run() {
    STATUS("scraping");

    if (Date.now() - this.lastReposListUpdate > REPOS_LIST_UPDATE) {
      await this.getWhitelistedRepos();
      await this.getForks();
      await this.searchProjects();
      this.lastReposListUpdate = Date.now();
    }

    const repos = await this.getReposList();

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i].repo;
      const org = repos[i].organisation;
      const repo_type = repos[i].repo_type;
      const dependencies = repos[i].dependencies;

      STATUS(`scraping [${org}/${repo}] ${i + 1} of ${repos.length} repos`);

      let status = await this.getRepoStatus(repo, org);

      if (status.pushed) {
        await this.getRepoCommits(repo, org);
      }

      if (status.updated || status.pushed) {
        await this.getRepoContributors(repo, org);
        await this.getRepoIssues(repo, org);
        await this.getRepoInfo(repo, org, dependencies, repo_type);
      }

      if (!status.pushed && !status.updated) {
        INFO(`skip Scraping [${org}/${repo}] no updates`);
      } else {
        INFO(`Refresh views`);
        await db.refreshView("overview_view");
        await db.refreshView("top_contributors_view");
        await db.refreshView("commits_view");
        await db.refreshView("active_contributors_view");
        await db.refreshView("recent_commits_view");
        await db.refreshView("repositories_view");
        await db.refreshView("activity_view");
        INFO(`refresh views done`);
      }
    }

    STATUS("scraping completed");
  }
}

module.exports = {
  Scraper,
};
