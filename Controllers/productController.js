const productSchema = require("../Models/productModel");
const admin = require("firebase-admin");

const { app, adminApp } = require("../Db_firebase/firebase");
const multer = require("multer");

const {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} = require("firebase/storage");
const db = admin.firestore(adminApp);
const storage = getStorage(app);
const upload = multer({ storage: multer.memoryStorage() });

const createProduct = async (req, res) => {
  try {
    // Validate the request body using the productSchema
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res.status(200).send({ message: `${error.message}` });
    }

    // Destructure the required fields from the request body
    let { category, subcategory, name, price, Gst } = value;
    category = category.trim();
    subcategory = subcategory.trim();
    name = name.trim();

    const photo = req.file;
    if (req.file.size < 600 * 1024) {
      return res.status(200).json({ error: "Minimum Size must be 600 KB." });
    }
    const active = true;
    let addOns = value.addOns || []; // Ensure addOns is initialized correctly
    let type = null;
    if (category === "Restaurant") {
      type = value.type;
    }
    if (category === "Restaurant" && type === null) {
      return res
        .status(200)
        .send({ message: `Type is required for Restuaratn Category` });
    }
    // all required fields are present
    if (!category || !subcategory || !name || !price) {
      return res.status(200).send({
        message: `All fields   are required to create a new Product`,
      });
    }
    if (price < 0) {
      return res.status(200).send({});
    }
    // Validate GST value
    if (Gst < 0 || Gst > 100) {
      return res.status(200).send({
        message: `Please enter a valid GST percentage between 0 and 100`,
      });
    }

    //  if the category exists
    const categorySnapshot = await db
      .collection("categories")
      .where("name", "==", category)
      .get();
    if (categorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Category: ${category} not found` });
    }
    const categoryId = categorySnapshot.docs[0].id;

    // if the subcategory exists under the specified category
    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .where("name", "==", subcategory)
      .get();
    if (subcategorySnapshot.empty) {
      return res.status(200).send({
        message: `Subcategory: ${subcategory} does not exist under the category: ${category}`,
      });
    }
    const subcategoryId = subcategorySnapshot.docs[0].id;

    //if the product with the same name exists or not
    const productSnapshot = await db
      .collection("products")
      .where("name", "==", name)
      .get();
    if (!productSnapshot.empty) {
      return res.status(200).send({
        message: `Product with the name: ${name} already exists. Try again with a different name`,
      });
    }

    let taxedPrice = price;
    if (Gst > 0 && Gst <= 100) {
      taxedPrice = price * (1 + Gst / 100);
      taxedPrice = Math.ceil(taxedPrice);
    }

    // Create a document in the products collection
    const productRef = db.collection("products").doc();
    const productId = productRef.id;

    // Upload the product image to storage
    const storageRef = ref(storage, `Products/${productId}`);
    const metadata = { contentType: photo.mimetype };
    const snapshot = await uploadBytesResumable(
      storageRef,
      photo.buffer,
      metadata
    );
    const imageUrl = await getDownloadURL(snapshot.ref);

    let formattedAddOns = null;
    // Check if add-ons are provided
    if (addOns.length > 0) {
      formattedAddOns = [];
      // Upload add-on images to storage and get their URLs
      for (let i = 0; i < addOns.length; i++) {
        const addOn = addOns[i];
        if (!addOn.name || !addOn.price) {
          return res
            .status(200)
            .send({ message: `All fields are required for each add-on` });
        }
        formattedAddOns.push({
          name: addOn.name.trim(),
          price: addOn.price,
          active: true,
        });
      }
    }

    await productRef.set({
      productId: productId,
      category: db.doc(`/categories/${categoryId}`), // Reference to the category document
      subcategory: db.doc(`/subcategories/${subcategoryId}`), // Reference to the subcategory document
      name: name,
      photo: imageUrl,
      price: price,
      taxedPrice: taxedPrice, // Include the taxed price in the document
      type: type,
      active: active,
      addOns: formattedAddOns || null, // Set add-ons or null if no add-ons provided
      Discount: 0,
      DiscountPrice: 0,
      GST: Gst,
    });

    return res
      .status(201)
      .send({ message: "Product created successfully", id: productId });
  } catch (error) {
    console.error("Error creating product: " + error.message);
    return res.status(200).send("Error creating product: " + error.message);
  }
};

const getAllProducts = async (req, res) => {
  try {
    const querySnapshot = await db.collection("products").get();
    const productsPromises = [];

    querySnapshot.forEach(async (doc) => {
      const productId = doc.id;
      const productData = doc.data();
      const categoryRef = productData.category;
      const subcategoryRef = productData.subcategory;

      const categoryDocPromise = categoryRef.get();
      const subcategoryDocPromise = subcategoryRef.get();

      const addons = [];
      if (productData.addOns && Array.isArray(productData.addOns)) {
        productData.addOns.forEach((addon) => {
          addons.push({
            name: addon.name,
            price: addon.price,
          });
        });
      }

      const productPromise = Promise.all([
        categoryDocPromise,
        subcategoryDocPromise,
      ]).then(([categoryDoc, subcategoryDoc]) => {
        const categoryName = categoryDoc.data().name;
        const subcategoryName = subcategoryDoc.data().name;

        return {
          productId: productId,
          category: categoryName,
          subcategory: subcategoryName,
          name: productData.name,
          price: productData.price,
          type: productData.type || null,
          photo: productData.photo,
          addOns: addons,
          active: productData.active || false,
          Tax: productData.GST || 0,
          TaxedPrice: productData.taxedPrice,
          Discountprice: productData.DiscountPrice || null,
        };
      });

      productsPromises.push(productPromise);
    });

    const products = await Promise.all(productsPromises);

    if (products.length === 0) {
      res.status(200).send({ message: "No products found" });
    } else {
      res.status(200).send({ message: "All Products", products: products });
    }
  } catch (error) {
    res.status(200).send("Error getting products: " + error.message);
  }
};

const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    if (!category) {
      return res
        .status(200)
        .send({ message: `Category Value is missing,It is required` });
    }
    const categorySnapshot = await db
      .collection("categories")
      .where("name", "==", category)
      .get();

    if (categorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Category:${category} does not exists` });
    }
    const categoryId = categorySnapshot.docs[0].id;

    const productSnapshot = await db
      .collection("products")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .get();
    if (productSnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Products not found in ${category} category` });
    }

    const products = [];
    const promises = [];
    productSnapshot.forEach((doc) => {
      //this will get the doc of the subcateogry which has the reference and
      // will retrive the name of the doc of subcategory
      const subcategoryPromise = doc
        .data()
        .subcategory.get()
        .then((subcategoryDoc) => {
          const subcategoryName = subcategoryDoc.data().name;
          products.push({
            category: category,
            subcategory: subcategoryName,
            name: doc.data().name,
            price: doc.data().price,
            type: doc.data().type,
            photo: doc.data().photo,
            addOns: doc.data().addOns,
            active: doc.data().active,
          });
        });
      promises.push(subcategoryPromise);
    });
    await Promise.all(promises);

    res
      .status(200)
      .send({ message: `Products in ${category} category are:`, products });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Error getting the products: ${error.message}` });
  }
};

const getProductsBySubcatgory = async (req, res) => {
  try {
    const { subcategory, id } = req.params;

    const adminSnapshot = await db.collection("admins").doc(id).get();
    const isadmin = adminSnapshot.exists;
    if (!subcategory) {
      return res.status(200).send({ message: "Subcategory value is required" });
    }

    const subcategoryDoc = await db
      .collection("subcategories")
      .where("name", "==", subcategory)
      .get();

    if (subcategoryDoc.empty) {
      return res
        .status(200)
        .send({ message: `${subcategory} Subcategory not found` });
    }

    const subcategoryId = subcategoryDoc.docs[0].id;
    let productSnapshot;
    if (isadmin) {
      productSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategoryId}`))
        .get();
    } else {
      productSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategoryId}`))
        .where("active", "==", true)
        .get();
    }

    if (productSnapshot.empty) {
      return res.status(200).send({
        message: `Products not found in subcategory ${subcategory}`,
      });
    }

    const products = [];
    const promises = [];

    productSnapshot.forEach((doc) => {
      const productData = doc.data();
      const productid = doc.id;
      const categoryPromise = productData.category.get();
      const subcategoryPromise = productData.subcategory.get();

      promises.push(
        Promise.all([categoryPromise, subcategoryPromise]).then(
          ([categoryDoc, subcategoryDoc]) => {
            const categoryName = categoryDoc.data().name;

            // let taxedPrice = productData.price;
            // if (productData.GST && productData.GST > 0) {
            //   // Calculate Taxed Price
            //   taxedPrice *= 1 + productData.GST / 100;
            // }

            products.push({
              Id: productid,
              category: categoryName,
              subcategory: subcategory,
              name: productData.name,
              price: productData.price,
              photo: productData.photo,
              type: productData.type,
              addOns: productData.addOns || [],
              active: productData.active,
              Tax: productData.GST || 0,
              taxedPrice: productData.taxedPrice,
              Discountprice: productData.DiscountPrice,
            });
          }
        )
      );
    });

    await Promise.all(promises);

    res.status(200).send({
      message: `Products in ${subcategory} subcategory:`,
      products,
    });
  } catch (error) {
    res.status(200).send({
      message: `Error getting the products: ${error.message}`,
    });
  }
};

const SearchProducts = async (req, res) => {
  try {
    const { subcategory, name } = req.params;
    if (!name || !subcategory) {
      return res.status(200).send({ message: `name value is missing ` });
    }
    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("name", "==", subcategory)
      .get();

    if (subcategorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Subcategory:${subcategory} does not exists` });
    }
    const SubcategoryId = subcategorySnapshot.docs[0].id;

    const productSnapshot = await db
      .collection("products")
      .where("subcategory", "==", db.doc(`/subcategories/${SubcategoryId}`))
      .get();
    const products = [];
    const promises = [];

    productSnapshot.forEach((doc) => {
      const productData = doc.data();
      if (
        productData.name.toLowerCase().includes(name.toLowerCase()) ||
        productData.name == name
      ) {
        const categoryPromise = productData.category.get();
        const subcategoryPromise = productData.subcategory.get();
        promises.push(
          Promise.all([categoryPromise, subcategoryPromise]).then(
            ([categoryDoc, subcategoryDoc]) => {
              const categoryName = categoryDoc.data().name;
              const subcategoryName = subcategoryDoc.data().name;
              products.push({
                category: categoryName,
                subcategory: subcategoryName,
                name: productData.name,
                price: productData.price,
                photo: productData.photo,
                type: productData.type,

                active: productData.active,
              });
            }
          )
        );
      }
    });
    await Promise.all(promises);

    res.status(200).send({ message: `Products :`, products });
  } catch (error) {
    res.status(200).send({ message: `Error getting product:${error.message}` });
  }
};

const getProductByName = async (req, res) => {
  try {
    const { name, id } = req.params;
    if (!name) {
      return res.status(200).send({ message: `Name value is missing` });
    }

    const productQuery = await db
      .collection("products")
      .where("name", "==", name)
      .get();

    const adminSnapshot = await db.collection("admins").doc(id).get();
    const isadmin = adminSnapshot.exists;

    if (productQuery.empty) {
      return res.status(200).send({ message: "Product not found" });
    }

    const products = [];
    const promises = [];

    productQuery.forEach((doc) => {
      const productData = doc.data();
      const productId = doc.id;
      const categoryPromise = productData.category.get();
      const subcategoryPromise = productData.subcategory.get();
      const addOnsArray = Object.values(productData.addOns || {});
      promises.push(
        Promise.all([categoryPromise, subcategoryPromise]).then(
          ([categoryDoc, subcategoryDoc]) => {
            const categoryName = categoryDoc.data().name;
            const subcategoryName = subcategoryDoc.data().name;

            // let taxedPrice = productData.price;
            // if (productData.GST && productData.GST > 0) {
            //   // Calculate Taxed Price
            //   taxedPrice *= 1 + productData.GST / 100;
            // }

            products.push({
              id: productId,
              category: categoryName,
              subcategory: subcategoryName,
              name: productData.name,
              price: productData.price,
              photo: productData.photo,
              addOns: addOnsArray,
              type: productData.type,
              active: productData.active,
              Discount: productData.Discount || 0,
              Discountprice: productData.DiscountPrice,
              taxedPrice: productData.taxedPrice,
            });
          }
        )
      );
    });

    await Promise.all(promises);

    res.status(200).send({ message: "Products:", products });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Error getting product by name: ${error.message}` });
  }
};

const getProductsByStatus = async (req, res) => {
  try {
    const { active } = req.params;
    if (!active) {
      return res.status(200).send({ message: `status value is missing ` });
    }
    const activeBoolean = active === "true";

    const productSnapshot = await db
      .collection("products")
      .where("active", "==", activeBoolean)
      .get();
    if (productSnapshot.empty) {
      return res.status(200).send({ message: ` Product are not found` });
    }
    const products = [];
    const promises = [];

    productSnapshot.forEach((doc) => {
      const productData = doc.data();
      const categoryPromise = productData.category.get();
      const subcategoryPromise = productData.subcategory.get();
      promises.push(
        Promise.all([categoryPromise, subcategoryPromise]).then(
          ([categoryDoc, subcategoryDoc]) => {
            const categoryName = categoryDoc.data().name;
            const subcategoryName = subcategoryDoc.data().name;
            products.push({
              category: categoryName,
              subcategory: subcategoryName,
              name: productData.name,
              price: productData.price,
              photo: productData.photo,
              type: productData.type,
              active: productData.active,
            });
          }
        )
      );
    });
    await Promise.all(promises);

    res.status(200).send({ message: `Products :`, products });
  } catch (error) {
    res.status(200).send({ message: `Error getting product:${error.message}` });
  }
};

const getProductType = async (req, res) => {
  try {
    const { subcategory } = req.params;
    if (!subcategory) {
      return res.status(200).send({ message: "Subcategory value is missing" });
    }

    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("name", "==", subcategory)
      .get();

    if (subcategorySnapshot.empty) {
      return res.status(200).send({ message: "Subcategory not found" });
    }

    const subcategoryId = subcategorySnapshot.docs[0].id;

    const productsSnapshot = await db
      .collection("products")
      .where("subcategory", "==", db.doc(`/subcategories/${subcategoryId}`))
      .get();

    if (productsSnapshot.empty) {
      return res
        .status(200)
        .send({ message: "No products found for the specified subcategory" });
    }

    const productTypesSet = new Set();

    productsSnapshot.docs.forEach((doc) => {
      productTypesSet.add(doc.data().type);
    });

    const productTypes = Array.from(productTypesSet);

    res.status(200).send({
      message: "Product types for the specified subcategory",
      types: productTypes,
    });
  } catch (error) {
    console.error("Error getting product types: " + error.message);
    res.status(200).send("Error getting product types: " + error.message);
  }
};

const getProductsbyType = async (req, res) => {
  try {
    const { subcategory, type, id } = req.params;
    if (!subcategory || !type) {
      return res
        .status(200)
        .send({ message: "Subcategory and type are required" });
    }

    const adminSnapshot = await db.collection("admins").doc(id).get();
    const isadmin = adminSnapshot.exists;
    const subcategoryDoc = await db
      .collection("subcategories")
      .where("name", "==", subcategory)
      .get();
    if (subcategoryDoc.empty) {
      return res
        .status(200)
        .send({ message: `${subcategory} Subcategory not found` });
    }
    const subcategoryId = subcategoryDoc.docs[0].id;
    let productsSnapshot;
    if (isadmin) {
      productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategoryId}`))
        .where("type", "==", type)
        .get();
    } else {
      productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategoryId}`))
        .where("type", "==", type)
        .where("active", "==", true)
        .get();
    }

    const products = [];
    for (const doc of productsSnapshot.docs) {
      const productData = doc.data();
      const categoryDoc = await productData.category.get();
      const categoryName = categoryDoc.data().name;
      const subcategoryDoc = await productData.subcategory.get();
      const subcategoryName = subcategoryDoc.data().name;

      products.push({
        category: categoryName,
        subcategory: subcategoryName,
        name: productData.name,
        taxedprice: productData.taxedPrice,
        type: productData.type,
        photo: productData.photo,
        active: productData.active,
        discountprice: productData.DiscountPrice,
      });
    }

    if (products.length === 0) {
      return res.status(200).send({ message: "No products found" });
    } else {
      res.status(200).send({ message: "All Products", products: products });
    }
  } catch (error) {
    res.status(200).send("Error getting products: " + error.message);
  }
};

const updateProduct = async (req, res) => {
  try {
    // Validate the request body using the productSchema
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res.status(200).send({ message: `${error.message}` });
    }

    // Get productId from request params
    const { productId } = req.params;

    // Destructure the required fields from the request body
    let { category, subcategory, name, price, type, Gst } = value;
    category = category.trim();
    subcategory = subcategory.trim();
    name = name.trim();

    const photo = req.file;

    // Check if all required fields are present
    if (!category || !subcategory || !name || !price) {
      return res
        .status(200)
        .send({ message: "All fields are required to update a product" });
    }

    // Check if the product to update exists
    const productSnapshot = await db
      .collection("products")
      .doc(productId)
      .get();

    if (!productSnapshot.exists) {
      return res
        .status(200)
        .send({ message: `Product with ID ${productId} not found` });
    }

    // Extract existing product data
    const productData = productSnapshot.data();

    // Check if the category exists
    const categorySnapshot = await db
      .collection("categories")
      .where("name", "==", category)
      .get();
    if (categorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Category: ${category} not found` });
    }
    const categoryId = categorySnapshot.docs[0].id;

    // Check if the subcategory exists under the specified category
    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .where("name", "==", subcategory)
      .get();
    if (subcategorySnapshot.empty) {
      return res.status(200).send({
        message: `Subcategory: ${subcategory} not found under category: ${category}`,
      });
    }
    const subcategoryId = subcategorySnapshot.docs[0].id;

    // Check if any field actually needs updating
    const updateFields = {};
    if (category !== productData.category) {
      updateFields.category = db.doc(`/categories/${categoryId}`);
    }
    if (subcategory !== productData.subcategory) {
      updateFields.subcategory = db.doc(`/subcategories/${subcategoryId}`);
    }
    if (name !== productData.name) {
      updateFields.name = name;
    }
    if (price !== productData.price) {
      updateFields.price = price;
    }
    if (Gst !== productData.GST) {
      updateFields.GST = Gst;
    }
    if (category === "Restaurant" && type && type !== productData.type) {
      updateFields.type = type;
    } else if (category !== "Restaurant" && productData.type) {
      updateFields.type = null;
    }

    // Check if a new photo is provided
    let imageUrl = null;
    if (photo) {
      // Delete existing photo from storage
      if (productData.photo) {
        const storageRef = ref(storage, productData.photo);
        await deleteObject(storageRef);
      }

      // Upload the new photo
      const storageRef = ref(storage, `Products/${productId}`);
      const metadata = { contentType: photo.mimetype };
      const snapshot = await uploadBytesResumable(
        storageRef,
        photo.buffer,
        metadata
      );
      imageUrl = await getDownloadURL(snapshot.ref);
      updateFields.photo = imageUrl;
    }

    // Calculate Gsted price if Gst (GST) is provided
    if (typeof Gst === "number" && Gst > 0 && Gst <= 100) {
      let GstedPrice = price * (1 + Gst / 100);
      GstedPrice = Math.ceil(GstedPrice);
      updateFields.taxedPrice = GstedPrice;
    }

    // If there are fields to update, apply the update
    if (Object.keys(updateFields).length > 0) {
      await db.collection("products").doc(productId).update(updateFields);
    }

    return res.status(200).send({ message: "Product updated successfully" });
  } catch (error) {
    console.error("Error updating product: " + error.message);
    return res.status(200).send("Error updating product: " + error.message);
  }
};

const updateproductstatus = async (req, res) => {
  try {
    const { productname } = req.params;

    const productSnapshot = await db
      .collection("products")
      .where("name", "==", productname)
      .get();

    if (productSnapshot.empty) {
      return res
        .status(200)
        .send({ message: `${productname} product is not found` });
    }

    const productDoc = productSnapshot.docs[0]; // Get the document reference
    const productData = productDoc.data();

    // Retrieve the associated subcategory
    const subcategoryRef = productData.subcategory;
    const subcategoryDoc = await subcategoryRef.get();
    const subcategoryData = subcategoryDoc.data();

    // Check the subcategory status whether active or inactive
    if (!subcategoryData.active) {
      return res.status(200).send({
        message: `Subcategory '${subcategoryData.name}' is inactive. Cannot activate the product status.`,
      });
    }

    // Toggle the 'active' field
    const updatedActiveValue = !productData.active;

    // Update the 'active' field
    await productDoc.ref.update({ active: updatedActiveValue });

    return res.status(200).send({
      message: `Product '${productname}' status updated successfully `,
      updatedActiveValue,
    });
  } catch (error) {
    res.status(200).send({
      message: `Unable to update the product due to : ${error.message}`,
    });
  }
};

const createAddon = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, price } = req.body;

    // Check if the product ID is provided
    if (!productId) {
      return res.status(200).send({ message: "Product ID is required" });
    }

    // Check if the required fields for the add-on are provided
    if (!name || price === undefined) {
      return res.status(200).send({
        message: "Both name and price are required for the add-on",
      });
    }

    // Validate the price
    if (price <= 0) {
      return res
        .status(200)
        .send({ message: "Price must be greater than zero" });
    }

    // Fetch the product document
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();

    if (!productSnapshot.exists) {
      return res.status(200).send({ message: "Product not found" });
    }

    // Get the product data
    const productData = productSnapshot.data();
    const addOns = productData.addOns || [];

    // Check if the add-on name already exists within the product's add-ons
    const isNameDuplicate = addOns.some(
      (addOn) => addOn.name.toLowerCase() === name.toLowerCase()
    );

    if (isNameDuplicate) {
      return res
        .status(200)
        .send({ message: "An add-on with the same name already exists" });
    }

    // Create the new add-on
    await productRef.update({
      addOns: admin.firestore.FieldValue.arrayUnion({
        name,
        price,
        Status: true,
      }),
    });

    return res
      .status(200)
      .send({ message: "Add-on created successfully for the product" });
  } catch (error) {
    console.error("Error creating add-on: " + error.message);
    return res.status(200).send("Error creating add-on: " + error.message);
  }
};

const editAddon = async (req, res) => {
  try {
    const { productId, index } = req.params;
    let { name, price } = req.body;

    // Trim the name
    name = name.trim();

    // Validate input
    if (!productId || !index) {
      return res
        .status(200)
        .send({ message: "Product ID and index are required" });
    }

    if (!name || price === undefined) {
      return res.status(200).send({
        message: "Name and price are required for editing the add-on",
      });
    }

    if (price <= 0) {
      return res
        .status(200)
        .send({ message: "Price must be greater than zero" });
    }

    // Fetch the product document
    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();

    if (!productSnapshot.exists) {
      return res.status(200).send({ message: "Product not found" });
    }

    const productData = productSnapshot.data();
    const addOns = productData.addOns || [];

    if (index < 0 || index >= addOns.length) {
      return res.status(200).send({ message: "Invalid index for the add-on" });
    }

    const isNameDuplicate = addOns.some(
      (addOn, i) =>
        i !== Number(index) && addOn.name.toLowerCase() === name.toLowerCase()
    );

    if (isNameDuplicate) {
      return res
        .status(200)
        .send({ message: "An add-on with the same name already exists" });
    }

    const updatedAddOns = addOns.map((addOn, i) => {
      if (i === Number(index)) {
        return { ...addOn, name, price };
      } else {
        return addOn;
      }
    });

    await productRef.update({ addOns: updatedAddOns });

    return res.status(200).send({ message: "Add-on updated successfully" });
  } catch (error) {
    console.error("Error editing add-on: " + error.message);
    return res.status(200).send("Error editing add-on: " + error.message);
  }
};

const updateAddonStatus = async (req, res) => {
  try {
    const { productId, index } = req.params;

    if (!productId || !index) {
      return res
        .status(200)
        .send({ message: "Product ID and index are required" });
    }

    const productRef = db.collection("products").doc(productId);
    const productSnapshot = await productRef.get();

    if (!productSnapshot.exists) {
      return res.status(200).send({ message: "Product not found" });
    }

    const productData = productSnapshot.data();
    const addOns = productData.addOns || [];

    if (index >= 0 && index < addOns.length) {
      // Update the specified add-on status
      addOns[index].Status = !addOns[index].Status;

      await productRef.update({ addOns });

      return res
        .status(200)
        .send({ message: "Add-on status updated successfully " });
    } else {
      return res.status(200).send({ message: "Invalid index for the add-on" });
    }
  } catch (error) {
    console.error("Error updating add-on status: " + error.message);
    return res
      .status(200)
      .send("Error updating add-on status: " + error.message);
  }
};

module.exports = {
  upload,
  createProduct,
  getAllProducts,
  getProductsByCategory,
  getProductsBySubcatgory,
  SearchProducts,
  getProductByName,
  getProductsByStatus,
  getProductType,
  getProductsbyType,
  updateProduct,
  updateproductstatus,
  createAddon,
  editAddon,
  updateAddonStatus,
};
