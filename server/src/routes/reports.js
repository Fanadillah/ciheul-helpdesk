'use strict';

const express = require('express');
const { requireRole } = require('../middleware/auth');
const reports = require('../services/reports');

module.exports = function reportRoutes(db) {
  const router = express.Router();
  router.get('/summary', requireRole('supervisor', 'admin'), (req, res) => {
    res.json(reports.summary(db, req.query));
  });
  return router;
};
