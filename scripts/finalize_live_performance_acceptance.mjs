import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repository = required('GITHUB_REPOSITORY');
const workflowId = required('GITHUB_WORKFLOW_ID');
const headSha = required('LIVE_WINDOWS_PERF_EXPECTED_SHA');
const currentRunId = Number(required('GITHUB_RUN_ID'));
const outputPath = required('LIVE_WINDOWS_PERF_OUTPUT');
const token = required('GITHUB_TOKEN');
const acceptancePath = path.join(path.dirname(outputPath), 'acceptance-result.json');
const acceptance = JSON.parse(readFileSync(acceptancePath, 'utf8'));

const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`;
const response = await fetch(url, {
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'real-wargame-performance-contract',
  },
});
if (!response.ok) throw new Error(`Unable to list exact-head workflow runs: ${response.status} ${await response.text()}`);
const payload = await response.json();
const priorSuccessfulIds = (Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [])
  .filter((run) => run && run.head_sha === headSha && run.id !== currentRunId && run.conclusion === 'success')
  .map((run) => Number(run.id))
  .filter(Number.isFinite)
  .sort((left, right) => left - right);
const workflowRunIds = [...new Set([...priorSuccessfulIds, currentRunId])].slice(-2);
acceptance.workflowRunIds = workflowRunIds;
writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, 'utf8');
console.log(`Exact-head acceptance references workflow runs: ${workflowRunIds.join(', ')}`);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
