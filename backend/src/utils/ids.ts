import { z } from 'zod';

/**
 * Every id is a random UUID (gen_random_uuid() in the database), so ids in addresses cannot be guessed or counted.
 * Accepted in any case and lowered, as PostgreSQL returns them, so ids compare as plain strings in the code.
 */
export const idSchema = z.uuid().transform((value) => value.toLowerCase());

/** The same, as a regular-expression fragment (lower case only), for paths such as image sources. */
export const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
