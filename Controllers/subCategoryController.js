const admin = require("firebase-admin");
const { app, adminApp } = require("../Db_firebase/firebase");

const multer = require("multer");
const {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} = require("firebase/storage");

const db = admin.firestore(adminApp);
const storage = getStorage(app);
const upload = multer({ storage: multer.memoryStorage() });

const createSubcat = async (req, res) => {
  try {
    let { name, category } = req.body;
    const photo = req.file;
    category = category.trim();
    if (!name || !category || !photo) {
      return res
        .status(200)
        .send({ message: "Name, category, and image are required." });
    }
    console.log(req.file.size);
    if (req.file.size < 600 * 1024) {
      return res.status(200).json({ error: "Minimum Size must be 600 KB." });
    }

    const categoryQuery = await db
      .collection("categories")
      .where("name", "==", category)
      .get();

    if (categoryQuery.empty) {
      return res.status(200).send({ message: "Category not found" });
    }

    const categoryId = categoryQuery.docs[0].id;

    const subcategoryQuery = await db
      .collection("subcategories")
      .where("name", "==", name)
      .get();

    if (!subcategoryQuery.empty) {
      return res.status(200).send({
        message:
          "Subcategory already exists in this category. Try with a new subcategory",
      });
    }

    const subcategoryRef = db.collection("subcategories").doc();
    const subcategoryId = subcategoryRef.id;
    const storageRef = ref(storage, `Subcategories/${subcategoryId}`);
    const metadata = { contentType: photo.mimetype };

    const snapshot = await uploadBytesResumable(
      storageRef,
      photo.buffer,
      metadata
    );
    const imageUrl = await getDownloadURL(snapshot.ref);

    await subcategoryRef.set({
      name: name,
      category: db.collection("categories").doc(categoryId),
      photo: imageUrl,
      active: true,
    });

    res.status(201).send({
      message: "Subcategory created successfully",
    });
  } catch (error) {
    res.status(200).send("Error creating subcategory: " + error.message);
  }
};

const getAllSubcat = async (req, res) => {
  try {
    const querySnapshot = await db.collection("subcategories").get();
    const subcategories = [];
    const promises = [];
    querySnapshot.forEach((doc) => {
      const categoryId = doc.data().category.id; // Assuming category is stored as a reference
      const promise = db
        .collection("categories")
        .doc(categoryId)
        .get()
        .then((categoryDoc) => {
          const categoryName = categoryDoc.data().name;
          subcategories.push({
            id: doc.id,
            name: doc.data().name,
            category: categoryName,
            photo: doc.data().photo,
            active: doc.data().active,
          });
        });
      promises.push(promise);
    });

    await Promise.all(promises); // Wait for all promises to resolve

    if (subcategories.length === 0) {
      res.status(200).send({
        message: "No subcategories exist",
        subcategories: subcategories,
      });
    } else {
      res.status(200).send({ message: "All Subcategories", subcategories });
    }
  } catch (error) {
    res.status(200).send("Error getting subcategories: " + error.message);
  }
};

const getSubcatByName = async (req, res) => {
  try {
    const { name } = req.params;
    const subcategoryQuery = await db
      .collection("subcategories")
      .where("name", "==", name)
      .get();

    if (subcategoryQuery.empty) {
      return res.status(200).send({ message: `${name}Subcategory not found` });
    }

    let subcategoryData = [];

    const promises = [];
    subcategoryQuery.forEach((doc) => {
      const categoryId = doc.data().category._path.segments[1];
      const promise = db
        .collection("categories")
        .doc(categoryId)
        .get()
        .then((categoryDoc) => {
          const categoryName = categoryDoc.data().name;
          subcategoryData.push({
            name: doc.data().name,
            category: categoryName,
            photo: doc.data().photo,
          });
        });
      promises.push(promise);
    });

    await Promise.all(promises);

    res.status(200).send({ message: "Desired SubCategory", subcategoryData });
  } catch (error) {
    res.status(200).send("Error getting subcategory by name: " + error.message);
  }
};

const getSubcategorybyCategory = async (req, res) => {
  try {
    const { category, id } = req.params;

    if (!category) {
      return res
        .status(200)
        .send({ message: "Category is missing in the request body" });
    }
    const adminSnapshot = await db.collection("admins").doc(id).get();
    const isadmin = adminSnapshot.exists;

    const categoryQuery = await db
      .collection("categories")
      .where("name", "==", category)
      .get();

    if (categoryQuery.empty) {
      return res
        .status(200)
        .send({ message: `Category "${category}" not found` });
    }
    const categoryId = categoryQuery.docs[0].id;
    let subcategoryQuery;
    if (isadmin) {
      subcategoryQuery = await db
        .collection("subcategories")
        .where("category", "==", db.doc(`/categories/${categoryId}`))
        .get();
    } else {
      subcategoryQuery = await db
        .collection("subcategories")
        .where("category", "==", db.doc(`/categories/${categoryId}`))
        .where("active", "==", true)
        .get();
    }

    if (subcategoryQuery.empty) {
      return res.status(200).send({
        message: `Subcategories not found under ${category} Category`,
      });
    }

    // Process the subcategory documents
    const subcategories = [];
    subcategoryQuery.forEach((doc) => {
      subcategories.push({
        category: category,
        name: doc.data().name,
        photo: doc.data().photo,
        active: doc.data().active,
      });
    });

    return res.status(200).send(subcategories);
  } catch (error) {
    console.error("Error getting subcategories by category: " + error.message);
    return res
      .status(200)
      .send("Error getting subcategories by category: " + error.message);
  }
};

const SearchSubcategory = async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) {
      return res.status(200).send({ message: "Name value is missing" });
    }

    const subcategorySnapshot = await db.collection("subcategories").get();

    if (subcategorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Subcategory '${name}' does not exist` });
    }

    const subcategories = [];
    const promises = [];

    subcategorySnapshot.forEach((doc) => {
      const subcategoryData = doc.data();
      if (
        subcategoryData.name.toLowerCase().includes(name.toLowerCase()) ||
        subcategoryData.name === name
      ) {
        const categoryPromise = subcategoryData.category.get(); // Fetch category information
        promises.push(
          categoryPromise.then((categoryDoc) => {
            const categoryName = categoryDoc.data().name;
            subcategories.push({
              name: subcategoryData.name,
              photo: subcategoryData.photo,
              active: subcategoryData.active,
              category: categoryName, // Include category name
            });
          })
        );
      }
    });

    await Promise.all(promises);

    res.status(200).send({ message: "Subcategories:", subcategories });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Error getting subcategories: ${error.message}` });
  }
};

const updateSubcat = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    let { category, name } = req.body;
    const photo = req.file;

    // Validate if name is provided and does not contain spaces
    if (
      (!name || name.trim() === "") &&
      (!category || category.trim() === "") &&
      !photo
    ) {
      return res.status(200).send({ message: "Change atleast one to update" });
    }

    if (!subcategoryId) {
      return res.status(200).send({ message: "SubcategoryId is missing" });
    }

    // Fetch the subcategory document
    const subcategoryRef = db.collection("subcategories").doc(subcategoryId);
    const subcategorySnapshot = await subcategoryRef.get();

    if (!subcategorySnapshot.exists) {
      // Check if the document exists
      return res.status(200).send({ message: "Subcategory not found" });
    }

    // Update data object
    const updateData = {};

    // Remove leading and trailing spaces from name
    if (name !== undefined && name !== "") {
      name = name.trim();
      updateData.name = name;
    }

    if (category !== undefined && category !== "") {
      // Check if category is provided
      // Fetch the category document
      category = category.trim();
      const categorySnapshot = await db
        .collection("categories")
        .where("name", "==", category)
        .get();

      if (categorySnapshot.empty) {
        return res
          .status(200)
          .send({ message: `${category} Category not found` });
      }

      // Get the category ID
      const categoryId = categorySnapshot.docs[0].id;
      updateData.category = db.doc(`/categories/${categoryId}`); // Corrected this line
    }

    if (photo) {
      // Upload new photo
      const storageRef = ref(storage, `Subcategories/${subcategoryId}`);
      const metadata = { contentType: photo.mimetype };
      await uploadBytesResumable(storageRef, photo.buffer, metadata);
      const imageUrl = await getDownloadURL(storageRef);
      updateData.photo = imageUrl;
    }

    // Update the subcategory document
    await subcategoryRef.update(updateData);

    return res
      .status(200)
      .send({ message: "Subcategory Updated Successfully", id: subcategoryId });
  } catch (error) {
    res.status(200).send("Error updating subcategory: " + error.message);
  }
};

const updateSubcategoryStatus = async (req, res) => {
  try {
    const { subcategoryname } = req.params;
    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("name", "==", subcategoryname)
      .get();

    if (subcategorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `${subcategoryname} subcategory is not found` });
    }

    const subcategoryDoc = subcategorySnapshot.docs[0];
    const subcategoryData = subcategoryDoc.data();
    const subcategoryId = subcategoryDoc.id;

    const categoryRef = subcategoryData.category;
    const categoryDoc = await categoryRef.get();
    const categoryData = categoryDoc.data();

    // Check the category status whether active or inactive
    if (!categoryData.active) {
      return res.status(200).send({
        message: `category '${categoryData.name}' is inactive. Cannot activate the Subcategory status.`,
      });
    }
    // Toggle the status of the subcategory
    const updatedStatus = !subcategoryData.active;
    await subcategoryDoc.ref.update({ active: updatedStatus });

    // Get the products associated with the subcategory
    const productSnapshot = await db
      .collection("products")
      .where("subcategory", "==", db.doc(`/subcategories/${subcategoryId}`))
      .get();

    // Update the active status of each associated product
    const productUpdates = productSnapshot.docs.map(async (productDoc) => {
      const updatedActiveValue = updatedStatus;
      await productDoc.ref.update({ active: updatedActiveValue });
    });

    // Wait for all product updates to complete
    await Promise.all(productUpdates);

    return res.status(200).send({
      message: `${subcategoryname} subcategory status updated, along with associated products`,
      updatedActiveValue: updatedStatus,
    });
  } catch (error) {
    res.status(200).send({
      message: `Unable to update the subcategory and associated products: ${error.message}`,
    });
  }
};

module.exports = {
  upload,
  createSubcat,
  getAllSubcat,
  updateSubcat,
  getSubcatByName,
  getSubcategorybyCategory,
  SearchSubcategory,
  updateSubcategoryStatus,
};
