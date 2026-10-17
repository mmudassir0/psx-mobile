/**
 * Where the daily picks come from. The daily job writes them to this repo's
 * `picks` branch, which only the repo owner can change, so nobody else can put
 * fake picks into the app. (The old ntfy channel accepted posts from anyone.)
 */
export const FEED_BASE = process.env.EXPO_PUBLIC_FEED_BASE || 'https://raw.githubusercontent.com/mmudassir0/psx-mobile/picks';
/** Balance sheets from the fundamentals job, read at runtime so new reports arrive without an app update. */
export const DATA_BASE = process.env.EXPO_PUBLIC_DATA_BASE || 'https://raw.githubusercontent.com/mmudassir0/psx-mobile/data';

/** ntfy is still used by the daily job for older app versions; the app no longer reads it. */
export const NTFY = process.env.EXPO_PUBLIC_NTFY || 'https://ntfy.sh';
export const FEED_TOPIC = 'sahm-feed-f009f5334a7546b2';
