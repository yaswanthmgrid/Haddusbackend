require("dotenv").config();
const admin = require("firebase-admin");

const axios = require("axios");

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).send({ message: "Refresh token is required" });
    }

    // Define the token endpoint URL provided by Firebase
    const tokenEndpoint = `https://securetoken.googleapis.com/v1/token?key=${process.env.FIREBASE_API_KEY}`;

    // Send a POST request to the token endpoint with Axios
    const response = await axios.post(tokenEndpoint, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const { id_token: newAccessToken } = response.data;

    if (!newAccessToken) {
      return res
        .status(400)
        .send({ message: "Failed to refresh access token" });
    }

    // Return the new access token
    res.status(200).send({ accessToken: newAccessToken });
    next();
  } catch (error) {
    console.error("Error refreshing access token:", error.message);
    res.status(500).send({ message: "Internal server error" });
  }
};

const verifyToken = async (req, res, next) => {
  const idToken = req.headers.authorization;

  try {
    if (!idToken) {
      return res
        .status(401)
        .send("Unauthorized: No Firebase ID token provided");
    }

    const [, token] = idToken.split(" ");

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).send("Unauthorized: Invalid Firebase ID token");
  }
};

module.exports = { verifyToken, refreshAccessToken };
