/**
 * Next.js app paths under src/ (portal-gen output root).
 */

export const WEB_SRC = 'src'

/** @param {string} routePath e.g. /hotels */
export function routeToAppPagePath(routePath) {
  const trimmed = routePath.replace(/^\//, '').replace(/\/$/, '')
  if (!trimmed) {
    return `${WEB_SRC}/app/(dashboard)/page.tsx`
  }
  return `${WEB_SRC}/app/(dashboard)/${trimmed}/page.tsx`
}

/** @param {string} file e.g. hotel.service.ts */
export function webServicePath(file) {
  return `${WEB_SRC}/services/${file}`
}

/** @param {string} file e.g. hotel/useHotelList.ts */
export function webHookPath(file) {
  return `${WEB_SRC}/hooks/${file}`
}

/** @param {string} file e.g. hotel.mock.ts */
export function webMockPath(file) {
  return `${WEB_SRC}/mocks/${file}`
}

/** @param {string} file e.g. hotel/schemas.ts */
export function webValidationPath(file) {
  return `${WEB_SRC}/validations/${file}`
}

/** @param {string} relativePath */
export function isNextPagePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  return normalized.includes('/app/(dashboard)/') && normalized.endsWith('/page.tsx')
}
