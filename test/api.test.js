const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongo, server, base;
const deadline = '2026-11-03T12:00:00.000Z';
const missing = '000000000000000000000001';

before(async () => {
    mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 }, instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }]
    });
    await mongoose.connect(mongo.getUri('mp3_test'));
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    base = `http://127.0.0.1:${port}/api`;
    server = spawn(process.execPath, ['server.js'], {
        cwd: require('node:path').resolve(__dirname, '..'),
        env: { ...process.env, PORT: String(port), MONGODB_URI: mongo.getUri('mp3_test') },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('API startup timed out')), 15000);
        server.stdout.on('data', chunk => {
            if (chunk.toString().includes('Server running')) { clearTimeout(timeout); resolve(); }
        });
        server.once('exit', code => { clearTimeout(timeout); reject(new Error(`API exited: ${code}`)); });
        server.stderr.on('data', chunk => process.stderr.write(chunk));
    });
}, { timeout: 180000 });

after(async () => {
    if (server && server.exitCode === null) {
        const exited = new Promise(resolve => server.once('exit', resolve));
        server.kill();
        await exited;
    }
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
});
beforeEach(async () => {
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('tasks').deleteMany({});
});

async function call(method, path, body, status = 200, headers = {}) {
    const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    if (status === 204) { assert.equal(text, ''); return; }
    const result = JSON.parse(text);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length);
    assert.ok(Object.hasOwn(result, 'data'));
    assert.doesNotMatch(result.message, /Mongo|Mongoose|CastError|E11000|stack/i);
    return result.data;
}
const get = path => call('GET', path);
const user = (name = 'Alice', extra = {}) => call('POST', '/users', { name, email: `${name}@example.com`, ...extra }, 201);
const task = (extra = {}) => call('POST', '/tasks', { name: 'Homework', deadline, ...extra }, 201);
const query = (path, values) => path + '?' + new URLSearchParams(Object.entries(values).map(([k, v]) => [k, JSON.stringify(v)]));

test('an occupied port exits with an error instead of reporting startup success', async () => {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: require('node:path').resolve(__dirname, '..'),
        env: { ...process.env, PORT: new URL(base).port, MONGODB_URI: mongo.getUri('mp3_test') },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise(resolve => {
        const timer = setTimeout(() => child.kill(), 5000);
        child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(code, 1);
    assert.doesNotMatch(stdout, /Server running/);
    assert.match(stderr, /port/i);
});

test('creates users and tasks with defaults and server-owned creation dates', async () => {
    const u = await user('Alice', { dateCreated: '2000-01-01', _id: missing });
    assert.deepEqual(u.pendingTasks, []);
    assert.notEqual(u._id, missing);
    assert.ok(Date.now() - Date.parse(u.dateCreated) < 10000);
    const t = await task({ dateCreated: '2000-01-01' });
    assert.equal(t.description, '');
    assert.equal(t.completed, false);
    assert.equal(t.assignedUser, '');
    assert.equal(t.assignedUserName, 'unassigned');
    assert.equal(t.deadline, deadline);
    assert.ok(Date.now() - Date.parse(t.dateCreated) < 10000);
});

test('validates required fields, types and unique emails on POST and PUT', async () => {
    const u = await user();
    const t = await task();
    const cases = [
        ['/users', {}], ['/users', { name: '', email: 'a@b.com' }],
        ['/users', { name: 'A' }], ['/users', { name: 4, email: 'a@b.com' }],
        ['/users', { name: 'A', email: ['a@b.com'] }],
        ['/users', { name: 'A', email: 'a@b.com', pendingTasks: 'oops' }],
        ['/users', { name: 'A', email: 'a@b.com', pendingTasks: [5] }],
        ['/tasks', {}], ['/tasks', { name: 'A' }],
        ['/tasks', { name: 'A', deadline: 'invalid' }],
        ['/tasks', { name: 'A', deadline: null }],
        ['/tasks', { name: 'A', deadline: [] }],
        ['/tasks', { name: 'A', deadline, completed: 'false' }],
        ['/tasks', { name: 'A', deadline, description: 7 }],
        ['/tasks', { name: 'A', deadline, assignedUser: {} }],
        ['/tasks', { name: 'A', deadline, assignedUserName: false }]
    ];
    for (const [path, body] of cases) {
        await call('POST', path, body, 400);
        await call('PUT', `${path}/${path === '/users' ? u._id : t._id}`, body, 400);
    }
    const b = await user('Bob');
    await call('POST', '/users', { name: 'A', email: u.email }, 400);
    await call('PUT', `/users/${b._id}`, { name: 'B', email: u.email }, 400);
    await call('PUT', `/users/${u._id}`, { name: 'A', email: u.email });
    assert.equal((await get('/users')).length, 2);
    assert.equal((await get('/tasks')).length, 1);
});

test('returns 404 for missing URL resources before checking PUT body or select', async () => {
    for (const resource of ['users', 'tasks']) {
        for (const id of ['invalid-id', missing]) {
            await call('GET', `/${resource}/${id}`, undefined, 404);
            await call('PUT', `/${resource}/${id}`, {}, 404);
            await call('PUT', `/${resource}/${id}`, '{broken', 404);
            await call('DELETE', `/${resource}/${id}`, undefined, 404);
            await call('GET', `/${resource}/${id}?select=broken`, undefined, 404);
        }
    }
});

test('distinguishes malformed and nonexistent references without changing data', async () => {
    const u = await user();
    const t = await task({ assignedUser: u._id });
    for (const [id, status] of [['bad', 400], [missing, 404]]) {
        await call('POST', '/tasks', { name: 'A', deadline, assignedUser: id }, status);
        await call('POST', '/users', { name: 'B', email: 'b@b.com', pendingTasks: [id] }, status);
        await call('PUT', `/tasks/${t._id}`, { name: 'A', deadline, assignedUser: id }, status);
        await call('PUT', `/users/${u._id}`, { name: 'B', email: u.email, pendingTasks: [id] }, status);
    }
    await call('PUT', `/tasks/${t._id}`, { name: 'A', deadline, assignedUser: u._id, assignedUserName: 'Wrong' }, 400);
    assert.deepEqual(await get(`/tasks/${t._id}`), t);
    assert.deepEqual((await get(`/users/${u._id}`)).pendingTasks, [t._id]);
    assert.equal((await get('/users')).length, 1);
    assert.equal((await get('/tasks')).length, 1);
});

test('task assignment, movement, completion and reopening update both users', async () => {
    const a = await user(), b = await user('Bob');
    const t = await task({ assignedUser: a._id });
    assert.equal(t.assignedUserName, 'Alice');
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, [t._id]);
    const moved = await call('PUT', `/tasks/${t._id}`, { name: 'Moved', deadline, assignedUser: b._id });
    assert.equal(moved.assignedUserName, 'Bob');
    assert.equal(moved.dateCreated, t.dateCreated);
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, []);
    assert.deepEqual((await get(`/users/${b._id}`)).pendingTasks, [t._id]);
    const done = await call('PUT', `/tasks/${t._id}`, { name: 'Done', deadline, completed: true, assignedUser: b._id });
    assert.equal(done.assignedUser, b._id);
    assert.deepEqual((await get(`/users/${b._id}`)).pendingTasks, []);
    await call('PUT', `/tasks/${t._id}`, { name: 'Done', deadline, completed: true, assignedUser: a._id });
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, []);
    await call('PUT', `/tasks/${t._id}`, { name: 'Reopen', deadline, assignedUser: a._id });
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, [t._id]);
    const cleared = await call('PUT', `/tasks/${t._id}`, { name: 'Clear', deadline, dateCreated: '2000-01-01' });
    assert.equal(cleared.assignedUser, '');
    assert.equal(cleared.assignedUserName, 'unassigned');
    assert.equal(cleared.description, '');
    assert.equal(cleared.completed, false);
    assert.equal(cleared.dateCreated, t.dateCreated);
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, []);
});

test('user replacement moves pending tasks and renames even completed tasks', async () => {
    const a = await user(), b = await user('Bob');
    const old = await task({ assignedUser: a._id });
    const done = await task({ completed: true, assignedUser: a._id });
    const incoming = await task({ assignedUser: b._id });
    const changed = await call('PUT', `/users/${a._id}`, {
        name: 'Alicia', email: a.email, pendingTasks: [incoming._id], dateCreated: '2000-01-01'
    });
    assert.equal(changed.dateCreated, a.dateCreated);
    assert.deepEqual(changed.pendingTasks, [incoming._id]);
    assert.deepEqual((await get(`/users/${b._id}`)).pendingTasks, []);
    assert.equal((await get(`/tasks/${old._id}`)).assignedUser, '');
    assert.equal((await get(`/tasks/${old._id}`)).assignedUserName, 'unassigned');
    for (const id of [incoming._id, done._id]) {
        const t = await get(`/tasks/${id}`);
        assert.equal(t.assignedUser, a._id);
        assert.equal(t.assignedUserName, 'Alicia');
    }
    await call('PUT', `/users/${a._id}`, { name: 'A', email: a.email });
    assert.equal((await get(`/tasks/${incoming._id}`)).assignedUser, '');
    assert.equal((await get(`/tasks/${done._id}`)).assignedUser, a._id);
});

test('POST user can take existing pending tasks; completed tasks are rejected atomically', async () => {
    const a = await user();
    const t = await task({ assignedUser: a._id });
    const b = await user('Bob', { pendingTasks: [t._id, t._id.toUpperCase()] });
    assert.deepEqual(b.pendingTasks, [t._id]);
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, []);
    assert.equal((await get(`/tasks/${t._id}`)).assignedUser, b._id);
    const done = await task({ completed: true, assignedUser: a._id });
    await call('POST', '/users', { name: 'C', email: 'c@c.com', pendingTasks: [t._id, done._id] }, 400);
    await call('PUT', `/users/${b._id}`, { name: 'C', email: b.email, pendingTasks: [done._id] }, 400);
    assert.deepEqual(await get(`/users/${b._id}`), b);
    assert.equal((await get(`/tasks/${t._id}`)).assignedUser, b._id);
    assert.deepEqual((await get(`/users/${a._id}`)).pendingTasks, []);
});

test('DELETE cleans references including completed tasks and returns 204 without a body', async () => {
    const u = await user();
    const pending = await task({ assignedUser: u._id });
    const done = await task({ assignedUser: u._id, completed: true });
    await call('DELETE', `/tasks/${pending._id}`, undefined, 204);
    assert.deepEqual((await get(`/users/${u._id}`)).pendingTasks, []);
    await call('GET', `/tasks/${pending._id}`, undefined, 404);
    const next = await task({ assignedUser: u._id });
    await call('DELETE', `/users/${u._id}`, undefined, 204);
    await call('GET', `/users/${u._id}`, undefined, 404);
    for (const id of [done._id, next._id]) {
        const t = await get(`/tasks/${id}`);
        assert.equal(t.assignedUser, '');
        assert.equal(t.assignedUserName, 'unassigned');
    }
});

test('combines filtering, sorting, projection and pagination in MongoDB', async () => {
    await task({ name: 'Z', completed: true });
    const b = await task({ name: 'B' });
    const a = await task({ name: 'A' });
    await task({ name: 'C' });
    const result = await get(query('/tasks', { where: { completed: false }, sort: { name: 1 }, skip: 1, limit: 1, select: { name: 1, _id: 0 } }));
    assert.deepEqual(result, [{ name: 'B' }]);
    assert.equal(await get(query('/tasks', { where: { completed: false }, count: true })), 3);
    assert.equal(await get(query('/tasks', { where: { name: 'Missing' }, count: true })), 0);
    assert.deepEqual(await get(query('/tasks', { where: { name: 'Missing' } })), []);
    const ids = await get(query('/tasks', { where: { _id: { $in: [a._id, b._id] } }, sort: { name: -1 } }));
    assert.deepEqual(ids.map(t => t.name), ['B', 'A']);
    await user('Z'); await user('A'); await user('M');
    assert.deepEqual(await get(query('/users', { sort: { name: 1 }, skip: 1, limit: 1, select: { name: 1, _id: 0 } })), [{ name: 'M' }]);
    assert.deepEqual(await get(query('/users', { where: { _id: missing } })), []);
});

test('select works on single resources and other parameters are ignored there', async () => {
    for (const [path, data] of [['/users', await user()], ['/tasks', await task()]]) {
        assert.deepEqual(await get(query(`${path}/${data._id}`, { select: { name: 1, _id: 0 } })), { name: data.name });
        assert.equal((await get(`${path}/${data._id}?where=bad&sort=bad&skip=bad&limit=bad&count=bad`))._id, data._id);
        await call('GET', `${path}/${data._id}?select=bad`, undefined, 400);
    }
});

test('rejects malformed queries and bodies with clean JSON errors', async () => {
    for (const key of ['where', 'sort', 'select', 'skip', 'limit', 'count']) {
        for (const resource of ['users', 'tasks']) {
            await call('GET', `/${resource}?${key}=bad`, undefined, 400);
        }
    }
    for (const values of [{ skip: -1 }, { limit: 1.5 }, { count: 'true' }, { where: [] }, { sort: 1 }, { select: { name: 2 } }]) {
        await call('GET', query('/tasks', values), undefined, 400);
    }
    await call('POST', '/users', '{broken', 400);
    await call('POST', '/users', [], 400);
    await call('GET', '/unknown', undefined, 404);
    await call('GET', query('/tasks', { where: { name: { $foo: 'x' } } }), undefined, 400);
});

test('defaults to 100 tasks and unlimited users, with limit=0 meaning unlimited', async () => {
    await mongoose.connection.collection('users').insertMany(Array.from({ length: 105 }, (_, i) => ({ name: `U${i}`, email: `${i}@x.com`, pendingTasks: [], dateCreated: new Date() })));
    await mongoose.connection.collection('tasks').insertMany(Array.from({ length: 105 }, (_, i) => ({ name: `T${i}`, deadline: new Date(deadline), completed: false, assignedUser: '', assignedUserName: 'unassigned', dateCreated: new Date() })));
    assert.equal((await get('/tasks')).length, 100);
    assert.equal((await get('/users')).length, 105);
    assert.equal((await get('/tasks?limit=0')).length, 105);
    assert.equal(await get('/tasks?count=true'), 105);
});

test('supports URL-encoded forms used by API clients', async () => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const u = await call('POST', '/users', 'name=Alice&email=alice%40example.com&pendingTasks=%5B%5D', 201, headers);
    const t = await call('POST', '/tasks', new URLSearchParams({ name: 'Form', deadline, assignedUser: u._id, completed: 'false' }).toString(), 201, headers);
    assert.equal(t.completed, false);
    assert.deepEqual((await get(`/users/${u._id}`)).pendingTasks, [t._id]);
});

test('concurrent assignments and duplicate emails preserve consistency', async () => {
    const a = await user(), b = await user('Bob');
    const t = await task();
    await Promise.all([a, b].map(u => call('PUT', `/tasks/${t._id}`, { name: 'Race', deadline, assignedUser: u._id })));
    const final = await get(`/tasks/${t._id}`);
    for (const u of [a, b]) {
        assert.deepEqual((await get(`/users/${u._id}`)).pendingTasks, final.assignedUser === u._id ? [t._id] : []);
    }
    const responses = await Promise.all([1, 2].map(() => fetch(base + '/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Same', email: 'same@x.com' })
    })));
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 400]);
});

test('database failures roll back partial writes and return safe 500 errors', async () => {
    const a = await user(), b = await user('Bob');
    const t = await task({ assignedUser: a._id });
    const snapshot = async () => ({ users: await get('/users?sort={"name":1}'), tasks: await get('/tasks?sort={"name":1}') });
    const original = await snapshot();
    const fail = command => mongoose.connection.db.admin().command({
        configureFailPoint: 'failCommand', mode: { times: 1 },
        data: { failCommands: [command], errorCode: 1 }
    });
    // Fail after the primary document was saved but before reference updates finish.
    for (const [method, path, body] of [
        ['POST', '/tasks', { name: 'New', deadline, assignedUser: a._id }],
        ['PUT', `/tasks/${t._id}`, { name: 'Moved', deadline, assignedUser: b._id }],
        ['POST', '/users', { name: 'New', email: 'new@x.com', pendingTasks: [t._id] }],
        ['PUT', `/users/${a._id}`, { name: 'Changed', email: a.email, pendingTasks: [] }]
    ]) {
        await fail('update');
        await call(method, path, body, 500);
        assert.deepEqual(await snapshot(), original);
    }
    // Fail the delete only after reference cleanup has been attempted.
    for (const path of [`/users/${a._id}`, `/tasks/${t._id}`]) {
        await fail('delete');
        await call('DELETE', path, undefined, 500);
        assert.deepEqual(await snapshot(), original);
    }
});

test('completed task creation cannot race user deletion or keep a stale user name', async () => {
    for (const action of ['delete', 'rename']) {
        const u = await user(action);
        const point = await mongoose.connection.db.admin().command({
            configureFailPoint: 'failCommand', mode: { times: 1 },
            data: { failCommands: ['insert'], blockConnection: true, blockTimeMS: 1000 }
        });
        const pending = fetch(base + '/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Race', deadline, assignedUser: u._id, completed: true })
        });
        await mongoose.connection.db.admin().command({ waitForFailPoint: 'failCommand', timesEntered: point.count + 1, maxTimeMS: 5000 });
        if (action === 'delete') await call('DELETE', `/users/${u._id}`, undefined, 204);
        else await call('PUT', `/users/${u._id}`, { name: 'Renamed', email: u.email });
        const response = await pending;
        if (action === 'delete') {
            assert.equal(response.status, 404);
            assert.equal(await get(query('/tasks', { where: { assignedUser: u._id }, count: true })), 0);
        } else {
            assert.equal(response.status, 201);
            assert.equal((await response.json()).data.assignedUserName, 'Renamed');
        }
    }
});
