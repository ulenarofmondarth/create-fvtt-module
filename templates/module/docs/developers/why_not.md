# Why not...

## ... use `docker` to isolate the whole development environment?

More trouble than it is worth. Although less of an issue than it used to be using docker in docker can be tricky.
Similarly, individual developer IDE preferences can get messy when using docker development containers. It is simpler
to use `nodejs` on the host and rely on `pnpm` for most of the build/runtime environment isolation.
