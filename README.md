# nor-customs-bot
A Discord bot for managing Nor Customs lobbies and roles in Heroes of the Storm.

# to start the app:
cd /home/jmeadows/ghq/github.com/meadowsjared/nor-customs-bot
nohup bun dev > log.latest 2>&1 &

# to check on the app:
cat log.latest

# to stop it:
ps aux | grep 'bun dev'
kill <PID_NUMBER>