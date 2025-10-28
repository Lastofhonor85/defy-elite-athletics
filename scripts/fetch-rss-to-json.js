// Create branch ai-agent-integration, add starter ai-agent files, and open a PR.
// Expects env vars: APP_ID, APP_PRIVATE_KEY (workflow decodes to app-key.pem),
// optional APP_INSTALLATION_ID, TARGET_OWNER, TARGET_REPO, TARGET_BASE

const fs = require('fs');
const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');

async function main() {
  try {
    const appId = process.env.APP_ID;
    const installId = process.env.APP_INSTALLATION_ID ? Number(process.env.APP_INSTALLATION_ID) : null;

    if (!appId) {
      console.error('Missing APP_ID environment variable');
      process.exit(1);
    }

    // Ensure the decoded PEM file exists
    if (!fs.existsSync('app-key.pem')) {
      console.error('Missing app-key.pem (workflow should have decoded APP_PRIVATE_KEY to this file)');
      process.exit(1);
    }
    const privateKey = fs.readFileSync('app-key.pem', 'utf8');

    const targetOwner = process.env.TARGET_OWNER || 'Lastofhonor85';
    const targetRepo = process.env.TARGET_REPO || 'defy-elite-athletics';
    const targetBase = process.env.TARGET_BASE || 'main';
    const newBranch = 'ai-agent-integration';

    // Authenticate as GitHub App and get installation token
    const auth = createAppAuth({ appId: Number(appId), privateKey });
    let installationAuth;
    if (installId) {
      installationAuth = await auth({ type: 'installation', installationId: installId });
    } else {
      const appAuth = await auth({ type: 'app' });
      const octoApp = new Octokit({ auth: appAuth.token });
      const installs = await octoApp.request('GET /app/installations');
      const inst = installs.data.find(i => i.account && (i.account.login.toLowerCase() === targetOwner.toLowerCase()));
      if (!inst) {
        console.error('No matching installation found for owner:', targetOwner);
        process.exit(1);
      }
      installationAuth = await auth({ type: 'installation', installationId: inst.id });
    }

    const octokit = new Octokit({ auth: installationAuth.token });

    // Get base branch commit SHA
    const baseBranch = await octokit.repos.getBranch({ owner: targetOwner, repo: targetRepo, branch: targetBase });
    const baseSha = baseBranch.data.commit.sha;

    // Create or update branch ref
    const ref = `refs/heads/${newBranch}`;
    try {
      await octokit.git.createRef({ owner: targetOwner, repo: targetRepo, ref, sha: baseSha });
      console.log('Created branch', newBranch);
    } catch (err) {
      if (err.status === 422) {
        console.log('Branch already exists:', newBranch);
      } else {
        console.error('Error creating branch:', err);
        process.exit(1);
      }
    }

    // Files to create/update
    const files = {
      'ai-agent/README.md': `# AI Agent Integrator - Starter

This folder contains a starter AI agent that accepts a task via POST /task, calls ChatGPT to get a unified diff, applies the patch, runs simple checks, and opens a PR.`,
      'ai-agent/server.js': `// minimal server stub (expand as needed)\nconst express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('AI Agent placeholder'));\napp.listen(8080, () => console.log('listening'));\n`,
    };

    // Create/update each file on the branch
    for (const [filePath, content] of Object.entries(files)) {
      const encoded = Buffer.from(content, 'utf8').toString('base64');
      try {
        const existing = await octokit.repos.getContent({ owner: targetOwner, repo: targetRepo, path: filePath, ref: newBranch });
        await octokit.repos.createOrUpdateFileContents({
          owner: targetOwner,
          repo: targetRepo,
          path: filePath,
          message: `App: update ${filePath}`,
          content: encoded,
          branch: newBranch,
          sha: existing.data.sha
        });
        console.log('Updated', filePath);
      } catch (err) {
        if (err.status === 404) {
          await octokit.repos.createOrUpdateFileContents({
            owner: targetOwner,
            repo: targetRepo,
            path: filePath,
            message: `App: add ${filePath}`,
            content: encoded,
            branch: newBranch
          });
          console.log('Created', filePath);
        } else {
          console.error('Error creating/updating', filePath, err);
          process.exit(1);
        }
      }
    }

    // Create PR if not exists
    try {
      const prTitle = 'AI Agent Integrator: Add starter and PR checks';
      const existingPRs = await octokit.pulls.list({
        owner: targetOwner,
        repo: targetRepo,
        head: `${targetOwner}:${newBranch}`,
        state: 'open'
      });
      if (existingPRs.data.length === 0) {
        const pr = await octokit.pulls.create({
          owner: targetOwner,
          repo: targetRepo,
          title: prTitle,
          head: newBranch,
          base: targetBase,
          body: 'Adds AI Agent Integrator starter files and PR check workflow.'
        });
        console.log('PR created:', pr.data.html_url);
      } else {
        console.log('PR already exists:', existingPRs.data[0].html_url);
      }
    } catch (err) {
      console.error('Failed to create PR:', err);
      process.exit(1);
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    process.exit(1);
  }
}

main();
