# Why ...

## ... use `pnpm`?

`pnpm` uses a cache and is more efficient than `npm`.

## ... use `github`?

It is pretty ubiquitous and virtually a standard for managing Foundry modules.

## ... use `vite`?

It provides nice tools (like an {{HMR}} development server) out of the box.

## ... use `vitest`?

Clean, simple, flexible, and ties in to `vite` ecosystem.

## ... use `docker`?

For ancillary tooling it provides a neat way to isolate from the host (so we can provide neat features without needing
to have you install a load of stuff). It also provides a nicely isolated environment for running development Foundry
VTT servers, which can also be used in more advances scenarios in `.github/workflows`.

## ... document with Sphinx?

This is just my taste. I like the power and simplicity of ReStructured Text (more that Markdown but shallower learning
curve than, for example, LaTeX). I also like the flexible output method from Sphinx. (See [](#replacing-sphinx))

## ... all the `svelte` stuff?

This module template assumes you will be using [svelte](https://svelte.dev) for any UI (rather than the Foundry
Handlebars). {program}`Svelte` is ({{IMHO}}) a more powerful, more reactive, yet simpler, UI framework. It plays nicely
with `vite` and together they produce small modules. One can use a complete library, such as
[TyphonJS](https://github.com/typhonjs-fvtt-lib) (which attempts to replicate the Foundry API UI as Svelte components),
or simply wrap standard Svelte by extending
[ApplicationV2](https://foundryvtt.com/api/v12/classes/foundry.applications.api.ApplicationV2.html). Which is better
depends on your objectives.
