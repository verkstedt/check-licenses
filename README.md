# @verkstedt/check-licenses

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

- We also collect data about invalid licenses, not just non–allowed
  ones.

- Use newline as delimiter between items of arguments and allow comment
  lines.

- Read clarifications from an argument, instead of a file.

- Combine `excludePackages` and `onlyAllowPackages` into a single
  `exclude` that allows `*` wildcard at the end of the names.

- Check if `node_modules` exists

- Additional allowed licenses and excluded packages for dev
  dependencies.

## Usage

### Command line

```sh
npx @verkstedt/check-licenses --help
```

### Programmatic

```mjs
import checkLicenses from '@verkstedt/check-licenses'

const results = await checkLicenses({
  start: 'PATH_TO_YOUR_PROJECT',
  allowedLicenses: ['ISC', 'MIT', 'Artistic-1.0+'],
  excluded: ['some-package', '@verkstedt/*'],
  clarifications: {
    'some-package': { licenses: 'ISC' },
  },
})

console.log(
  'Dependencies with invalid license metadata:',
  results.filter((result) => !result.valid)
)

console.log(
  'Dependencies with non–allowed licenses:',
  results.filter((result) => result.valid && !result.allowed)
)
```

## Testing

This script is mainly indented to be used in CI pipelines. To test
things locally, get current values from your CI environment and store
then in a `.env.local` file (see [`.env.example`](./.env.example) for an
example how it can lok like), then use `dotenv-cli` to pass them as
command line arguments:

```sh
cd PATH_TO_CHECK_LICENSES_REPO
npx dotenv-cli -e .env.test -- sh -c '\
  npx . \
    --allow-licenses="$LICENSE_CHECK_ALLOW_LICENSES_GLOBAL" \
    --allow-licenses="$LICENSE_CHECK_ALLOW_LICENSES" \
    --allow-licenses-dev="$LICENSE_CHECK_ALLOW_LICENSES_DEV_GLOBAL" \
    --allow-licenses-dev="$LICENSE_CHECK_ALLOW_LICENSES_DEV" \
    --exclude-packages="$LICENSE_CHECK_EXCLUDE_PACKAGES_GLOBAL" \
    --exclude-packages="$LICENSE_CHECK_EXCLUDE_PACKAGES" \
    --exclude-packages-dev="$LICENSE_CHECK_EXCLUDE_PACKAGES_DEV_GLOBAL" \
    --exclude-packages-dev="$LICENSE_CHECK_EXCLUDE_PACKAGES_DEV" \
    --clarifications="$LICENSE_CHECK_CLARIFICATIONS" \
    PATH_TO_YOUR_PROJECT \
  '
```

## Debugging

Run with `NODE_DEBUG=@verkstedt/check-licenses` environment variable set
to see some debug logs.

---

[license-checker-evergreen]: https://www.npmjs.com/package/license-checker-evergreen

## License

[ISC](./LICENSE)
