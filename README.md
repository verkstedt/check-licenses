@verkstedt/check-licenses
=========================

Check licenses of your project dependencies.

## Links

<details>
<summary>verkstedt internal</summary>

- [🗪 Chat](https://app.slack.com/client/T6HMM3NG2/C07JVGJM10S)
- [🗒 Tasks](https://verkstedt.atlassian.net/jira/software/projects/VIP/boards/12) (shared with other projects)

</details>

## Differences to [license-checker-evergreen]

This is a lightweight wrapper around [license-checker-evergreen] with
following notable changes:

- Check licenses only after we collect all dependencies and
  filter out ignored packages ([license-checker-evergreen] filters out
  only after checking).

- We list all offending packages, instead of just the first one.

- Use newline as delimiter between items of arguments and allow comment
  lines.

- Read clarifications from an argument, instead of a file and allow
  JSONC comments there.

- Combine `excludePackages` and `onlyAllowPackages` into a single
  `excludes` that allows `*` wildcard at the end of the names.

- Check if `node_modules` exists

## Usage

### Command line

```sh
npx @verkstedt/check-licenses --help
```

### Programmatic

```mjs
import { checkLicenses } from '@verkstedt/check-licenses';

const results = checkLicenses({
  start: 'PATH_TO_YOUR_PROJECT',
  allowedLicenses: ['ISC', 'MIT', 'Artistic-1.0+'],
  excludedPackages: ['some-package', '@verkstedt/*'],
  clarifications: {
    'some-package': { licenses: 'ISC' },
  },
})

console.log('Violations:', results.filter(result => !result.ok));
```

## Testing

This script is mainly indented to be used in CI pipelines. To test
things locally, you can save vars from CI in a `.env.test` file and run:

```sh
npx dotenv -e .env.test -- sh -c 'npx @verkstedt/check-licenses -l "$ALLOWED_LICENSES" -e "$EXCLUDED_PACKAGES" -c "$CLARIFICATIONS" PATH_TO_YOUR_PROJECT'
```

## Debugging

Run with `NODE_DEBUG=@verkstedt/check-licenses` environment variable set
to see some debug logs.

---

[license-checker-evergreen]: https://www.npmjs.com/package/license-checker-evergreen

## License

[ISC](./LICENSE)

