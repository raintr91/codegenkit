import { spawnSync } from 'node:child_process'
import {
  resolveBeAdapter,
  resolveFeAdapter,
  resolveType,
  type BeAdapterId,
  type CodegenType,
  type FeAdapterId,
} from '../config/project-root.js'
import {
  AGENT_IDS,
  AGENT_LABEL,
  detectAgents,
  parseAgentTargets,
  type AgentId,
} from './agents.js'
import {
  checkboxPrompt,
  promptLine,
  selectPrompt,
  type CheckboxChoice,
} from './prompt.js'

const FE_ADAPTERS: FeAdapterId[] = ['nuxt4', 'nextjs', 'dotnet-line']
const BE_ADAPTERS: BeAdapterId[] = ['fastapi', 'laravel', 'dotnet-integration']

const FE_ADAPTER_NAMES: Record<FeAdapterId, string> = {
  nuxt4: 'Nuxt 4',
  nextjs: 'Next.js',
  'dotnet-line': '.NET Line (WinForms)',
}

const BE_ADAPTER_NAMES: Record<BeAdapterId, string> = {
  fastapi: 'FastAPI',
  laravel: 'Laravel',
  'dotnet-integration': '.NET Integration',
}

export interface InitWizardPrompts {
  checkbox<T extends string>(opts: {
    message: string
    choices: CheckboxChoice<T>[]
  }): Promise<T[]>
  select<T extends string>(opts: {
    message: string
    choices: Array<{ value: T; name: string }>
    defaultIndex?: number
  }): Promise<T>
  line(question: string): Promise<string>
}

export interface InitWizardSelection {
  targets: AgentId[]
  target: string
  type: CodegenType
  feAdapter?: FeAdapterId
  beAdapter?: BeAdapterId
  docsRoot?: string
  /** Optional toolkits chosen now (empty = init "trống" for optionals). */
  withOptional: string[]
  /** Whether to delegate CodeGraph wire to Platform DNA during this init. */
  wireCodegraph: boolean
}

function artifactgraphAvailable(): boolean {
  const command = process.env.ARTIFACTGRAPH_COMMAND?.trim() || 'artifactgraph'
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') return false
  return probe.status === 0 || probe.status === 1
}

export async function resolveInitWizard(opts: {
  root: string
  requestedTarget?: string
  requestedType?: string
  requestedAdapter?: string
  requestedFeAdapter?: string
  requestedBeAdapter?: string
  requestedDocsRoot?: string
  /** Optional toolkits from `--with`; undefined means "not passed" (prompt). */
  requestedWith?: string[]
  /** Explicit `--codegraph` / `--no-codegraph`; undefined defers to the wizard. */
  wireCodegraphFlag?: boolean
  interactive: boolean
  detectedAgents?: AgentId[]
  prompts?: InitWizardPrompts
}): Promise<InitWizardSelection> {
  const prompts = opts.prompts ?? {
    checkbox: checkboxPrompt,
    select: selectPrompt,
    line: promptLine,
  }
  const detected = opts.detectedAgents ?? detectAgents(opts.root)

  const targets =
    opts.interactive && !opts.requestedTarget
      ? await prompts.checkbox({
          message: 'Which agents should receive Codegenkit MCP? (none = skip agents, add later)',
          choices: AGENT_IDS.map((id) => ({
            value: id,
            name: detected.includes(id) ? `${AGENT_LABEL[id]} (detected)` : AGENT_LABEL[id],
            checked: detected.length ? detected.includes(id) : id === 'cursor',
          })),
        })
      : parseAgentTargets(opts.requestedTarget, detected)

  const type = opts.requestedType
    ? resolveType(opts.requestedType)
    : opts.interactive
      ? await prompts.select({
          message: 'Select the destination lane:',
          choices: [
            { value: 'fe', name: 'Frontend (FE)' },
            { value: 'be', name: 'Backend (BE)' },
            { value: 'fullstack', name: 'Fullstack (FE + BE)' },
          ],
        })
      : resolveType()

  let feAdapter: FeAdapterId | undefined
  let beAdapter: BeAdapterId | undefined

  if (type === 'fe' || type === 'fullstack') {
    const requested = opts.requestedFeAdapter ?? (type === 'fe' ? opts.requestedAdapter : undefined)
    feAdapter = requested
      ? resolveFeAdapter(requested)
      : opts.interactive
        ? await prompts.select({
            message: 'Select the FE adapter:',
            choices: FE_ADAPTERS.map((value) => ({
              value,
              name: FE_ADAPTER_NAMES[value],
            })),
          })
        : resolveFeAdapter()
  }

  if (type === 'be' || type === 'fullstack') {
    const requested = opts.requestedBeAdapter ?? (type === 'be' ? opts.requestedAdapter : undefined)
    beAdapter = requested
      ? resolveBeAdapter(requested)
      : opts.interactive
        ? await prompts.select({
            message: 'Select the BE adapter:',
            choices: BE_ADAPTERS.map((value) => ({
              value,
              name: BE_ADAPTER_NAMES[value],
            })),
          })
        : resolveBeAdapter()
  }

  let docsRoot = opts.requestedDocsRoot
  const needsDocsRoot =
    (type === 'fe' || type === 'fullstack') && feAdapter !== 'dotnet-line'
  if (needsDocsRoot && !docsRoot && opts.interactive) {
    const answer = await prompts.line(
      'Docs hub path for CODEGENKIT_DOCS_ROOT (Enter to skip): ',
    )
    if (answer) docsRoot = answer
  }

  const installableOptional = artifactgraphAvailable() ? ['ArtifactGraph'] : []
  const withOptional =
    opts.interactive && opts.requestedWith === undefined
      ? installableOptional.length
        ? await prompts.checkbox({
            message: 'Optional toolkits to add now (none = skip, add later):',
            choices: installableOptional.map((id) => ({
              value: id,
              name: id,
              checked: false,
            })),
          })
        : []
      : (opts.requestedWith ?? [])

  const cursorSelected = targets.includes('cursor')
  let wireCodegraph = opts.wireCodegraphFlag ?? cursorSelected
  if (opts.wireCodegraphFlag === undefined && opts.interactive && cursorSelected) {
    const choice = await prompts.select({
      message: 'Wire cross-repo CodeGraph servers via Platform DNA now?',
      choices: [
        { value: 'yes', name: 'Yes — run `platform-dna codegraph:wire` now' },
        { value: 'later', name: 'Skip — wire later with `platform-dna codegraph:wire`' },
      ],
    })
    wireCodegraph = choice === 'yes'
  }

  return {
    targets,
    target: targets.join(',') || 'none',
    type,
    feAdapter,
    beAdapter,
    docsRoot,
    withOptional,
    wireCodegraph: wireCodegraph && cursorSelected,
  }
}
