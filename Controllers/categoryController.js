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
    const { categoryId } = req.params;
    let { name } = req.body;
    const photo = req.file;

    if ((!name || name.trim() === "") && !photo) {
      return res.status(200).send({ message: "Change atleast one to update" });
    }

    if (!categoryId) {
      return res.status(200).send({ message: "categoryId is missing" });
    }

    const categorySnapshot = await db
      .collection("categories")
      .doc(categoryId)
      .get();

    if (!categorySnapshot.exists) {
      return res.status(200).send({ message: "Category not found" });
    }

    const updateData = {};
    if (name !== undefined && name !== "") {
      name = name.trim();
      updateData.name = name;
    }

    if (photo) {
      const existingPhotoRef = ref(storage, `Categories/${categoryId}`);
      await deleteObject(existingPhotoRef);

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

    const updatedStatus = !categoryData.active;
    await categoryDoc.ref.update({ active: updatedStatus });

    const subcategorySnapshot = await db
      .collection("subcategories")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .get();

    const subcategoryUpdates = subcategorySnapshot.docs.map(
      async (subcategoryDoc) => {
        const updatedActiveValue = updatedStatus;
        await subcategoryDoc.ref.update({ active: updatedActiveValue });
      }
    );

    await Promise.all(subcategoryUpdates);

    const productSnapshot = await db
      .collection("products")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .get();

    const productUpdates = productSnapshot.docs.map(async (productDoc) => {
      const updatedActiveValue = updatedStatus;
      await productDoc.ref.update({ active: updatedActiveValue });
    });

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
