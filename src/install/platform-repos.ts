import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FE_SKILLS } from './harness.js'
import type { AdapterId } from '../config/project-root.js'

const NON_PORTABLE = /(\.\.\/|~\/|\/home\/|[A-Za-z]:\\|\\\\)/

export function mergePlatformRepos(opts: {
  projectRoot: string
  adapter: AdapterId
}): { path: string; mergedSkills: string[]; warnings: string[] } {
  const root = path.resolve(opts.projectRoot)
  const file = path.join(root, 'platform-repos.json')
  const warnings: string[] = []
  let data: any = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {
        defaultGroup: 'fe',
        harness: { profiles: { fe: { groups: ['fe'], skills: [] } } },
        groups: { fe: { description: 'FE current repository', primary: path.basename(root), projects: [path.basename(root)] } },
        projects: {
          [path.basename(root)]: {
            root: '.',
            role: 'fe',
            adapter: opts.adapter,
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
  data.harness.profiles.fe ??= { groups: ['fe'], skills: [] }
  const skills: string[] = data.harness.profiles.fe.skills ?? []
  const merged: string[] = []
  for (const id of FE_SKILLS) {
    if (!skills.includes(id)) {
      skills.push(id)
      merged.push(id)
    }
  }
  data.harness.profiles.fe.skills = skills
  data.harness.profiles.fe.adapter = opts.adapter
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return { path: file, mergedSkills: merged, warnings }
}
