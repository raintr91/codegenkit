import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { BE_SKILLS, FE_SKILLS } from './harness.js'
import type {
  BeAdapterId,
  CodegenType,
  FeAdapterId,
} from '../config/project-root.js'

const NON_PORTABLE = /(\.\.\/|~\/|\/home\/|[A-Za-z]:\\|\\\\)/

export function mergePlatformRepos(opts: {
  projectRoot: string
  type: CodegenType
  feAdapter?: FeAdapterId
  beAdapter?: BeAdapterId
}): { path: string; mergedSkills: string[]; warnings: string[] } {
  const root = path.resolve(opts.projectRoot)
  const file = path.join(root, 'platform-repos.json')
  const warnings: string[] = []
  let data: any = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {
        defaultGroup: opts.type === 'fullstack' ? 'fe' : opts.type,
        harness: { profiles: {} },
        groups: {},
        projects: {
          [path.basename(root)]: {
            root: '.',
            role: opts.type,
            repo: path.basename(root),
            write: true,
          },
        },
      }
  if (NON_PORTABLE.test(JSON.stringify(data))) {
    warnings.push('platform-repos.json contains non-portable path patterns')
  }
  data.harness ??= {}
  data.harness.profiles ??= {}
  const merged: string[] = []
  const profiles: Array<'fe' | 'be'> =
    opts.type === 'fullstack' ? ['fe', 'be'] : [opts.type]
  for (const profile of profiles) {
    data.groups ??= {}
    data.groups[profile] ??= {
      description: `${profile.toUpperCase()} current repository`,
      primary: path.basename(root),
      projects: [path.basename(root)],
    }
    data.harness.profiles[profile] ??= { groups: [profile], skills: [] }
    const skills: string[] = data.harness.profiles[profile].skills ?? []
    const owned = profile === 'fe' ? FE_SKILLS : BE_SKILLS
    for (const id of owned) {
      if (!skills.includes(id)) {
        skills.push(id)
        merged.push(id)
      }
    }
    data.harness.profiles[profile].skills = skills
    data.harness.profiles[profile].adapter =
      profile === 'fe' ? opts.feAdapter : opts.beAdapter
  }
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return { path: file, mergedSkills: merged, warnings }
}
