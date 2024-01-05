# pg-password-util

[![NPM](https://nodei.co/npm/pg-query-exec.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/pg-query-exec/)

# Overview
Utility library for password encoding for PostgreSQL.

This solves the problem of plaintext passwords appearing in server logs by replacing:

```sql
ALTER USER app PASSWORD 'Super Duper Secret!'
```

With the password encoded client side:

```sql
ALTER USER app PASSWORD 'SCRAM-SHA-256$4096:M1A3zTFR9TzaX5NuvytilQ==$TZtMCtrZ8wkkZVkS7vursem77PsBqthl8GqkPohscJw=:POfEEJ9BOrm6upeAFKU3awWqMg+kKYXyPOG5E5tuhJc='
```

That hashed value does not contain the plaintext of the password and matches how the PostgreSQL stores the value in `pg_shadow`.

* [Install](#install)
* [Usage](#usage)
* [Features](#features)
* [Building and Testing](#building-and-testing)
* [License](#license)

# Install

    $ npm install pg-password-util

# Dependencies

The only direct dependency is [`pg-format`](https://www.npmjs.com/package/pg-format) used to escape literals and identifiers.

The ALTER USER helpers accept a `client` argument that must provide the same signature as `pg.Client` (i.e. the client from the [`pg`](https://www.npmjs.com/package/pg) node-postgres driver). It's not a direct dependency of this module though.

# Features
* Encoding passwords using SCRAM-SHA-256 (recommended)
* Encoding passwords using md5 (for legacy systems)
* Generating SQL to change a user's password
* Inferring the password_encryption from the target database

# Usage
## Generate SQL for an ALTER USER to change a password

```typescript
import { genAlterUserPasswordSql } = require('pg-password-util');

const sql = genAlterUserPasswordSql({
    username: 'app',
    password: 'my-new-secret-password',
    passwordEncryption: 'scram-sha-256',
});
```

## Generate encoded password for use in a custom CREATE USER statement

```typescript
import { encodeScramSha256 } = require('pg-password-util');
import * as pgFormat from 'pg-format';

const encodedPassword = encodeScramSha256({
    password: 'my-new-secret-password',
    iterations: 10000,
});
const sql = pgFormat('CREATE USER app PASSWORD %L LOGIN', encodedPassword);
```

## Change a user's password

```typescript
import { alterUserPassword } = require('pg-password-util');

// client is a pg.Client
await alterUserPassword(client, {
    username: 'app',
    password: 'my-new-secret-password',
});
```

# Building and Testing
To build the module run:

    $ make

Testing requires a PostgreSQL database. You can start one in the foreground via:

    $ bin/postgres-server

Then, to run the tests run:

    $ make test

# License
ISC. See the file [LICENSE](LICENSE).
