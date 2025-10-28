// Create branch ai-agent-integration, add starter ai-agent files, and open a PR.
// Expects env vars: APP_ID, APP_PRIVATE_KEY (workflow decodes to app-key.pem),
// optional APP_INSTALLATION_ID, TARGET_OWNER, TARGET_REPO, TARGET_BASE

const fs = require('fs');
const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');

async function main() {
  const appId = process.env.APP_ID;
  const installId = process.env.APP_INSTALLATION_ID ? Number(process.env.APP_INSTALLATION_ID) : null;
  const privateKey = fs.readFileSync('app-key.pem', 'utf8');

  if (!appId || !privateKey) {
    console.error('Missing APP_ID or app-key.pem');
    process.exit(1);
  }

  const targetOwner = process.env.TARGET_OWNER || 'Lastofhonor85';
  const targetRepo = process.env.TARGET_REPO || 'defy-elite-athletics';
  const targetBase = process.env.TARGET_BASE || 'main';
  const newBranch = `ai-agent-integration`;

  // Auth as app and get installation token
  const auth = createAppAuth({ appId: Number(appId), privateKey });
  let installationAuth;
  if (installId) {
    installationAuth = await auth({ type: 'installation', installationId: installId });
  } else {
    // find installation for the owner
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
      console.log('Branch already exists, continuing to update files on it:', newBranch);
    } else {
      console.error('Error creating branch:', err);
      process.exit(1);
    }
  }

  // Files to create/update: path => content
  const files = {
    'ai-agent/README.md': `# AI Agent Integrator - Starter

This folder contains a starter AI agent that accepts a task via POST /task, calls ChatGPT to get a unified diff, applies the patch, runs simple checks, and opens a PR. Configure secrets and follow instructions in the README to run.`,
    'ai-agent/server.js': `const express = require("express");
const bodyParser = require("body-parser");
const AiAgent = require("./ai-agent");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const cfg = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  githubToken: process.env.GITHUB_TOKEN || "",
  githubAppName: process.env.GITHUB_APP_NAME || "AI Agent Integrator",
  repoOwner: process.env.REPO_OWNER || "Lastofhonor85",
  repoName: process.env.REPO_NAME || "defy-elite-athletics",
  baseBranch: process.env.REPO_DEFAULT_BRANCH || "main",
  workdir: process.env.WORKDIR || "/tmp/ai-agent-work",
};

const agent = new AiAgent(cfg);

app.post("/task", async (req, res) => {
  try {
    const { title, description, testCommand } = req.body;
    if (!title || !description) return res.status(400).json({ error: "title and description required" });

    const result = await agent.handleTask({ title, description, testCommand });
    res.json(result);
  } catch (err) {
    console.error("server error:", err);
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(\`AI Agent server listening on port \${port}\`);
});`,
    'ai-agent/ai-agent.js': `const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Octokit } = require("@octokit/rest");
const fetch = require("node-fetch");

class AiAgent {
  constructor(cfg) {
    this.cfg = cfg;
    this.octokit = new Octokit({ auth: cfg.githubToken });
    this.appName = cfg.githubAppName || "AI Agent Integrator";
  }

  async handleTask({ title, description, testCommand }) {
    const id = \`task-\${Date.now()}\`;
    const workdir = path.join(this.cfg.workdir, id);
    fs.mkdirSync(workdir, { recursive: true });

    const repoUrl = \`https://x-access-token:\${this.cfg.githubToken}@github.com/\${this.cfg.repoOwner}/\${this.cfg.repoName}.git\`;
    try {
      execSync(\`git clone --depth 1 --branch \${this.cfg.baseBranch} \${repoUrl} \${workdir}\`, { stdio: "inherit" });
    } catch (err) {
      return { status: "failed", reason: "git_clone_failed", error: String(err) };
    }

    const prompt = [
      "You are a senior web developer. Produce a git unified diff that implements the task below.",
      \`Repository: \${this.cfg.repoOwner}/\${this.cfg.repoName}\`,
      \`Base branch: \${this.cfg.baseBranch}\`,
      \`Task: \${description}\`,
      "Constraints: produce only a valid unified diff suitable for 'git apply'. Keep changes minimal and only modify files necessary. If you cannot produce a safe patch, explain why.",
    ].join("\\n\\n");

    let patch;
    try {
      patch = await this.callOpenAiForPatch(prompt);
    } catch (err) {
      return { status: "failed", reason: "llm_error", error: String(err) };
    }

    if (!patch || !patch.includes("--- a/")) {
      return { status: "failed", reason: "no_patch_returned", output: patch };
    }

    try {
      fs.writeFileSync(path.join(workdir, "patch.diff"), patch, "utf8");
      execSync(\`git apply patch.diff\`, { cwd: workdir, stdio: "inherit" });
    } catch (err) {
      return { status: "failed", reason: "apply_patch_failed", error: String(err), patch };
    }

    let checkLogs = "";
    if (testCommand) {
      try {
        execSync(testCommand, { cwd: workdir, stdio: "inherit", env: process.env });
      } catch (err) {
        return { status: "tests_failed", reason: "test_command_failed", error: String(err), patch };
      }
    } else {
      try {
        execSync(\`npx html-validate "**/*.html" --quiet\`, { cwd: workdir, stdio: "inherit" });
      } catch (err) {
        checkLogs += \`html-validate reported issues: \${String(err)}\\n\`;
      }
    }

    const branch = \`ai/\${id}\`;
    try {
      execSync(\`git checkout -b \${branch}\`, { cwd: workdir });
      execSync(\`git add -A\`, { cwd: workdir });
      execSync(\`git commit -m "\${this.appName}: \${title}"\`, { cwd: workdir });
      execSync(\`git push origin \${branch}\`, { cwd: workdir });
    } catch (err) {
      return { status: "failed", reason: "git_push_failed", error: String(err) };
    }

    try {
      const prBodyParts = [
        \`Automated PR generated by \${this.appName} for task:\\n\\n\${description}\`,
        "",
        "LLM prompt and response are attached below for audit.",
        "",
        "----",
        "",
        "Patch (first 2000 characters):",
        "```",
        patch.slice(0, 2000),
        "```",
        "",
        checkLogs ? \`Check logs:\\n\\\`\\\`\\\`\\n\${checkLogs}\\n\\\`\\\`\\\`\\n\` : ""
      ];
      const pr = await this.octokit.pulls.create({
        owner: this.cfg.repoOwner,
        repo: this.cfg.repoName,
        title: \`\${this.appName}: \${title}\`,
        head: branch,
        base: this.cfg.baseBranch,
        body: prBodyParts.join("\\n")
      });
      return { status: "pr_created", prUrl: pr.data.html_url, patch };
    } catch (err) {
      return { status: "failed", reason: "pr_create_failed", error: String(err) };
    }
  }

  async callOpenAiForPatch(prompt) {
    const url = "https://api.openai.com/v1/chat/completions";
    const body = {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      max_tokens: 2500
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(\`OpenAI error: \${resp.status} \${t}\`);
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    return content;
  }
}

module.exports = AiAgent;`,
    '.github/workflows/ai-agent-check.yml': `name: AI Agent - PR checks

on:
  pull_request:
    branches:
      - main
    paths:
      - '**/*'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install html-validate (global)
        run: npm install -g html-validate

      - name: Validate HTML
        run: |
          html-validate "**/*.html" || true

      - name: Run repo Node script if present
        run: |
          if [ -f ./scripts/fetch-rss-to-json.js ]; then
            node ./scripts/fetch-rss-to-json.js || true
          else
            echo "No repo script to run"
          fi`
  };
