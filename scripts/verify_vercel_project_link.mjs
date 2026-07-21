import { readFile } from 'node:fs/promises';
import process from 'node:process';

const options = parseArgs(process.argv.slice(2));
const file = required(options, 'file');
const expectedOrgId = required(options, 'expected-org-id');
const expectedProjectId = required(options, 'expected-project-id');
const expectedProjectName = options['expected-project-name'] ?? 'repo';

let linked;
try {
  linked = JSON.parse(await readFile(file, 'utf8'));
} catch {
  fail('Unable to read the linked Vercel project metadata.');
}

const matches = linked
  && linked.orgId === expectedOrgId
  && linked.projectId === expectedProjectId
  && linked.projectName === expectedProjectName;

if (!matches) {
  fail(`Linked Vercel project does not match the permanent Vercel project ${expectedProjectName}.`);
}

console.log(`Verified permanent project ${expectedProjectName}.`);

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) fail(`Unknown argument: ${token}`);
    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}.`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function required(optionsObject, name) {
  const value = optionsObject[name];
  if (!value) fail(`Missing required argument --${name}.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
