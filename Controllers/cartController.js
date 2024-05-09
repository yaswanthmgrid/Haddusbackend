const admin = require("firebase-admin");
const {
  collection,
  query,
  setDoc,
  where,
  getDocs,
  doc,
  getDoc,
} = require("firebase/firestore");
const { db } = require("../Db_firebase/firebase");

const applyCoupon = async (req, res) => {
  try {
    const { userId } = req.params;
    const { couponId } = req.body;

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data();

    if (!cartData) {
      return res
        .status(200)
        .send({ message: `Cart not found with id: ${userId}` });
    }

    const couponRef = doc(db, "coupons", couponId);
    const couponSnap = await getDoc(couponRef);
    const couponData = couponSnap.data();

    if (!couponData || couponData.Status === false) {
      return res.status(200).send({ message: `Invalid or unavailable coupon` });
    }

    if (cartData.bill === 0) {
      return res
        .status(200)
        .send({ message: `Can't apply coupon for empty cart` });
    }
    let finalBill = cartData.bill;
    if (couponData.Coupontype === "Percentage") {
      finalBill *= 1 - couponData.CouponAmount / 100;
    } else if (couponData.Coupontype === "Amount") {
      finalBill -= couponData.CouponAmount;
    }
    finalBill = Math.ceil(finalBill);

    const couponDiscount = cartData.bill - finalBill;

    await setDoc(cartRef, {
      ...cartData,
      Finalbill: finalBill,
      couponId: couponId,
      couponAmount: couponData.CouponAmount,
      couponDiscount: couponDiscount,
    });

    return {
      success: true,
      FinalBill: finalBill,
      CouponAmount: couponData.CouponAmount,
      couponDiscount,
      message: `Coupon applied successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error applying coupon: ${error.message}`,
    };
  }
};

const removeCoupon = async (req, res) => {
  try {
    const { userId } = req.params;

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data();

    if (!cartData) {
      return res.status(200).send({ message: "Cart not found" });
    }

    let newBill = 0;
    cartData.products.forEach((product) => {
      newBill += product.price2;
    });

    await setDoc(cartRef, {
      ...cartData,
      Finalbill: 0,
      couponId: "",
      couponAmount: 0,
      couponDiscount: 0,
    });
    console.log("Coupon Removed");
    return {
      success: true,
      FinalBill: newBill,
      message: `Coupon removed successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error removing coupon: ${error.message}`,
    };
  }
};

const createUserCart = async (userId, products) => {
  try {
    const cartDocRef = doc(db, "carts", userId);
    const cartDoc = await getDoc(cartDocRef);
    if (cartDoc.exists()) {
      throw new Error(
        "A cart already exists for this customer. If you want to add items, use the existing cart."
      );
    }

    let formattedProducts = [];

    if (products && products.length > 0) {
      const getProductDetails = async (productName) => {
        const productRef = collection(db, "products");
        const querySnapshot = await getDocs(
          query(productRef, where("name", "==", productName))
        );
        if (!querySnapshot.empty) {
          const productData = querySnapshot.docs[0].data();
          return productData;
        } else {
          return null;
        }
      };

      const validateProducts = async () => {
        for (const { name } of products) {
          const productDetails = await getProductDetails(name);
          if (!productDetails) {
            return false;
          }
        }
        return true;
      };

      const areProductsValid = await validateProducts();
      if (!areProductsValid) {
        throw new Error("One or more products are not found");
      }

      const calculatePrice2 = (product, quantity) => {
        let price2 = product.price * quantity;
        if (product.addOns) {
          product.addOns.forEach((addOn) => {
            price2 += addOn.addOnPrice * quantity;
          });
        }
        return price2;
      };

      formattedProducts = await Promise.all(
        products.map(async ({ name, quantity }) => {
          const productDetails = await getProductDetails(name);
          const addOns = productDetails.addOns || [];
          const finalQuantity = quantity || 1;
          const price2 = calculatePrice2(productDetails, finalQuantity);
          return {
            productName: productDetails.name,
            productImage: productDetails.photo,
            price: productDetails.price,
            quantity: finalQuantity,
            addOns: addOns,
            price2: price2,
          };
        })
      );
    }

    const bill = formattedProducts.reduce(
      (total, product) => total + (product.price2 || 0),
      0
    );

    await setDoc(cartDocRef, {
      products: formattedProducts,
      bill: bill,
      Finalbill: 0,
      couponId: "",
      couponAmount: 0,
      couponDiscount: 0,
    });

    return {
      message: "Cart created successfully",
      products: formattedProducts.map((product) => ({
        productName: product.productName,
        productImage: product.productImage,
        Itemprice: product.price,
        quantity: product.quantity,
        add_ons: product.addOns,
        Total_Price: product.price2,
      })),
      bill: bill,
    };
  } catch (error) {
    throw new Error(`Error creating cart: ${error.message}`);
  }
};

const addItemToCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { products } = req.body;

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(200).send({ message: `User ${userId} not found` });
    }

    const getProductDetails = async (productName) => {
      const productRef = collection(db, "products");
      const querySnapshot = await getDocs(
        query(productRef, where("name", "==", productName))
      );
      if (!querySnapshot.empty) {
        const productId = querySnapshot.docs[0].id;
        const productData = querySnapshot.docs[0].data();
        return { ...productData, productId };
      } else {
        return null;
      }
    };

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    let cartData = cartSnap.data() || { products: [] };

    const updatedProducts = Array.isArray(cartData.products)
      ? [...cartData.products]
      : [];

    for (const { name, quantity, addOns } of products) {
      const existingProductIndex = updatedProducts.findIndex(
        (p) => p.productName === name
      );

      if (existingProductIndex !== -1) {
        const existingProduct = updatedProducts[existingProductIndex];
        existingProduct.quantity += quantity || 1;
        existingProduct.price2 =
          existingProduct.price * existingProduct.quantity;
      } else {
        const productDetails = await getProductDetails(name);

        if (!productDetails) {
          return res
            .status(200)
            .send({ message: `Product "${name}" not found` });
        }

        const finalQuantity = quantity !== undefined ? quantity : 1;
        const basePrice =
          productDetails.DiscountPrice !== 0
            ? productDetails.DiscountPrice
            : productDetails.taxedPrice;
        let price2 =
          (basePrice +
            (addOns || []).reduce((total, addon) => total + addon.price, 0)) *
          finalQuantity;

        const newItem = {
          productName: productDetails.name,
          productId: productDetails.productId,
          productImage: productDetails.photo,
          originalPrice: productDetails.price,
          taxedPrice: productDetails.taxedPrice,
          price: basePrice,
          quantity: finalQuantity,
          addOns: addOns || [],
          price2: price2 || 0,
        };
        updatedProducts.push(newItem);
      }
    }

    const newBill = updatedProducts.reduce(
      (total, product) => total + (product.price2 || 0),
      0
    );

    await setDoc(cartRef, {
      products: updatedProducts,
      bill: newBill,
      couponId: cartData.couponId,
      couponAmount: cartData.couponAmount,
      Finalbill: cartData.Finalbill || 0,
    });

    if (cartData && cartData.couponId) {
      req.params.userId = userId;
      req.body.couponId = cartData.couponId;

      const applyCouponResult = await applyCoupon(req, res);

      if (applyCouponResult.success) {
        return res.status(200).send({
          message: applyCouponResult.message,
          FinalBill: applyCouponResult.FinalBill,
          CouponAmount: applyCouponResult.CouponAmount,
          couponDiscount: applyCouponResult.couponDiscount,
        });
      } else {
        return res.status(applyCouponResult.statusCode).send({
          message: applyCouponResult.message,
        });
      }
    } else {
      return res.status(200).send({
        message: "Items added to cart successfully",
        itemsAdded: products,
        newBill: newBill,
      });
    }
  } catch (error) {
    return res
      .status(200)
      .send({ message: `Error adding items to cart: ${error.message}` });
  }
};

const deleteItemFromCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName } = req.body;

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data() || { products: [] };

    const itemIndex = cartData.products.findIndex(
      (product) => product.productName === productName
    );

    if (itemIndex !== -1) {
      cartData.products.splice(itemIndex, 1);

      const newBill = cartData.products.reduce(
        (total, product) => total + (product.price2 || 0),
        0
      );

      await setDoc(cartRef, {
        ...cartData,
        products: cartData.products,
        bill: newBill,
      });

      if (cartData && cartData.couponId) {
        const couponRef = doc(db, "coupons", cartData.couponId);
        const couponSnap = await getDoc(couponRef);
        const couponData = couponSnap.data();

        if (couponData) {
          if (newBill < couponData.Minimumamount) {
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            const removeCouponResult = await removeCoupon(req, res);

            if (removeCouponResult.success) {
              return res.status(200).send({
                message: removeCouponResult.message,
                newBill,
              });
            } else {
              return res.status(removeCouponResult.statusCode).send({
                message: removeCouponResult.message,
              });
            }
          } else if (newBill >= couponData.Minimumamount) {
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            const applyCouponResult = await applyCoupon(req, res);

            if (applyCouponResult.success) {
              return res.status(200).send({
                message: applyCouponResult.message,
                FinalBill: applyCouponResult.FinalBill,
                CouponAmount: applyCouponResult.CouponAmount,
                couponDiscount: applyCouponResult.couponDiscount,
              });
            } else {
              return res.status(applyCouponResult.statusCode).send({
                message: applyCouponResult.message,
              });
            }
          }
        }
      }

      return res.status(200).send({
        message: `${productName} item deleted successfully`,
        newBill,
      });
    } else {
      return res.status(200).send({
        message: `Item "${productName}" not found in the cart`,
      });
    }
  } catch (error) {
    return res.status(200).send({
      message: `Error deleting item from cart: ${error.message}`,
    });
  }
};

const updateProductQuantityInCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName, quantity } = req.body;

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data() || { products: [] };

    const productIndex = cartData.products.findIndex(
      (product) => product.productName === productName
    );

    if (productIndex !== -1) {
      const product = cartData.products[productIndex];
      const oldQuantity = product.quantity;
      product.quantity = quantity;

      let price2Before = product.price2;
      let price2 = product.price * quantity;

      if (product.addOns) {
        product.addOns.forEach((addOn) => {
          price2 += addOn.price * quantity;
        });
      }

      product.price2 = price2;

      const addOns = product.addOns || [];
      const productsWithSameAddOns = cartData.products.filter(
        (p) =>
          JSON.stringify(p.addOns) === JSON.stringify(addOns) &&
          p.productName !== productName
      );
      productsWithSameAddOns.forEach((p) => {
        p.price2 += (price2 - product.price * oldQuantity) * p.quantity;
      });

      const newBill = cartData.products.reduce(
        (total, product) => total + (product.price2 || 0),
        0
      );

      await setDoc(cartRef, {
        products: cartData.products,
        bill: newBill,
        couponId: cartData.couponId,
        couponAmount: cartData.couponAmount,
        Finalbill: cartData.Finalbill || 0,
      });

      if (cartData && cartData.couponId) {
        const couponRef = doc(db, "coupons", cartData.couponId);
        const couponSnap = await getDoc(couponRef);
        const couponData = couponSnap.data();

        if (couponData) {
          if (newBill < couponData.Minimumamount) {
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            const removeCouponResult = await removeCoupon(req, res);

            if (removeCouponResult.success) {
              return res.status(200).send({
                message: removeCouponResult.message,
                newBill,
              });
            } else {
              return res.status(removeCouponResult.statusCode).send({
                message: removeCouponResult.message,
              });
            }
          } else if (newBill >= couponData.Minimumamount) {
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            const applyCouponResult = await applyCoupon(req, res);

            if (applyCouponResult.success) {
              return res.status(200).send({
                message: applyCouponResult.message,
                FinalBill: applyCouponResult.FinalBill,
                CouponAmount: applyCouponResult.CouponAmount,
                couponDiscount: applyCouponResult.couponDiscount,
              });
            } else {
              return res.status(applyCouponResult.statusCode).send({
                message: applyCouponResult.message,
              });
            }
          }
        }
      }

      return res.status(200).send({
        message: `Product "${productName}" quantity updated successfully`,
        newBill,
      });
    } else {
      return res.status(200).send({
        message: `Product "${productName}" not found in the cart`,
      });
    }
  } catch (error) {
    console.error("Error updating product quantity in cart:", error);
    return res.status(200).send({
      message: `Error updating product quantity in cart: ${error.message}`,
    });
  }
};

const deleteAddOnFromProductInCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName, selectedAddOns } = req.body;

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data() || { products: [] };
    const productIndex = cartData.products.findIndex(
      (product) => product.productName === productName
    );

    if (productIndex !== -1) {
      const product = cartData.products[productIndex];

      product.addOns = product.addOns.filter(
        (addOn) => !selectedAddOns.includes(addOn.name)
      );

      let price2 = product.price * product.quantity;
      if (product.addOns) {
        product.addOns.forEach((addOn) => {
          price2 += addOn.price * product.quantity;
        });
      }
      product.price2 = price2;

      const newBill = cartData.products.reduce(
        (total, product) => total + (product.price2 || 0),
        0
      );

      await setDoc(cartRef, {
        products: cartData.products,
        bill: newBill,
        couponId: cartData.couponId,
        couponAmount: cartData.couponAmount,
        Finalbill: cartData.Finalbill || 0,
      });
      if (cartData && cartData.couponId) {
        const couponRef = doc(db, "coupons", cartData.couponId);
        const couponSnap = await getDoc(couponRef);
        const couponData = couponSnap.data();

        if (couponData) {
          if (newBill < couponData.Minimumamount) {
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;
            const removeCouponResult = await removeCoupon(req, res);

            if (removeCouponResult.success) {
              return res.status(200).send({
                message: removeCouponResult.message,
                newBill,
              });
            } else {
              return res.status(removeCouponResult.statusCode).send({
                message: removeCouponResult.message,
              });
            }
          } else if (newBill >= couponData.Minimumamount) {
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;
            const applyCouponResult = await applyCoupon(req, res);

            if (applyCouponResult.success) {
              return res.status(200).send({
                message: applyCouponResult.message,
                FinalBill: applyCouponResult.FinalBill,
                CouponAmount: applyCouponResult.CouponAmount,
                couponDiscount: applyCouponResult.couponDiscount,
              });
            } else {
              return res.status(applyCouponResult.statusCode).send({
                message: applyCouponResult.message,
              });
            }
          }
        }
      }

      return res.status(200).send({
        message: `Selected add-ons updated for product "${productName}" successfully`,
        newBill,
      });
    } else {
      return res.status(200).send({
        message: `Product "${productName}" not found in the cart`,
      });
    }
  } catch (error) {
    return res.status(200).send({
      message: `Error updating selected add-ons for product in cart: ${error.message}`,
    });
  }
};

const getCart = async (req, res) => {
  try {
    const { userId } = req.params;

    const cartRef = doc(db, "carts", userId);

    const cartSnap = await getDoc(cartRef);

    if (!cartSnap.exists()) {
      return res.status(200).send({ message: `Cart ${userId} not found` });
    }

    const cartData = cartSnap.data();

    res.status(200).send({ cartData });
  } catch (error) {
    res
      .status(200)
      .send({ message: `Error getting cart details: ${error.message}` });
  }
};

const updateProductInCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName, addOnName } = req.body;

    if (!userId) {
      return res.status(200).send({ message: "User ID is required" });
    }

    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);

    if (!cartSnap.exists()) {
      return res
        .status(200)
        .send({ message: `Cart for user ${userId} not found` });
    }

    const cartData = cartSnap.data();
    const products = cartData.products || [];

    const productIndex = products.findIndex(
      (product) => product.productName === productName
    );

    if (productIndex === -1) {
      return res
        .status(200)
        .send({ message: `Product "${productName}" not found in the cart` });
    }

    const product = products[productIndex];

    const addOnIndex = product.addOns.findIndex(
      (addOn) => addOn.name === addOnName
    );

    if (addOnIndex === -1) {
      return res.status(200).send({
        message: `Add-on "${addOnName}" not found in product "${productName}`,
      });
    }

    product.addOns.splice(addOnIndex, 1);

    let price2 = product.price;
    if (product.addOns.length > 0) {
      price2 += product.addOns.reduce((total, addOn) => total + addOn.price, 0);
    }
    product.price2 = price2 * product.quantity;

    const newBill = products.reduce(
      (total, product) => total + (product.price2 || 0),
      0
    );

    await setDoc(cartRef, {
      products: products,
      bill: newBill,
      Finalbill: cartData.Finalbill || 0,
      couponId: cartData.couponId,
      couponAmount: cartData.couponAmount,
    });

    return res.status(200).send({
      message: ` Product "${productName}" updated successfully`,
      newBill: newBill,
    });
  } catch (error) {
    return res
      .status(200)
      .send({ message: `Error updating product in cart: ${error.message} ` });
  }
};

module.exports = {
  createUserCart,
  addItemToCart,
  deleteItemFromCart,
  updateProductQuantityInCart,
  deleteAddOnFromProductInCart,
  getCart,
  updateProductInCart,
};
