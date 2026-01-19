import { randomBytes } from 'node:crypto'
import { writeFile, stat } from 'node:fs/promises'
import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { parse as parseJsonC } from 'jsonc-parser'
import { initFast } from 'license-checker-evergreen'
import satisfies from 'spdx-satisfies'
import spdxLicenseIds from 'spdx-license-ids' with { type: 'json' }

// eslint-disable-next-line @typescript-eslint/no-misused-promises -- initFast already returna s promise, but it doesn’t resolve to anything and it returns data via a callback
const licenseChecker = promisify(initFast)

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
   * SPXD license specifiers
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
  log?: ((message: string, ...args: Array<any>) => void) | (() => void)
}

function parseListValue(value: string): Array<string> {
  return value
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#') && line.trim() !== '')
}

function parseJsonValue<Return>(value: string): Return {
  return parseJsonC(value) as Return
}

async function validateNodeModulesExistence(dir: string): Promise<void> {
  const nodeModulesDir = join(dir, 'node_modules')
  // check if exists and is a directory
  try {
    const dirStat = await stat(nodeModulesDir)
    if (!dirStat.isDirectory()) {
      throw new Error(
        `File '${nodeModulesDir}' exists, but is not a directory.`
      )
    }
  } catch (cause) {
    throw new Error(
      `Directory '${nodeModulesDir}' does not exist. Make sure to run 'npm install' before running the license checker.`,
      { cause }
    )
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
  log = () => {},
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
    (exclude) =>
      exclude.includes('*') && exclude.indexOf('*') !== exclude.length - 1
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
      ? parseJsonValue<Clarifications>(clarificationsParam)
      : clarificationsParam
  log('Parsed clarifications: %O', clarifications)
  const clarificationsFile = await createTempClarificationsFile(clarifications)
  log('Wrote clarifications to temporary file: %s', clarificationsFile)

  await validateNodeModulesExistence(start)
  log('node_modules directory exists in %s', start)

  const packages = await licenseChecker({
    start,
    relativeModulePath: true,
    relativeLicensePath: true,
    customFormat,
    clarificationsFile,
    excludePackages: exclude.filter((pkg) => !pkg.endsWith('*')),
    excludePackagesStartingWith: exclude
      .filter((pkg) => pkg.endsWith('*'))
      .map((pkg) => pkg.slice(0, -1)),
  })

  const result: Array<PackageInfo> = Object.values<PackageInfo>(packages).map(
    (info) => ({
      ...info,
      ok: checkLicense(allowedLicenses, info),
    })
  )

  log('License check result: %O', result)

  return result
}
