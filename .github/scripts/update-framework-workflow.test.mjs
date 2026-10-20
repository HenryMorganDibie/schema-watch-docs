/** Customer workflow must fail closed before unsupported or unsafe updates. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/update-framework.yml', 'utf8'))
const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
const job = workflow.jobs.update

test('customer dispatch excludes the canonical template and non-default branches', () => {
  assert.match(job.if, /github\.repository != 'thallylabs\/starter'/)
  assert.match(job.if, /github\.event\.repository\.default_branch/)
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(job.permissions, { contents: 'write', 'pull-requests': 'write', actions: 'write' })
  assert.equal(job.environment, undefined)
  assert.doesNotMatch(JSON.stringify(workflow), /RELEASE_COORDINATOR|runtime_ref|starter-runtime-contract/)
})

test('rejects an old published CLI before applying or creating a pull request', () => {
  const apply = job.steps.find(step => step.id === 'update').run
  const capability = apply.indexOf("grep -q -- '--require-complete'")
  const mutation = apply.indexOf('starter update --apply --require-complete')
  assert.ok(capability >= 0 && capability < mutation)
  assert.match(apply.slice(capability, mutation), /exit 1/)
  const pr = job.steps.find(step => step.id === 'pull-request')
  assert.equal(pr.if, "steps.update.outputs.changed == 'true'")
  assert.match(pr.run, /git ls-remote --exit-code --heads/)
  assert.doesNotMatch(pr.run, /--force|gh pr merge|push origin.*BASE_BRANCH/)
})

test('token-suppressed pull requests dispatch the same secret-free validation', () => {
  assert.equal(ci.on.workflow_dispatch.inputs.base_sha.required, true)
  assert.deepEqual(ci.permissions, { contents: 'read' })
  assert.match(ci.jobs.verify.if, /startsWith\(github\.ref, 'refs\/heads\/automation\/thally-framework-'/)
  assert.match(ci.jobs.verify.if, /github\.ref != format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/)
  const validate = job.steps.find(step => step.name === 'Run update pull request validation')
  assert.equal(validate.if, "steps.pull-request.outputs.needs_dispatch == 'true'")
  assert.match(validate.run, /gh workflow run ci\.yml --ref "\$UPDATE_BRANCH"/)
  const plan = ci.jobs.verify.steps.find(step => step.id === 'plan')
  assert.match(plan.env.BASE_SHA, /inputs\.base_sha/)
})


test('weekly checks reuse the customer guards and published complete-update requirement', () => {
  assert.deepEqual(workflow.on.schedule, [{ cron: '43 3 * * 2' }])
  assert.match(job.if, /github\.repository != 'thallylabs\/starter'/)
  assert.match(job.if, /github\.event\.repository\.default_branch/)
  const canonical = parse(readFileSync('.github/workflows/sync-runtime.yml', 'utf8'))
  assert.equal(canonical.on.schedule, undefined)
  assert.equal(canonical.jobs.sync.if, "github.repository == 'thallylabs/starter'")
  assert.match(job.steps.find(step => step.id === 'update').run, /grep -q -- '--require-complete'/)
  assert.doesNotMatch(JSON.stringify(workflow), /gh pr merge/)
})

test('existing open update PRs are retained without overwriting or dispatching CI again', () => {
  const run = job.steps.find(step => step.id === 'pull-request').run
  const existingBranch = run.slice(run.indexOf('if git ls-remote'), run.indexOf('current_base='))
  assert.match(existingBranch, /gh pr view "\$branch" --json url,state,baseRefName,headRefName/)
  assert.match(existingBranch, /\.state == "OPEN" and \.baseRefName == \$base and \.headRefName == \$head/)
  assert.match(existingBranch, /needs_dispatch=false/)
  assert.match(existingBranch, /exit 0/)
  assert.match(existingBranch, /without a matching open pull request/)
  assert.match(existingBranch, /exit 1/)
  assert.doesNotMatch(existingBranch, /git push|git commit|gh workflow run/)
})
