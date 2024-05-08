const express = require("express");
const adminController = require("../Controllers/adminController");
const router = express.Router();

router.post("/admin/createAdmin", adminController.CreateAdmin);
router.post("/adminAdminLogin", adminController.loginAdmin);
router.post("/admin/Forgetpassword/:email", adminController.forgotpassword);
router.post("/admin/logout", adminController.logout);

router.get("/admin/adminDetails", adminController.getAdmin);
router.patch(
  "/admin/updateadmin/:adminId",

  adminController.updateAdmin
);

module.exports = router;
