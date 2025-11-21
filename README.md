# nor-customs-bot
A Discord bot for managing Nor Customs lobbies and roles in Heroes of the Storm.

# to start the app:
cd /home/jmeadows/ghq/github.com/meadowsjared/nor-customs-bot
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