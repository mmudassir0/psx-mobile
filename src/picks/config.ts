/**
 * Where the daily picks are published. ntfy.sh is a free notification relay;
 * the feed channel holds the picks as JSON for the app to read (nobody needs
 * to subscribe to it). The name is random so it isn't found by chance; the
 * picks aren't secret.
 */
export const NTFY = process.env.EXPO_PUBLIC_NTFY || 'https://ntfy.sh';
export const FEED_TOPIC = 'sahm-feed-f009f5334a7546b2';
