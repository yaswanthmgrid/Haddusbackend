const express = require("express");
const deliveryChargesController = require("../Controllers/deliverychargeController");
const router = express.Router();

router.post(
  "/deliveryCharge/createcharge",

  deliveryChargesController.createDeliveryCharge
);
router.get(
  "/deliveryCharge/getAllcharge",

  deliveryChargesController.getDeliveryCharges
);

router.patch(
  "/deliverCharge/updatedeliverycharge/:deliveryId",

  deliveryChargesController.updateDeliveryCharge
);

module.exports = router;
