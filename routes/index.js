const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');

function check(condition, message, status = 400) {
    if (!condition) throw Object.assign(new Error(message), { status });
}

function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value) {
    return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function text(value, field, required = false) {
    check(typeof value === 'string' && (!required || value.trim().length > 0), `${field} must be a${required ? ' nonempty' : ''} string.`);
    return required ? value.trim() : value;
}

function json(query, key, fallback) {
    if (query[key] === undefined) return fallback;
    check(typeof query[key] === 'string', `${key} must be JSON.`);
    try { return JSON.parse(query[key]); }
    catch { check(false, `${key} must be valid JSON.`); }
}

function fields(query, key, fallback = {}) {
    const value = json(query, key, fallback);
    check(object(value), `${key} must be a JSON object.`);
    if (key !== 'where') {
        const allowed = key === 'sort' ? [1, -1] : [0, 1];
        check(Object.values(value).every(v => allowed.includes(v)), `Invalid ${key} values.`);
    }
    return value;
}

async function existing(Model, value, session) {
    check(id(value), 'Resource not found.', 404);
    const doc = await Model.findById(value).session(session || null);
    check(doc, 'Resource not found.', 404);
    return doc;
}

function body(req, isUser) {
    check(object(req.body), 'A request body object is required.');
    const b = { ...req.body };
    // Form bodies encode arrays and booleans as strings; JSON bodies keep strict types.
    if (req.is('application/x-www-form-urlencoded')) {
        if (typeof b.pendingTasks === 'string') {
            try { b.pendingTasks = JSON.parse(b.pendingTasks); }
            catch { check(false, 'pendingTasks must be a list of task ids.'); }
        }
        if (b.completed === 'true' || b.completed === 'false') b.completed = b.completed === 'true';
    }
    const data = { name: text(b.name, 'name', true) };
    if (isUser) {
        data.email = text(b.email, 'email', true);
        const pending = b.pendingTasks === undefined ? [] : b.pendingTasks;
        check(Array.isArray(pending) && pending.every(id), 'pendingTasks must be a list of valid task ids.');
        data.pendingTasks = [...new Set(pending.map(v => v.toLowerCase()))];
    } else {
        check((typeof b.deadline === 'string' && b.deadline.trim() !== '') || typeof b.deadline === 'number', 'A valid deadline is required.');
        data.deadline = new Date(b.deadline);
        check(Number.isFinite(data.deadline.getTime()), 'A valid deadline is required.');
        data.description = text(b.description === undefined ? '' : b.description, 'description');
        data.completed = b.completed === undefined ? false : b.completed;
        check(typeof data.completed === 'boolean', 'completed must be a boolean.');
        data.assignedUser = b.assignedUser === undefined ? '' : b.assignedUser;
        check(data.assignedUser === '' || id(data.assignedUser), 'assignedUser must be a valid user id or an empty string.');
        data.assignedUser = data.assignedUser.toLowerCase();
        if (b.assignedUserName !== undefined) text(b.assignedUserName, 'assignedUserName');
        data.assignedUserName = b.assignedUserName;
    }
    return data;
}

async function saveUser(doc, data, session) {
    const options = { session };
    check(!await User.exists({ email: data.email, _id: { $ne: doc._id } }).session(session), 'Email is already in use.');
    const tasks = await Task.find({ _id: { $in: data.pendingTasks } }).session(session);
    check(tasks.length === data.pendingTasks.length, 'A referenced task does not exist.', 404);
    check(tasks.every(t => !t.completed), 'Completed tasks cannot be in pendingTasks.');
    doc.set(data);
    await doc.save(options);
    // Removed pending tasks become unassigned; completed tasks keep their assignment.
    await Task.updateMany({ assignedUser: doc.id, completed: false, _id: { $nin: data.pendingTasks } }, {
        $set: { assignedUser: '', assignedUserName: 'unassigned' }
    }, options);
    await User.updateMany({ _id: { $ne: doc._id }, pendingTasks: { $in: data.pendingTasks } }, {
        $pull: { pendingTasks: { $in: data.pendingTasks } }
    }, options);
    await Task.updateMany({ _id: { $in: data.pendingTasks } }, {
        $set: { assignedUser: doc.id, assignedUserName: doc.name }
    }, options);
    await Task.updateMany({ assignedUser: doc.id }, { $set: { assignedUserName: doc.name } }, options);
    return doc;
}

async function saveTask(doc, data, session) {
    const options = { session };
    if (data.assignedUser) {
        const user = await existing(User, data.assignedUser, session);
        check(data.assignedUserName === undefined || data.assignedUserName === user.name, 'assignedUserName does not match the assigned user.');
        data.assignedUserName = user.name;
    } else data.assignedUserName = 'unassigned';
    doc.set(data);
    await doc.save(options);
    // A real user write prevents completed-task assignments racing a rename/delete.
    if (doc.assignedUser) {
        await User.updateOne({ _id: doc.assignedUser }, { $inc: { __v: 1 } }, options);
    }
    await User.updateMany({ pendingTasks: doc.id }, { $pull: { pendingTasks: doc.id } }, options);
    if (doc.assignedUser && !doc.completed) {
        await User.updateOne({ _id: doc.assignedUser }, { $addToSet: { pendingTasks: doc.id } }, options);
    }
    return doc;
}

router.get('/', (req, res) => res.json({ message: 'OK', data: { service: 'MP3 task API' } }));

for (const [path, Model, isUser] of [['users', User, true], ['tasks', Task, false]]) {
    router.get(`/${path}`, async (req, res) => {
        const where = fields(req.query, 'where');
        const sort = fields(req.query, 'sort');
        const select = fields(req.query, 'select');
        const skip = json(req.query, 'skip', 0);
        const limit = json(req.query, 'limit', isUser ? 0 : 100);
        const count = json(req.query, 'count', false);
        check(Number.isSafeInteger(skip) && skip >= 0, 'skip must be a nonnegative integer.');
        check(Number.isSafeInteger(limit) && limit >= 0, 'limit must be a nonnegative integer.');
        check(typeof count === 'boolean', 'count must be a boolean.');
        const query = count ? Model.countDocuments(where) : Model.find(where).sort(sort).select(select).skip(skip).limit(limit);
        try { query.cast(Model); }
        catch { check(false, 'Invalid filter values.'); }
        const data = await query;
        res.json({ message: 'OK', data });
    });

    router.get(`/${path}/:id`, async (req, res) => {
        await existing(Model, req.params.id);
        const data = await Model.findById(req.params.id).select(fields(req.query, 'select'));
        check(data, 'Resource not found.', 404);
        res.json({ message: 'OK', data });
    });

    for (const method of ['post', 'put']) {
        router[method](`/${path}${method === 'put' ? '/:id' : ''}`, async (req, res, next) => {
            // URL-id errors take precedence even when the request body is malformed JSON.
            if (method === 'put') await existing(Model, req.params.id);
            next();
        }, express.urlencoded({ extended: true }), express.json(), async (req, res) => {
            const data = await mongoose.connection.transaction(async session => {
                const doc = method === 'put' ? await existing(Model, req.params.id, session) : new Model();
                const values = body(req, isUser);
                return isUser ? saveUser(doc, values, session) : saveTask(doc, values, session);
            });
            res.status(method === 'post' ? 201 : 200).json({ message: method === 'post' ? 'Created' : 'OK', data });
        });
    }

    router.delete(`/${path}/:id`, async (req, res) => {
        await mongoose.connection.transaction(async session => {
            const doc = await existing(Model, req.params.id, session);
            if (isUser) {
                await Task.updateMany({ assignedUser: doc.id }, {
                    $set: { assignedUser: '', assignedUserName: 'unassigned' }
                }, { session });
            } else {
                await User.updateMany({ pendingTasks: doc.id }, { $pull: { pendingTasks: doc.id } }, { session });
            }
            await doc.deleteOne({ session });
        });
        res.status(204).end();
    });
}

module.exports = router;
