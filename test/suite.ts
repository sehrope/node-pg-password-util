import * as assert from 'assert';
import * as mocha from 'mocha';
import * as pg from 'pg'
import { URL } from 'url'
import { randomBytes } from 'crypto'
assert.strictEqual(mocha.name, mocha.name);
import {
    encodeMd5,
    encodeScramSha256,
    alterUserPassword,
    encodePassword,
} from '../src/index'

function getEnv(name: string, defaultValue: string | undefined = undefined) {
    let value = process.env[name];
    if (value === null || value === undefined) {
        value = defaultValue
    }
    if (value === undefined) {
        throw new Error('Missing required environment variable: ' + name);
    }
    return value;
}

const databaseUrl = getEnv('DATABASE_URL', 'postgresql://postgres:dbpass@127.0.0.1:5432/postgres')
async function withPostgreSuperUser<T>(task: (client: pg.Client) => T | Promise<T>) {
    const client = new pg.Client(databaseUrl);
    await client.connect();
    try {
        const result = await task(client);
        return result;
    } finally {
        client.end();
    }
}

function randomId() {
    return randomBytes(16).toString('hex');
}

function randomUsername() {
    return 'test_' + Date.now() + '_' + randomId();;
}

describe('the test environment', () => {
    it('should be able to connect to the test database', async () => {
        await withPostgreSuperUser(() => { });
    })
    it('should be able to create a datasbase user', async () => {
        await withPostgreSuperUser(async client => {
            const user = randomUsername();
            await client.query(`CREATE USER ${user} LOGIN`);
            await client.query(`DROP USER ${user}`);
        });
    })
})

async function assertValidUserCredentials(username: string, password: string) {
    const url = new URL(databaseUrl);
    url.username = username
    url.password = password
    const client = new pg.Client(url.toString());
    try {
        await client.connect();
        const result = await client.query('SELECT USER');
        const actualUsername = result.rows[0].user;
        assert.strictEqual(actualUsername, username, 'Username must match the credentials')
    } finally {
        client.end();
    }
}

async function assertInvalidUserCredentials(username: string, password: string, message?: string) {
    const url = new URL(databaseUrl);
    url.username = username
    url.password = password
    const client = new pg.Client(url.toString());
    try {
        await client.connect();
        assert.fail(message || 'Bad credentials must not be able to log in')
    } catch (_ignore) {
        // We expect to fail here
    } finally {
        client.end();
    }
}

async function testCreateUserAndLogin(opts: {
    username: string;
    password: string;
    encodedPassword: string;
    beforeTest?: (client: pg.Client) => void | Promise<void>;
    afterTest?: (client: pg.Client) => void | Promise<void>;
}) {
    const {
        username,
        password,
        encodedPassword,
        beforeTest,
        afterTest,
    } = opts;
    await withPostgreSuperUser(async client => {
        if (beforeTest) {
            await beforeTest(client)
        }
        await client.query(`CREATE USER ${username} WITH PASSWORD '${encodedPassword}' LOGIN`)
        try {
            await assertValidUserCredentials(username, password)
            await assertInvalidUserCredentials(username, 'BAD:' + password)

            const newPassword = randomId();
            await alterUserPassword(client, {
                username,
                password: newPassword,
            });

            await assertInvalidUserCredentials(username, password, 'Original credentials should no longer be able to log in')
            await assertValidUserCredentials(username, newPassword);
            await assertInvalidUserCredentials(username, 'BAD:' + newPassword);

            if (afterTest) {
                await afterTest(client)
            }
        } finally {
            await client.query(`DROP USER ${username}`).catch(ignore => { })
        }
    })
}

describe('pg-password-encoder', () => {
    it('should validate encodeMd5(...) args', async () => {
        assert.throws(() => {
            encodeMd5({
                username: '',
                password: 'dummy',
            })
        }, /A username is required/);
        assert.throws(() => {
            encodeMd5({
                username: 'dummy',
                password: '',
            })
        }, /A non-empty password is required/);
    })

    it('should validate encodeScramSha256(...) args', async () => {
        assert.throws(() => {
            encodeScramSha256({
                password: '',
            })
        }, /A non-empty password is required/);
        assert.throws(() => {
            encodeScramSha256({
                password: 'dummy',
                salt: 'not a buffer' as any as Buffer,
            })
        }, /salt must be a Buffer/);
        assert.throws(() => {
            encodeScramSha256({
                password: 'dummy',
                iterations: -1,
            })
        }, /iterations must be a positive integer:/);
    })

    it('should validate encodePassword(...) args', async () => {
        assert.throws(() => {
            encodePassword({
                username: 'dummy-user',
                password: 'dummy-pass',
                passwordEncryption: 'not-an-acceptable-value',
            })
        }, /Unhandled passwordEncryption/);
    });

    it('should treat legacy args to encodePassword(...) as md5', async () => {
        for (let passwordEncryption of ['on', 'off']) {
            const encoded = encodePassword({
                username: 'dummy-user',
                password: 'dummy-pass',
                passwordEncryption,
            });
            assert.ok(encoded.startsWith('md5'), 'encoded password for ' + passwordEncryption + ' must start with md5: ' + encoded)
        }
    })


    it('should encode md5 passwords', async () => {
        const username = randomUsername()
        const password = randomId()
        const encodedPassword = encodeMd5({ username, password })
        await testCreateUserAndLogin({
            username,
            password,
            encodedPassword,
        });
    })

    it('should encode scram passwords with default options', async () => {
        const username = randomUsername()
        const password = randomId()
        const encodedPassword = encodeScramSha256({ password })
        await testCreateUserAndLogin({
            username,
            password,
            encodedPassword,
        });
    })

    it('should encode scram passwords with custom options', async () => {
        const username = randomUsername()
        const password = randomId()
        const encodedPassword = encodeScramSha256({
            password,
            iterations: 1,
            salt: randomBytes(64),
        });
        assert.ok(encodedPassword.startsWith('SCRAM-SHA-256$1:'), 'encodedPassword should have custom iteration count: ' + encodedPassword);
        await testCreateUserAndLogin({
            username,
            password,
            encodedPassword,
        });
    })

    it('should encode md5 passwords when that is the server default', async () => {
        const username = randomUsername()
        const password = randomId()
        const encodedPassword = encodeMd5({ username, password })
        await testCreateUserAndLogin({
            username,
            password,
            encodedPassword,
            beforeTest: async client => {
                await client.query("SET password_encryption = 'md5'");
            },
        });
    })

    it('should encode SCRAM passwords when that is the server default', async () => {
        const username = randomUsername()
        const password = randomId()
        const encodedPassword = encodeMd5({ username, password })
        await testCreateUserAndLogin({
            username,
            password,
            encodedPassword,
            beforeTest: async client => {
                await client.query("SET password_encryption = 'scram-sha-256'");
            },
        });
    })
})
