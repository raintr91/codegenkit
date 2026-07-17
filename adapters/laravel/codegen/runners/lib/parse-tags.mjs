const PREFIX = {
  genModule: '#gen:module',
  genModelPlatform: '#gen:model-platform',
  genModelTenant: '#gen:model-tenant',
  genCrud: '#gen:crud',
  genAction: '#gen:action-',
  genSelectItems: '#gen:select-items',
  genCreateOrUpdate: '#gen:create-or-update:',
  genAuthApi: '#gen:auth-api',
  genTestModule: '#gen:test-module',
  genTestSmoke: '#gen:test-smoke',
  skipGen: '#skip-gen:',
  manualAction: '#manual-action:',
  manualService: '#manual-service:',
  manualTest: '#manual-test:',
  callExternal: '#call-external',
  crossEntityService: '#cross-entity-service',
  derivedData: '#derived-data'
}

/**
 * @param {string[]} tags
 */
export function parseTags(tags = []) {
  const parsed = {
    domain: [],
    gen: [],
    skipGen: [],
    manualActions: [],
    manualServices: [],
    manualTests: [],
    raw: tags.map((t) => String(t).trim()).filter(Boolean)
  }

  for (const tag of parsed.raw) {
    if (tag === PREFIX.callExternal) parsed.domain.push('call-external')
    else if (tag === PREFIX.crossEntityService) parsed.domain.push('cross-entity-service')
    else if (tag === PREFIX.derivedData) parsed.domain.push('derived-data')
    else if (tag.startsWith(PREFIX.skipGen)) parsed.skipGen.push(tag.slice(PREFIX.skipGen.length))
    else if (tag.startsWith(PREFIX.manualAction)) parsed.manualActions.push(tag.slice(PREFIX.manualAction.length) || 'general')
    else if (tag.startsWith(PREFIX.manualService)) parsed.manualServices.push(tag.slice(PREFIX.manualService.length))
    else if (tag.startsWith(PREFIX.manualTest)) parsed.manualTests.push(tag.slice(PREFIX.manualTest.length))
    else if (tag.startsWith('#gen:')) parsed.gen.push(tag)
  }

  return parsed
}

export { PREFIX }
