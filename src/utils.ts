/**
 * Splits the string by the delimiter, ignoring escaped delimiters.
 *
 * @param str - string to split
 * @param delimiter - delimiter
 * @param escapeCharacter - escape character
 * @param preserveAllTokens - if true, preserve empty parts
 */
export function splitByDelimiterWithEscapeCharacter(
    str: string,
    delimiter: string,
    escapeCharacter: string,
    preserveAllTokens: boolean,
): string[] {
    const parts: string[] = [];

    if (!str) {
        return parts;
    }

    let sb: string[] = [];
    for (let i = 0; i < str.length; i += 1) {
        const c = str.charAt(i);
        if (c === delimiter) {
            if (i === 0) {
                // Ignore
            } else if (str.charAt(i - 1) === escapeCharacter) {
                sb.splice(sb.length - 1, 1);
                sb.push(c);
            } else if (preserveAllTokens || sb.length > 0) {
                const part = sb.join('');
                parts.push(part);
                sb = [];
            }
        } else {
            sb.push(c);
        }
    }

    if (preserveAllTokens || sb.length > 0) {
        parts.push(sb.join(''));
    }

    return parts;
}

/**
 * Checks if the specified string starts with a substr at the specified index.
 *
 * @param str - String to check
 * @param startIndex - Index to start checking from
 * @param substr - Substring to check
 * @return boolean true if it does start
 */
export function startsAtIndexWith(str: string, startIndex: number, substr: string): boolean {
    if (str.length - startIndex < substr.length) {
        return false;
    }

    for (let i = 0; i < substr.length; i += 1) {
        if (str.charAt(startIndex + i) !== substr.charAt(i)) {
            return false;
        }
    }

    return true;
}

/**
 * djb2 hash algorithm
 *
 * @param str
 * @param begin
 * @param end
 * @return {number}
 */
export function fastHashBetween(str: string, begin: number, end: number): number {
    let hash = 5381;
    for (let idx = begin; idx < end; idx += 1) {
        hash = 33 * hash + str.charCodeAt(idx);
    }

    return hash;
}
/**
 * djb2 hash algorithm
 *
 * @param str
 * @return {any}
 */
export function fastHash(str: string): number {
    if (str === '') {
        return 0;
    }

    const len = str.length;
    return fastHashBetween(str, 0, len);
}

/**
 * Look for any symbol from "chars" array starting at "start" index or from the start of the string
 *
 * @param str   String to search
 * @param chars Chars to search for
 * @param start Start index (optional, inclusive)
 * @return int Index of the element found or -1 if not
 */
export function indexOfAny(str: string, chars: string[], start = 0): number {
    if (str.length <= start) {
        return -1;
    }

    for (let i = start; i < str.length; i += 1) {
        const c = str.charAt(i);
        if (chars.indexOf(c) > -1) {
            return i;
        }
    }

    return -1;
}

/**
 * Checks if arrays are equal
 *
 * @param l
 * @param r
 */
export function stringArraysEquals(l: string[] | null, r: string[] | null): boolean {
    if (!l || !r) {
        return !l && !r;
    }

    if (l.length !== r.length) {
        return false;
    }

    for (let i = 0; i < l.length; i += 1) {
        if (l[i] !== r[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Count enabled options in value of specified enumaration type
 *
 * @param value
 * @param enumerationType
 * @returns count
 */
export function countElementsInEnum(value: number, enumerationType: any): number {
    let count = 0;

    // eslint-disable-next-line no-restricted-syntax,guard-for-in
    for (const item in enumerationType) {
        const mask = enumerationType[item];
        if ((value & mask) === mask) {
            count += 1;
        }
    }

    return count;
}
