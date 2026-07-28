import * as crypto from "crypto";
import * as zlib from "zlib";

/**
 * Luazi Standard Library - Crypto Module
 * Provides cryptographic and compression utilities for Luazi scripts
 */

export default {
    // =========================================================================
    // HASHING
    // =========================================================================

    /**
     * Calculate SHA-256 hash of a string
     */
    sha256: (data: string): string => {
        return crypto.createHash("sha256").update(data).digest("hex");
    },

    /**
     * Calculate SHA-256 hash of bytes
     */
    sha256Bytes: (data: Uint8Array): string => {
        return crypto.createHash("sha256").update(Buffer.from(data)).digest("hex");
    },

    /**
     * Calculate SHA-512 hash of a string
     */
    sha512: (data: string): string => {
        return crypto.createHash("sha512").update(data).digest("hex");
    },

    /**
     * Calculate SHA-512 hash of bytes
     */
    sha512Bytes: (data: Uint8Array): string => {
        return crypto.createHash("sha512").update(Buffer.from(data)).digest("hex");
    },

    /**
     * Calculate MD5 hash of a string
     */
    md5: (data: string): string => {
        return crypto.createHash("md5").update(data).digest("hex");
    },

    /**
     * Calculate MD5 hash of bytes
     */
    md5Bytes: (data: Uint8Array): string => {
        return crypto.createHash("md5").update(Buffer.from(data)).digest("hex");
    },

    /**
     * Calculate SHA-1 hash of a string
     */
    sha1: (data: string): string => {
        return crypto.createHash("sha1").update(data).digest("hex");
    },

    /**
     * Calculate SHA-1 hash of bytes
     */
    sha1Bytes: (data: Uint8Array): string => {
        return crypto.createHash("sha1").update(Buffer.from(data)).digest("hex");
    },

    /**
     * Hash a file using the specified algorithm
     */
    hashFile: (filePath: string, algorithm: string = "sha256"): string => {
        try {
            const data = require("fs").readFileSync(filePath);
            return crypto.createHash(algorithm).update(data).digest("hex");
        } catch (e: any) {
            throw new Error(`Failed to hash file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Hash raw bytes using the specified algorithm
     */
    hashBytes: (data: Uint8Array, algorithm: string = "sha256"): string => {
        return crypto.createHash(algorithm).update(Buffer.from(data)).digest("hex");
    },

    // =========================================================================
    // HMAC
    // =========================================================================

    /**
     * Calculate HMAC using the specified algorithm
     */
    hmac: (algorithm: string, key: string, data: string): string => {
        return crypto.createHmac(algorithm, key).update(data).digest("hex");
    },

    /**
     * Calculate HMAC-SHA256
     */
    hmacSha256: (key: string, data: string): string => {
        return crypto.createHmac("sha256", key).update(data).digest("hex");
    },

    /**
     * Calculate HMAC-SHA512
     */
    hmacSha512: (key: string, data: string): string => {
        return crypto.createHmac("sha512", key).update(data).digest("hex");
    },

    // =========================================================================
    // RANDOM
    // =========================================================================

    /**
     * Generate cryptographically secure random bytes
     */
    randomBytes: (size: number): Uint8Array => {
        return crypto.randomBytes(size);
    },

    /**
     * Generate a random integer in range [min, max]
     */
    randomInt: (min: number = 0, max: number = 2147483647): number => {
        return crypto.randomInt(min, max);
    },

    /**
     * Generate a random UUID v4
     */
    uuid: (): string => {
        return crypto.randomUUID();
    },

    /**
     * Generate a random hex string of specified length
     */
    randomHex: (length: number): string => {
        return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
    },

    // =========================================================================
    // ENCRYPTION
    // =========================================================================

    /**
     * Encrypt data using AES-256-GCM
     */
    encrypt: (data: string, key: string): { iv: string; encrypted: string; authTag: string } => {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key.padEnd(32).slice(0, 32)), iv);
        let encrypted = cipher.update(data, "utf8", "hex");
        encrypted += cipher.final("hex");
        return {
            iv: iv.toString("hex"),
            encrypted,
            authTag: cipher.getAuthTag().toString("hex"),
        };
    },

    /**
     * Decrypt data using AES-256-GCM
     */
    decrypt: (encrypted: string, key: string, iv: string, authTag: string): string => {
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            Buffer.from(key.padEnd(32).slice(0, 32)),
            Buffer.from(iv, "hex")
        );
        decipher.setAuthTag(Buffer.from(authTag, "hex"));
        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    },

    // =========================================================================
    // COMPRESSION - GZIP
    // =========================================================================

    /**
     * Compress data using gzip
     */
    gzip: (data: Uint8Array | string, level: number = 6): Uint8Array => {
        const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
        return zlib.gzipSync(buffer, { level });
    },

    /**
     * Decompress gzip data
     */
    gunzip: (data: Uint8Array): Uint8Array => {
        return zlib.gunzipSync(Buffer.from(data));
    },

    /**
     * Compress a file using gzip
     */
    gzipFile: (filePath: string, destPath?: string, level: number = 6): string => {
        try {
            const data = require("fs").readFileSync(filePath);
            const compressed = zlib.gzipSync(data, { level });
            const outputPath = destPath || `${filePath}.gz`;
            require("fs").writeFileSync(outputPath, compressed);
            return outputPath;
        } catch (e: any) {
            throw new Error(`Failed to gzip file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Decompress a gzip file
     */
    gunzipFile: (filePath: string, destPath?: string): string => {
        try {
            const data = require("fs").readFileSync(filePath);
            const decompressed = zlib.gunzipSync(data);
            const outputPath = destPath || filePath.replace(/\.gz$/, "");
            require("fs").writeFileSync(outputPath, decompressed);
            return outputPath;
        } catch (e: any) {
            throw new Error(`Failed to gunzip file: ${filePath} - ${e.message}`);
        }
    },

    // =========================================================================
    // COMPRESSION - BROTLI
    // =========================================================================

    /**
     * Compress data using brotli
     */
    brotli: (data: Uint8Array | string, quality: number = 4): Uint8Array => {
        const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
        return zlib.brotliCompressSync(buffer, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
            },
        });
    },

    /**
     * Decompress brotli data
     */
    unbrotli: (data: Uint8Array): Uint8Array => {
        return zlib.brotliDecompressSync(Buffer.from(data));
    },

    /**
     * Compress a file using brotli
     */
    brotliFile: (filePath: string, destPath?: string, quality: number = 4): string => {
        try {
            const data = require("fs").readFileSync(filePath);
            const compressed = zlib.brotliCompressSync(data, {
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
                },
            });
            const outputPath = destPath || `${filePath}.br`;
            require("fs").writeFileSync(outputPath, compressed);
            return outputPath;
        } catch (e: any) {
            throw new Error(`Failed to brotli compress file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Decompress a brotli file
     */
    unbrotliFile: (filePath: string, destPath?: string): string => {
        try {
            const data = require("fs").readFileSync(filePath);
            const decompressed = zlib.brotliDecompressSync(data);
            const outputPath = destPath || filePath.replace(/\.br$/, "");
            require("fs").writeFileSync(outputPath, decompressed);
            return outputPath;
        } catch (e: any) {
            throw new Error(`Failed to brotli decompress file: ${filePath} - ${e.message}`);
        }
    },

    // =========================================================================
    // COMPRESSION - DEFLATE
    // =========================================================================

    /**
     * Compress data using deflate
     */
    deflate: (data: Uint8Array | string, level: number = 6): Uint8Array => {
        const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
        return zlib.deflateSync(buffer, { level });
    },

    /**
     * Decompress deflate data
     */
    inflate: (data: Uint8Array): Uint8Array => {
        return zlib.inflateSync(Buffer.from(data));
    },

    /**
     * Compress data using deflateRaw (no zlib header)
     */
    deflateRaw: (data: Uint8Array | string, level: number = 6): Uint8Array => {
        const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
        return zlib.deflateRawSync(buffer, { level });
    },

    /**
     * Decompress deflateRaw data
     */
    inflateRaw: (data: Uint8Array): Uint8Array => {
        return zlib.inflateRawSync(Buffer.from(data));
    },

    // =========================================================================
    // COMPRESSION - ZIP
    // =========================================================================

    /**
     * Compress data using zip
     */
    zip: (data: Uint8Array | string, level: number = 6): Uint8Array => {
        const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
        return zlib.zipSync(buffer, { level });
    },

    /**
     * Decompress zip data
     */
    unzip: (data: Uint8Array): Uint8Array => {
        return zlib.unzipSync(Buffer.from(data));
    },

    // =========================================================================
    // BASE64
    // =========================================================================

    /**
     * Encode a string to base64
     */
    base64Encode: (data: string): string => {
        return Buffer.from(data, "utf8").toString("base64");
    },

    /**
     * Decode a base64 string
     */
    base64Decode: (data: string): string => {
        return Buffer.from(data, "base64").toString("utf8");
    },

    /**
     * Encode bytes to base64
     */
    base64EncodeBytes: (data: Uint8Array): string => {
        return Buffer.from(data).toString("base64");
    },

    /**
     * Decode base64 to bytes
     */
    base64DecodeBytes: (data: string): Uint8Array => {
        return Buffer.from(data, "base64");
    },

    // =========================================================================
    // HEX
    // =========================================================================

    /**
     * Encode bytes to hex string
     */
    hexEncode: (data: Uint8Array): string => {
        return Buffer.from(data).toString("hex");
    },

    /**
     * Decode hex string to bytes
     */
    hexDecode: (data: string): Uint8Array => {
        return Buffer.from(data, "hex");
    },

    // =========================================================================
    // PBKDF2
    // =========================================================================

    /**
     * Derive a key using PBKDF2
     */
    pbkdf2: (password: string, salt: string, iterations: number = 100000, keyLength: number = 64): string => {
        return crypto.pbkdf2Sync(password, salt, iterations, keyLength, "sha512").toString("hex");
    },

    /**
     * Generate a secure password hash using scrypt
     */
    hashPassword: (password: string, salt?: string): { hash: string; salt: string } => {
        const usedSalt = salt || crypto.randomBytes(16).toString("hex");
        const hash = crypto.scryptSync(password, usedSalt, 64).toString("hex");
        return { hash, salt: usedSalt };
    },

    /**
     * Verify a password against a hash
     */
    verifyPassword: (password: string, hash: string, salt: string): boolean => {
        const computed = crypto.scryptSync(password, salt, 64).toString("hex");
        return computed === hash;
    },

    // =========================================================================
    // CHECKSUM
    // =========================================================================

    /**
     * Calculate CRC32 checksum
     */
    crc32: (data: string): number => {
        const buffer = Buffer.from(data, "utf8");
        let crc = 0 ^ (-1);
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc >>> 8) ^ crc32Table[(crc ^ buffer[i]) & 0xFF];
        }
        return (crc ^ (-1)) >>> 0;
    },

    /**
     * Calculate Adler32 checksum
     */
    adler32: (data: string): number => {
        const buffer = Buffer.from(data, "utf8");
        let a = 1, b = 0;
        for (let i = 0; i < buffer.length; i++) {
            a = (a + buffer[i]) % 65521;
            b = (b + a) % 65521;
        }
        return ((b << 16) | a) >>> 0;
    },
};

// CRC32 lookup table
const crc32Table: number[] = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crc32Table[n] = c;
  }
