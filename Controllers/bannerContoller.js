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

const createBanner = async (req, res) => {
  try {
    const photo = req.file;
    if (!photo) {
      return res.status(200).send({ message: "Image is required." });
    }

    const bannerRef = db.collection("banners").doc();
    const bannerId = bannerRef.id;

    const storageRef = ref(storage, `banners/${bannerId}`);
    const metadata = { contentType: photo.mimetype };
    const snapshot = await uploadBytesResumable(
      storageRef,
      photo.buffer,
      metadata
    );
    const imageUrl = await getDownloadURL(snapshot.ref);

    await bannerRef.set({
      photo: imageUrl,
    });

    res.status(201).send({
      message: "Banner created successfully",
      id: bannerId,
      photo: imageUrl,
    });
  } catch (error) {
    res.status(200).send("Error creating banner: " + error.message);
  }
};

const getAllBanners = async (req, res) => {
  try {
    const querySnapshot = await db.collection("banners").get();
    const banners = [];
    querySnapshot.forEach((doc) => {
      banners.push({
        id: doc.id,
        photo: doc.data().photo,
      });
    });
    res.status(200).send(banners);
  } catch (error) {
    res.status(200).send("Error getting banners: " + error.message);
  }
};

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(200).send({ message: "Banner ID is required." });
    }

    const bannerRef = db.collection("banners").doc(id);
    const bannerDoc = await bannerRef.get();

    if (!bannerDoc.exists) {
      return res.status(200).send({ message: "Banner not found." });
    }

    // Delete the banner's photo from storage

    const photoRef = ref(storage, `banners/${id}`);
    await deleteObject(photoRef);

    // Delete the banner document from Firestore
    await bannerRef.delete();

    res.status(200).send({ message: "Banner deleted successfully" });
  } catch (error) {
    res.status(200).send("Error deleting banner: " + error.message);
  }
};

module.exports = {
  upload,
  createBanner,
  getAllBanners,
  deleteBanner,
};
