const express = require("express");
const couponController = require("../Controllers/couponController");
const router = express.Router();

router.post("/coupon/createCoupon", couponController.createCoupon);
router.post(
  "/coupon/ApplyCoupon/:userId",

  couponController.applyCoupon
);
router.post(
  "/coupon/RemoveCoupon/:userId",

  couponController.removeCoupon
);

router.get(
  "/coupon/getallCoupons/:id",

  couponController.getallCoupons
);
router.patch(
  "/coupon/updatecoupon/:CouponId",

  couponController.updateCoupon
);
router.patch(
  "/couponupdatestatus/:couponId",

  couponController.updateCouponstatus
);

module.exports = router;
