/**
 * Verify the managed-content artifact emitted by the public Thally runtime.
 *
 * The starter owns this integration check, not the generator. It protects the
 * scaffold contract without duplicating packaging logic: managed builds must
 * contain a manifest plus byte-identical assets for every listed source file.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const assetRoot = path.join(projectRoot, '.open-next', 'assets', '_thally', 'content')
const manifestPath = path.join(assetRoot, 'manifest.json')

function isSafeProjectPath(projectPath) {
  return (
    typeof projectPath === 'string' &&
    projectPath.length > 0 &&
    !path.isAbsolute(projectPath) &&
    projectPath.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

const rawManifest = await readFile(manifestPath, 'utf8').catch((error) => {
  throw new Error(
    `Managed content manifest is missing at ${manifestPath}. ` +
      'Build with THALLY_CONTENT_SOURCE=assets.',
    { cause: error },
  )
})

let manifest
try {
  manifest = JSON.parse(rawManifest)
} catch (error) {
  throw new Error('Managed content manifest is not valid JSON.', { cause: error })
}

if (manifest?.version !== 1 || !manifest.files || typeof manifest.files !== 'object') {
  throw new Error('Managed content manifest does not satisfy the version 1 contract.')
}

const entries = Object.keys(manifest.files)
if (entries.length === 0) {
  throw new Error('Managed content manifest is empty.')
}

for (const projectPath of entries) {
  if (!isSafeProjectPath(projectPath)) {
    throw new Error(`Managed content manifest contains an unsafe path: ${projectPath}`)
  }

  const sourcePath = path.join(projectRoot, ...projectPath.split('/'))
  const assetPath = path.join(assetRoot, ...projectPath.split('/'))
  const [sourceInfo, assetInfo] = await Promise.all([stat(sourcePath), stat(assetPath)])
  if (!sourceInfo.isFile() || !assetInfo.isFile()) {
    throw new Error(`Managed content entry is not backed by files: ${projectPath}`)
  }

  const [sourceBytes, assetBytes] = await Promise.all([readFile(sourcePath), readFile(assetPath)])
  if (!sourceBytes.equals(assetBytes)) {
    throw new Error(`Managed content asset differs from its authored source: ${projectPath}`)
  }
}

for (const requiredPath of ['AGENTS.md', 'docs.json']) {
  if (!Object.hasOwn(manifest.files, requiredPath)) {
    throw new Error(`Managed content manifest is missing required input: ${requiredPath}`)
  }
}

if (!entries.some((entry) => entry.startsWith('src/content/') && /\.mdx?$/.test(entry))) {
  throw new Error('Managed content manifest does not contain any documentation pages.')
}

console.log(`Managed content assets: verified ${entries.length} manifest-backed file(s).`)
