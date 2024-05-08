const express = require("express");
const router = express.Router();

const discountController = require("../Controllers/discountController");

router.post("/discount/createDiscount", discountController.createDiscount);
router.get(
  "/discounts/getalldiscounts",

  discountController.getallDiscount
);

router.patch(
  "/updatediscount/byId/:discountId",
  discountController.updateDiscount
);

router.patch(
  "/updatediscount/byId/:discountId/:subcategoryid",
  discountController.updateSubcategoryDiscount
);

router.patch(
  "/updatestatus/discount/:discountCode",
  discountController.updateDiscountStatus
);

router.patch(
  "/updatesubcategorystatus/:discountId/:subcategoryid",
  discountController.updateSubcategoryStatus
);

module.exports = router;
