'use strict';

const config = require('../config');
const { openDb } = require('./index');

const db = openDb(config.dbPath);
console.log(`[migrate] schema applied to ${config.dbPath}`);
db.close();
