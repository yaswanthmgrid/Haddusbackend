const admin = require("firebase-admin");
const { adminApp } = require("../Db_firebase/firebase");
const sendEmail = require("./SendEmail");
const db = admin.firestore(adminApp);
const crypto = require("crypto");

const generateOTP = async (req, res) => {
  try {
    const { email } = req.params;

    // Check if the email is valid
    if (!isValidEmail(email)) {
      return res.status(400).send({ message: "Invalid email address" });
    }
    // Check if user already exists
    const userSnapshot = await db
      .collection("users")
      .where("email", "==", email)
      .get();
    if (!userSnapshot.empty) {
      return res.status(200).send({
        message: `User already exists using this email, please sign in`,
      });
    }

    // Check if OTP document exists for the email
    const otpDocRef = db.collection("otp").doc(email);
    const otpDoc = await otpDocRef.get();

    // Set OTP expiration time and generate the OTP
    const OTP_EXPIRATION_TIME = 10 * 60 * 1000; // 2 minutes in milliseconds
    const OTP_DELTE_TIME = 20 * 60 * 1000;
    const otp = generateRandomOTP(); // Generate a random 4-digit OTP
    const expirationTime = Date.now() + OTP_EXPIRATION_TIME; // Calculate expiration time

    // Prepare the data for the OTP document
    const otpData = {
      email: email,
      otp: otp,
      expirationTime: new Date(expirationTime),
      Status: true,
    };

    if (otpDoc.exists) {
      // Update existing document
      await otpDocRef.update(otpData);
    } else {
      // Create a new OTP document
      await otpDocRef.set(otpData);
    }

    // Calculate the expiration time in minutes for the email
    const time = OTP_EXPIRATION_TIME / 60000;

    // Schedule a task to update the OTP status to false after expiration time
    const timeoutId = setTimeout(async () => {
      await otpDocRef.update({ Status: false });
      console.log("OTP expired");
    }, OTP_EXPIRATION_TIME);
    const deletetimeoutId = setTimeout(async () => {
      await otpDocRef.delete();
    }, OTP_DELTE_TIME);

    // Store the timeout ID in the document for potential use later
    await otpDocRef.update({ timeoutId: String(timeoutId) });
    await sendEmail(email, otp, time);

    res.status(200).send({ message: `OTP has been sent: to ${email} email` });
  } catch (error) {
    console.error("Error generating OTP: " + error.message);
    return res
      .status(500)
      .send({ message: `Error generating OTP: ${error.message}` });
  }
};

// Function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Function to generate a random 4-digit OTP using the crypto library
const generateRandomOTP = () => {
  try {
    return Math.floor(1000 + crypto.randomInt(9000)).toString();
  } catch (error) {
    throw new Error("Error generating random OTP: " + error.message);
  }
};

// Function to validate OTP
const validateOTP = async (req, res) => {
  try {
    // Extract the email from the request parameters

    // Extract the entered OTP from the request body
    const { email, enteredOTP } = req.body;

    // Validate the email input
    if (!email || typeof email !== "string" || email.trim() === "") {
      return res.status(400).send({ message: "Invalid email provided" });
    }

    // Get the OTP document for the given email
    const otpDocRef = db.collection("otp").doc(email);
    const otpDoc = await otpDocRef.get();

    // Check if the OTP document exists
    if (!otpDoc.exists) {
      return res
        .status(404)
        .send({ message: "OTP not Generated, Please try Again" });
    }

    // Extract OTP data from the document
    const otpData = otpDoc.data();
    const storedOTP = otpData.otp;
    const expirationTime = otpData.expirationTime.toMillis();

    // Check if the OTP has expired
    if (Date.now() > expirationTime) {
      // OTP has expired, delete the document
      await otpDocRef.delete();
      return res.status(400).send({ message: "OTP has expired" });
    }

    // Compare the entered OTP with the stored OTP
    if (enteredOTP === storedOTP) {
      clearTimeout(Number(otpData.timeoutId));
      await otpDocRef.delete();
      return res.status(200).send({ message: "OTP validated successfully" });
    } else {
      // Incorrect OTP
      return res.status(400).send({ message: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error validating OTP:", error);
    return res
      .status(500)
      .send({ message: `Error validating OTP: ${error.message}` });
  }
};

module.exports = {
  generateOTP,
  validateOTP,
};
