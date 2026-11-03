// Optional BLAKE3 entry is incompatible with some browser bundlers.
// Deliberately throw during import so Siglum uses its internal hashing fallback.
throw new Error('Use Siglum built-in DJB2 fallback');
export function hash() {}
