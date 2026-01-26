import { randomBytes } from 'node:crypto'
import { unlinkSync, type Stats } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { initFast } from 'license-checker-evergreen'
import spdxLicenseIds from 'spdx-license-ids' with { type: 'json' }
import satisfies from 'spdx-satisfies'

const customFormat = Object.freeze({
  licenses: '' as string,
  private: false as boolean,
  path: '' as string,
  name: '' as string,
  version: '' as string,
  repository: '' as string,
  licenseFile: 'none' as string,
  licenseText: 'none' as string,
  // Init with undefined, will be filled in later
  ok: undefined as boolean | undefined,
})

type PackageInfo = {
  [key in keyof typeof customFormat]: (typeof customFormat)[key]
}

// FIXME Update if license-checker-evergreen adds proper types
interface LicenceCheckerArgs {
  start: string
  relativeModulePath: boolean
  relativeLicensePath: boolean
  customFormat: Record<string, unknown>
  clarificationsFile: string
  excludePackages: Array<string>
  excludePackagesStartingWith: Array<string>
}
type LicenceCheckerResult = Array<PackageInfo>
// We use these two later with `satisfies` to make sure we get some errors when
// licence-checker-evergreen introduces proper typings and they don’t match ours
type LicenceCheckerRealArgs = Parameters<typeof initFast>[0]
type LicenceCheckerRealResult = Parameters<Parameters<typeof initFast>[1]>[1]

const licenseChecker = promisify<LicenceCheckerArgs, LicenceCheckerResult>(
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- initFast already returna s promise, but it doesn’t resolve to anything and it returns data via a callback
  initFast
)

export type Clarifications = Record<
  string,
  {
    licenses?: string
    licenseFile?: string
  }
>

/**
 * license-checker only accepts clarifications via a file, so we create
 * a temporary file for it to read and delete it on process exit
 */
async function createTempClarificationsFile(
  clarifications: Clarifications
): Promise<string> {
  const clarificationsJson = JSON.stringify(clarifications)
  const clarificationsFile = join(
    tmpdir(),
    `clarifications-${randomBytes(16).toString('hex')}.json`
  )
  await writeFile(clarificationsFile, clarificationsJson, {
    encoding: 'utf8',
  })

  process.on('exit', () => {
    try {
      unlinkSync(clarificationsFile)
    } catch {
      // ignore
    }
  })

  return clarificationsFile
}

function checkLicense(
  allowedSpdxLicenses: Array<string>,
  { name, version, licenses }: PackageInfo
): boolean {
  // license-checker-evergreen adds * to the end of licenses, if it
  // didn’t read it from package.json
  const license = licenses.endsWith('*') ? licenses.slice(0, -1) : licenses

  if (allowedSpdxLicenses.includes(license)) {
    return true
  } else {
    try {
      return satisfies(license, allowedSpdxLicenses)
    } catch (cause) {
      throw new Error(
        `Failed to check license '${licenses}' for package ${name}@${version}. You might need to add it to clarifications.`,
        { cause }
      )
    }
  }
}

interface CheckLicensesOptions {
  /**
   * Project root path
   */
  start: string
  /**
   * Names of packages.
   * Can include '*' wildcard at the end
   */
  exclude: string | Array<string>
  /**
   * SPDX license specifiers
   * @link https://www.npmjs.com/package/spdx-satisfies
   */
  allowedLicenses: string | Array<string>
  /**
   * Clarifications for packages with broken license metadata
   * @link https://github.com/greenstevester/license-checker-evergreen/blob/main/docs/advanced-features.md#license-clarifications
   */
  clarifications: string | Clarifications
  /**
   * Debug logger function
   * @see import('node:util').debug
   */
  log?:
    | ((message: string, ...args: Parameters<Console['log']>) => void)
    | (() => void)
}

function parseListValue(value: string): Array<string> {
  return value
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#') && line.trim() !== '')
}

function parseJsonValue(value: string) {
  return JSON.parse(value) as unknown
}

async function validateNodeModulesExistence(dir: string): Promise<void> {
  const nodeModulesDir = join(dir, 'node_modules')
  // check if exists and is a directory
  let dirStat: Stats
  try {
    dirStat = await stat(nodeModulesDir)
  } catch (cause) {
    throw new Error(
      `Directory '${nodeModulesDir}' does not exist. Make sure to run 'npm install' before running the license checker.`,
      { cause }
    )
  }
  if (!dirStat.isDirectory()) {
    throw new Error(`File '${nodeModulesDir}' exists, but is not a directory.`)
  }
}

/**
 * Check if licenses of dependencies ok
 */
export default async function checkLicenses({
  start,
  allowedLicenses: allowedLicensesParam,
  exclude: excludeParam,
  clarifications: clarificationsParam,
  log = () => undefined,
}: CheckLicensesOptions): Promise<Array<PackageInfo>> {
  const allowedLicenses = Array.isArray(allowedLicensesParam)
    ? allowedLicensesParam
    : parseListValue(allowedLicensesParam)
  const invalidLicenses = allowedLicenses.filter((licenseSpec) => {
    const licenseId = licenseSpec.endsWith('+')
      ? licenseSpec.slice(0, -1)
      : licenseSpec
    return !spdxLicenseIds.includes(licenseId)
  })
  if (invalidLicenses.length > 0) {
    throw new Error(
      `The following allowed licenses are not valid SPDX license identifiers: ${invalidLicenses.join(', ')}`
    )
  }
  log('Parsed allowed licenses: %O', allowedLicenses)

  const exclude = Array.isArray(excludeParam)
    ? excludeParam
    : parseListValue(excludeParam)

  const invalidExcludes = exclude.filter(
    (excl) => excl.includes('*') && excl.indexOf('*') !== excl.length - 1
  )
  if (invalidExcludes.length > 0) {
    throw new Error(
      `The following exclude are invalid, wildcards are only supported at the end of the string: ${invalidExcludes.join(
        ', '
      )}`
    )
  }
  log('Parsed exclude: %O', exclude)

  const clarifications: Clarifications =
    typeof clarificationsParam === 'string'
      ? (parseJsonValue(clarificationsParam) as Clarifications)
      : clarificationsParam
  log('Parsed clarifications: %O', clarifications)
  const clarificationsFile = await createTempClarificationsFile(clarifications)
  log('Wrote clarifications to temporary file: %s', clarificationsFile)

  await validateNodeModulesExistence(start)
  log('node_modules directory exists in %s', start)

  const packages = (await licenseChecker({
    start,
    relativeModulePath: true,
    relativeLicensePath: true,
    customFormat,
    clarificationsFile,
    excludePackages: exclude.filter((pkg) => !pkg.endsWith('*')),
    excludePackagesStartingWith: exclude
      .filter((pkg) => pkg.endsWith('*'))
      .map((pkg) => pkg.slice(0, -1)),
  } satisfies LicenceCheckerRealArgs)) satisfies LicenceCheckerRealResult

  const result: Array<PackageInfo> = Object.values<PackageInfo>(packages).map(
    (info) => ({
      ...info,
      ok: checkLicense(allowedLicenses, info),
    })
  )

  log('License check result: %O', result)

  return result
}
