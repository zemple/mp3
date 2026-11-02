require('dotenv').config({ quiet: true });
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');
const Task = require('./models/task');
const app = express();

app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
    res.set('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});
app.use('/api', require('./routes'));
app.use((req, res) => res.status(404).json({ message: 'Resource not found.', data: null }));
app.use((err, req, res, next) => {
    let status = 500, message = 'An unexpected server error occurred.';
    if (err.code === 11000) { status = 400; message = 'Email is already in use.'; }
    else if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' ||
        ['CastError', 'ValidationError', 'StrictModeError'].includes(err.name) ||
        (err.name === 'MongoServerError' && [2, 9, 14, 168, 31253, 31254].includes(err.code))) {
        status = 400; message = 'Invalid request values or query parameters.';
    }
    else if (err.status === 400 || err.status === 404) { status = err.status; message = err.message; }
    res.status(status).json({ message, data: null });
});

async function start() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI);
    // Build the unique email index before accepting requests.
    await User.init();
    await Task.init();
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server running on port ${port}`));
}

start().catch(() => {
    console.error('Startup failed. Check MONGODB_URI, database credentials and Atlas network access.');
    process.exit(1);
});
