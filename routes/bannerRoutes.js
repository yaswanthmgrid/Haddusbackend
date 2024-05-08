const express = require("express");
const router = express.Router();
const bannerController = require("../Controllers/bannerContoller");
const { upload } = require("../Controllers/bannerContoller");

router.post("/banner", upload.single("photo"), bannerController.createBanner);

router.get("/banner", bannerController.getAllBanners);

router.delete("/banner/:id", bannerController.deleteBanner);

module.exports = router;
