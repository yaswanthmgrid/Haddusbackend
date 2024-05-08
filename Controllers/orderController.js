const admin = require("firebase-admin");
const { adminApp } = require("../Db_firebase/firebase");
const { sendOrderNotification } = require("./notificationController");
const db = admin.firestore(adminApp);

const createOrder = async (req, res) => {
  try {
    const { userId } = req.params;
    const { DeliveryFee, ShippingAddress, paymentMethod } = req.body;

    if (!userId) {
      return res.status(200).send({ message: `UserId is required` });
    }

    if (!DeliveryFee || !ShippingAddress || !paymentMethod) {
      return res.status(200).send({ message: "All fields are required" });
    }

    // Define the cart reference using user ID
    const cartRef = db.collection("carts").doc(userId);
    const cartSnapshot = await cartRef.get();
    const cartData = cartSnapshot.data();

    // Calculate final bill based on cart data
    let finalBill;
    if (cartData.Finalbill == 0) {
      finalBill = cartData.bill;
    } else {
      finalBill = cartData.Finalbill;
    }
    finalBill += DeliveryFee;

    // Generate order ID and transaction ID
    const ordersSnapshot = await db.collection("orders").get();
    const orderCount = ordersSnapshot.size;
    const orderId = (orderCount + 1).toString().padStart(6, "0");
    const transactionId =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    // Current timestamp
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Prepare order products data
    const orderProducts = cartData.products.map((product) => {
      const {
        productName,
        quantity,
        originalPrice,
        taxedPrice,
        price2,
        price,
        addOns,
      } = product;

      const taxedAmount = (taxedPrice - originalPrice) * quantity;
      let discountAmount;
      if (taxedPrice > price) {
        discountAmount = taxedPrice - price;
      } else {
        discountAmount = 0;
      }

      return {
        productName,
        quantity,
        ItemPrice: price2,
        TaxedAmount: taxedAmount,
        discountAmount,
        product_price: price,
        addOns,
      };
    });

    // Set order data
    const orderData = {
      userId,
      orderId,
      products: orderProducts,
      deliveryFee: DeliveryFee,
      finalBill,
      TotalBIll: cartData.bill,
      paymentMethod,
      shippingAddress: ShippingAddress,
      status: "PENDING",
      transactionId,
      createdAt: timestamp,
      coupon: cartData.couponId || "",
      couponDiscount: cartData.couponAmount,
      Rating: null,
      Comment: null,
    };

    // Create the order
    await db.collection("orders").doc(orderId).set(orderData);

    // If a coupon was used, update the coupon usage and status
    if (cartData.couponId !== "") {
      const couponSnapshot = await db
        .collection("coupons")
        .doc(cartData.couponId)
        .get();
      const currentUsed = couponSnapshot.data().Used + 1;
      await couponSnapshot.ref.update({ Used: currentUsed });
      if (currentUsed >= couponSnapshot.data().Limit) {
        await couponSnapshot.ref.update({ Status: false });
      }
    }

    // Update cart data to clear the bill and products
    await cartRef.update({
      bill: 0,
      products: [],
      Finalbill: 0,
      couponId: "",
      couponAmount: 0,
      couponDiscount: 0,
    });
    await sendOrderNotification(userId, orderId);
    res
      .status(200)
      .send({ message: "Order created successfully", orderId: orderId });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(200).send({ message: "Error creating order" });
  }
};

const getOrders = async (req, res) => {
  try {
    const orderSnapshot = await db.collection("orders").get();
    const Orders = [];

    orderSnapshot.forEach((doc) => {
      const orderDetails = doc.data();
      const orderPromise = new Promise(async (resolve, reject) => {
        // const createdAt = new Date(
        //   orderDetails.createdAt.toDate()
        // ).toLocaleString("en-US", {
        //   month: "long",
        //   day: "numeric",
        //   year: "numeric",
        // hour: "numeric",
        // minute: "numeric",
        // second: "numeric",
        // timeZoneName: "short",
        // });
        const createdAt = new Date(
          orderDetails.createdAt.toDate()
        ).toLocaleString("en-Uk", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

        const UserSnapshot = await db
          .collection("users")
          .doc(orderDetails.userId)
          .get();

        let = userName = "";
        if (UserSnapshot.exists) {
          userName = UserSnapshot.data().name;
        }
        const order = {
          orderId: orderDetails.orderId,
          CustomerId: orderDetails.userId,
          CustomerName: userName,
          Address: orderDetails.shippingAddress,
          Date: createdAt,
          Price: orderDetails.finalBill,
          Status: orderDetails.status,
        };
        resolve(order);
      });
      Orders.push(orderPromise);
    });
    const AllOrders = await Promise.all(Orders);
    if (AllOrders.length === 0) {
      res.status(200).send({ message: "No Orders Found" });
    } else {
      res.status(200).send({ message: "All Orders", orders: AllOrders });
    }
  } catch (error) {
    res.status(200).send({ message: `Error getting Order:,${error.message}` });
  }
};

const getOrdersByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    if (!status) {
      return res.status(200).send({ message: "Status parameter is required" });
    }

    // Query orders collection based on the provided status
    const orderSnapshot = await db
      .collection("orders")
      .where("status", "==", status)
      .get();

    const orders = [];

    // Iterate over each document in the order snapshot
    for (const doc of orderSnapshot.docs) {
      const orderDetails = doc.data();
      const createdAt = new Date(
        orderDetails.createdAt.toDate()
      ).toLocaleString("en-Uk", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      // Fetch user data asynchronously
      try {
        const userSnapshot = await db
          .collection("users")
          .doc(orderDetails.userId)
          .get();
        const userName = userSnapshot.exists
          ? userSnapshot.data().name
          : "Unknown";

        const order = {
          orderId: orderDetails.orderId,
          CustomerId: orderDetails.userId,
          CustomerName: userName,
          Date: createdAt,
          Bill: orderDetails.finalBill,
          status: orderDetails.status,
        };
        orders.push(order);
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    }

    if (orders.length === 0) {
      res
        .status(200)
        .send({ message: `No orders found with status ${status}` });
    } else {
      res
        .status(200)
        .send({ message: `Orders with status ${status}`, orders: orders });
    }
  } catch (error) {
    res.status(200).send({ message: `Error getting orders: ${error.message}` });
  }
};

const orderDetail = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(200).send({ message: "OrderId is required" });
    }

    const orderSnapshot = await db.collection("orders").doc(orderId).get();
    if (orderSnapshot.empty) {
      return res
        .status(200)
        .send({ message: `Order with id ${orderId} not Found` });
    }
    const orderdetails = orderSnapshot.data();

    const UserSnapshot = await db
      .collection("users")
      .doc(orderdetails.userId)
      .get();
    if (!UserSnapshot.exists) {
      return res.status(200).send({ message: "User not found" });
    }
    const userName = UserSnapshot.data().name;

    const createdAt = new Date(orderdetails.createdAt.toDate()).toLocaleString(
      "en-Uk",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        timeZoneName: "short",
      }
    );

    const Order = {
      OrderId: orderdetails.orderId,
      CustomerId: orderdetails.userId,
      CustomerName: userName,
      Products: orderdetails.products,
      DeliveyFee: orderdetails.deliveryFee,
      Bill: orderdetails.finalBill,
      TotalBIll: orderdetails.TotalBIll,
      AppliedCoupon: orderdetails.Coupon,
      ShippingAddress: orderdetails.shippingAddress,
      CreatedAt: createdAt,
      PaymentMethod: orderdetails.paymentMethod,
      TransactionId: orderdetails.transactionId,
      Status: orderdetails.status,
    };

    res.status(200).send({ message: `Order details`, order: Order });
  } catch (error) {
    res.status(200).send({
      message: `Unable to Get order  Details,${error.message} `,
    });
  }
};

const UserOrders = async (req, res) => {
  try {
    let { userId } = req.params; // Updated to accept userId from request params

    if (!userId) {
      return res.status(200).send({ message: "UserId is required" });
    }

    const ordersSnapshot = await db
      .collection("orders")
      .where("userId", "==", userId)
      .get();

    if (ordersSnapshot.empty) {
      return res
        .status(200)
        .send({ message: `No orders found for user with id ${userId}` });
    }

    let orders = [];
    for (const doc of ordersSnapshot.docs) {
      let orderdetails = doc.data();
      const UserSnapshot = await db
        .collection("users")
        .doc(orderdetails.userId)
        .get(); // Await here
      const userName = UserSnapshot.data().name;

      const createdAt = new Date(
        orderdetails.createdAt.toDate()
      ).toLocaleString("en-UK", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        timeZoneName: "short",
      });

      const order = {
        OrderId: orderdetails.orderId,
        CustomerId: orderdetails.userId,
        CustomerName: userName,
        Products: orderdetails.products,
        DeliveryFee: orderdetails.deliveryFee,
        Bill: orderdetails.finalBill,
        ShippingAddress: orderdetails.shippingAddress,
        CreatedAt: createdAt,
        PaymentMethod: orderdetails.paymentMethod,
        TransactionId: orderdetails.transactionId,
        Status: orderdetails.status,
        Rating: orderdetails.Rating,
        Comment: orderdetails.Comment,
      };

      orders.push(order);
    }

    // Sort orders array based on OrderId in descending order
    orders.sort((a, b) => b.OrderId.localeCompare(a.OrderId));

    res.status(200).send({
      message: `Orders details`,
      number_of_orders: orders.length,
      Orders: orders,
    });
  } catch (error) {
    res.status(200).send({
      message: `Unable to get orders for user  ${error.message}`,
    });
  }
};

const searchOrders = async (req, res) => {
  try {
    const { searchQuery } = req.params;
    console.log(searchQuery);
    if (!searchQuery) {
      return res.status(200).send({ message: "Enter input to search" });
    }

    // Search for orders where orderId matches searchQuery
    const orderSnapshot1 = await db
      .collection("orders")
      .where("orderId", "==", searchQuery)
      .get();
    // Search for orders where userId matches searchQuery
    const orderSnapshot2 = await db
      .collection("orders")
      .where("userId", "==", searchQuery)
      .get();

    // Search for users where name matches searchQuery
    const userSnapshot = await db
      .collection("users")
      .where("name", "==", searchQuery)
      .get();
    const userIds = userSnapshot.docs.map((doc) => doc.id);

    let combinedSnapshot = [].concat(orderSnapshot1.docs, orderSnapshot2.docs);

    if (userIds.length > 0) {
      // Search for orders where userId is in the list of userIds
      const orderSnapshot3 = await db
        .collection("orders")
        .where("userId", "in", userIds)
        .get();

      combinedSnapshot = combinedSnapshot.concat(orderSnapshot3.docs);
    }

    const orders = [];

    for (const doc of combinedSnapshot) {
      const orderDetails = doc.data();
      const createdAt = orderDetails.createdAt.toDate().toLocaleString("en-US");

      // Fetch the user document corresponding to the userId
      const userSnapshot = await db
        .collection("users")
        .doc(orderDetails.userId)
        .get();
      const customerName = userSnapshot.exists
        ? userSnapshot.data().name
        : "Unknown";

      const order = {
        orderId: orderDetails.orderId,
        customerId: orderDetails.userId,
        customerName: customerName,
        finalBill: orderDetails.finalBill,
        status: orderDetails.status,
        createdAt: createdAt,
      };
      orders.push(order);
    }

    if (orders.length === 0) {
      res
        .status(200)
        .send({ message: "No orders found matching the criteria" });
    } else {
      res.status(200).send({ message: "Matching orders", orders: orders });
    }
  } catch (error) {
    res.status(200).send({
      message: `Error searching orders: ${error.message}`,
    });
  }
};

const orderStatusUpdate = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { updatedstatus } = req.body;
    if (!orderId) {
      return res
        .status(200)
        .send({ message: `OrderID is required to update the Order` });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnapshot = await orderRef.get();

    if (!orderSnapshot.exists) {
      return res
        .status(200)
        .send({ message: `No Order found with this Id: ${orderId}` });
    }

    const orderData = orderSnapshot.data();
    const currentStatus = orderData.status;

    if (
      updatedstatus !== "COMPLETED" ||
      updatedstatus !== "PENDING" ||
      updatedstatus !== "DELIVERED"
    ) {
      if (currentStatus === "DELIVERED" || currentStatus === "CANCELED") {
        return res.status(200).send({
          message: `You can't update the status of the order that is already ${currentStatus}`,
        });
      }
      await orderRef.update({ status: updatedstatus });
      return res.status(200).send({
        message: `Successfully updated the Order status to: ${updatedstatus}`,
      });
    } else {
      return res.status(200).send({
        message: `STATUS must be either COMPLETED or PENDING or CANCELED`,
      });
    }
  } catch (error) {
    return res
      .status(200)
      .send({ message: `Error updating the status: ${error.message}` });
  }
};

const orderfeedback = async (req, res) => {
  try {
    const { userId, orderId } = req.params;
    let { rating, Comment } = req.body;
    rating = Number(rating);
    if (rating < 1 || rating > 5 || rating !== Math.round(rating)) {
      return res
        .status(200)
        .send({ message: "Rating must be between 1 and 5" });
    }
    if (!userId || !orderId) {
      return res
        .status(200)
        .send({ message: "UserId and OrderId are required in the params" });
    }

    // Check if the user exists
    const userSnapshot = await db.collection("users").doc(userId).get();
    if (!userSnapshot.exists) {
      return res.status(200).send({ message: "User not found" });
    }

    // Check if the order exists and belongs to the user
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists || orderSnapshot.data().userId !== userId) {
      return res.status(200).send({ message: "User does not have this order" });
    }

    // Check if there is existing feedback for the same user and order
    const existingFeedback = await db
      .collection("feedbacks")
      .where("userId", "==", userId)
      .where("orderId", "==", orderId)
      .get();

    if (!existingFeedback.empty) {
      return res
        .status(200)
        .send({ message: "Feedback already exists for this order and user" });
    }

    const userName = userSnapshot.data().name;

    // Set Comment to an empty string if it's not provided
    if (!Comment) {
      Comment = "";
    }

    const feedbackData = {
      userId: userId,
      userName: userName,
      orderId: orderId,
      Comment,
      rating: rating,
    };

    // Add the feedback document to the "feedback" collection
    await db.collection("feedbacks").add(feedbackData);

    // Update the rating field in the orders collection
    await orderRef.update({ Comment: Comment, Rating: rating });

    // Send a success response
    return res.status(200).send({ message: "Feedback submitted successfully" });
  } catch (error) {
    // Handle any errors that occur during the process
    return res
      .status(200)
      .send({ message: `Error submitting feedback: ${error.message}` });
  }
};

const userfeedbacks = async (req, res) => {
  try {
    const feedbacksSnapshot = await db.collection("feedbacks").get();
    const feedbacks = [];

    feedbacksSnapshot.forEach((doc) => {
      const feedbackData = doc.data();
      const feedback = {
        orderId: feedbackData.orderId,
        rating: feedbackData.rating,
        Comment: feedbackData.Comment,
        userId: feedbackData.userId,
        userName: feedbackData.userName,
      };
      feedbacks.push(feedback);
    });

    if (feedbacks.length === 0) {
      res
        .status(200)
        .send({ message: "No feedbacks found", feedbacks: feedbacks });
    } else {
      res.status(200).send({ message: "All feedbacks", feedbacks: feedbacks });
    }
  } catch (error) {
    console.error("Error getting user feedbacks: ", error);
    res.status(200).send("Error getting user feedbacks");
  }
};

const orderDashboard = async (req, res) => {
  try {
    const OrderSnapshot = await db.collection("orders").get();

    const TotalOrders = OrderSnapshot.size;
    let TotalDelivered = 0;
    let TotalCanceled = 0;
    let Revenue = 0;
    await db
      .collection("orders")
      .where("status", "==", "DELIVERED")
      .get()
      .then((snapshot) => {
        TotalDelivered = snapshot.size;
      });
    await db
      .collection("orders")
      .where("status", "==", "CANCELED")
      .get()
      .then((snapshot) => {
        TotalCanceled = snapshot.size;
      });
    const TotalCompleted = await db
      .collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    TotalCompleted.forEach((doc) => {
      console.log(doc.id);
      const orderDetails = doc.data();
      const price = orderDetails.finalBill;
      Revenue += price;
    });

    res.status(200).send({
      message: `Dashboard Details:`,
      TotalDelivered: TotalDelivered,
      TotalOrders: TotalOrders,
      TotalCanceled: TotalCanceled,
      TotalRevenue: Revenue,
    });
  } catch (error) {
    return res.status(200).send({
      message: `Unable to get the details : ${error.message},Please try again`,
    });
  }
};

module.exports = {
  createOrder,
  getOrders,
  orderDetail,
  searchOrders,
  orderStatusUpdate,
  getOrdersByStatus,
  UserOrders,
  orderfeedback,
  userfeedbacks,
  orderDashboard,
};
