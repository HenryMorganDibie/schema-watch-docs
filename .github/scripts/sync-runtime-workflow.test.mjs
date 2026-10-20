/** Structural release-safety tests for the generated starter synchronization. */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

const workflow = parse(
  readFileSync('.github/workflows/sync-runtime.yml', 'utf8'),
)

test('rejects customer copies before requesting the release environment or tokens', () => {
  assert.equal(workflow.jobs.sync.if, "github.repository == 'thallylabs/starter'")
})

test('uses a narrowed destination App token for repository writes', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(workflow.jobs.sync.environment, 'release-control')
  assert.doesNotMatch(JSON.stringify(workflow), /THALLY_AGENT_TOKEN/)
  assert.doesNotMatch(JSON.stringify(workflow), /STARTER_SYNC_PR_TOKEN/)
  const tokenStep = workflow.jobs.sync.steps.find(
    (step) => step.name === 'Mint the destination PR token',
  )
  assert.match(tokenStep.uses, /actions\/create-github-app-token@[0-9a-f]{40}/)
  assert.equal(tokenStep.with['permission-actions'], 'read')
  assert.equal(tokenStep.with['permission-contents'], 'write')
  assert.equal(tokenStep.with['permission-pull-requests'], 'write')
})

test('auto-merges only after CI verifies the exact pull-request head', () => {
  const mergeStep = workflow.jobs.sync.steps.find(
    (step) => step.name === 'Merge after CI succeeds',
  )
  assert.equal(
    mergeStep.if,
    "inputs.auto_merge && github.actor == vars.RELEASE_COORDINATOR_ACTOR && steps.pull-request.outputs.changed == 'true'",
  )
  assert.match(mergeStep.run, /--workflow ci\.yml/)
  assert.match(mergeStep.run, /gh run watch "\$run_id" --exit-status/)
  assert.match(mergeStep.run, /base_sha.*EXPECTED_BASE_SHA/)
  assert.match(mergeStep.run, /current_base.*commits\/main/)
  assert.match(mergeStep.run, /current_base.*EXPECTED_BASE_SHA/)
  assert.match(mergeStep.run, /final_base.*EXPECTED_BASE_SHA/)
  assert.match(mergeStep.run, /--match-head-commit "\$head_sha"/)
})

test('keeps manual dispatch safe and opt-in', () => {
  assert.equal(workflow.on.workflow_dispatch.inputs.auto_merge.default, false)
  assert.equal(workflow.on.workflow_dispatch.inputs.auto_merge.required, false)
  assert.match(workflow['run-name'], /inputs\.request_id/)
})
