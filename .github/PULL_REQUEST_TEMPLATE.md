## Summary

<!-- What changes and why. Link the issue if there is one. -->

## Type

- [ ] Server code (`server/src`)
- [ ] Skills / commands / agent (model-facing content)
- [ ] Data format (needs a migration and a `data_schema` bump, see docs/DATA_FORMAT.md §11)
- [ ] Docs only

## Checklist

- [ ] `cd server && npm run check` passes (typecheck, tests, build)
- [ ] `server/dist/` rebuilt and committed if `server/src` changed
- [ ] `claude plugin validate --strict .` passes
- [ ] For skill/command changes: relevant evals run (`claude plugin eval . --case <name>`), results noted below
- [ ] No personal learning data, secrets or tokens in the diff
- [ ] CHANGELOG.md updated

## Eval results (if behaviour changed)
