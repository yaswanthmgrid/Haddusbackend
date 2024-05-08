const admin = require("firebase-admin");
const validator = require("validator");
const { app, adminApp } = require("../Db_firebase/firebase");
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} = require("firebase/auth");
const db = admin.firestore(adminApp);
const auth = getAuth(app);

const CreateAdmin = async (req, res) => {
  try {
    let { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(200).send({ message: `All field are required` });
    }
    name = name.trim();
    email = email.trim();
    password = password.trim();
    if (phone.toString().length !== 10) {
      return res.status(200).send({ message: "Enter a valid Phone Number" });
    }
    phone = parseInt(phone, 10);
    // Check if email is valid
    if (!validator.isEmail(email)) {
      return res.status(200).send({ message: "Enter a valid Email Address" });
    }

    // Check if password meets the criteria
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(200).send({
        message:
          "Password must contain at least 8 characters, including one uppercase letter, one lowercase letter, one number, and one special character.",
      });
    }
    // Create user authentication
    const adminData = {
      name: name,
      email: email,
      phone: phone,
    };

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Save the admin data to the database
    // Assuming you have a Firestore database reference called 'db'
    const adminRef = await db.collection("admins").add(adminData);
    const adminId = adminRef.id;

    res.status(201).send({
      message: "Admin created successfully",
      adminId: adminId,
    });
  } catch (error) {
    res.status(200).send("Error creating user: " + error.message);
  }
};
const loginAdmin = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    let username = "";
    let userid;

    if (!email && !phone) {
      return res
        .status(200)
        .send({ message: "Please provide either email or phone for login" });
    }

    if (phone && phone.toString().length !== 10) {
      return res.status(200).send({ message: "Enter a valid phone number" });
    }

    let userCredential;

    if (email) {
      const emailSnapshot = await db
        .collection("admins")
        .where("email", "==", email)
        .get();
      if (emailSnapshot.empty) {
        return res.status(200).send({ message: "Invalid credentials." });
      }
      const userDoc = emailSnapshot.docs[0];
      username = userDoc.data().name;
      userid = userDoc.id; // Get userid from the document ID (if applicable)
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } else if (phone) {
      const phoneSnapshot = await db
        .collection("admins")
        .where("phone", "==", phone)
        .get();

      if (phoneSnapshot.empty) {
        return res.status(200).send({ message: "Invalid credentials." });
      }

      const userDoc = phoneSnapshot.docs[0];
      const userEmail = userDoc.data().email;
      username = userDoc.data().name;
      userid = userDoc.id; // Get userid from the document ID (if applicable)
      userCredential = await signInWithEmailAndPassword(
        auth,
        userEmail,
        password
      );
    }

    const user = userCredential.user;

    res.status(200).send({
      message: "Admin authenticated successfully",
      admin: user,
      name: username,
      id: userid, // Send the admin ID in the response
    });
  } catch (error) {
    if (error.code === "auth/invalid-login-credentials") {
      res.status(200).send({ message: "Invalid credentials." });
    } else {
      res.status(200).send({ message: `Error during login: ${error.message}` });
    }
  }
};

const updateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { name, email, phone } = req.body;
    const tokenUid = req.user.uid;

    console.log(`Token UID: ${tokenUid}`);

    const userRef = db.collection("admin").doc(adminId);
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

    if (
      !emailQuerySnapshot.empty &&
      emailQuerySnapshot.docs[0].id !== adminId
    ) {
      return res.status(200).send({ message: "Email already exists" });
    }

    if (
      !phoneQuerySnapshot.empty &&
      phoneQuerySnapshot.docs[0].id !== adminId
    ) {
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
const getAdmin = async (req, res) => {
  try {
    // Query the "admins" collection
    const adminsSnapshot = await db.collection("admins").get();

    // Check if there are no documents in the collection
    if (adminsSnapshot.empty) {
      return res.status(200).send({ message: "No admin found" });
    }

    // Create an array to store the list of admins
    const admins = [];

    // Loop through each document in the snapshot
    adminsSnapshot.forEach((doc) => {
      // Get the admin data from the document
      const adminData = doc.data();
      const adminId = doc.id;
      // Extract the desired fields
      const admin = {
        Id: adminId,
        name: adminData.name,
        email: adminData.email,
        phone: adminData.phone,
      };

      // Add the admin object to the list
      admins.push(admin);
    });

    // Send the list of admins as the response
    res
      .status(200)
      .send({ message: "Admin data retrieved successfully", admins });
  } catch (error) {
    // Send an error response if there's an issue
    console.error("Error retrieving admin data:", error);
    res.status(200).send({ message: "Error retrieving admin data" });
  }
};

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Function to validate phone number format (10 digits)
function isValidPhoneNumber(phone) {
  const phoneRegex = /^\d{10}$/;
  return phoneRegex.test(phone);
}

const forgotpassword = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(200).send({ message: `Email is required` });
    }
    const emailSnapshot = await db
      .collection("admins")
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
  CreateAdmin,
  loginAdmin,
  updateAdmin,
  forgotpassword,
  logout,
  getAdmin,
};
