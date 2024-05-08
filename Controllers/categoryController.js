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

const createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const photo = req.file;
    if (!name || !photo) {
      return res.status(200).send({ message: "Name and image are required." });
    }
    if (req.file.size < 600 * 1024) {
      return res.status(200).json({ error: "Minimum Size must be 600 KB." });
    }

    const categoryQuery = await db
      .collection("categories")
      .where("name", "==", name)
      .get();

    if (!categoryQuery.empty) {
      return res
        .status(200)
        .send({ message: "Category already exists,Add a new Category." });
    }

    const categoryRef = db.collection("categories").doc();
    const categoryId = categoryRef.id;
    const storageRef = ref(storage, `Categories/${categoryId}`);

    const metadata = { contentType: photo.mimetype };
    const snapshot = await uploadBytesResumable(
      storageRef,
      photo.buffer,
      metadata
    );
    const imageUrl = await getDownloadURL(snapshot.ref);

    await categoryRef.set({
      name: name,
      photo: imageUrl,
      active: true,
    });

    res.status(201).send({
      message: "Category created successfully",
    });
  } catch (error) {
    res.status(200).send("Error creating category: " + error.message);
  }
};

const getAllCategories = async (req, res) => {
  try {
    const { id } = req.params;
    const adminSnapshot = await db.collection("admins").doc(id).get();
    const isadmin = adminSnapshot.exists;

    let querySnapshot;
    if (isadmin) {
      querySnapshot = await db.collection("categories").get();
    } else {
      querySnapshot = await db
        .collection("categories")
        .where("active", "==", true)
        .get();
    }

    const categories = [];
    querySnapshot.forEach((doc) => {
      categories.push({
        id: doc.id,
        name: doc.data().name,
        photo: doc.data().photo,
        active: doc.data().active,
      });
    });
    res.status(200).send(categories);
  } catch (error) {
    res.status(200).send("Error getting categories: " + error.message);
  }
};

const getCategoryByName = async (req, res) => {
  try {
    const categoryName = req.params.name;
    const categoryQuery = await db
      .collection("categories")
      .where("name", "==", categoryName)
      .get();

    if (!categoryQuery.empty) {
      let categoryData;
      categoryQuery.forEach((doc) => {
        categoryData = doc.data();
      });
      res.status(200).send(categoryData);
    } else {
      res.status(200).send({ message: "Category not found" });
    }
  } catch (error) {
    res.status(200).send("Error getting category: " + error.message);
  }
};

const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params; // Changed from categoryName to categoryId
    let { name } = req.body;
    const photo = req.file;

    // Validate if name is provided and does not contain spaces
    if ((!name || name.trim() === "") && !photo) {
      return res.status(200).send({ message: "Change atleast one to update" });
    }

    if (!categoryId) {
      // Changed from categoryName to categoryId
      return res.status(200).send({ message: "categoryId is missing" }); // Changed from categoryName to categoryId
    }
    if (req.file.size < 600 * 1024) {
      return res.status(200).json({ error: "Minimum Size must be 600 KB." });
    }

    // Fetch the category document
    const categorySnapshot = await db
      .collection("categories")
      .doc(categoryId) // Changed from categoryName to categoryId
      .get();

    if (!categorySnapshot.exists) {
      // Check if the document exists
      return res.status(200).send({ message: "Category not found" });
    }

    // Update data object
    const updateData = {};
    // Remove leading and trailing spaces from name
    if (name !== undefined && name !== "") {
      name = name.trim();
      updateData.name = name;
    }

    if (photo) {
      // Delete the existing photo in the storage
      const existingPhotoRef = ref(storage, `Categories/${categoryId}`);
      await deleteObject(existingPhotoRef);

      // Upload new photo
      const storageRef = ref(storage, `Categories/${categoryId}`);
      const metadata = { contentType: photo.mimetype };
      const snapshot = await uploadBytesResumable(
        storageRef,
        photo.buffer,
        metadata
      );
      const imageUrl = await getDownloadURL(snapshot.ref);
      updateData.photo = imageUrl;
    }

    // Update the category document
    await db.collection("categories").doc(categoryId).update(updateData);

    return res
      .status(200)
      .send({ message: "Category Updated Successfully", id: categoryId });
  } catch (error) {
    res.status(200).send("Error updating category: " + error.message);
  }
};

const SearchCategory = async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) {
      return res.status(200).send({ message: "Name value is missing" });
    }

    const categorySnapshot = await db
      .collection("categories")

      .get();

    if (categorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Category '${name}' does not exist` });
    }

    const categories = [];
    const promises = [];

    categorySnapshot.forEach((doc) => {
      const categoryData = doc.data();
      if (
        categoryData.name.toLowerCase().includes(name.toLowerCase()) ||
        categoryData.name === name
      ) {
        promises.push(
          Promise.all([]).then(() => {
            categories.push({
              name: categoryData.name,
              photo: categoryData.photo,

              active: categoryData.active,
            });
          })
        );
      }
    });

    await Promise.all(promises);

    res.status(200).send({ message: "Categories:", categories });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Error getting categories: ${error.message}` });
  }
};

const updateCategorytstatus = async (req, res) => {
  try {
    const { categoryname } = req.params;

    // Check if the subcategory exists
    const categorySnapshot = await db
      .collection("categories")
      .where("name", "==", categoryname)
      .get();

    if (categorySnapshot.empty) {
      return res
        .status(200)
        .send({ message: `${categoryname} category is not found` });
    }

    const categoryDoc = categorySnapshot.docs[0];
    const categoryData = categoryDoc.data();
    const categoryId = categoryDoc.id;

    // Toggle the status of the subcategory
    const updatedStatus = !categoryData.active;
    await categoryDoc.ref.update({ active: updatedStatus });

    // Get the products associated with the subcategory
    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .get();

    // Update the active status of each associated product
    const subcategoryUpdates = subcategorySnapshot.docs.map(
      async (subcategoryDoc) => {
        const updatedActiveValue = updatedStatus;
        await subcategoryDoc.ref.update({ active: updatedActiveValue });
      }
    );

    // Wait for all product updates to complete
    await Promise.all(subcategoryUpdates);

    // Get the products associated with the subcategory
    const productSnapshot = await db
      .collection("products")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .get();

    // Update the active status of each associated product
    const productUpdates = productSnapshot.docs.map(async (productDoc) => {
      const updatedActiveValue = updatedStatus;
      await productDoc.ref.update({ active: updatedActiveValue });
    });

    // Wait for all product updates to complete
    await Promise.all(productUpdates);

    return res.status(200).send({
      message: `${categoryname} category status updated, along with associated Subcategory,products`,
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
  createCategory,
  SearchCategory,
  getAllCategories,
  getCategoryByName,
  updateCategory,
  updateCategorytstatus,
};
