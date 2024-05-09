const admin = require("firebase-admin");

const registerNotification = async (userId) => {
  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      console.error("User not found");
      return;
    }
    const userData = userDoc.data();
    if (!userData.permission) {
      console.error("User permission denied");
      return;
    }
    const notificationData = {
      title: "🎉 Welcome to Haddus!",
      body: `Hi ${
        userDoc.data().name
      }, we're thrilled to have you on board! Start exploring now and make the most of your experience!`,
    };

    await sendNotificationToDevice(
      userDoc.data().DeviceToken,
      notificationData
    );

    console.log("Notification sent successfully");
  } catch (error) {
    console.error("Error registering notification:", error);
    throw new Error("Error registering notification: " + error.message);
  }
};

const sendOrderNotification = async (userId, orderId) => {
  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      console.error("User not found");
      return;
    }
    const userData = userDoc.data();
    if (!userData.permission) {
      console.error("User permission denied");
      return;
    }
    const notificationData = {
      title: "Order Placed",
      body: `Hi ${
        userDoc.data().name
      }, your order (${orderId}) has been successfully placed. Enjoy your meal!`,
    };

    await sendNotificationToDevice(
      userDoc.data().DeviceToken,
      notificationData
    );

    console.log("Order notification sent successfully");
  } catch (error) {
    console.error("Error sending order notification:", error);
    throw new Error("Error sending order notification: " + error.message);
  }
};
/*THis is for sending notification for multiple users*/

// const discountNotification = async (userIds, category, applicable, percent) => {
//   try {
//     const firestore = admin.firestore();

//     for (const userId of userIds) {
//       const userDoc = await firestore.collection("users").doc(userId).get();

//       if (!userDoc.exists) {
//         console.error(`User with ID ${userId} not found`);
//         continue;
//       }

//       const userData = userDoc.data();
//       const deviceToken = userData.DeviceToken;

//       // Construct notification data
//       const notificationData = {
//         title: "🍴😋😋 Unlock Delicious Discounts! Savor Your Meal!",
//         body: `Hi ${userData.name}, your taste buds are in for a treat! Unlock a delicious ${percent}% off on our mouthwatering ${category} ${applicable}. Don't miss out—savor the flavors now!`,
//       };

//       if (deviceToken) {
//         await sendNotificationToDevice(deviceToken, notificationData);
//         console.log(`Notification sent successfully to user ID ${userId}`);
//       } else {
//         console.error(`Device token not found for user ID ${userId}`);
//       }
//     }
//   } catch (error) {
//     console.error("Error sending notifications:", error);
//     throw new Error("Error sending notifications: " + error.message);
//   }
// };

const discountNotification = async (userId, category, applicable, percent) => {
  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      console.error("User not found");
      return;
    }
    const userData = userDoc.data();
    if (!userData.permission) {
      console.error("User permission denied");
      return;
    }
    const notificationData = {
      title: "🍴😋😋 Unlock Delicious Discounts! Savor Your Meal!",
      body: `Hi ${
        userDoc.data().name
      }, your taste buds are in for a treat! Unlock a delicious ${percent}% off on our mouthwatering ${category} ${applicable}. Don't miss out—savor the flavors now!
`,
    };
    await sendNotificationToDevice(
      userDoc.data().DeviceToken,
      notificationData
    );

    console.log("Notification sent successfully");
  } catch (error) {
    console.error("Error registering notification:", error);
    throw new Error("Error registering notification: " + error.message);
  }
};

const sendNotificationToDevice = async (deviceToken, notificationData) => {
  try {
    const message = {
      token: deviceToken,
      notification: {
        title: notificationData.title,
        body: notificationData.body,
      },
    };
    const response = await admin.messaging().send(message);
    console.log("Notification sent:", response);
  } catch (error) {
    console.error("Error sending notification:", error);
    throw new Error("Error sending notification: " + error.message);
  }
};

module.exports = {
  registerNotification,
  sendOrderNotification,
  discountNotification,
};
