const admin = require("firebase-admin");
const { adminApp } = require("../Db_firebase/firebase");
const db = admin.firestore(adminApp);

const createDeliveryCharge = async (req, res) => {
  try {
    const { deliveryFee } = req.body;

    if (!deliveryFee) {
      return res.status(200).send({
        message: `DeliveryFee is required to create the delivery fee`,
      });
    }

    if (deliveryFee < 0 || deliveryFee > 100) {
      return res
        .status(200)
        .send({ message: `DeliveryFee should be between 0 and 100` });
    }
    const deliveryChargeRef = db.collection("deliveryCharges").doc();
    await deliveryChargeRef.set({ deliveryFee });

    return res
      .status(200)
      .send({ message: "Delivery charge created successfully" });
  } catch (error) {
    console.error("Error creating delivery charge:", error);
    return res.status(200).send({ message: "Error creating delivery charge" });
  }
};

const getDeliveryCharges = async (req, res) => {
  try {
    const deliveryChargeSnapshot = await db.collection("deliveryCharges").get();

    if (deliveryChargeSnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Delivery Charges are not created` });
    }

    const deliveryCharges = [];

    deliveryChargeSnapshot.forEach((doc) => {
      const data = doc.data();
      const id = doc.id;
      const deliveryFee = data.deliveryFee;

      deliveryCharges.push({
        id,
        deliveryFee,
      });
    });

    return res
      .status(200)
      .send({ message: `All delivery charges`, deliveryCharges });
  } catch (error) {
    console.error("Error fetching delivery charges:", error);
    return res.status(200).send({ message: "Error fetching delivery charges" });
  }
};

const updateDeliveryCharge = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { charge } = req.body;

    if (!deliveryId) {
      return res.status(200).send({ message: `DeliveryId is required` });
    }
    if (!charge) {
      return res.status(200).send({ message: `Charge is required` });
    }

    if (charge < 0 || charge > 100) {
      return res
        .status(200)
        .send({ message: `Charge must be between 0 and 100` });
    }

    const deliveryRef = db.collection("deliveryCharges").doc(deliveryId);
    const snapshot = await deliveryRef.get();

    if (!snapshot.exists) {
      return res
        .status(200)
        .send({ message: `DeliveryId ${deliveryId} not found` });
    }

    await deliveryRef.update({ deliveryFee: charge });

    return res.status(200).send({
      message: `Delivery Charge is updated,`,
    });
  } catch (error) {
    return res.status(200).send({
      message: `Error updating the deliveryCharge: ${error.message}`,
    });
  }
};

module.exports = {
  createDeliveryCharge,
  getDeliveryCharges,
  updateDeliveryCharge,
};
