const GITLAB_URL = (process.env.GITLAB_URL || 'https://gitlab.com').replace(/\/+$/, '');
const GITLAB_PROJECT = process.env.GITLAB_PROJECT || '';

async function authenticateWithLDAP(username, password) {
  const tokenUrl = `${GITLAB_URL}/oauth/token`;
  const params = new URLSearchParams();
  params.set('grant_type', 'password');
  params.set('username', username);
  params.set('password', password);
  if (process.env.GITLAB_CLIENT_ID) {
    params.set('client_id', process.env.GITLAB_CLIENT_ID);
  }
  if (process.env.GITLAB_CLIENT_SECRET) {
    params.set('client_secret', process.env.GITLAB_CLIENT_SECRET);
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error('LDAP authentication failed: invalid credentials');
    }
    throw new Error(`GitLab authentication failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function gitlabApi(token, method, path, body) {
  const url = `${GITLAB_URL}/api/v4${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.message || data?.error || text;
    throw new Error(`GitLab API ${method} ${path} failed (${res.status}): ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`);
  }
  return data;
}

export async function gitlabCommitFiles({ username, password, project, branch, files, commitMessage }) {
  const token = await authenticateWithLDAP(username, password);
  const projectPath = project || GITLAB_PROJECT;
  if (!projectPath) throw new Error('GitLab project path not configured');

  const encodedProject = encodeURIComponent(projectPath);

  let targetBranch;
  try {
    const projectInfo = await gitlabApi(token, 'GET', `/projects/${encodedProject}`);
    targetBranch = branch || projectInfo.default_branch || 'main';
  } catch {
    targetBranch = branch || 'main';
  }

  if (branch) {
    try {
      await gitlabApi(token, 'GET', `/projects/${encodedProject}/repository/branches/${encodeURIComponent(branch)}`);
    } catch {
      const projectInfo = await gitlabApi(token, 'GET', `/projects/${encodedProject}`);
      await gitlabApi(token, 'POST', `/projects/${encodedProject}/repository/branches`, {
        branch,
        ref: projectInfo.default_branch || 'main',
      });
    }
    targetBranch = branch;
  }
  const defaultBranch = targetBranch;

  const actions = [];
  for (const f of files) {
    let action = 'create';
    try {
      await gitlabApi(token, 'GET', `/projects/${encodedProject}/repository/files/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(defaultBranch)}`);
      action = 'update';
    } catch {}

    actions.push({
      action,
      file_path: f.path,
      content: f.content,
    });
  }

  const result = await gitlabApi(token, 'POST', `/projects/${encodedProject}/repository/commits`, {
    branch: defaultBranch,
    commit_message: commitMessage || 'DataFlow pipeline deployment',
    actions,
  });

  return {
    sha: result.id,
    short_sha: result.short_id,
    branch: defaultBranch,
    url: `${GITLAB_URL}/${projectPath}/-/commit/${result.id}`,
    files: files.map(f => f.path),
    author: result.author_name,
    message: result.message,
  };
}

export async function gitlabCheckStatus({ username, password }) {
  const token = await authenticateWithLDAP(username, password);
  const user = await gitlabApi(token, 'GET', '/user');
  const projectPath = GITLAB_PROJECT;
  let projectInfo = null;

  if (projectPath) {
    try {
      projectInfo = await gitlabApi(token, 'GET', `/projects/${encodeURIComponent(projectPath)}`);
    } catch {}
  }

  return {
    connected: true,
    login: user.username,
    name: user.name,
    email: user.email,
    gitlabUrl: GITLAB_URL,
    project: projectPath,
    projectFound: !!projectInfo,
    projectName: projectInfo?.name_with_namespace || null,
    defaultBranch: projectInfo?.default_branch || null,
  };
}

export function getGitLabConfig() {
  return {
    url: GITLAB_URL,
    project: GITLAB_PROJECT,
    configured: !!GITLAB_PROJECT,
  };
}
