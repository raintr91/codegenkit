import { parse } from 'yaml'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Function dir for yaml layout: .../list/ when spec is .../list/ir/spec.yaml
 * @param {string} specPath absolute or relative
 */
export function resolveFeatureDir(specPath) {
  const absolute = path.resolve(specPath)
  const dir = path.dirname(absolute)
  if (path.basename(dir) === 'ir') return path.dirname(dir)
  return dir
}

/**
 * @param {string} specPath absolute or relative to cwd
 */
export async function readSpecFile(specPath) {
  const absolute = path.resolve(specPath)
  const raw = await readFile(absolute, 'utf8')
  const spec = parse(raw) ?? {}

  if (!spec.codegen?.profile) {
    throw new Error(
      `Missing codegen.profile in ${specPath}. Spec chưa portal-gen-ready — chạy /dev-grill-docs trước /prototype. ` +
        'Xem .cursor/extracts/codegen/readiness.md và docs-hub templates/feature.bundle.yaml'
    )
  }

  const featureDir = resolveFeatureDir(absolute)
  return {
    spec,
    specFile: path.relative(process.cwd(), absolute),
    featureDir
  }
}
