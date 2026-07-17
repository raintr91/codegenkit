import { readFile } from 'node:fs/promises'
import path from 'node:path'

const MANIFEST_NAME = 'codegen.manifest.json'

/** @param {string} featureDir */
export async function readCodegenManifest(featureDir) {
  const manifestPath = path.join(featureDir, 'generated', MANIFEST_NAME)
  let raw

  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch {
    throw new Error(
      `Missing ${path.join(featureDir, 'generated', MANIFEST_NAME)} — run pnpm api:gen --spec ... first`
    )
  }

  const manifest = JSON.parse(raw)
  if (!manifest.module || !manifest.entity) {
    throw new Error(`Invalid codegen manifest at ${manifestPath}`)
  }

  return { manifest, manifestPath }
}
