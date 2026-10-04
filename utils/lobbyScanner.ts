import sharp from 'sharp';
import { createWorker, Worker } from 'tesseract.js';
import { getActivePlayers, getAllRegisteredHotSAccounts, RegisteredPlayerAccount, setPlayerActive } from '../store/player';

export interface ScanLobbySummary {
  newlyAdded: { discordId: string; name: string; hotsBattleTag: string; }[];
  alreadyActive: { discordId: string; name: string; hotsBattleTag: string; }[];
  unregistered: string[];
  missingFromScreenshot: { discordId: string; name: string; }[];
  removed: { discordId: string; name: string; }[];
  totalLobbyCount: number;
  team1DiscordIds: string[];
  team2DiscordIds: string[];
  team1CaptainDiscordId?: string;
  team2CaptainDiscordId?: string;
}

let workerInstance: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerInstance) {
    workerInstance = createWorker('eng');
  }
  return workerInstance;
}

function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
        );
      }
    }
  }
  return matrix[bn][an];
}

interface CropCoordinate {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SlotCropCoordinates {
  nameCoord: CropCoordinate;
  badgeCoord: CropCoordinate;
}

function calculateSlotCoordinates(imageWidth: number, imageHeight: number): SlotCropCoordinates[] {
  const targetAspect = 16 / 9;
  const currentAspect = imageWidth / imageHeight;
  let activeLeft = 0;
  let activeTop = 0;
  let activeWidth = imageWidth;
  let activeHeight = imageHeight;

  if (currentAspect > targetAspect) {
    activeWidth = Math.round(imageHeight * targetAspect);
    activeLeft = Math.round((imageWidth - activeWidth) / 2);
  } else if (currentAspect < targetAspect) {
    activeHeight = Math.round(imageWidth / targetAspect);
    activeTop = Math.round((imageHeight - activeHeight) / 2);
  }

  const crops: SlotCropCoordinates[] = [];

  // Team 1 slots (5 slots)
  for (let i = 0; i < 5; i++) {
    const baseLeft = activeLeft + Math.round(activeWidth * 0.160);
    const top = activeTop + Math.round(activeHeight * (0.252 + i * 0.0485));
    const height = Math.round(activeHeight * 0.042);
    crops.push({
      nameCoord: {
        left: baseLeft,
        top,
        width: Math.round(activeWidth * 0.220),
        height,
      },
      badgeCoord: {
        left: baseLeft + Math.round(activeWidth * 0.215),
        top,
        width: Math.round(activeWidth * 0.095),
        height,
      },
    });
  }

  // Team 2 slots (5 slots)
  for (let i = 0; i < 5; i++) {
    const baseLeft = activeLeft + Math.round(activeWidth * 0.535);
    const top = activeTop + Math.round(activeHeight * (0.252 + i * 0.0485));
    const height = Math.round(activeHeight * 0.042);
    crops.push({
      nameCoord: {
        left: baseLeft,
        top,
        width: Math.round(activeWidth * 0.220),
        height,
      },
      badgeCoord: {
        left: baseLeft + Math.round(activeWidth * 0.215),
        top,
        width: Math.round(activeWidth * 0.095),
        height,
      },
    });
  }

  return crops;
}

function cleanOCRText(raw: string): string {
  // Strip parenthesized or bracketed tags like (Host), [Captain], (Observer)
  let text = raw.replace(/[([<{].*?[\])}>]/g, ' ');
  // Strip trailing or isolated role/status keywords like Host, Captain, Capta, Caopta, Observer, Referee, Ref
  text = text.replace(/[[({|Il1]*\s*(host|captain|capta|caopta|observer|referee|ref)\s*[\])}|Il1]*/gi, ' ');
  // Strip stray symbols often produced by lobby icons/party brackets/borders (e.g. «, », _, +, ~, *, ^, |, =)
  text = text.replace(/[«»_+~*^|=#\\/\])}>]/g, ' ');
  // Strip non-alphanumeric chars at beginning and end
  text = text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
  // Strip isolated 1-2 character garbage tokens at the beginning if followed by a real word
  text = text.replace(/^[a-zA-Z0-9]{1,2}\s+(?=[a-zA-Z0-9]{3,})/g, '');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function isCaptainBadgeText(raw: string): boolean {
  const cleaned = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return false;
  if (/captain|ceptoin|coptaln|capta|capt/.test(cleaned)) {
    return true;
  }
  return levenshteinDistance(cleaned, 'captain') <= 3;
}

function findBestAccountMatch(
  ocrName: string,
  accounts: RegisteredPlayerAccount[],
): RegisteredPlayerAccount | undefined {
  const normalizedOcr = ocrName.toLowerCase().trim();

  // 1. Exact match against BattleTag prefix or Real ID Name
  for (const acc of accounts) {
    const prefix = acc.hotsBattleTag.split('#')[0].toLowerCase();
    if (prefix === normalizedOcr) {
      return acc;
    }
    if (acc.realIdName && acc.realIdName.trim().toLowerCase() === normalizedOcr) {
      return acc;
    }
  }

  // 2. Extract alphanumeric word tokens (ignoring symbols and punctuation)
  const tokens = normalizedOcr
    .split(/[^a-z0-9]+/i)
    .filter(t => t.length > 0);

  // 2a. Exact match against individual tokens (prefer longer tokens first)
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  for (const token of sortedTokens) {
    if (token.length < 3) continue;
    for (const acc of accounts) {
      const prefix = acc.hotsBattleTag.split('#')[0].toLowerCase();
      if (prefix === token) {
        return acc;
      }
      if (acc.realIdName && acc.realIdName.trim().toLowerCase() === token) {
        return acc;
      }
    }
  }

  // 2b. Check if any account's prefix or real ID name is contained as a whole token or substring
  for (const acc of accounts) {
    const prefix = acc.hotsBattleTag.split('#')[0].toLowerCase();
    if (prefix.length >= 3 && tokens.includes(prefix)) {
      return acc;
    }
    if (acc.realIdName) {
      const realIdNorm = acc.realIdName.trim().toLowerCase();
      if (realIdNorm.length >= 3 && (normalizedOcr.includes(realIdNorm) || tokens.includes(realIdNorm))) {
        return acc;
      }
    }
  }

  // 3. Fuzzy match using Levenshtein distance against full string
  let bestMatch: RegisteredPlayerAccount | undefined = undefined;
  let minDistance = 999;
  const maxAllowedDistance = ocrName.length <= 5 ? 1 : 2;

  for (const acc of accounts) {
    const prefix = acc.hotsBattleTag.split('#')[0].toLowerCase();
    const dist = levenshteinDistance(normalizedOcr, prefix);
    if (dist <= maxAllowedDistance && dist < minDistance) {
      minDistance = dist;
      bestMatch = acc;
    }

    if (acc.realIdName) {
      const realIdNorm = acc.realIdName.trim().toLowerCase();
      const realIdDist = levenshteinDistance(normalizedOcr, realIdNorm);
      const realIdMaxDist = realIdNorm.length <= 5 ? 1 : realIdNorm.length <= 10 ? 2 : 3;
      if (realIdDist <= realIdMaxDist && realIdDist < minDistance) {
        minDistance = realIdDist;
        bestMatch = acc;
      }
    }
  }

  if (bestMatch) return bestMatch;

  // 4. Fuzzy match against individual tokens (length >= 3)
  for (const token of sortedTokens) {
    if (token.length < 3) continue;
    const tokenMaxDist = token.length <= 5 ? 1 : 2;
    for (const acc of accounts) {
      const prefix = acc.hotsBattleTag.split('#')[0].toLowerCase();
      const dist = levenshteinDistance(token, prefix);
      if (dist <= tokenMaxDist && dist < minDistance) {
        minDistance = dist;
        bestMatch = acc;
      }
      if (acc.realIdName) {
        const realIdNorm = acc.realIdName.trim().toLowerCase();
        const rDist = levenshteinDistance(token, realIdNorm);
        if (rDist <= tokenMaxDist && rDist < minDistance) {
          minDistance = rDist;
          bestMatch = acc;
        }
      }
    }
    if (bestMatch) return bestMatch;
  }

  return bestMatch;
}

export async function scanLobbyScreenshot(
  imageBuffer: Buffer,
  guildId: string,
  sync = false,
): Promise<ScanLobbySummary> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 1920;
  const height = metadata.height ?? 1080;

  const slotCoords = calculateSlotCoordinates(width, height);
  const worker = await getWorker();

  const registeredAccounts = getAllRegisteredHotSAccounts();
  const detectedSlots: { slotIndex: number; text: string; isCaptain: boolean; }[] = [];

  for (let i = 0; i < slotCoords.length; i++) {
    const { nameCoord, badgeCoord } = slotCoords[i];
    try {
      const processedBuffer = await sharp(imageBuffer)
        .extract(nameCoord)
        .resize({ width: nameCoord.width * 3 })
        .grayscale()
        .threshold(140)
        .toBuffer();

      const result = await worker.recognize(processedBuffer);
      const rawText = result.data.text.trim();
      const cleaned = cleanOCRText(rawText);

      // Check captain badge in badge area
      let isCaptain = false;
      try {
        const badgeBuffer = await sharp(imageBuffer)
          .extract(badgeCoord)
          .resize({ width: badgeCoord.width * 3 })
          .grayscale()
          .threshold(130)
          .toBuffer();
        const badgeResult = await worker.recognize(badgeBuffer);
        const badgeText = badgeResult.data.text.trim();
        isCaptain = isCaptainBadgeText(badgeText);
      } catch (badgeErr) {
        console.error('Error checking badge crop for OCR:', badgeErr);
      }

      if (cleaned.length >= 2 && !cleaned.toLowerCase().includes('empty slot')) {
        detectedSlots.push({ slotIndex: i, text: cleaned, isCaptain });
      }
    } catch (err) {
      console.error('Error processing slot crop for OCR:', err);
    }
  }

  const newlyAdded: { discordId: string; name: string; hotsBattleTag: string; }[] = [];
  const alreadyActive: { discordId: string; name: string; hotsBattleTag: string; }[] = [];
  const unregistered: string[] = [];
  const processedDiscordIds = new Set<string>();
  const team1DiscordIds: string[] = [];
  const team2DiscordIds: string[] = [];
  let team1CaptainDiscordId: string | undefined;
  let team2CaptainDiscordId: string | undefined;

  for (const detected of detectedSlots) {
    const matched = findBestAccountMatch(detected.text, registeredAccounts);
    if (matched) {
      if (processedDiscordIds.has(matched.discordId)) {
        continue;
      }
      processedDiscordIds.add(matched.discordId);

      const { updated } = setPlayerActive(matched.discordId, true, guildId);
      const info = {
        discordId: matched.discordId,
        name: matched.discordDisplayName,
        hotsBattleTag: matched.hotsBattleTag,
      };

      if (updated) {
        newlyAdded.push(info);
      } else {
        alreadyActive.push(info);
      }

      if (detected.slotIndex < 5) {
        team1DiscordIds.push(matched.discordId);
        if (detected.isCaptain && !team1CaptainDiscordId) {
          team1CaptainDiscordId = matched.discordId;
        }
      } else {
        team2DiscordIds.push(matched.discordId);
        if (detected.isCaptain && !team2CaptainDiscordId) {
          team2CaptainDiscordId = matched.discordId;
        }
      }
    } else {
      unregistered.push(detected.text);
    }
  }

  const currentActive = getActivePlayers(guildId);
  const missingFromScreenshot: { discordId: string; name: string; }[] = [];
  const removed: { discordId: string; name: string; }[] = [];

  for (const p of currentActive) {
    if (!processedDiscordIds.has(p.discordId)) {
      const missingInfo = {
        discordId: p.discordId,
        name: p.usernames.discordDisplayName,
      };
      missingFromScreenshot.push(missingInfo);
      if (sync) {
        setPlayerActive(p.discordId, false, guildId);
        removed.push(missingInfo);
      }
    }
  }

  const finalActiveCount = sync
    ? currentActive.length - removed.length
    : currentActive.length;

  return {
    newlyAdded,
    alreadyActive,
    unregistered,
    missingFromScreenshot,
    removed,
    totalLobbyCount: finalActiveCount,
    team1DiscordIds,
    team2DiscordIds,
    team1CaptainDiscordId,
    team2CaptainDiscordId,
  };
}
