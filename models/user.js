const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    pendingTasks: { type: [String], default: [] }
}, { timestamps: { createdAt: 'dateCreated', updatedAt: false } });

// Use Mongoose's internal version for assignment locks, without exposing it in the API.
schema.set('toJSON', { transform: (doc, value) => { delete value.__v; } });
module.exports = mongoose.model('User', schema);
