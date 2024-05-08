const express = require("express");
const orderController = require("../Controllers/orderController");
const router = express.Router();

router.post(
  "/order/createorder/:userId",

  orderController.createOrder
);
router.post(
  "/order/createfeedback/:userId/:orderId",
  orderController.orderfeedback
);
router.get("/orders/Allorders", orderController.getOrders);

router.get("/orders/getorderDetails/:orderId", orderController.orderDetail);
router.get("/orders/UserOrders/:userId", orderController.UserOrders);
router.get("/orders/search/:searchQuery", orderController.searchOrders);
router.get("/orders/byStatus/:status", orderController.getOrdersByStatus);
router.get("/orders/getallfeedbacks", orderController.userfeedbacks);
router.get("/Dashboard/Details", orderController.orderDashboard);

router.patch(
  "/orders/updatestatus/:orderId",
  orderController.orderStatusUpdate
);
module.exports = router;
