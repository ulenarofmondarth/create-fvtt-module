# Alternatives

(replace-pnpm)=

## Can I use `npm` instead of `pnpm`?

Replacing `pnpm` with `npm` is simple enough. You will need to modify the following:

`package.json`
: Change the `packageManager` entry, remove the `scripts.preinstall` entry. Check for any embedded `pnpm` commands and
  replace with the corresponding `npm` command. The scripts in `scripts/` and the git hooks in `.husky/` also call
  `pnpm`.

`.github/workflows`
: Check these as they use `pnpm`. The shared set-up steps in `.github/actions/setup` install `pnpm` and cache its
  store.

(replacing-github)=

## Can I use an alternative to `github`?

You can use another host for your version control and deployment but you will need to review and update:

`.github/workflows`
: These (obviously) rely on github being used[^f1]. These build, package and deploy your module and its associated
  documentation. The release App and the branch rulesets ([](github-setup.md)) are GitHub features too; another host
  needs its own way of letting releases push to protected branches.

`module.json`
: The elements in this file that change with each release are automatically maintained by the `.github/workflows`.
  You will need to implement alternatives if you choose another host.

(replacing-sphinx)=

## Can I replace the documentation system?

This template uses Docker to isolate a documentation system based on [Sphinx](https://www.sphinx-doc.org/en/master/).
The `.github/workflows` assume this documentation system is used when building and deploying the documentation to
{program}`github pages`.

If you replace the documentation system you will need to review and update:

`.github/workflows/dev.yml`
: The `docs` job builds the documentation for every pull request.

`package.json`
: Update (or remove) the `build:docs`, `serve:docs` and `devserve:docs` script entries.

`compose.yaml` and `docs/Dockerfile`
: Update (or remove) the `docs` service and its image.

[^f1]: Well, at least something that understands Github actions and workflow format. Try
    [act](https://github.com/nektos/act), this can be useful for local testing of workflows. It is also the workflow
    system used by [Gitea](https://about.gitea.com/) (if you fancy an alternative web-based repository host).
