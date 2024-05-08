const express = require("express");
const categoryController = require("../Controllers/categoryController");
const { upload } = require("../Controllers/categoryController");

const router = express.Router();

router.post(
  "/createcategories",
  upload.single("photo"),

  categoryController.createCategory
);
router.get("/categories/:id", categoryController.getAllCategories);
router.get(
  "/categories/:name",

  categoryController.getCategoryByName
);
router.get(
  "/categories/SearchbyName/:name",

  categoryController.SearchCategory
);
router.patch(
  "/categories/:categoryId",
  upload.single("photo"),

  categoryController.updateCategory
);

router.patch(
  "/updateCategoryStatus/:categoryname",

  categoryController.updateCategorytstatus
);

module.exports = router;
