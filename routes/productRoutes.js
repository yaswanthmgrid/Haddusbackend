const express = require("express");
const productController = require("../Controllers/productController");
const { upload } = require("../Controllers/productController");

const router = express.Router();

router.post(
  "/products/addproduct",
  upload.single("photo"),

  productController.createProduct
);
router.get("/products", productController.getAllProducts);
router.get(
  "/products/byCategory/:category",

  productController.getProductsByCategory
);
router.get(
  "/products/bySubcategory/:subcategory/:id",

  productController.getProductsBySubcatgory
);
router.get(
  "/products/Search/:subcategory/:name",

  productController.SearchProducts
);

router.get(
  "/productsbyName/:name/:id",

  productController.getProductByName
);
router.get(
  "/products/byStatus/:active",

  productController.getProductsByStatus
);
router.get(
  "/products/types/:subcategory",

  productController.getProductType
);
router.get(
  "/products/:subcategory/:type/:id",

  productController.getProductsbyType
);

router.patch(
  "/products/updateproduct/:productId",
  upload.single("photo"),

  productController.updateProduct
);

router.patch(
  "/updateproductStatus/:productname",

  productController.updateproductstatus
);

//add-ons
router.post(
  "/productsaddon/:productId",

  productController.createAddon
);
router.patch(
  "/producteditAddOns/:productId/:index",

  productController.editAddon
);
router.patch(
  "/productupdateAddonStatus/:productId/:index",

  productController.updateAddonStatus
);

module.exports = router;
