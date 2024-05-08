const admin = require("firebase-admin");
const { adminApp } = require("../Db_firebase/firebase");
const db = admin.firestore(adminApp);
const createTransaction = async (req, res) => {
  try {
    const transaction = {
      orderId: orderId,
      TransactionId: transactionid,
      OrderDate: orderdate,
      TransactionDate: transcationdate,
      OrderAmount: orderAmount,
      DeliveryCharge: DeliveryCharge,
      TaxCharge: TaxCharge,
      Discount: Discount,
      TotalAmount: TotalAMount,
      PaymentMode: PaymentMode,
    };
    await db.collection("transactions").set(TransactionId).set(transaction);
    res.status(200).send({ message: `Transaction Doc created` });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Error Creating Transaction :${error.message}` });
  }
};
