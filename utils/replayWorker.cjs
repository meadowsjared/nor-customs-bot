const { parentPort } = require('node:worker_threads');
const heroprotocol = require('heroprotocol');
const Parser = require('hots-parser');

function parseReplaySync(file) {
  try {
    const replay = Parser.processReplay(file, {
      overrideVerifiedBuild: true,
    });
    if (!replay || !replay.match) {
      return null;
    }

    if (!replay.match.filename) {
      replay.match.filename = file;
    }

    let mapName = replay.match.map;
    if (mapName === 'Garden of Terror') {
      const fileNameLower = file.toLowerCase();
      if (fileNameLower.includes('classic')) {
        mapName = 'Garden of Terror Classic';
        replay.match.map = mapName;
      }
    }

    const players = Object.values(replay.players || {});

    // Check if any player has an unknown or missing hero (e.g. from Auto-Select in custom lobbies)
    try {
      const details = heroprotocol.get(heroprotocol.DETAILS, file);
      if (details && Array.isArray(details.m_playerList)) {
        for (const player of players) {
          if (!player.hero || player.hero === 'Unknown' || player.hero === 'RAND' || player.hero === 'Auto') {
            const match = details.m_playerList.find(p => {
              const nameStr = p.m_name ? (typeof p.m_name === 'string' ? p.m_name : p.m_name.toString('utf8')) : '';
              return nameStr === player.name;
            });
            if (match && match.m_hero) {
              let heroName = typeof match.m_hero === 'string' ? match.m_hero : match.m_hero.toString('utf8');
              if (heroName === 'Lúcio') heroName = 'Lucio';
              player.hero = heroName;
            }
          }
        }
      }
    } catch {
      // Ignore if details cannot be parsed
    }

    const formatPlayerEntry = p => {
      const heroStr = p.hero ? ` (${p.hero})` : '';
      return `${p.name}#${p.tag}${heroStr}`;
    };

    const team0Players = players
      .filter(p => p.team === 0)
      .map(formatPlayerEntry)
      .join(', ');
    const team1Players = players
      .filter(p => p.team === 1)
      .map(formatPlayerEntry)
      .join(', ');

    return {
      replayObj: replay,
      map: mapName,
      date: replay.match.date,
      type: replay.match.type,
      mode: replay.match.mode,
      length: replay.match.length,
      winner: replay.match.winner,
      team0Takedowns: replay.match.team0Takedowns,
      team1Takedowns: replay.match.team1Takedowns,
      team0Players,
      team1Players,
      file,
    };
  } catch (error) {
    return null;
  }
}

if (parentPort) {
  parentPort.on('message', msg => {
    try {
      const data = parseReplaySync(msg.file);
      parentPort.postMessage({ id: msg.id, file: msg.file, data });
    } catch (err) {
      parentPort.postMessage({ id: msg.id, file: msg.file, data: null, error: String(err) });
    }
  });
}

module.exports = { parseReplaySync };

