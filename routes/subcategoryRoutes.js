const express = require("express");
const subcategoryController = require("../Controllers/subCategoryController");

const { upload } = require("../Controllers/subCategoryController");

const router = express.Router();

router.post(
  "/subcategories",
  upload.single("photo"),
  subcategoryController.createSubcat
);
router.get("/subcategories/:id", subcategoryController.getAllSubcat);
router.get(
  "/subcategories/byname/:name",
  subcategoryController.getSubcatByName
);
router.get(
  "/subcategories/bycategory/:category/:id",
  subcategoryController.getSubcategorybyCategory
);
router.get(
  "/subcategories/SearchbyName/:name",
  subcategoryController.SearchSubcategory
);

router.patch(
  "/updateSubcategoryStatus/:subcategoryname",
  subcategoryController.updateSubcategoryStatus
);

router.patch(
  "/subcategories/updatesubcategory/:subcategoryId",
  upload.single("photo"),
  subcategoryController.updateSubcat
);

module.exports = router;
