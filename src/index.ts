import { randomBytes, createHash, createHmac, pbkdf2Sync } from 'crypto';
import { Client } from 'pg';
import * as pgFormat from 'pg-format';

function hmacSha256(key: Buffer | string, text: string | Buffer) {
    return createHmac('sha256', key).update(text).digest();
}

function sha256(text: string | Buffer) {
    return createHash('sha256').update(text).digest();
}

/**
 * Encode the password for md5 authentication.
 * This should only be used for legacy servers.
 */
export function encodeMd5(opts: {
    username: string;
    password: string;
}) {
    const { username, password } = opts;
    if (!username) {
        throw new Error('A username is required')
    }
    if (!password) {
        throw new Error('A non-empty password is required')
    }
    const hash = createHash('md5')
    hash.update(password);
    hash.update(username); // PostgreSQL uses the username as a salt
    return 'md5' + hash.digest('hex');
}

const DEFAULT_SCRAM_SALT_SIZE = 16;
const DFEAULT_SCRAM_ITERATIONS = 4096;

/**
 * Encode the password for SCRAM-SHA-256 authentication.
 * The iterations and salt are optional.
 * If not provided, the defaults will be used that match the defaults for the PostgreSQL server.
 */
export function encodeScramSha256(opts: {
    password: string;
    salt?: Buffer;
    iterations?: number;
}) {
    const salt = opts.salt || randomBytes(DEFAULT_SCRAM_SALT_SIZE);
    if (!Buffer.isBuffer(salt)) {
        throw new Error('salt must be a Buffer')
    }
    const iterations = opts.iterations || DFEAULT_SCRAM_ITERATIONS;
    if (!Number.isSafeInteger(iterations) || iterations <= 0) {
        throw new Error('iterations must be a positive integer: ' + iterations)
    }
    const { password } = opts;
    if (!password) {
        throw new Error('A non-empty password is required')
    }
    const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    const clientKey = hmacSha256(saltedPassword, 'Client Key');
    const storedKey = sha256(clientKey);
    const serverKey = hmacSha256(saltedPassword, 'Server Key');
    return [
        'SCRAM-SHA-256',
        '$' + iterations,
        ':' + salt.toString('base64'),
        '$' + storedKey.toString('base64'),
        ':' + serverKey.toString('base64')
    ].join('');
}

export type PasswordEncryptionType = 'md5' | 'scram-sha-256'

/**
 * Encode the password using the specified password encryption mechanism.
 * This function takes the username as once of it's options, but it is only used for the md5 mechanism.
 * @param opts Encoding options
 * @returns the encoded password as an unescaped string literal
 */
export function encodePassword(opts: {
    username: string
    password: string
    passwordEncryption: PasswordEncryptionType
}) {
    const {
        username,
        password,
        passwordEncryption,
    } = opts;
    switch (passwordEncryption as string) {
        case 'on':
        case 'off':
        case 'md5':
            return encodeMd5({
                username,
                password,
            });
        case 'scram-sha-256':
            return encodeScramSha256({
                password,
            });
    }
    throw new Error('Unhandled passwordEncryption: ' + passwordEncryption)
}

/**
 * Generate SQL for changing a user's password.
 * A specific passwordEncryption must be specified.
 * @returns a SQL statement that can be executed to update the user's password to the encoded value
 */
export function genAlterUserPasswordSql(opts: {
    username: string
    password: string
    passwordEncryption: string
}) {
    const {
        username,
        password,
        passwordEncryption,
    } = opts;
    const encodedPassword = encodePassword({
        username,
        password,
        passwordEncryption: passwordEncryption as PasswordEncryptionType,
    });
    return pgFormat('ALTER USER %I PASSWORD %L', username, encodedPassword)
}

/**
 * Use the provided DB client to change the user's password.
 * If the passwordEncryption is not specified, the database will be queried for the current password_encryption.
 */
export async function alterUserPassword(client: Client, opts: {
    username: string
    password: string
    passwordEncryption?: string | null
}) {
    let { passwordEncryption } = opts;
    if (!passwordEncryption) {
        // Unspecified so use the server default
        const result = await client.query('SHOW password_encryption');
        passwordEncryption = result.rows[0].password_encryption;
    }
    const {
        username,
        password,
    } = opts;
    const sql = genAlterUserPasswordSql({
        username,
        password,
        passwordEncryption,
    });
    await client.query(sql);
}
