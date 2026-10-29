# customs-cruncher
A Discord bot for managing Hots Customs lobbies and roles in Heroes of the Storm.

# to start the app:
cd /home/jmeadows/ghq/github.com/meadowsjared/customs-cruncher
bun start

  ### or run it directly:
  nohup bun dev > out.log 2>&1 &; disown

# to check on the app:
bun status

cat out.log

# to stop it:
bun stop

  ### or use this to kill it
  ps aux | grep 'bun dev'

  kill <PID_NUMBER>

  [**Angular convention**](https://github.com/conventional-changelog/commitlint/tree/master/@commitlint/config-conventional#type-enum)

Commit messages should have types according to commitlint-config-conventional can be:

* build
* chore
* ci
* docs
* feat
* fix
* perf
* refactor
* revert
* style
* test

For more information, see the [commitlint documentation](https://commitlint.js.org/#/reference-rules?id=type-enum).
