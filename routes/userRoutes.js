const express = require("express");
const usersController = require("../Controllers/userController");
const { refreshAccessToken } = require("../Middleware/userAuth");
const router = express.Router();
router.use(express.json());
router.post("/user/refreshtoken", refreshAccessToken);
router.post("/createusers", usersController.createUser);
router.post("/users/login", usersController.loginUser);
router.post("/userForgetpassword/:email", usersController.forgotpassword);
router.post("/users/addaddress/:userId", usersController.addNewAddress);
router.get("/users", usersController.getUsers);
router.get("/users/:id", usersController.getUserById);
router.get("/users/phone/:userPhone", usersController.getUserByPhone);
router.get("/users/name/:name", usersController.getUserByName);
router.get("/users/email/:email", usersController.getUserByEmail);
router.get("/users/alladdress/:userId", usersController.getAllAddresses);

router.patch("/users/updateDetails/:userId", usersController.updateUser);

router.patch("/users/editaddress/:userId/:index", usersController.editAddress);

router.delete(
  "/users/deleteaddress/:userId/:index",
  usersController.deleteAddress
);

module.exports = router;
