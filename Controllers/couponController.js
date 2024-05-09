const admin = require("firebase-admin");
const { adminApp } = require("../Db_firebase/firebase");
const couponSchema = require("../Models/couponModel");

const db = admin.firestore(adminApp);
const moment = require("moment");

const createCoupon = async (req, res) => {
  try {
    const { error, value } = couponSchema.validate(req.body);
    if (error) {
      return res
        .status(200)
        .send({ message: `Unable to create please :${error.message}` });
    }
    let {
      promocode,
      limit,
      coupontype,
      couponAmount,
      fromdate,
      todate,
      minimumamount,
    } = value;
    promocode = promocode.trim();
    const couponSnapshot = await db
      .collection("coupons")
      .where("Promocode", "==", promocode)
      .get();
    if (!couponSnapshot.empty) {
      return res.status(200).send({
        message: `Promocode already exists with this ${promocode} name , Use another name`,
      });
    }

    if (
      coupontype === "Percentage" &&
      (couponAmount < 0 || couponAmount > 99)
    ) {
      return res
        .status(200)
        .send({ message: `Amount must be between 0 and 99` });
    }
    if (coupontype === "Amount" && (couponAmount < 0 || couponAmount > 200)) {
      return res
        .status(200)
        .send({ message: `Amount must be between 0 and 200` });
    }
    if (limit < 0) {
      return res
        .status(200)
        .send({ message: `Limit  must not be less than 0` });
    }

    if (minimumamount < 0) {
      return res
        .status(200)
        .send({ message: `Minimum Amount must not be less than 0` });
    }
    if (moment(fromdate).isSameOrAfter(todate)) {
      return res
        .status(200)
        .send({ message: "From date must be before To date" });
    }

    if (moment(fromdate).isSameOrBefore(moment())) {
      return res
        .status(200)
        .send({ message: "From date must be in the future" });
    }

    fromdate = moment
      .utc(fromdate)
      .subtract(5, "hours")
      .subtract(30, "minutes")
      .toDate();
    todate = moment
      .utc(todate)
      .subtract(5, "hours")
      .subtract(30, "minutes")
      .toDate();
    Inputfromdate = moment
      .utc(fromdate)
      .add(5, "hours")
      .add(30, "minutes")
      .toDate();
    Inputtodate = moment
      .utc(todate)
      .add(5, "hours")
      .add(30, "minutes")
      .toDate();

    let validInput = {
      Promocode: promocode,
      Limit: limit,
      Used: 0,
      Coupontype: coupontype,
      CouponAmount: couponAmount,
      Fromdate: fromdate,
      Todate: todate,
      Minimumamount: minimumamount,
      Status: false,
    };

    const couponRef = await db.collection("coupons").add(validInput);
    const couponId = couponRef.id;
    const couponDocRef = db.collection("coupons").doc(couponId);

    const delayUpdate = moment(Inputfromdate).diff(moment());
    const delayReset = moment(Inputtodate).diff(moment());
    console.log(delayUpdate, delayReset);

    const updateTimeoutId = setTimeout(async () => {
      console.log(
        "Update operation triggered at:",
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
      );
      await couponDocRef.update({ Status: true });
    }, delayUpdate);

    const resetTimeoutId = setTimeout(async () => {
      console.log(
        "Reset operation triggered at:",
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
      );
      await couponDocRef.update({ Status: false });

      const cartsSnapshot = await db.collection("carts").get();

      for (const cartDoc of cartsSnapshot.docs) {
        const cartData = cartDoc.data();

        if (cartData.couponId === couponId) {
          await cartDoc.ref.update({
            Finalbill: 0,
            couponAmount: 0,
            couponId: "",
            couponDiscount: 0,
          });
        }
      }
    }, delayReset);

    await couponDocRef.update({
      timeouts: [
        { updateTimeoutId: String(updateTimeoutId) },
        { resetTimeoutId: String(resetTimeoutId) },
      ],
    });

    res.status(200).send({
      message: ` ${validInput.Promocode} Coupon created Successfully`,
    });
  } catch (error) {
    return res
      .status(200)
      .send({ message: `Unable to create the coupon :${error.message}` });
  }
};

const getallCoupons = async (req, res) => {
  try {
    const { id } = req.params;
    const adminSnapshot = await db.collection("admins").doc(id).get();
    const isamdin = adminSnapshot.exists;
    let couponSnapshot;
    if (isamdin) {
      couponSnapshot = await db.collection("coupons").get();
    } else {
      couponSnapshot = await db
        .collection("coupons")
        .where("Status", "==", true)
        .get();
    }

    if (couponSnapshot.empty) {
      return res.status(200).send({ message: `No COupons are Available` });
    }
    const Coupons = [];
    couponSnapshot.forEach((doc) => {
      const coupondata = doc.data();
      const couponID = doc.id;
      const fromDate = moment
        .utc(coupondata.Fromdate.toDate())
        .add(5, "hours")
        .add(30, "minutes")
        .toDate();

      const toDate = moment
        .utc(coupondata.Todate.toDate())
        .add(5, "hours")
        .add(30, "minutes")
        .toDate();
      const coupon = {
        promoId: couponID,
        Promocode: coupondata.Promocode,
        Limit: coupondata.Limit,
        Coupontype: coupondata.Coupontype,
        CouponAmount: coupondata.CouponAmount,
        Fromdate: fromDate.toLocaleString(),
        Todate: toDate.toLocaleString(),
        Minimumamount: coupondata.Minimumamount,
        Status: coupondata.Status,
        Used: coupondata.Used,
      };

      Coupons.push(coupon);
    });
    res.status(200).send({ message: `All Coupons:`, Coupons: Coupons });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Unable to get the Coupons:${error.message}` });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const { CouponId } = req.params;
    if (!CouponId) {
      return res.status(200).send({ message: `CouponId is required` });
    }

    const couponDocRef = db.collection("coupons").doc(CouponId);
    const couponSnapshot = await couponDocRef.get();
    if (!couponSnapshot.exists) {
      return res
        .status(200)
        .send({ message: `Coupon with id ${CouponId} not found` });
    }

    let { Fromdate, Todate, ...validUpdates } = req.body;

    if (Fromdate !== "" && couponSnapshot.data().timeouts) {
      clearTimeout(couponSnapshot.data().timeouts.updateTimeoutId);
    }
    if (Todate !== "" && couponSnapshot.data().timeouts) {
      clearTimeout(couponSnapshot.data().timeouts.resetTimeoutId);
    }

    const ISTFromdate = moment
      .utc(Fromdate)
      .subtract(11, "hours")

      .toDate();
    const ISTTodate = moment
      .utc(Todate)
      .subtract(11, "hours")

      .toDate();

    const parsedFromdate = Fromdate ? new Date(Fromdate) : undefined;
    const parsedTodate = Todate ? new Date(Todate) : undefined;
    const utcFromdate = parsedFromdate
      ? moment.utc(parsedFromdate).toDate()
      : undefined;
    const utcTodate = parsedTodate
      ? moment.utc(parsedTodate).toDate()
      : undefined;

    if (parsedFromdate && parsedTodate && parsedFromdate >= parsedTodate) {
      return res
        .status(200)
        .send({ message: `Todate must be greater than Fromdate` });
    }

    if (parsedFromdate && parsedFromdate <= new Date()) {
      return res
        .status(200)
        .send({ message: `FromDate must be in the Future` });
    }

    if (parsedTodate && parsedTodate <= new Date()) {
      return res.status(200).send({ message: `Todate must be in the Future` });
    }

    await couponDocRef.update({
      Fromdate: ISTFromdate,
      Todate: ISTTodate,
      Status: false,
      ...validUpdates,
    });

    let updateTimeoutId;
    if (parsedFromdate) {
      const currentTime = new Date();
      const delayUpdate = parsedFromdate - currentTime;
      const delayReset = parsedTodate - currentTime;
      console.log(delayUpdate, delayReset);
      updateTimeoutId = setTimeout(async () => {
        await couponDocRef.update({ Status: true });
      }, delayUpdate);

      resetTimeoutId = setTimeout(async () => {
        await couponDocRef.update({ Status: false });
      }, delayReset);

      await couponDocRef.update({
        timeouts: {
          updateTimeoutId: String(updateTimeoutId),
          resetTimeoutId: String(resetTimeoutId),
        },
      });
    }

    if (parsedTodate) {
      const currentTime = new Date();
      const delayReset = parsedTodate - currentTime;

      const resetTimeoutId = setTimeout(async () => {
        await couponDocRef.update({ Status: false });
      }, delayReset);

      await couponDocRef.update({
        timeouts: {
          updateTimeoutId: String(updateTimeoutId),
          resetTimeoutId: String(resetTimeoutId),
        },
      });
    }

    return res.status(200).send({ message: `Coupon updated successfully` });
  } catch (error) {
    console.error("Error updating coupon: ", error);
    return res
      .status(200)
      .send({ message: `Unable to update the coupon: ${error.message}` });
  }
};

const updateCouponstatus = async (req, res) => {
  try {
    const { couponId } = req.params;
    if (!couponId) {
      return res
        .status(200)
        .send({ message: `Coupon Id is required to update the status` });
    }
    const couponSnapshot = await db.collection("coupons").doc(couponId).get();
    if (!couponSnapshot.exists) {
      return res.status(200).send({ message: `Coupon not found with that ID` });
    }

    const currentDate = moment();

    const todate = moment(couponSnapshot.data().Todate.toDate());
    const Inputtodate = moment.utc(todate).add(5, "hours").add(30, "minutes");

    if (couponSnapshot.data().Status === true) {
      await couponSnapshot.ref.update({ Status: false });
      return res.status(200).send({ message: `Status updated to false` });
    } else {
      if (Inputtodate.isBefore(currentDate)) {
        return res.status(200).send({
          message: `Status can't be updated as Todate is in the past. Please change the fromdate and todate accordingly`,
        });
      } else {
        if (Used >= Limit) {
          return res.status(200).send({
            message: `Can't Update the Status to True As Coupon Redeemed limit Reached Please Update the Limit`,
          });
        }
        await couponSnapshot.ref.update({ Status: true });
        return res.status(200).send({ message: `Status updated to true` });
      }
    }
  } catch (error) {
    return res
      .status(200)
      .send({ message: `Unable to update the status: ${error.message}` });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { userId } = req.params;
    const { couponId } = req.body;

    const cartSnapshot = await db.collection("carts").doc(userId).get();
    const cartData = cartSnapshot.data();
    if (!cartData) {
      return { success: false, message: `Cart not found with id: ${userId}` };
    }

    const couponSnapshot = await db.collection("coupons").doc(couponId).get();
    const couponData = couponSnapshot.data();
    if (!couponData || couponData.Status === false) {
      return { success: false, message: `Invalid or unavailable coupon` };
    }

    if (cartData.bill == 0) {
      return { success: false, message: `Can't apply coupon for empty cart` };
    }

    let finalBill = cartData.bill;
    if (couponData.Coupontype === "Percentage") {
      finalBill *= 1 - couponData.CouponAmount / 100;
    } else if (couponData.Coupontype === "Amount") {
      finalBill -= couponData.CouponAmount;
    }
    finalBill = Math.ceil(finalBill);

    const couponDiscount = cartData.bill - finalBill;

    await cartSnapshot.ref.update({
      Finalbill: finalBill,
      couponId: couponId,
      couponAmount: couponData.CouponAmount,
      couponDiscount,
    });

    return res.status(200).send({
      success: true,
      FinalBill: finalBill,
      CouponAmount: couponData.CouponAmount,
      couponDiscount,
      message: `Coupon applied successfully`,
    });
  } catch (error) {
    return res.status(200).send({
      success: false,
      message: `Error applying coupon: ${error.message}`,
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const { userId } = req.params;
    const cartsSnapshot = await db.collection("carts").doc(userId).get();
    const cartData = cartsSnapshot.data();

    if (!cartData) {
      return res.status(200).send({ message: "Cart not found" });
    }

    let newBill = 0;
    cartData.products.forEach((product) => {
      newBill += product.price2;
    });
    await cartsSnapshot.ref.update({
      Finalbill: 0,
      couponId: "",
      couponAmount: 0,
      couponDiscount: 0,
    });
    return res.status(200).send({
      success: true,
      FinalBill: finalBill,
      message: `Coupon removed successfully`,
    });
  } catch (error) {
    return res.status(200).send({
      success: false,
      message: `Error removing coupon: ${error.message}`,
    });
  }
};

module.exports = {
  createCoupon,
  getallCoupons,
  updateCoupon,
  updateCouponstatus,
  applyCoupon,
  removeCoupon,
};
