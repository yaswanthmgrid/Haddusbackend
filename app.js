//Seperate routes for admin and user like update product ;get-order,products,cart
const express = require("express");
const cors = require("cors");
const userroutes = require("./routes/userRoutes");
const adminroutes = require("./routes/adminRoutes");

const categoryroutes = require("./routes/categoryRoutes");
const subcategoryroutes = require("./routes/subcategoryRoutes");
const bannerrotues = require("./routes/bannerRoutes");
const productroutes = require("./routes/productRoutes");
const cartroutes = require("./routes/cartRoutes");
const orderroutes = require("./routes/orderRoutes");
const discountroutes = require("./routes/discountRoutes");
const otproutes = require("./routes/otpverificationRoutes");
const deliveryChargeroutes = require("./routes/deliverychargeRoutes");
const couponroutes = require("./routes/couponRoutes");

// const notificationroutes = require("./routes/pushNotificationroute");
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
  })
);

app.use(userroutes);
app.use(adminroutes);
app.use(categoryroutes);
app.use(subcategoryroutes);
app.use(bannerrotues);
app.use(productroutes);
app.use(cartroutes);
app.use(orderroutes);
app.use(discountroutes);
app.use(otproutes);
app.use(deliveryChargeroutes);
app.use(couponroutes);

const port = 3002;
app.listen(port, () => {
  console.log(`server is up and running on port : ${port}`);
});
