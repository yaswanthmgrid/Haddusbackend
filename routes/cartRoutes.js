const cartController = require("../Controllers/cartController");

const express = require("express");
const router = express.Router();

router.post("/cart/addItem/:userId", cartController.addItemToCart);
router.get("/cart/:userId", cartController.getCart);

// To update the quantity of an item
router.patch(
  "/cart/:userId/updateProductQuantity",
  cartController.updateProductQuantityInCart
);

//Update the product
router.patch("/cartupdateproduct/:userId", cartController.updateProductInCart);

//  delete add-on from product
router.delete(
  "/cart/:userId/deleteAddOn",
  cartController.deleteAddOnFromProductInCart
);
// delete the product
router.delete("/cart/deleteItem/:userId", cartController.deleteItemFromCart);

module.exports = router;
