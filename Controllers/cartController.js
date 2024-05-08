const admin = require("firebase-admin");
// const { applyCoupon, removeCoupon } = require("./couponController");

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

    // Get the cart document
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data();

    if (!cartData) {
      return res
        .status(200)
        .send({ message: `Cart not found with id: ${userId}` });
    }

    // Get the coupon document
    const couponRef = doc(db, "coupons", couponId);
    const couponSnap = await getDoc(couponRef);
    const couponData = couponSnap.data();

    if (!couponData || couponData.Status === false) {
      return res.status(200).send({ message: `Invalid or unavailable coupon` });
    }

    // Check the cart bill
    if (cartData.bill === 0) {
      return res
        .status(200)
        .send({ message: `Can't apply coupon for empty cart` });
    }

    // Calculate final bill and coupon discount
    let finalBill = cartData.bill;
    if (couponData.Coupontype === "Percentage") {
      finalBill *= 1 - couponData.CouponAmount / 100;
    } else if (couponData.Coupontype === "Amount") {
      finalBill -= couponData.CouponAmount;
    }
    finalBill = Math.ceil(finalBill);

    const couponDiscount = cartData.bill - finalBill;
    // Update the cart document
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

    // Get the cart document
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data();

    if (!cartData) {
      return res.status(200).send({ message: "Cart not found" });
    }

    // Calculate the new bill as the sum of price2 values in the products array
    let newBill = 0;
    cartData.products.forEach((product) => {
      newBill += product.price2;
    });

    // Update the cart document to remove coupon data and set Finalbill to 0
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
    // Check if a cart already exists for the user
    const cartDocRef = doc(db, "carts", userId);
    const cartDoc = await getDoc(cartDocRef);
    if (cartDoc.exists()) {
      throw new Error(
        "A cart already exists for this customer. If you want to add items, use the existing cart."
      );
    }

    // Initialize formattedProducts array
    let formattedProducts = [];

    if (products && products.length > 0) {
      // Function to fetch product details from the 'products' collection based on product names
      const getProductDetails = async (productName) => {
        const productRef = collection(db, "products");
        const querySnapshot = await getDocs(
          query(productRef, where("name", "==", productName))
        );
        if (!querySnapshot.empty) {
          const productData = querySnapshot.docs[0].data();
          return productData;
        } else {
          return null; // Return null if product not found
        }
      };

      // Function to validate if all products in the request exist in the 'products' collection
      const validateProducts = async () => {
        for (const { name } of products) {
          const productDetails = await getProductDetails(name);
          if (!productDetails) {
            return false; // If any product is not found, return false
          }
        }
        return true; // All products exist in the collection
      };

      // Check if all products in the request exist in the 'products' collection
      const areProductsValid = await validateProducts();
      if (!areProductsValid) {
        throw new Error("One or more products are not found");
      }

      // Function to calculate price2 for each product
      const calculatePrice2 = (product, quantity) => {
        let price2 = product.price * quantity;
        if (product.addOns) {
          product.addOns.forEach((addOn) => {
            price2 += addOn.addOnPrice * quantity;
          });
        }
        return price2;
      };

      // Transform each product to the desired structure with product details
      formattedProducts = await Promise.all(
        products.map(async ({ name, quantity }) => {
          const productDetails = await getProductDetails(name);
          const addOns = productDetails.addOns || []; // Default to empty array if addOns is undefined
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

    // Calculate bill as the sum of price2 for all products
    const bill = formattedProducts.reduce(
      (total, product) => total + (product.price2 || 0), // Add only if price2 is not null
      0
    );

    // Create a new document in the 'carts' collection
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
      bill: bill, // Include bill from newCartRef
    };
  } catch (error) {
    throw new Error(`Error creating cart: ${error.message}`);
  }
};

const addItemToCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { products } = req.body;

    // Check if the user exists in the users collection
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(200).send({ message: `User ${userId} not found` });
    }

    // Function to fetch product details from the 'products' collection
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

    // Get the current cart data
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    let cartData = cartSnap.data() || { products: [] };

    // Ensure cartData.products is an array
    const updatedProducts = Array.isArray(cartData.products)
      ? [...cartData.products]
      : [];

    // Loop through the products to add or update them in the cart
    for (const { name, quantity, addOns } of products) {
      // Find if the product already exists in the cart
      const existingProductIndex = updatedProducts.findIndex(
        (p) => p.productName === name
      );

      if (existingProductIndex !== -1) {
        // If the product already exists in the cart, update its quantity and price
        const existingProduct = updatedProducts[existingProductIndex];
        existingProduct.quantity += quantity || 1;
        existingProduct.price2 =
          existingProduct.price * existingProduct.quantity;
      } else {
        // If the product is not in the cart, add it as a new item
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

        // Construct the new item
        const newItem = {
          productName: productDetails.name,
          productId: productDetails.productId,
          productImage: productDetails.photo,
          originalPrice: productDetails.price,
          taxedPrice: productDetails.taxedPrice,
          price: basePrice,
          quantity: finalQuantity,
          addOns: addOns || [],
          price2: price2 || 0, // Ensure price2 is defined
        };
        updatedProducts.push(newItem);
      }
    }

    // Calculate the new bill based on the updated products array
    const newBill = updatedProducts.reduce(
      (total, product) => total + (product.price2 || 0),
      0
    );

    // Update the cart document with the updated products array and bill
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
        // Since applyCoupon already updated the cart document, just return a success response
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

// const deleteItemFromCart = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { productName } = req.body;

//     // Fetch the current cart data
//     const cartRef = doc(db, "carts", userId);
//     const cartSnap = await getDoc(cartRef);
//     const cartData = cartSnap.data() || { products: [] };

//     // Find the index of the item with the provided productName
//     const itemIndex = cartData.products.findIndex(
//       (product) => product.productName === productName
//     );

//     if (itemIndex !== -1) {
//       // If the item exists in the cart, remove it
//       cartData.products.splice(itemIndex, 1);

//       // Recalculate the bill based on the updated products array
//       const newBill = cartData.products.reduce(
//         (total, product) => total + (product.price2 || 0),
//         0
//       );

//       // Update the cart document with the modified products array and the new bill
//       await setDoc(cartRef, {
//         products: cartData.products,
//         bill: newBill,
//         Finalbill: cartData.Finalbill || 0,
//         couponId: cartData.couponId,
//         couponAmount: cartData.couponAmount,
//       });

//       // Send a success response
//       return res.status(200).send({
//         message: `${productName} item deleted successfully`,
//         newBill: newBill,
//       });
//     } else {
//       // If the item does not exist in the cart, send a not found response
//       return res.status(200).send({
//         message: `Item "${productName}" not found in the cart`,
//       });
//     }
//   } catch (error) {
//     // Handle errors
//     return res
//       .status(200)
//       .send({ message: `Error deleting item from cart: ${error.message}` });
//   }
// };

const deleteItemFromCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName } = req.body;

    // Fetch the current cart data
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data() || { products: [] };

    // Find the index of the item with the provided productName
    const itemIndex = cartData.products.findIndex(
      (product) => product.productName === productName
    );

    if (itemIndex !== -1) {
      // Remove the item from the cart
      cartData.products.splice(itemIndex, 1);

      // Recalculate the bill based on the updated products array
      const newBill = cartData.products.reduce(
        (total, product) => total + (product.price2 || 0),
        0
      );

      // Update the cart document with the modified products array and new bill
      await setDoc(cartRef, {
        ...cartData,
        products: cartData.products,
        bill: newBill,
      });

      // Check if the cart contains a coupon ID
      if (cartData && cartData.couponId) {
        // Retrieve the coupon data
        const couponRef = doc(db, "coupons", cartData.couponId);
        const couponSnap = await getDoc(couponRef);
        const couponData = couponSnap.data();

        // Check if the coupon data is available
        if (couponData) {
          // Determine whether to remove the coupon or apply it
          if (newBill < couponData.Minimumamount) {
            // Remove the coupon if the new bill is less than the minimum amount
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            // Call the removeCoupon function
            const removeCouponResult = await removeCoupon(req, res);

            if (removeCouponResult.success) {
              // Return the appropriate response
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
            // Apply the coupon if the new bill is greater than or equal to the minimum amount
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            // Call the applyCoupon function
            const applyCouponResult = await applyCoupon(req, res);

            if (applyCouponResult.success) {
              // Return the appropriate response
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

      // Return a success response
      return res.status(200).send({
        message: `${productName} item deleted successfully`,
        newBill,
      });
    } else {
      // Return an error response if the item is not found
      return res.status(200).send({
        message: `Item "${productName}" not found in the cart`,
      });
    }
  } catch (error) {
    // Handle any errors
    return res.status(200).send({
      message: `Error deleting item from cart: ${error.message}`,
    });
  }
};

// const updateProductQuantityInCart = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { productName, quantity } = req.body;

//     // Fetch the current cart data
//     const cartRef = doc(db, "carts", userId);
//     const cartSnap = await getDoc(cartRef);
//     const cartData = cartSnap.data() || { products: [] };

//     // Find the index of the product with the provided productName
//     const productIndex = cartData.products.findIndex(
//       (product) => product.productName === productName
//     );

//     if (productIndex !== -1) {
//       // If the product exists in the cart, update its quantity
//       const product = cartData.products[productIndex];
//       const oldQuantity = product.quantity;
//       product.quantity = quantity;

//       // Calculate the new price2 for the product
//       let price2Before = product.price2;
//       let price2 = product.price * quantity;

//       if (product.addOns) {
//         product.addOns.forEach((addOn) => {
//           price2 += addOn.price * quantity;
//         });
//       }

//       product.price2 = price2;

//       // Update the bill by adjusting the price2 of other products with the same add-ons
//       const addOns = product.addOns || [];
//       const productsWithSameAddOns = cartData.products.filter(
//         (p) =>
//           JSON.stringify(p.addOns) === JSON.stringify(addOns) &&
//           p.productName !== productName
//       );
//       productsWithSameAddOns.forEach((p) => {
//         p.price2 += (price2 - product.price * oldQuantity) * p.quantity;
//       });

//       // Recalculate the bill based on the updated products array
//       const newBill = cartData.products.reduce(
//         (total, product) => total + (product.price2 || 0),
//         0
//       );

//       await setDoc(cartRef, {
//         products: cartData.products,
//         bill: newBill,
//         Finalbill: cartData.Finalbill || 0,
//         couponId: cartData.couponId,
//         couponAmount: cartData.couponAmount,
//       });

//       // Send a success response
//       return res.status(200).send({
//         message: `Product "${productName}" quantity updated successfully`,
//         newBill: newBill,
//       });
//     } else {
//       // If the product does not exist in the cart, send a not found response
//       return res.status(200).send({
//         message: `Product "${productName}" not found in the cart`,
//       });
//     }
//   } catch (error) {
//     // Handle errors
//     console.error("Error updating product quantity in cart:", error);
//     return res.status(200).send({
//       message: `Error updating product quantity in cart: ${error.message}`,
//     });
//   }
// };
const updateProductQuantityInCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName, quantity } = req.body;

    // Fetch the current cart data
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data() || { products: [] };

    // Find the index of the product with the provided productName
    const productIndex = cartData.products.findIndex(
      (product) => product.productName === productName
    );

    if (productIndex !== -1) {
      // If the product exists in the cart, update its quantity
      const product = cartData.products[productIndex];
      const oldQuantity = product.quantity;
      product.quantity = quantity;

      // Calculate the new price2 for the product
      let price2Before = product.price2;
      let price2 = product.price * quantity;

      if (product.addOns) {
        product.addOns.forEach((addOn) => {
          price2 += addOn.price * quantity;
        });
      }

      product.price2 = price2;

      // Update the bill by adjusting the price2 of other products with the same add-ons
      const addOns = product.addOns || [];
      const productsWithSameAddOns = cartData.products.filter(
        (p) =>
          JSON.stringify(p.addOns) === JSON.stringify(addOns) &&
          p.productName !== productName
      );
      productsWithSameAddOns.forEach((p) => {
        p.price2 += (price2 - product.price * oldQuantity) * p.quantity;
      });

      // Recalculate the bill based on the updated products array
      const newBill = cartData.products.reduce(
        (total, product) => total + (product.price2 || 0),
        0
      );

      // Update the cart document with the modified products array and new bill
      await setDoc(cartRef, {
        products: cartData.products,
        bill: newBill,
        couponId: cartData.couponId,
        couponAmount: cartData.couponAmount,
        Finalbill: cartData.Finalbill || 0,
      });

      // Check if the cart contains a coupon ID
      if (cartData && cartData.couponId) {
        // Retrieve the coupon data
        const couponRef = doc(db, "coupons", cartData.couponId);
        const couponSnap = await getDoc(couponRef);
        const couponData = couponSnap.data();

        // Determine whether to remove the coupon or apply it
        if (couponData) {
          // Check if the new bill is less than the coupon's minimum amount
          if (newBill < couponData.Minimumamount) {
            // Remove the coupon if the new bill is less than the minimum amount
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            // Call removeCoupon to remove the coupon
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
            // Apply the coupon if the new bill is greater than or equal to the minimum amount
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            // Call applyCoupon to apply the coupon
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

      // Return a success response
      return res.status(200).send({
        message: `Product "${productName}" quantity updated successfully`,
        newBill,
      });
    } else {
      // If the product does not exist in the cart, send a not found response
      return res.status(200).send({
        message: `Product "${productName}" not found in the cart`,
      });
    }
  } catch (error) {
    // Handle errors
    console.error("Error updating product quantity in cart:", error);
    return res.status(200).send({
      message: `Error updating product quantity in cart: ${error.message}`,
    });
  }
};

// const deleteAddOnFromProductInCart = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { productName, selectedAddOns } = req.body;

//     // Fetch the current cart data
//     const cartRef = doc(db, "carts", userId);
//     const cartSnap = await getDoc(cartRef);
//     const cartData = cartSnap.data() || { products: [] };

//     // Find the index of the product with the provided productName
//     const productIndex = cartData.products.findIndex(
//       (product) => product.productName === productName
//     );

//     if (productIndex !== -1) {
//       // If the product exists in the cart
//       const product = cartData.products[productIndex];

//       // Filter out the selected add-ons and update the product
//       const updatedAddOns = product.addOns.filter((addOn) =>
//         selectedAddOns.includes(addOn.name)
//       );
//       product.addOns = updatedAddOns;

//       // Recalculate the price2 for the product
//       let price2 = product.price * product.quantity;
//       if (product.addOns) {
//         product.addOns.forEach((addOn) => {
//           price2 += addOn.addOnPrice * product.quantity;
//         });
//       }
//       product.price2 = price2;

//       // Recalculate the bill based on the updated products array
//       const newBill = cartData.products.reduce(
//         (total, product) => total + (product.price2 || 0),
//         0
//       );

//       // Update the cart document with the modified products array and the new bill
//       await setDoc(cartRef, {
//         products: cartData.products,
//         bill: newBill,
//         Finalbill: cartData.Finalbill || 0,
//         couponId: cartData.couponId,
//         couponAmount: cartData.couponAmount,
//       });

//       // Send a success response
//       return res.status(200).send({
//         message: `Selected add-ons updated for product "${productName}" successfully`,
//         newBill: newBill,
//       });
//     } else {
//       // If the product does not exist in the cart, send a not found response
//       return res.status(200).send({
//         message: `Product "${productName}" not found in the cart naidu`,
//       });
//     }
//   } catch (error) {
//     // Handle errors
//     return res.status(200).send({
//       message: `Error updating selected add-ons for product in cart: ${error.message}`,
//     });
//   }
// };

const deleteAddOnFromProductInCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { productName, selectedAddOns } = req.body;

    // Fetch the current cart data
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    const cartData = cartSnap.data() || { products: [] };

    // Find the index of the product with the provided productName
    const productIndex = cartData.products.findIndex(
      (product) => product.productName === productName
    );

    if (productIndex !== -1) {
      // If the product exists in the cart
      const product = cartData.products[productIndex];

      // Filter out the selected add-ons and update the product
      product.addOns = product.addOns.filter(
        (addOn) => !selectedAddOns.includes(addOn.name)
      );

      // Recalculate the price2 for the product
      let price2 = product.price * product.quantity;
      if (product.addOns) {
        product.addOns.forEach((addOn) => {
          price2 += addOn.price * product.quantity;
        });
      }
      product.price2 = price2;

      // Recalculate the bill based on the updated products array
      const newBill = cartData.products.reduce(
        (total, product) => total + (product.price2 || 0),
        0
      );

      // Update the cart document with the modified products array and new bill
      await setDoc(cartRef, {
        products: cartData.products,
        bill: newBill,
        couponId: cartData.couponId,
        couponAmount: cartData.couponAmount,
        Finalbill: cartData.Finalbill || 0,
      });

      // Check if the cart contains a coupon ID
      if (cartData && cartData.couponId) {
        // Retrieve the coupon data
        const couponRef = doc(db, "coupons", cartData.couponId);
        const couponSnap = await getDoc(couponRef);
        const couponData = couponSnap.data();

        // Determine whether to remove the coupon or apply it
        if (couponData) {
          // Check if the new bill is less than the coupon's minimum amount
          if (newBill < couponData.Minimumamount) {
            // Remove the coupon if the new bill is less than the minimum amount
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            // Call removeCoupon to remove the coupon
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
            // Apply the coupon if the new bill is greater than or equal to the minimum amount
            req.params.userId = userId;
            req.body.couponId = cartData.couponId;

            // Call applyCoupon to apply the coupon
            const applyCouponResult = await applyCoupon(req, res);

            if (applyCouponResult.success) {
              // Return the appropriate response
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

      // Return a success response
      return res.status(200).send({
        message: `Selected add-ons updated for product "${productName}" successfully`,
        newBill,
      });
    } else {
      // If the product does not exist in the cart, send a not found response
      return res.status(200).send({
        message: `Product "${productName}" not found in the cart`,
      });
    }
  } catch (error) {
    // Handle errors
    return res.status(200).send({
      message: `Error updating selected add-ons for product in cart: ${error.message}`,
    });
  }
};

const getCart = async (req, res) => {
  try {
    const { userId } = req.params;

    // Reference to the cart document
    const cartRef = doc(db, "carts", userId);

    // Retrieve the cart document
    const cartSnap = await getDoc(cartRef);

    // Check if the cart document exists
    if (!cartSnap.exists()) {
      return res.status(200).send({ message: `Cart ${userId} not found` });
    }

    // Extract cart data
    const cartData = cartSnap.data();

    // Send the cart data as response
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

    // Check if userId is provided
    if (!userId) {
      return res.status(200).send({ message: "User ID is required" });
    }

    // Get the cart document
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);

    // Check if cart document exists
    if (!cartSnap.exists()) {
      return res
        .status(200)
        .send({ message: `Cart for user ${userId} not found` });
    }

    // Extract cart data
    const cartData = cartSnap.data();
    const products = cartData.products || [];

    // Find the index of the product in the cart
    const productIndex = products.findIndex(
      (product) => product.productName === productName
    );

    // Check if product exists in the cart
    if (productIndex === -1) {
      return res
        .status(200)
        .send({ message: `Product "${productName}" not found in the cart` });
    }

    // Get the product
    const product = products[productIndex];

    // Find the index of the add-on in the product's add-ons array
    const addOnIndex = product.addOns.findIndex(
      (addOn) => addOn.name === addOnName
    );

    // Check if add-on exists in the product
    if (addOnIndex === -1) {
      return res.status(200).send({
        message: `Add-on "${addOnName}" not found in product "${productName}`,
      });
    }

    // Remove other add-ons from the product
    product.addOns.splice(addOnIndex, 1);

    // Update price2 of the product
    let price2 = product.price;
    if (product.addOns.length > 0) {
      price2 += product.addOns.reduce((total, addOn) => total + addOn.price, 0);
    }
    product.price2 = price2 * product.quantity;

    // Update bill
    const newBill = products.reduce(
      (total, product) => total + (product.price2 || 0),
      0
    );

    // Update the cart document with the modified products array and the new bill
    await setDoc(cartRef, {
      products: products,
      bill: newBill,
      Finalbill: cartData.Finalbill || 0,
      couponId: cartData.couponId,
      couponAmount: cartData.couponAmount,
    });

    // Send success response
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
