# Prerequisites

`nodeJS`
: This template is tested against `nodejs` version 24.

`pnpm`
: The package manager of choice. (See [](#replace-pnpm) if you object to efficiency.)

`docker`
: (And `docker compose`---commonly bundled when you install Docker.)

  - `docker` version v28+
  - `docker compose` version v2.33+

`git`
: Pretty much any modern `git`, at the time of writing I have v2.39.5 installed.

`Xvfb` and `xauth` (optional)
: Only needed to run the end-to-end tests without a desktop session, such as over SSH, with `pnpm run test:e2e:xvfb`.
  `xvfb-run` needs `xauth` too, which Debian's `xvfb` package only recommends, so install both:
  `sudo apt-get install xvfb xauth`.
