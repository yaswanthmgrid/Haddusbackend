const admin = require("firebase-admin");
const { app, adminApp } = require("../Db_firebase/firebase");
const multer = require("multer");
const { createUserCart } = require("./cartController");
const { createUserSchema } = require("../Models/userModel");
const { registerNotification } = require("./notificationController");
const { verifyToken } = require("../Middleware/otpVerification");
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} = require("firebase/auth");
const db = admin.firestore(adminApp);
const auth = getAuth(app);

const createUser = async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(200).send({ message: error.details[0].message });
    }

    const { name, email, phone, password, DeviceToken, permission } = value;

    if (phone.toString().length !== 10) {
      return res
        .status(200)
        .send({ message: "Phone number must be 10 digits." });
    }
    const emailQuery = await db
      .collection("users")
      .where("email", "==", email)
      .get();
    const phoneQuery = await db
      .collection("users")
      .where("phone", "==", phone)
      .get();

    if (!emailQuery.empty || !phoneQuery.empty) {
      return res.status(200).send({
        message:
          "User already exists with this email or phone number. Please use Sign-in.",
      });
    }
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    const registrationDate = `${year}${month}${day}`;

    let userNumber = 1;
    let userId = `CUS${registrationDate}${userNumber
      .toString()
      .padStart(4, "0")}`;
    let existingUser = await db.collection("users").doc(userId).get();
    while (existingUser.exists) {
      userNumber++;
      userId = `CUS${registrationDate}${userNumber
        .toString()
        .padStart(4, "0")}`;
      existingUser = await db.collection("users").doc(userId).get();
    }
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const newUser = {
      name: name,
      email: email,
      phone: phone,
      address: null,
      permission: permission,
      userId: userId,
      DeviceToken: DeviceToken,
    };

    await db.collection("users").doc(userId).set(newUser);

    await createUserCart(userId);

    res.status(201).send({
      message: "User created successfully",
    });
  } catch (error) {
    res.status(200).send("Error creating user: " + error.message);
  }
};

const updateUserDeviceToken = async (req, res) => {
  try {
    const { userId } = req.params;
    const { devicetoken } = req.body;
    if (!devicetoken) {
      return res.staus(200).send({ message: `device token is required` });
    }

    const userSnapshot = await db.collection("users").doc(userId).get();
    if (userSnapshot.empty) {
      return res.staus(200).send({ message: `User not found` });
    }
    await userSnapshot.update({ DeviceToken: devicetoken });
    res.staus(200).send({ message: `Device Token updated` });
  } catch (error) {
    res
      .status(200)
      .send({ message: `unable to update the device token :${error.message}` });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    let username = "";
    let userid = "";

    if (!email && !phone) {
      return res
        .status(200)
        .send({ message: "Please provide either email or phone for login" });
    }

    if (phone && phone.toString().length !== 10) {
      return res
        .status(200)
        .send({ message: "Enter a valid Phone Number of 10 digits" });
    }

    let userCredential;

    if (email) {
      const emailSnapshot = await db
        .collection("users")
        .where("email", "==", email)
        .get();
      if (emailSnapshot.empty) {
        return res
          .status(200)
          .send({ message: "User not found with this email,Please Sign-up" });
      }
      const userDoc = emailSnapshot.docs[0];
      username = userDoc.data().name;
      userid = userDoc.data().userId;
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } else if (phone) {
      const phoneSnapshot = await db
        .collection("users")
        .where("phone", "==", phone)
        .get();

      if (phoneSnapshot.empty) {
        return res.status(200).send({
          message: "User not found with this phone number,Please Sign-up",
        });
      }

      const userDoc = phoneSnapshot.docs[0];
      const userEmail = userDoc.data().email;
      username = userDoc.data().name;
      userid = userDoc.data().userId;

      userCredential = await signInWithEmailAndPassword(
        auth,
        userEmail,
        password
      );
    }

    const user = userCredential.user;

    res.status(200).send({
      message: "User authenticated successfully",
      user: user,
      name: username,
      userid: userid,
    });
  } catch (error) {
    if (error.code === "auth/invalid-login-credentials") {
      res.status(200).send({ message: "Invalid Credentials" });
    } else {
      res.status(200).send(error.message);
    }
  }
};

const getUsers = async (req, res) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    const users = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const userid = doc.id;
      const ordersSnapshot = await db
        .collection("orders")
        .where("userId", "==", userid)
        .get();
      const numberoforders = ordersSnapshot.size;
      let firstAddress = {};
      if (data.address && data.address.length > 0) {
        // Get the first element of the address array
        firstAddress = data.address[0];
      }
      const user = {
        userid: userid,
        userName: data.name,
        email: data.email,
        phone: data.phone,
        address: firstAddress,
        orders: numberoforders,
      };
      users.push(user);
    }

    res.status(200).send({ Users: users.length, users });
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const getUserByName = async (req, res) => {
  try {
    const userName = req.params.name;
    const userSnapshot = await db
      .collection("users")
      .where("name", "==", userName)
      .get();

    if (userSnapshot.empty) {
      res.status(200).send("User not found");
    } else {
      const userData = userSnapshot.docs[0].data();
      res.status(200).send({ id: userSnapshot.docs[0].id, data: userData });
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    const userDoc = await db.collection("users").doc(userId).get();

    if (userDoc.empty) {
      res.status(200).send("User not found");
    } else {
      res.status(200).send({ id: userDoc.id, data: userDoc.data() });
    }
  } catch (error) {
    res.status(200).send({ message: `error getting user : ${error.message}` });
  }
};

const getUserByEmail = async (req, res) => {
  try {
    const userEmail = req.params.email;
    const userSnapshot = await db
      .collection("users")
      .where("email", "==", userEmail)
      .get();

    if (userSnapshot.empty) {
      res.status(200).send("User not found");
    } else {
      const userData = userSnapshot.docs[0].data();
      res.status(200).send({ id: userSnapshot.docs[0].id, data: userData });
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const getUserByPhone = async (req, res) => {
  try {
    const { userPhone } = req.params;
    const userSnapshot = await db
      .collection("users")
      .where("phone", "==", userPhone)
      .get();

    if (userSnapshot.empty) {
      res.status(200).send("User not found");
    } else {
      const userData = userSnapshot.docs[0].data();
      res.status(200).send({ id: userSnapshot.docs[0].id, data: userData });
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone } = req.body;
    const tokenUid = req.user.uid;

    console.log(`Token UID: ${tokenUid}`);

    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return res.status(200).send({ message: "User not found" });
    }

    const userData = userSnapshot.data();
    let trimmedEmail = email ? email.trim() : null;

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      return res.status(200).send({ message: "Invalid email format" });
    }

    let phoneNum = null;
    if (phone !== null) {
      phoneNum = parseInt(phone, 10);
      if (isNaN(phoneNum) || phoneNum.toString().length !== 10) {
        return res.status(200).send({
          message: "Invalid phone number; it must be a 10-digit number",
        });
      }
    }

    // Check if a user with the new email or phone number already exists
    const emailQuerySnapshot = await db
      .collection("users")
      .where("email", "==", trimmedEmail)
      .get();
    const phoneQuerySnapshot = await db
      .collection("users")
      .where("phone", "==", phoneNum)
      .get();

    if (!emailQuerySnapshot.empty && emailQuerySnapshot.docs[0].id !== userId) {
      return res.status(200).send({ message: "Email already exists" });
    }

    if (!phoneQuerySnapshot.empty && phoneQuerySnapshot.docs[0].id !== userId) {
      return res.status(200).send({ message: "Phone number already exists" });
    }

    const updateData = {};

    if (name !== undefined && name !== "") {
      updateData.name = name.trim();
    }

    if (phoneNum !== null) {
      updateData.phone = phoneNum; // Store phone as a number
    }

    if (trimmedEmail && trimmedEmail !== userData.email) {
      try {
        await admin.auth().updateUser(tokenUid, {
          email: trimmedEmail,
        });

        updateData.email = trimmedEmail;
      } catch (error) {
        console.error("Error updating email: " + error.message);
        return res.status(200).send("Error updating email: " + error.message);
      }
    }

    console.log(`updateData: ${JSON.stringify(updateData)}`);

    // Update the user document in Firestore
    await userRef.update(updateData);

    return res.status(200).send({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user: " + error.message);
    return res
      .status(200)
      .send({ message: "Error updating user: " + error.message });
  }
};

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhoneNumber(phone) {
  const phoneRegex = /^\d{10}$/;
  return phoneRegex.test(phone);
}

const addNewAddress = async (req, res) => {
  try {
    const { userId } = req.params;
    const { Address } = req.body;

    // Check if Address field is provided
    if (!Address || !Array.isArray(Address) || Address.length === 0) {
      return res.status(200).send({ message: "Address is required" });
    }

    // Check if all required fields in each address are provided and not empty
    for (const addr of Address) {
      const { plot, street, landmark, area, city, pincode } = addr;
      if (!plot || !street || !landmark || !area || !city || !pincode) {
        return res
          .status(200)
          .send({ message: "All fields in Address are required" });
      }
    }

    const userRef = db.collection("users").doc(userId);

    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.address && userData.address.length >= 5) {
        return res
          .status(200)
          .send({ message: "Maximum address limit reached" });
      }
      const newAddresses = userData.address
        ? [...userData.address, ...Address]
        : Address;

      // Update the user document with the new addresses array
      await userRef.update({ address: newAddresses });

      res.status(200).send({ message: "New address added successfully" });
    } else {
      res.status(200).send("User not found");
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const getAllAddresses = async (req, res) => {
  try {
    const { userId } = req.params;
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const addresses = userData.address || [];
      res.status(200).send({ message: `All address`, addresses });
    } else {
      res.status(200).send({ message: "User not found" });
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const editAddress = async (req, res) => {
  try {
    const { userId, index } = req.params;
    const { Address } = req.body;

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const addresses = userData.address || [];
      if (index >= 0 && index < addresses.length) {
        addresses[index] = Address;
        await userRef.update({ address: addresses });
        res.status(200).send({ message: "Address updated successfully" });
      } else {
        res.status(200).send({ message: "Invalid address index" });
      }
    } else {
      res.status(200).send({ message: "User not found" });
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { userId, index } = req.params;

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const addresses = userData.address || [];
      if (index >= 0 && index < addresses.length) {
        addresses.splice(index, 1);
        await userRef.update({ address: addresses });
        res.status(200).send({ message: "Address deleted successfully" });
      } else {
        res.status(200).send({ messsage: "Invalid address index" });
      }
    } else {
      res.status(200).send({ messsage: "User not found" });
    }
  } catch (error) {
    res.status(200).send(error.message);
  }
};

const forgotpassword = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(200).send({ message: `Email is required` });
    }
    const emailSnapshot = await db
      .collection("users")
      .where("email", "==", email)
      .get();
    if (emailSnapshot.empty) {
      return res
        .status(200)
        .send({ message: `User is not found with this Email Address` });
    }
    sendPasswordResetEmail(auth, email)
      .then(() => {
        res.status(200).send({
          message: `Reset password Mail has been sent to your email:${email}`,
        });
      })
      .catch(() => {
        res.status(200).send({
          message: `Unable to send forgetpassword to your email:${email}`,
        });
      });
  } catch (error) {
    res.status(200).send({
      message: `unable to send the mail :${error.messsage}`,
    });
  }
};

const logout = async (req, res) => {
  try {
    await signOut(auth);
    res.status(200).send({ message: "User signed out successfully" });
  } catch (error) {
    console.error("Error signing out user:", error);
    res.status(200).send({ message: "Error signing out user" });
  }
};

module.exports = {
  createUser,
  loginUser,
  getUsers,
  getUserById,
  getUserByName,
  getUserByPhone,
  getUserByEmail,
  updateUser,
  addNewAddress,
  getAllAddresses,
  editAddress,
  deleteAddress,
  updateUserDeviceToken,
  forgotpassword,
  logout,
};
