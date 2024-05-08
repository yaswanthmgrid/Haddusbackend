const admin = require("firebase-admin");
const { app, adminApp } = require("../Db_firebase/firebase");

const createType = async (req, res) => {
  try {
    const { category, subcategory, name } = req.body;

    const categoryDoc = db
      .collection("categories")
      .where("category", "==", category)
      .get();

    if (categoryDoc.empty) {
      return res
        .status(200)
        .send({ message: `Category "${category}" not found` });
    }
    const categoryId = categoryDoc.docs[0].id;

    //Checks the subcategory exists under a particular category
    const subcategoryQuery = await db
      .collection("subcategories")
      .where("category", "==", db.doc(`/categories/${categoryId}`))
      .get();
    if (subcategoryQuery.empty) {
      return res.status(200).send({
        message: `subcategory: ${subcategory} does not exists under the category:${category} `,
      });
    }
    const subcategoryId = subcategoryQuery.doc[0].id;

    //Check if the type already exists the a particular category and subcategory
    const typeQuery = await db
      .collection("producttypes")
      .where("name", "==", name)
      .get();
    if (!typeQuery.empty) {
      return res.status(200).send({
        message: `Type:${name} already exists in the Category:${category} and subcateogry:${subcategory}`,
      });
    }
    const typedoc = db.collection("producttypes").doc();
    await typedoc.set({
      category: db.doc(`/categories/${categoryId}`), // Reference to the category document
      subcategory: db.doc(`/subcategories/${subcategoryId}`), // Reference to the subcategory document
      name: name,
    });
  } catch (error) {
    console.error("Error getting subcategories by category: " + error.message);
    return res
      .status(500)
      .send("Error getting subcategories by category: " + error.message);
  }
};

module.exports = { createType };
