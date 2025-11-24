/**
 * Validates a Heroes of the Storm battle tag against Blizzard's naming rules
 * @param hotsBattleTag The battle tag to validate (e.g., "PlayerName#1234")
 * @returns An object indicating whether the battle tag is valid, along with any errors and rules if invalid
 */
export function validateBattleTag(hotsBattleTag: string):
  | {
      isValid: false;
      errors: string[];
      rules: string;
    }
  | {
      isValid: true;
    } {
  const validationErrors: string[] = [];

  // Check basic format
  if (!hotsBattleTag.includes('#')) {
    validationErrors.push('❌ Missing # separator');
  }

  const [nameBeforeHash, hashPart] = hotsBattleTag.split('#');

  // Check name length (3-12 characters)
  if (!nameBeforeHash || nameBeforeHash.length < 3 || nameBeforeHash.length > 12) {
    validationErrors.push(`❌ Name must be 3-12 characters (you have ${nameBeforeHash?.length ?? 0})`);
  }

  // Check if name starts with a number
  if (nameBeforeHash && /^\d/.test(nameBeforeHash)) {
    validationErrors.push('❌ Name cannot start with a number');
  }

  // Check for spaces or invalid symbols
  if (nameBeforeHash && /[\s!@$%^&*()+=\[\]{};':"\\|,.<>?\/ ]/.test(nameBeforeHash)) {
    validationErrors.push(
      `❌ Name contains spaces or invalid symbols (you have: \`${nameBeforeHash.replace(
        /[^\s!@$%^&*()+=\[\]{};':"\\|,.<>?\/ ]/g,
        ''
      )}\`)`
    );
  }

  // Check hash number (must be at least 4 digits)
  if (!hashPart || !/^\d{4,}$/.test(hashPart)) {
    // count the number of numeric digits after the hash
    const nonDigits = hashPart ? hashPart.replace(/\d/g, '') : '';
    const digitCount = hashPart ? hashPart.replace(/\D/g, '').length : 0;

    if (digitCount < 4) {
      validationErrors.push(`❌ Must have at least 4 digits after the # (you have ${digitCount})`);
    } else if (nonDigits.length > 0) {
      validationErrors.push(
        `❌ Only digits are allowed after the # (you have ${nonDigits.length} non-digit${
          nonDigits.length === 1 ? '' : 's'
        }: \`${nonDigits}\`)`
      );
    } else if (digitCount > 4) {
      validationErrors.push(`❌ Must have at least 4 digits after the # (you have ${digitCount})`);
    }
  }

  const isValid = validationErrors.length === 0;
  if (isValid) {
    return { isValid: true };
  }
  return {
    isValid: false,
    errors: validationErrors,
    rules: `
[Naming Rules:](https://us.support.blizzard.com/en/article/26963)
* The BattleTag must be between 3-12 characters long.
* Accented characters are allowed.
* Numbers are allowed, but a BattleTag cannot start with a number.
* Mixed capitals are allowed (ex: ZeRgRuSh).
* No spaces or symbols are allowed.
* The BattleTag must follow blizzards [Code of Conduct](<https://us.support.blizzard.com/en/article/42673?_gl=1*1ywluiy*_ga*MTk4MTkxNjk2Mi4xNzQ3MzUxNzQy*_ga_VYKNV7C0S3*czE3NjM5NTI0ODAkbzIwJGcwJHQxNzYzOTUyNDgwJGo2MCRsMCRoMA#:~:text=in%20greater%20restrictions.-,Naming,-Names%20are%20subject>).`,
  };
}
