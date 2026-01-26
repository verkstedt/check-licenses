#!/usr/bin/env -S node --enable-source-maps --no-deprecation=DEP0174

import {
  debug,
  parseArgs,
  type ParseArgsConfig,
  type ParseArgsOptionDescriptor,
} from 'node:util'

import wordWrap from 'word-wrap'

import checkLicenses, { Clarifications, parseClarifications } from './index.mjs'

const PKG_NAME = '@verkstedt/check-licenses'

const log = debug(PKG_NAME)

const supportsColor =
  process.stdout.isTTY && process.stderr.isTTY && process.env.TERM !== 'dumb'

const ansi =
  process.env.FORCE_COLOR || (supportsColor && !('NO_COLOR' in process.env))
    ? {
        dim: '\u001b[2m',
        bold: '\u001b[1m',
        red: '\u001b[31m',
        reset: '\u001b[0m',
      }
    : {
        dim: '',
        bold: '',
        red: '',
        reset: '',
      }

const cliOptions = Object.freeze({
  ['exclude']: {
    short: 'x',
    type: 'string',
    multiple: true,
    default: [],
    description:
      "Newline-separated list of package names to exclude from the check. Use '*' at the end of the name to match by prefix. Lines starting with '#' are treated as comments and ignored.",
  },
  ['allowed-licenses']: {
    short: 'l',
    type: 'string',
    multiple: true,
    default: [],
    description:
      "Newline-separated list of allowed SPDX license identifiers <https://spdx.org/licenses/>. You can use '+' after a version to also allow future versions. Lines starting with '#' are treated as comments and ignored.",
  },
  ['clarifications']: {
    short: 'c',
    type: 'string',
    multiple: true,
    default: ['{}'],
    description:
      'JSON object with license clarifications for packages with broken license metadata <https://github.com/greenstevester/license-checker-evergreen/blob/main/docs/advanced-features.md#license-clarifications>',
  },
  ['help']: {
    short: 'h',
    type: 'boolean',
    default: false,
    description: 'Show this help message and exit',
  },
} as const) satisfies Record<
  string,
  ParseArgsOptionDescriptor & { description: string }
>

function wrapText(prefix: string, text: string): string {
  const columns = process.stdout.columns || 80

  return wordWrap(text, { width: columns - prefix.length - 2 }).replace(
    /^/gm,
    prefix
  )
}

function printHelp(): void {
  process.stdout.write(
    [
      `${ansi.bold}Check licenses of your project dependencies.${ansi.reset}`,
      '',
      `${ansi.bold}Usage:${ansi.reset} npx ${PKG_NAME} [OPTIONS] PATH`,
      '',
      `${ansi.bold}ARGUMENTS${ansi.reset}`,
      '  PATH',
      wrapText('      ', 'Path to the project to check'),
      '',
      `${ansi.bold}OPTIONS${ansi.reset}`,
      ...Object.entries(cliOptions).map(([name, option]) =>
        [
          `  -${option.short}, --${name}`,
          wrapText(
            '      ',
            [
              option.description,
              '\n',
              ansi.dim,
              option.type,
              'multiple' in option && option.multiple
                ? ', can be specified multiple times'
                : '',
              'default' in option
                ? `, default: ${JSON.stringify(option.default)}`
                : '',
              ansi.reset,
            ].join('')
          ),
        ].join('\n')
      ),
      '',
    ].join('\n')
  )
}

interface OurParseArgsConfig extends ParseArgsConfig {
  options: typeof cliOptions
}

function parseCliArgs(): {
  start: string
  exclude: string
  allowedLicenses: string
  clarifications: Clarifications
} {
  let parseArgsResult
  try {
    parseArgsResult = parseArgs<OurParseArgsConfig>({
      args: process.argv.slice(2),
      options: cliOptions,
      strict: true,
      allowPositionals: true,
      allowNegative: true,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      [
        'ERR_PARSE_ARGS_UNKNOWN_OPTION',
        'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
      ].includes(error.code)
    ) {
      process.stderr.write(
        `${ansi.red}ERROR: ${error.message}${ansi.reset}\n\n`
      )
      printHelp()
      process.exit(64) // EX_USAGE
    } else {
      throw error
    }
  }

  const { values, positionals } = parseArgsResult!

  if (values.help) {
    printHelp()
    process.exit(0) // EX_OK
  }

  if (positionals.length !== 1) {
    process.stderr.write(
      `${ansi.red}ERROR: Missing required PATH argument${ansi.reset}\n\n`
    )
    printHelp()
    process.exit(64) // EX_USAGE
  }
  const start = positionals[0]
  log(`Starting path: %s`, start)

  // parseArgs types currently doesn’t recognise `type` and types
  // everything as `string | boolean` (it only recognises `multiple`, so
  // it doesn’t type as `string | boolean | string[] | boolean[]`).
  // So we need to cast values as strings.

  const excludeArray = values.exclude as Array<string>
  log(`Excludes: %s`, excludeArray)
  const exclude = excludeArray.join('\n')

  const allowedLicensesArray = values['allowed-licenses'] as Array<string>
  log(`Allowed licenses: %s`, allowedLicensesArray)
  const allowedLicenses = allowedLicensesArray.join('\n')

  const clarificationsArray = values.clarifications as Array<string>
  log(`Clarifications: %s`, clarificationsArray)
  const clarifications = clarificationsArray.reduce((carry, itemString) => {
    const item = parseClarifications(itemString)
    return {
      ...carry,
      ...item,
    }
  }, {})
  log(`Clarifications (merged): %s`, clarifications)

  return {
    start,
    exclude,
    allowedLicenses,
    clarifications,
  }
}

async function main() {
  const { start, exclude, allowedLicenses, clarifications } = parseCliArgs()

  const result = await checkLicenses({
    start,
    exclude,
    clarifications,
    allowedLicenses,
    log,
  })

  const violations = result.filter((pkg) => pkg.ok !== true)

  if (violations.length === 0) {
    log('No license violations found.')
  } else {
    log('License violations found: %O', violations)
    process.stderr.write(
      [
        `${ansi.red}Found ${violations.length} license violations:${ansi.reset}`,
        ...violations.map(
          ({ name, version, licenses }) => `  - ${name}@${version}: ${licenses}`
        ),
        '',
      ].join('\n')
    )
    process.exit(1) // EX_FAILURE
  }
}

await main()
