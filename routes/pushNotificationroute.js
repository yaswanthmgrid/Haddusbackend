const express = require("express");
const router = express.Router();
const pushNotificationController = require("../Controllers/notificationController");

// Route to send notification
router.post("/send-notification", pushNotificationController.pushNotificationController);

module.exports = router;
