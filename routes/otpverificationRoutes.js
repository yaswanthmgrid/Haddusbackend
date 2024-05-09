const express = require("express");
const otp = require("../Middleware/otpVerification");
const router = express.Router();

router.post("/sendOtp/:email", otp.generateOTP);
router.post("/admin/sendOtp/:email", otp.AdmingenerateOTP);

router.post("/validateotp", otp.validateOTP);
module.exports = router;
