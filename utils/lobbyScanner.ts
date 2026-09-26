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

function calculateSlotCoordinates(imageWidth: number, imageHeight: number): CropCoordinate[] {
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

  const crops: CropCoordinate[] = [];

  // Team 1 slots (5 slots)
  for (let i = 0; i < 5; i++) {
    crops.push({
      left: activeLeft + Math.round(activeWidth * 0.160),
      top: activeTop + Math.round(activeHeight * (0.252 + i * 0.0485)),
      width: Math.round(activeWidth * 0.280),
      height: Math.round(activeHeight * 0.042),
    });
  }

  // Team 2 slots (5 slots)
  for (let i = 0; i < 5; i++) {
    crops.push({
      left: activeLeft + Math.round(activeWidth * 0.535),
      top: activeTop + Math.round(activeHeight * (0.252 + i * 0.0485)),
      width: Math.round(activeWidth * 0.280),
      height: Math.round(activeHeight * 0.042),
    });
  }

  // // Observers slots (6 slots)
  // for (let i = 0; i < 6; i++) {
  //   crops.push({
  //     left: activeLeft + Math.round(activeWidth * 0.160),
  //     top: activeTop + Math.round(activeHeight * (0.555 + i * 0.0485)),
  //     width: Math.round(activeWidth * 0.280),
  //     height: Math.round(activeHeight * 0.042),
  //   });
  // }

  return crops;
}

function cleanOCRText(raw: string): string {
  // Strip parenthesized tags like (Host), (Captain), (Observer)
  let text = raw.replace(/\(.*?\)/g, ' ');
  // Strip trailing or isolated role/status keywords like Host, Captain, Capta, Caopta, Observer, Referee, Ref
  text = text.replace(/\b(host|captain|capta|caopta|observer|referee|ref)\b/gi, ' ');
  // Strip non-alphanumeric chars at beginning and end
  text = text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function findBestAccountMatch(
  ocrName: string,
  accounts: RegisteredPlayerAccount[],
): RegisteredPlayerAccount | undefined {
  const normalizedOcr = ocrName.toLowerCase();

  // 1. Exact match against BattleTag prefix
  for (const acc of accounts) {
    const prefix = acc.hotsBattleTag.split('#')[0].toLowerCase();
    if (prefix === normalizedOcr) {
      return acc;
    }
  }

  // 2. Fuzzy match using Levenshtein distance
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
  }

  return bestMatch;
}

export async function scanLobbyScreenshot(
  imageBuffer: Buffer,
  guildId: string,
  sync = true,
): Promise<ScanLobbySummary> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 1920;
  const height = metadata.height ?? 1080;

  const slotCoords = calculateSlotCoordinates(width, height);
  const worker = await getWorker();

  const registeredAccounts = getAllRegisteredHotSAccounts();
  const detectedSlots: { slotIndex: number; text: string; }[] = [];

  for (let i = 0; i < slotCoords.length; i++) {
    const coord = slotCoords[i];
    try {
      const processedBuffer = await sharp(imageBuffer)
        .extract(coord)
        .resize({ width: coord.width * 3 })
        .grayscale()
        .threshold(145)
        .toBuffer();

      const result = await worker.recognize(processedBuffer);
      const rawText = result.data.text.trim();
      const cleaned = cleanOCRText(rawText);

      if (cleaned.length >= 2 && !cleaned.toLowerCase().includes('empty slot')) {
        detectedSlots.push({ slotIndex: i, text: cleaned });
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
      } else {
        team2DiscordIds.push(matched.discordId);
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
  };
}
