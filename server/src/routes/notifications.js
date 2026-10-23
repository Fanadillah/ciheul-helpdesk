'use strict';

const express = require('express');
const notifications = require('../services/notifications');

module.exports = function notificationRoutes(db) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json({ notifications: notifications.listNotifications(db, req.user.id) });
  });
  router.post('/:id/read', (req, res) => {
    notifications.markRead(db, req.user.id, req.params.id);
    res.json({ ok: true });
  });
  return router;
};
