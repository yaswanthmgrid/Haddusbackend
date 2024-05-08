// const nodemailer = require("nodemailer");
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: "mgridapp@gmail.com",
//     pass: "sbcroxdapvduwgis",
//   },
// });

// const mailOptions = {
//   from: "mgridapp@gmail.com",
//   to: "yaswanth.mgrid@gmail.com",
//   subject: "Hello Yaswanth Naidu",
//   text: `Your One-Time Password (OTP) is: ${otp}`,
//   html: `
//       <p>Your One-Time Password (OTP) is: <strong>${otp}</strong></p>
//       <p>Please use this OTP to proceed with your request. The OTP is valid for a limited time.</p>
//     `,
// };

// // Send the email
// transporter.sendMail(mailOptions, (error, info) => {
//   if (error) {
//     console.error("Error sending email:", error);
//   } else {
//     console.log("Email sent successfully:", info.response);
//   }
// });

const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "mgridapp@gmail.com",
    pass: "sbcroxdapvduwgis",
  },
});

const sendEmail = async (recipientEmail, otp, time) => {
  // Define the email options
  const mailOptions = {
    from: "mgridapp@gmail.com", // Sender's email address
    to: recipientEmail, // Recipient's email address
    subject: "Haddus Kitchen One Time Password", // Subject of the email
    text: `Your One-Time Password (OTP) is: ${otp}`, // Plain text body
    html: `
      <p>Your One-Time Password (OTP) is: <strong>${otp}</strong></p>
      <p>Please use this OTP to proceed with your request. The OTP is valid only for ${time} minutes .</p>
    `, // HTML body
  };

  // Send the email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

module.exports = sendEmail;
