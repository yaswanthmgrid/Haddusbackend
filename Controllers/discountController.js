const discountSchema = require("../Models/discountModel");
const admin = require("firebase-admin");
const { app, adminApp } = require("../Db_firebase/firebase");
const {
  discountNotification,
} = require("../Controllers/notificationController");
const db = admin.firestore(adminApp);

const moment = require("moment");

const updateProducts = async (allUpdatedProducts, discountAmount) => {
  const updatedProducts = [];

  // Iterate over each product in the allUpdatedProducts array
  for (const product of allUpdatedProducts) {
    const taxedPrice = product.taxedPrice;
    const discountedAmount = (discountAmount / 100) * taxedPrice;
    let discountPrice = taxedPrice - discountedAmount;
    discountPrice = Math.ceil(discountPrice);

    // Update the Discount and DiscountPrice fields for each product
    await db.collection("products").doc(product.id).update({
      Discount: discountAmount,
      DiscountPrice: discountPrice,
    });

    // Add the updated product details to the array
    const updatedProduct = {
      id: product.id,
      name: product.name,
      DiscountPrice: discountPrice,
    };
    updatedProducts.push(updatedProduct);
  }

  // Return the array of updated products
  return updatedProducts;
};

const resetProducts = async (allUpdatedProducts) => {
  const resetProductsArray = [];

  // Iterate over each product in the allUpdatedProducts array
  for (const product of allUpdatedProducts) {
    // Reset the discount and discount price for each product
    await db.collection("products").doc(product.id).update({
      Discount: 0,
      DiscountPrice: 0,
    });

    // Add the reset product details to the array
    const resetProduct = {
      id: product.id,
      name: product.name,
      taxedPrice: product.taxedPrice,
    };
    resetProductsArray.push(resetProduct);
  }

  // Return the array of reset products
  return resetProductsArray;
};

const updateCarts = async (cartsSnapshot, updatedProducts) => {
  const cartsToUpdatePromises = cartsSnapshot.docs.map(async (cartDoc) => {
    const cartData = cartDoc.data();
    let newBill = 0;

    // Iterate through each product in the cart
    if (cartData.products && Array.isArray(cartData.products)) {
      cartData.products.forEach((product) => {
        // Find the corresponding updated product from updatedProducts
        const updatedProduct = updatedProducts.find(
          (p) => p.id === product.productId
        );

        // If an updated product is found
        if (updatedProduct) {
          // Update product's price field based on the available data
          const discountPrice = updatedProduct.DiscountPrice || 0;
          const taxedPrice = updatedProduct.taxedPrice || 0;

          // Determine the new price
          if (discountPrice > 0) {
            product.price = discountPrice;
          } else {
            product.price = taxedPrice;
          }

          // Calculate price2: price * quantity plus add-ons price
          product.price2 = product.price * product.quantity;
          if (product.addOns && Array.isArray(product.addOns)) {
            product.addOns.forEach((addon) => {
              product.price2 += addon.price * product.quantity;
            });
          }

          // Add the product's price2 to the new bill
          newBill += product.price2;
        } else {
          // Update product's price field based on the available data
          const discountPrice = product.DiscountPrice || 0;
          const taxedPrice = product.taxedPrice || 0;

          // Determine the new price
          if (discountPrice > 0) {
            product.price = discountPrice;
          } else {
            product.price = taxedPrice;
          }

          // Calculate price2: price * quantity plus add-ons price
          product.price2 = product.price * product.quantity;
          if (product.addOns && Array.isArray(product.addOns)) {
            product.addOns.forEach((addon) => {
              product.price2 += addon.price * product.quantity;
            });
          }

          // Add the product's price2 to the new bill
          newBill += product.price2;
        }
      });

      // Prepare the data to be updated in the Firestore document
      const updateData = {
        products: cartData.products,
        bill: newBill,
      };

      // Optional: Update other cart fields if they exist
      if (cartData.Finalbill !== undefined) {
        updateData.Finalbill = cartData.Finalbill;
      }
      if (cartData.couponId !== undefined) {
        updateData.couponId = cartData.couponId;
      }
      if (cartData.couponAmount !== undefined) {
        updateData.couponAmount = cartData.couponAmount;
      }

      // Update the cart document in Firestore
      await cartDoc.ref.update(updateData);
    } else {
      console.log(`No products found for cart: ${cartDoc.id}`);
    }
  });

  // Wait for all cart updates to complete
  await Promise.all(cartsToUpdatePromises);
};

const resetCarts = async (cartsSnapshot, resetProductsArray) => {
  // Iterate over each cart document
  const cartsResetPromises = cartsSnapshot.docs.map(async (cartDoc) => {
    const cartData = cartDoc.data();
    let newBill = 0;

    // Check if cartData.products exists and iterate over them
    if (cartData.products && Array.isArray(cartData.products)) {
      cartData.products.forEach((product) => {
        const resetProduct = resetProductsArray.find(
          (p) => p.id === product.productId
        );

        if (resetProduct) {
          // Reset price and price2 for the product in the cart
          product.price = resetProduct.taxedPrice || 0;
          product.price2 = product.price * product.quantity;
        }
      });

      // Recalculate the bill for the cart
      cartData.products.forEach((product) => {
        newBill += product.price2;
      });

      // Update bill for the cart
      await cartDoc.ref.update({
        products: cartData.products,
        bill: newBill,
        Finalbill: cartData.Finalbill,
        couponId: cartData.couponId,
        couponAmount: cartData.couponAmount,
      });
    } else {
      console.log(`No products found for cart: ${cartDoc.id}`);
    }
  });

  // Wait for all cart resets to complete
  await Promise.all(cartsResetPromises);
};

const createDiscount = async (req, res) => {
  try {
    const { error, value } = discountSchema.validate(req.body);
    if (error) {
      return res.status(200).send({ message: error.message });
    }
    let { applicablefor, applicableinput, discountamount, fromdate, todate } =
      value;
    applicablefor = applicablefor.trim();
    const userId = "CUS2405030001";
    console.log(
      applicablefor,
      applicableinput,
      discountamount,
      fromdate,
      todate
    );

    if (!["category", "subcategory", "product"].includes(applicablefor)) {
      return res.status(200).send({
        message:
          "Applicablefor must be either 'category', 'subcategory', or 'product'",
      });
    }

    if (discountamount <= 0 || discountamount >= 100) {
      return res
        .status(200)
        .send({ message: "DiscountAmount must be between 0 and 100" });
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
    Inputtodate = moment(todate).add(5, "hours").add(30, "minutes").toDate();

    switch (applicablefor) {
      case "category":
        // Iterate through each applicable input element (category name)
        for (let element of applicableinput) {
          // Fetch the category data
          const categorySnapshot = await db
            .collection("categories")
            .where("name", "==", element)
            .get();

          if (categorySnapshot.empty) {
            return res.status(200).send({
              message: `Category '${element}' not found`,
            });
          }

          // Get the category name and ID
          const categoryName = categorySnapshot.docs[0].data().name;
          const categoryId = categorySnapshot.docs[0].id;

          // Fetch existing discounts for the category with condition "All" products
          const existingDiscountSnapshot = await db
            .collection("discounts")
            .where("Category", "==", categoryName)
            .where("Products", "==", "All")
            .get();

          if (!existingDiscountSnapshot.empty) {
            // Handle the existing discount case
            const existingDiscountDoc = existingDiscountSnapshot.docs[0];
            const existingDiscountId = existingDiscountDoc.id;
            const existingDiscountRef = db
              .collection("discounts")
              .doc(existingDiscountId);

            try {
              // Update existing discount details
              await existingDiscountRef.update({
                DiscountAmount: discountamount,
                FromDate: fromdate,
                ToDate: todate,
                active: false,
              });

              const subcategoriesData =
                existingDiscountDoc.data().subcategories || [];

              subcategoriesData.forEach((sub) => {
                clearTimeout(Number(sub.updateTimeoutId));
                clearTimeout(Number(sub.resetTimeoutId));
              });

              const allUpdatedProducts = [];

              // Iterate through existing subcategories and gather products
              for (let subcategory of subcategoriesData) {
                // Update subcategory details
                subcategory.DiscountAmount = discountamount;
                subcategory.FromDate = fromdate;
                subcategory.ToDate = todate;

                // Fetch the products for the current subcategory
                const productsSnapshot = await db
                  .collection("products")
                  .where(
                    "subcategory",
                    "==",
                    db.doc(`/subcategories/${subcategory.id}`)
                  )
                  .get();

                // Gather products into allUpdatedProducts array
                if (productsSnapshot && productsSnapshot.docs) {
                  productsSnapshot.docs.forEach((productDoc) => {
                    allUpdatedProducts.push({
                      id: productDoc.id,
                      ...productDoc.data(),
                    });
                  });
                } else {
                  console.error(
                    `No products found for subcategory ${subcategory.id}`
                  );
                }
              }

              // Calculate update and reset delays
              const updateDelay = moment(Inputfromdate).diff(moment());
              const resetDelay = moment(Inputtodate).diff(moment());
              console.log(updateDelay, resetDelay);
              // Define the update function
              const updateFunction = async () => {
                await discountNotification(
                  userId,
                  applicableinput,
                  discountamount,
                  applicablefor
                );
                console.log("Updating Products...");

                // Use the allUpdatedProducts array to update products
                const updatedProducts = await updateProducts(
                  allUpdatedProducts,
                  discountamount
                );
                console.log("Products updated.");

                // Update carts using the updated products array
                const cartsSnapshot = await db.collection("carts").get();
                await updateCarts(cartsSnapshot, updatedProducts);

                console.log("Updating subcategories...");
                // Update discount document with subcategories set to active
                await existingDiscountRef.update({
                  subcategories: subcategoriesData.map((sub) => ({
                    ...sub,
                    active: true,
                  })),
                  active: true,
                });

                console.log("Subcategories updated.");
              };

              // Define the reset function
              const resetFunction = async () => {
                console.log("Resetting Products...");

                // Use the allUpdatedProducts array to reset products
                const resetProductsArray = await resetProducts(
                  allUpdatedProducts
                );

                // Reset carts using the reset products array
                const cartsSnapshot = await db.collection("carts").get();
                await resetCarts(cartsSnapshot, resetProductsArray);

                console.log("Resetting subcategories and discount document...");
                // Reset discount document and subcategories to inactive
                await existingDiscountRef.update({
                  subcategories: subcategoriesData.map((sub) => ({
                    ...sub,
                    active: false,
                  })),
                  active: false,
                });

                console.log("Subcategories and discount document reset.");
              };

              // Schedule the update and reset functions using setTimeout
              const updateTimeoutId = setTimeout(updateFunction, updateDelay);
              const resetTimeoutId = setTimeout(resetFunction, resetDelay);

              // Update subcategory data with new timeout IDs
              subcategoriesData.forEach((sub) => {
                sub.updateTimeoutId = String(updateTimeoutId);
                sub.resetTimeoutId = String(resetTimeoutId);
              });

              // Update the discount document with new timeout IDs
              await existingDiscountRef.update({
                subcategories: subcategoriesData,
              });

              console.log(
                `Update delay: ${updateDelay}ms, Reset delay: ${resetDelay}ms`
              );
            } catch (error) {
              console.error("Error updating existing discount:", error);
            }
          } else {
            const subcategoriesSnapshot = await db
              .collection("subcategories")
              .where("category", "==", db.doc(`/categories/${categoryId}`))
              .get();

            // Array to store subcategory details
            const subcategories = [];
            // Array to store all products from all subcategories
            const allUpdatedProducts = [];

            // Iterate through each subcategory and gather products
            for (const subcategoryDoc of subcategoriesSnapshot.docs) {
              const subcategoryData = subcategoryDoc.data();
              const subcategoryId = subcategoryDoc.id;

              // Fetch the products for the current subcategory
              const productsSnapshot = await db
                .collection("products")
                .where(
                  "subcategory",
                  "==",
                  db.doc(`/subcategories/${subcategoryId}`)
                )
                .get();

              // Check if productsSnapshot and productsSnapshot.docs are defined and iterable
              if (productsSnapshot && productsSnapshot.docs) {
                // Iterate over productsSnapshot.docs and gather products into allUpdatedProducts array
                productsSnapshot.docs.forEach((productDoc) => {
                  allUpdatedProducts.push({
                    id: productDoc.id,
                    ...productDoc.data(),
                  });
                });
                console.log(allUpdatedProducts);
              } else {
                console.error(
                  `No products found for subcategory ${subcategoryId}`
                );
              }

              // Add subcategory details to the array
              subcategories.push({
                id: subcategoryId,
                name: subcategoryData.name,
                DiscountAmount: discountamount,
                FromDate: fromdate,
                ToDate: todate,
                active: false, // Setting active to false initially
              });
            }

            // Calculate the time delays for update and reset operations
            const updateDelay = moment(Inputfromdate).diff(moment());
            const resetDelay = moment(Inputtodate).diff(moment());

            // Create the discount object
            const validInput = {
              Category: categoryName,
              DiscountAmount: discountamount,
              Products: "All",
              FromDate: fromdate,
              ToDate: todate,
              active: false,
              Category: categoryName,
              subcategories: subcategories || [],
            };

            // Add the discount to the database
            const discountRef = await db
              .collection("discounts")
              .add(Object.assign({}, validInput));
            const discountId = discountRef.id;
            const discountDocRef = db.collection("discounts").doc(discountId);

            // Define the update function
            const updateFunction = async () => {
              await discountNotification(
                userId,
                applicableinput,
                discountamount,
                applicablefor
              );
              console.log("Updating Products...");

              // Use the allUpdatedProducts array to update products
              const updatedProducts = await updateProducts(
                allUpdatedProducts,
                discountamount
              );
              console.log(updateProducts);

              // Update carts using the updated products array
              const cartsSnapshot = await db.collection("carts").get();
              await updateCarts(cartsSnapshot, updatedProducts);

              console.log("Updating subcategories...");
              // Update discount document with subcategories set to active
              await discountDocRef.update({
                subcategories: subcategories.map((sub) => ({
                  ...sub,
                  active: true,
                })),
                active: true,
              });

              console.log("Subcategories updated.");
            };

            // Define the reset function
            const resetFunction = async () => {
              console.log("Resetting Products...");

              // Use the allUpdatedProducts array to reset products
              const resetProductsArray = await resetProducts(
                allUpdatedProducts
              );

              // Reset carts using the reset products array
              const cartsSnapshot = await db.collection("carts").get();
              await resetCarts(cartsSnapshot, resetProductsArray);

              console.log("Resetting subcategories and discount document...");
              // Reset discount document and subcategories to inactive
              await discountDocRef.update({
                subcategories: subcategories.map((sub) => ({
                  ...sub,
                  active: false,
                })),
                active: false,
              });

              console.log("Subcategories and discount document reset.");
            };

            // Schedule the update and reset functions using setTimeout
            const updateTimeoutId = setTimeout(updateFunction, updateDelay);
            const resetTimeoutId = setTimeout(resetFunction, resetDelay);

            // Store the timeouts in subcategories array
            subcategories.forEach((subcategory) => {
              subcategory.updateTimeoutId = String(updateTimeoutId);
              subcategory.resetTimeoutId = String(resetTimeoutId);
            });

            console.log(
              `Update delay: ${updateDelay}ms, Reset delay: ${resetDelay}ms`
            );
          }
        }
        break;
      case "subcategory":
        try {
          let discountCreated = false;
          let subcategoryDoc;

          // Iterate through each applicable input subcategory
          for (let subcategory of applicableinput) {
            // Fetch the subcategory document
            const subcategorySnapshot = await db
              .collection("subcategories")
              .where("name", "==", subcategory)
              .get();

            if (subcategorySnapshot.empty) {
              return res.status(200).send({
                message: ` Subcategory '${subcategory}' not found`,
              });
            }

            // Get the subcategory document and associated data
            subcategoryDoc = subcategorySnapshot.docs[0];
            const categoryRef = subcategoryDoc.data().category;
            const categoryDoc = await categoryRef.get();
            const categoryName = categoryDoc.data().name;

            // Check for existing discount document
            const existingDiscountQuery = await db
              .collection("discounts")
              .where("Category", "==", categoryName)
              .where("Products", "==", "All")
              .get();

            // Check if a discount document exists
            if (!existingDiscountQuery.empty) {
              // Handle existing discount
              const discountDoc = existingDiscountQuery.docs[0];
              const discountDocRef = db
                .collection("discounts")
                .doc(discountDoc.id);
              const discountData = discountDoc.data();

              if (
                moment(fromdate).isAfter(discountData.FromDate) ||
                moment(todate).isAfter(discountData.ToDate)
              ) {
                // Update FromDate and ToDate of the existing discount document if input dates are greater
                await discountDocRef.update({
                  FromDate: fromdate,
                  ToDate: todate,
                });

                console.log(
                  `Updated existing discount document with new FromDate and ToDate.`
                );
              }
              // Get subcategories from discount data
              const subcategories = discountData.subcategories || [];
              const inputSubcategoryIndex = subcategories.findIndex(
                (sub) => sub.name === subcategory
              );

              if (inputSubcategoryIndex !== -1) {
                const inputSubcategory = subcategories[inputSubcategoryIndex];

                // Clear existing timeouts for input subcategory
                clearTimeout(Number(inputSubcategory.updateTimeoutId));
                clearTimeout(Number(inputSubcategory.resetTimeoutId));

                // Update subcategory details
                inputSubcategory.DiscountAmount = discountamount;
                inputSubcategory.FromDate = fromdate;
                inputSubcategory.ToDate = todate;
                inputSubcategory.active = false;

                // Calculate delays for update and reset functions
                const updateDelay = moment(Inputfromdate).diff(moment());
                const resetDelay = moment(Inputtodate).diff(moment());
                console.log(`Update delay: ${updateDelay} ms`);
                console.log(`Reset delay: ${resetDelay} ms`);

                // Fetch products for the specified subcategory and populate allUpdatedProducts
                const productsSnapshot = await db
                  .collection("products")
                  .where("subcategory", "==", subcategoryDoc.ref)
                  .get();
                const allUpdatedProducts = [];
                if (productsSnapshot && productsSnapshot.docs) {
                  productsSnapshot.docs.forEach((productDoc) => {
                    allUpdatedProducts.push({
                      id: productDoc.id,
                      ...productDoc.data(),
                    });
                  });
                }

                // Define update function
                const updateFunction = async () => {
                  console.log(
                    `Updating products for subcategory: ${subcategory}`
                  );
                  const updatedProducts = await updateProducts(
                    allUpdatedProducts,
                    discountamount
                  );
                  console.log(
                    `Products updated for subcategory: ${subcategory}`
                  );

                  const cartsSnapshot = await db.collection("carts").get();
                  await updateCarts(cartsSnapshot, updatedProducts);
                  console.log(`Carts updated for subcategory: ${subcategory}`);

                  // Update subcategories and set active state
                  await discountDocRef.update({
                    subcategories: subcategories.map((sub) => ({
                      ...sub,
                      active: sub.name === subcategory ? true : sub.active,
                    })),
                    active: true,
                  });
                };

                // Define reset function
                const resetFunction = async () => {
                  console.log(
                    `Resetting products for subcategory: ${subcategory}`
                  );
                  const resetProductsArray = await resetProducts(
                    allUpdatedProducts
                  );
                  console.log(`Products reset for subcategory: ${subcategory}`);

                  const cartsSnapshot = await db.collection("carts").get();
                  await resetCarts(cartsSnapshot, resetProductsArray);
                  console.log(`Carts reset for subcategory: ${subcategory}`);

                  // Update subcategories and set inactive state
                  await discountDocRef.update({
                    subcategories: subcategories.map((sub) => ({
                      ...sub,
                      active: sub.name === subcategory ? false : sub.active,
                    })),
                    active: false,
                  });
                };

                // Schedule the update and reset functions using setTimeout
                inputSubcategory.updateTimeoutId = String(
                  setTimeout(updateFunction, updateDelay)
                );
                inputSubcategory.resetTimeoutId = String(
                  setTimeout(resetFunction, resetDelay)
                );
                await discountDocRef.update({
                  subcategories,
                });

                discountCreated = true;
              }
            } else {
              // Handle the case where there is no existing discount document (create a new one)
              const subcategoriesSnapshot = await db
                .collection("subcategories")
                .where("category", "==", categoryRef)
                .get();

              const subcategories = [];
              const allUpdatedProducts = [];

              // Iterate through each subcategory document and add input subcategories
              for (let subcategoryDoc of subcategoriesSnapshot.docs) {
                const subcategoryData = subcategoryDoc.data();
                const subcategoryName = subcategoryData.name;
                const subcategoryId = subcategoryDoc.id;

                // Check if this is an input subcategory
                if (applicableinput.includes(subcategoryName)) {
                  // Fetch products for the specified subcategory and populate `allUpdatedProducts`
                  const productsSnapshot = await db
                    .collection("products")
                    .where(
                      "subcategory",
                      "==",
                      db.doc(`/subcategories/${subcategoryId}`)
                    )
                    .get();

                  if (productsSnapshot && productsSnapshot.docs) {
                    productsSnapshot.docs.forEach((productDoc) => {
                      allUpdatedProducts.push({
                        id: productDoc.id,
                        ...productDoc.data(),
                      });
                    });
                  }

                  // Add subcategory details to the array
                  subcategories.push({
                    id: subcategoryId,
                    name: subcategoryName,
                    DiscountAmount: discountamount,
                    FromDate: fromdate,
                    ToDate: todate,
                    updateTimeoutId: "",
                    resetTimeoutId: "",
                    active: false,
                  });

                  // Calculate update and reset delays
                  const updateDelay = moment(Inputfromdate).diff(moment());
                  const resetDelay = moment(Inputtodate).diff(moment());

                  // Find the index of the input subcategory
                  const subcategoryIndex = subcategories.findIndex(
                    (sub) => sub.name === subcategoryName
                  );

                  // Define the update function for the current subcategory
                  const updateFunction = async () => {
                    console.log(
                      `Updating products for subcategory: ${subcategoryName}`
                    );

                    // Update products
                    const updatedProducts = await updateProducts(
                      allUpdatedProducts,
                      discountamount
                    );
                    console.log(
                      `Products updated for subcategory: ${subcategoryName}`
                    );

                    // Update carts using updated products array
                    const cartsSnapshot = await db.collection("carts").get();
                    await updateCarts(cartsSnapshot, updatedProducts);
                    console.log(
                      `Carts updated for subcategory: ${subcategoryName}`
                    );

                    // Set the `active` state of the input subcategory and discount document to `true`
                    subcategories[subcategoryIndex].active = true;

                    await discountDocRef.update({
                      subcategories,
                      active: true,
                    });

                    console.log(
                      `Discount document and input subcategory set to true.`
                    );
                  };

                  // Define the reset function for the current subcategory
                  const resetFunction = async () => {
                    console.log(
                      `Resetting products for subcategory: ${subcategoryName}`
                    );

                    // Reset products
                    const resetProductsArray = await resetProducts(
                      allUpdatedProducts
                    );
                    console.log(
                      `Products reset for subcategory: ${subcategoryName}`
                    );

                    // Reset carts using the reset products array
                    const cartsSnapshot = await db.collection("carts").get();
                    await resetCarts(cartsSnapshot, resetProductsArray);
                    console.log(
                      `Carts reset for subcategory: ${subcategoryName}`
                    );

                    // Set the `active` state of the input subcategory to `false`
                    subcategories[subcategoryIndex].active = false;

                    await discountDocRef.update({
                      subcategories,
                      active: false,
                    });

                    console.log(
                      `Discount document and input subcategory set to false.`
                    );

                    // Check if all subcategories' `active` status is `false`
                    const allSubcategoriesInactive = subcategories.every(
                      (sub) => !sub.active
                    );
                    if (allSubcategoriesInactive) {
                      // Set the active status of the discount document to false
                      await discountDocRef.update({
                        active: false,
                      });
                      console.log(
                        `All subcategories are inactive. Discount document set to false.`
                      );
                    }
                  };

                  // Schedule the update and reset functions using setTimeout for the current input subcategory
                  const updateTimeoutId = setTimeout(
                    updateFunction,
                    updateDelay
                  );
                  const resetTimeoutId = setTimeout(resetFunction, resetDelay);

                  // Update the input subcategory with the timeout IDs
                  subcategories[subcategoryIndex].updateTimeoutId =
                    String(updateTimeoutId);
                  subcategories[subcategoryIndex].resetTimeoutId =
                    String(resetTimeoutId);
                } else {
                  // For subcategories that are not input subcategories, add them with a 0% discount
                  subcategories.push({
                    id: subcategoryId,
                    name: subcategoryName,
                    DiscountAmount: 0,
                    FromDate: fromdate,
                    ToDate: todate,
                    updateTimeoutId: "",
                    resetTimeoutId: "",
                    active: false,
                  });
                }
              }

              // Create the new discount document with the provided details
              const discountData = {
                Category: categoryName,
                DiscountAmount: discountamount,
                Products: "All",
                FromDate: fromdate,
                ToDate: todate,
                active: false,
                subcategories,
              };

              const discountRef = await db
                .collection("discounts")
                .add(discountData);
              const discountId = discountRef.id;
              const discountDocRef = db.collection("discounts").doc(discountId);

              discountCreated = true;
            }
          }

          // Send appropriate response
          if (discountCreated) {
            return res.status(200).send({ message: `Discount Created` });
          } else {
            return res.status(200).send({ message: `Error creating Discount` });
          }
        } catch (error) {
          console.error("Error creating or updating discount:", error);
          return res.status(200).send({ message: "Internal server error" });
        }

      default:
        throw new Error("Invalid applicableFor value");
    }

    res.status(201).send({ message: `Discount created successfully` });
  } catch (error) {
    console.error("Error creating Discount: ", error);
    return res.status(200).send("Error creating Discount");
  }
};

const getallDiscount = async (req, res) => {
  try {
    // Retrieve all documents from the "discounts" collection
    const discountSnapshot = await db.collection("discounts").get();

    // Initialize an array to store the discounts
    const discounts = [];

    // Loop through each document in the snapshot
    discountSnapshot.forEach((doc) => {
      // Get the data of each document
      const discountData = doc.data();
      const discountId = doc.id;
      // Convert Firestore timestamps into date and time format
      const fromDate = moment
        .utc(discountData.FromDate.toDate())
        .add(5, "hours")
        .add(30, "minutes")
        .toDate();

      const toDate = moment
        .utc(discountData.ToDate.toDate())
        .add(5, "hours")
        .add(30, "minutes")
        .toDate();

      // Initialize an array to store subcategories
      const subcategories = [];

      // Loop through each subcategory in the discountData
      discountData.subcategories.forEach((subcategory) => {
        // Convert subcategory timestamps into date and time format
        const subFromDate = moment
          .utc(subcategory.FromDate.toDate())
          .add(5, "hours")
          .add(30, "minutes")
          .toDate();

        const subToDate = moment
          .utc(subcategory.ToDate.toDate())
          .add(5, "hours")
          .add(30, "minutes")
          .toDate();

        // Create a subcategory object with the retrieved data
        const subcategoryObj = {
          name: subcategory.name,
          discount: subcategory.DiscountAmount,
          FromDate: subFromDate.toLocaleString(),
          ToDate: subToDate.toLocaleString(),
          active: subcategory.active,
        };

        // Push the subcategory object to the subcategories array
        subcategories.push(subcategoryObj);
      });

      // Create a discount object with the retrieved data including subcategories
      const discount = {
        dicountId: discountId,
        Category: discountData.Category,
        DiscountAmount: discountData.DiscountAmount,
        FromDate: fromDate.toLocaleString(),
        ToDate: toDate.toLocaleString(),
        active: discountData.active,
        subcategories: subcategories,
      };

      // Push the discount object to the discounts array
      discounts.push(discount);
    });

    // If there are no discounts, send a message
    if (discounts.length === 0) {
      res.status(200).send({ message: "No Discounts found" });
    } else {
      // Otherwise, send all discounts
      res.status(200).send({ message: "All Discounts", Discounts: discounts });
    }
  } catch (error) {
    // If an error occurs, send an error response
    res.status(200).send("Error getting Discounts: " + error.message);
  }
};

const updateDiscount = async (req, res) => {
  try {
    const { discountId } = req.params;
    const { discountamount, fromdate, todate } = req.body;

    // Validate input
    if (!discountId) {
      return res
        .status(200)
        .send({ message: "DiscountId is required to update" });
    }
    if (discountamount <= 0 || discountamount >= 100) {
      return res
        .status(200)
        .send({ message: "DiscountAmount must be between 0 and 100" });
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

    // Retrieve the existing discount document
    const discountDocRef = db.collection("discounts").doc(discountId);
    const discountDoc = await discountDocRef.get();

    if (!discountDoc.exists) {
      return res.status(200).send({
        message: `No discount found with the given id: ${discountId}`,
      });
    }

    const existingDiscountData = discountDoc.data();

    // Convert dates to UTC
    const fromDate = moment.utc(fromdate).toDate();
    const toDate = moment.utc(todate).toDate();
    console.log(`111111`, fromDate, toDate);

    const formattedfromdate = moment(fromDate)
      .utc()
      .subtract(5, "hours")
      .subtract(30, "minutes")
      .toDate();
    const formattedinputtodate = moment(toDate)
      .utc()
      .subtract(5, "hours")
      .subtract(30, "minutes")
      .toDate();
    const inputfromdate = moment(fromDate).utc().subtract(11, "hours").toDate();
    const inputtodate = moment(toDate).utc().subtract(11, "hours").toDate();

    console.log(`222222222222`, formattedfromdate, formattedinputtodate);
    const updateDelay = moment(formattedfromdate).diff(moment());
    const resetDelay = moment(formattedinputtodate).diff(moment());
    console.log(updateDelay, resetDelay);
    // Update discount document
    await discountDocRef.update({
      DiscountAmount: discountamount,
      FromDate: inputfromdate,
      ToDate: inputtodate,
      active: false, // Initially set to false, will be updated during the process
    });

    // Handle existing subcategories
    const subcategoriesData = existingDiscountData.subcategories || [];

    const allUpdatedProducts = [];
    const allResetProducts = [];

    for (let subcategory of subcategoriesData) {
      // Clear existing timeouts for each subcategory
      clearTimeout(Number(subcategory.updateTimeoutId));
      clearTimeout(Number(subcategory.resetTimeoutId));

      // Update subcategory details
      subcategory.DiscountAmount = discountamount;
      subcategory.FromDate = inputfromdate;
      subcategory.ToDate = inputtodate;
      subcategory.active = false;
      // Fetch products for the subcategory
      const productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
        .get();

      // Gather products for updating and resetting
      if (productsSnapshot && productsSnapshot.docs) {
        const products = productsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        allUpdatedProducts.push(...products);
        allResetProducts.push(...products);
      }

      const updateFunction = async () => {
        try {
          console.log(`Updating products for subcategory: ${subcategory.name}`);

          // Update products
          const updatedProducts = await updateProducts(
            allUpdatedProducts,
            discountamount
          );

          // Update carts
          const cartsSnapshot = await db.collection("carts").get();
          await updateCarts(cartsSnapshot, updatedProducts);

          // Update the relevant subcategory to active
          subcategory.active = true;

          // Update the discount document with the modified subcategoriesData
          await discountDocRef.update({
            subcategories: subcategoriesData,
            active: true,
          });

          console.log(
            `Products and carts updated for subcategory: ${subcategory.name}`
          );
        } catch (error) {
          console.error(
            `Error updating products for subcategory: ${subcategory.name}`,
            error
          );
        }
      };
      const resetFunction = async () => {
        try {
          console.log(
            `Resetting products for subcategory: ${subcategory.name}`
          );

          // Reset products
          const resetProductsArray = await resetProducts(allResetProducts);

          // Reset carts
          const cartsSnapshot = await db.collection("carts").get();
          await resetCarts(cartsSnapshot, resetProductsArray);

          // Reset the relevant subcategory to inactive
          subcategory.active = false;

          // Update the discount document with the modified subcategoriesData
          await discountDocRef.update({
            subcategories: subcategoriesData,
            active: false,
          });

          console.log(
            `Products and carts reset for subcategory: ${subcategory.name}`
          );
        } catch (error) {
          console.error(
            `Error resetting products for subcategory: ${subcategory.name}`,
            error
          );
        }
      };

      const updateTimeoutId = setTimeout(updateFunction, updateDelay);
      subcategory.updateTimeoutId = String(updateTimeoutId);

      const resetTimeoutId = setTimeout(resetFunction, resetDelay);
      subcategory.resetTimeoutId = String(resetTimeoutId);
    }

    // Update the discount document with the updated subcategories
    await discountDocRef.update({
      subcategories: subcategoriesData,
    });

    return res.status(200).send({ message: "Discount updated successfully" });
  } catch (error) {
    console.error("Error updating discount:", error);
    return res
      .status(200)
      .send({ message: `Error updating discount: ${error.message}` });
  }
};

const updateDiscountStatus = async (req, res) => {
  try {
    const { discountCode } = req.params;
    const discountDocRef = db.collection("discounts").doc(discountCode);
    const discountDocSnapshot = await discountDocRef.get();

    if (!discountDocSnapshot.exists) {
      return res.status(200).send({ message: "Discount not found." });
    }

    const discountData = discountDocSnapshot.data();
    const currentStatus = discountData.active;

    if (currentStatus) {
      const newStatus = false;
      const allUpdatedProducts = [];
      const updatedSubcategoriesPromises = discountData.subcategories.map(
        async (subcategory) => {
          if (subcategory.active) {
            clearTimeout(Number(subcategory.updateTimeoutId));
            clearTimeout(Number(subcategory.resetTimeoutId));
            await discountDocRef.update({
              [`subcategories.${subcategory.name}.active`]: false,
            });
            const productsSnapshot = await db
              .collection("products")
              .where(
                "subcategory",
                "==",
                db.doc(`/subcategories/${subcategory.id}`)
              )
              .get();

            productsSnapshot.forEach((doc) => {
              const productData = doc.data();
              allUpdatedProducts.push({
                id: doc.id,
                name: productData.name,
                taxedPrice: productData.taxedPrice || 0,
                Discount: 0,
                DiscountPrice: 0,
              });
            });

            console.log(`${subcategory.name} status updated to false.`);
          }
          return {
            ...subcategory,
            active: false,
          };
        }
      );

      const updatedSubcategoriesData = await Promise.all(
        updatedSubcategoriesPromises
      );

      // Update discount document
      await discountDocRef.update({
        subcategories: updatedSubcategoriesData,
        active: newStatus,
      });

      // Perform reset operations based on allUpdatedProducts
      const resetProductsArray = await resetProducts(allUpdatedProducts);
      const cartsSnapshot = await db.collection("carts").get();
      await resetCarts(cartsSnapshot, resetProductsArray);

      return res.status(200).send({
        message: `Discount status updated successfully to: ${newStatus}.`,
      });
    } else {
      const currentDate = moment();
      const FromDate = moment(discountDocSnapshot.data().FromDate.toDate())
        .utc()
        .add(11, "hours");
      const ToDate = moment(discountDocSnapshot.data().ToDate.toDate())
        .utc()
        .add(5, "hours")
        .add(30, "minutes");

      console.log(currentDate);
      console.log(`11111111111`, FromDate, ToDate);
      if (ToDate.isAfter(currentDate)) {
        await discountDocRef.update({ active: true });

        const subcategoriesData = discountData.subcategories || [];
        const allUpdatedProducts = [];
        for (const subcategory of subcategoriesData) {
          clearTimeout(Number(subcategory.updateTimeoutId));
          clearTimeout(Number(subcategory.resetTimeoutId));

          subcategory.active = true;
          const productsSnapshot = await db
            .collection("products")
            .where(
              "subcategory",
              "==",
              db.doc(`/subcategories/${subcategory.id}`)
            )
            .get();

          if (productsSnapshot && productsSnapshot.docs) {
            productsSnapshot.docs.forEach((productDoc) => {
              allUpdatedProducts.push({
                id: productDoc.id,
                ...productDoc.data(),
              });
            });
          } else {
            console.error(
              `No products found for subcategory ${subcategory.id}`
            );
          }

          const updatedProducts = await updateProducts(
            allUpdatedProducts,
            discountDocSnapshot.data().DiscountAmount
          );

          const cartsSnapshot = await db.collection("carts").get();
          await updateCarts(cartsSnapshot, updatedProducts);
        }

        const resetDelay = ToDate.diff(currentDate);
        console.log(`12345`, resetDelay);
        const resetFunction = async () => {
          console.log(`Resetting products and carts for all subcategories.`);

          for (const subcategory of subcategoriesData) {
            // Fetch products for the current subcategory
            const productsSnapshot = await db
              .collection("products")
              .where(
                "subcategory",
                "==",
                db.doc(`/subcategories/${subcategory.id}`)
              )
              .get();

            const resetProductsArray = productsSnapshot.docs.map(
              (productDoc) => ({
                id: productDoc.id,
                ...productDoc.data(),
              })
            );

            // Reset products
            await resetProducts(resetProductsArray);

            // Reset carts
            const cartsSnapshot = await db.collection("carts").get();
            await resetCarts(cartsSnapshot, resetProductsArray);

            // Set subcategory active status to false
            subcategory.active = false;
          }

          // Set the discount document active status to false and update subcategories data
          await discountDocRef.update({
            subcategories: subcategoriesData,
            active: false,
          });

          console.log(`Products and carts reset for all subcategories.`);
        };

        // Schedule the reset function based on resetDelay
        const resetTimeoutId = setTimeout(resetFunction, resetDelay);

        // Update the reset timeout ID for each subcategory
        subcategoriesData.forEach((subcategory) => {
          subcategory.resetTimeoutId = String(resetTimeoutId);
        });

        // Update the discount document with the modified subcategories data
        await discountDocRef.update({
          subcategories: subcategoriesData,
        });

        console.log(`Discount status updated successfully to: true.`);
        return res
          .status(200)
          .send({ message: `Discount status updated successfully to: true.` });
      } else {
        return res.status(200).send({
          message:
            "ToDate must be greater than the current date to activate the discount.Please update the Discount to make it Active",
        });
      }
    }
  } catch (error) {
    return res
      .status(200)
      .send({ message: `Error updating discount status: ${error.message}` });
  }
};

const updateSubcategoryDiscount = async (req, res) => {
  try {
    const { discountId, subcategoryid } = req.params;
    const { discountamount, fromDate, toDate } = req.body;

    // Fetch the discount document
    const discountDocRef = db.collection("discounts").doc(discountId);
    const discountDocSnapshot = await discountDocRef.get();

    // Validate discount document existence
    if (!discountDocSnapshot.exists) {
      return res
        .status(200)
        .send({ message: "No discount found with the provided discountId" });
    }

    const discountData = discountDocSnapshot.data();

    // Validate input data
    if (discountamount <= 0 || discountamount >= 100) {
      return res
        .status(200)
        .send({ message: "Discount amount must be between 0 and 100" });
    }
    if (moment(fromDate).isSameOrAfter(toDate)) {
      return res
        .status(200)
        .send({ message: "From date must be before to date" });
    }
    if (moment(fromDate).isSameOrBefore(moment())) {
      return res
        .status(200)
        .send({ message: "From date must be in the future" });
    }

    // Convert input dates to UTC and adjust time zones if necessary
    const inputfromdate = moment(fromDate)
      .utc()
      .subtract(5, "hours")
      .subtract(30, "minutes")
      .toDate();
    const inputtodate = moment(toDate)
      .utc()
      .subtract(5, "hours")
      .subtract(30, "minutes")
      .toDate();
    console.log(fromDate, toDate);

    const formattedfromdate = moment(inputfromdate)
      .utc()
      .add(5, "hours")
      .add(30, "minutes")
      .toDate();
    const formattedinputtodate = moment(inputtodate)
      .utc()
      .add(5, "hours")
      .add(30, "minutes")
      .toDate();
    console.log(formattedfromdate, formattedinputtodate, `111111111111111`);

    // Fetch the subcategory document
    const subcategoryDocRef = db.collection("subcategories").doc(subcategoryid);
    const subcategoryDocSnapshot = await subcategoryDocRef.get();

    // Validate subcategory document existence
    if (!subcategoryDocSnapshot.exists) {
      return res.status(200).send({ message: "Subcategory not found" });
    }

    const subcategoryData = subcategoryDocSnapshot.data();

    // Fetch products associated with the subcategory
    const allUpdatedProducts = [];
    const productsSnapshot = await db
      .collection("products")
      .where("subcategory", "==", subcategoryDocRef)
      .get();

    if (productsSnapshot && productsSnapshot.docs) {
      productsSnapshot.docs.forEach((productDoc) => {
        allUpdatedProducts.push({
          id: productDoc.id,
          ...productDoc.data(),
        });
      });
    }

    // Update discount dates if necessary
    if (
      moment(inputfromdate).isAfter(discountData.FromDate) ||
      moment(inputtodate).isAfter(discountData.ToDate)
    ) {
      await discountDocRef.update({
        FromDate: inputfromdate,
        ToDate: inputtodate,
      });
    }

    // Update subcategory discount
    const subcategories = discountData.subcategories || [];
    const subcategoryIndex = subcategories.findIndex(
      (sub) => sub.id === subcategoryid
    );

    if (subcategoryIndex !== -1) {
      const subcategory = subcategories[subcategoryIndex];

      // Clear existing timeouts
      clearTimeout(Number(subcategory.updateTimeoutId));
      clearTimeout(Number(subcategory.resetTimeoutId));

      // Update subcategory details
      subcategory.DiscountAmount = discountamount;
      subcategory.FromDate = inputfromdate;
      subcategory.ToDate = inputtodate;

      // Calculate update and reset delays

      const updateDelay = moment(formattedfromdate).diff(moment());
      const resetDelay = moment(formattedinputtodate).diff(moment());
      console.log(`updateDelay :${updateDelay},resetdelay :${resetDelay}`);
      // Define update and reset functions
      const updateFunction = async () => {
        console.log(`Updating products for subcategory: ${subcategory.name}`);
        const updatedProducts = await updateProducts(
          allUpdatedProducts,
          discountamount
        );
        console.log(`Products updated for subcategory: ${subcategory.name}`);

        // Update carts
        const cartsSnapshot = await db.collection("carts").get();
        await updateCarts(cartsSnapshot, updatedProducts);
        console.log(`Carts updated for subcategory: ${subcategory.name}`);

        // Update subcategories and set active state
        const newSubcategories = subcategories.map((sub) => ({
          ...sub,
          active: sub.id === subcategory.id ? true : sub.active,
        }));
        await discountDocRef.update({
          subcategories: newSubcategories,
          active: true,
        });
      };

      const resetFunction = async () => {
        console.log(`Resetting products for subcategory: ${subcategory.name}`);
        const resetProductsArray = await resetProducts(allUpdatedProducts);
        console.log(`Products reset for subcategory: ${subcategory.name}`);

        // Reset carts
        const cartsSnapshot = await db.collection("carts").get();
        await resetCarts(cartsSnapshot, resetProductsArray);
        console.log(`Carts reset for subcategory: ${subcategory.name}`);

        // Update subcategories and set inactive state for the subcategory
        subcategory.active = false;
        await discountDocRef.update({
          subcategories,
        });

        // Check if all subcategories are inactive
        const allSubcategoriesInactive = subcategories.every(
          (sub) => !sub.active
        );

        if (allSubcategoriesInactive) {
          await discountDocRef.update({
            active: false,
          });
          console.log(
            `All subcategories are inactive. Setting discount active field to false.`
          );
        }
      };

      // Set timeouts for update and reset functions
      subcategory.updateTimeoutId = String(
        setTimeout(updateFunction, updateDelay)
      );
      subcategory.resetTimeoutId = String(
        setTimeout(resetFunction, resetDelay)
      );

      // Update the discount document with the updated subcategory details
      subcategories[subcategoryIndex] = subcategory;
      await discountDocRef.update({
        subcategories,
      });

      return res.status(200).send({ message: "Discount updated successfully" });
    } else {
      return res
        .status(200)
        .send({ message: "Subcategory not found in discount" });
    }
  } catch (error) {
    console.error("Error updating subcategory discount:", error);
    return res.status(200).send({ message: "Internal server error" });
  }
};

// const updateSubcategoryStatus = async (req, res) => {
//   try {
//     const { discountId, subcategoryid } = req.params;

//     // Validate input
//     if (!discountId) {
//       return res.status(200).send({ message: "Discount Id is required." });
//     }
//     if (!subcategoryid) {
//       return res.status(200).send({ message: "Subcategory Id is required." });
//     }

//     // Retrieve discount document
//     const discountDocRef = db.collection("discounts").doc(discountId);
//     const discountSnapshot = await discountDocRef.get();

//     if (!discountSnapshot.exists) {
//       return res.status(200).send({ message: "Discount not found." });
//     }

//     const discountData = discountSnapshot.data();
//     const currentDate = moment();
//     const ToDate = moment(discountData.ToDate.toDate())
//       .utc()
//       .add(5, "hours")
//       .add(30, "minutes");
//     console.log(`current:`, currentDate, `TOdate`, ToDate);
//     // Find the specified subcategory
//     const subcategory = discountData.subcategories.find(
//       (sub) => sub.id === subcategoryid
//     );

//     if (!subcategory) {
//       return res.status(200).send({
//         message: "Subcategory not found in the discount document.",
//       });
//     }

//     const currentStatus = subcategory.active;

//     // Determine the new status and perform checks for activating
//     if (!currentStatus) {
//       if (!ToDate.isAfter(currentDate)) {
//         // Check if ToDate is greater than current date
//         return res.status(200).send({
//           message:
//             "Cannot activate subcategory: ToDate must be greater than the current date.",
//         });
//       }

//       // Update subcategory active status to true
//       subcategory.active = true;

//       // Fetch products for the current subcategory
//       const productsSnapshot = await db
//         .collection("products")
//         .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
//         .get();

//       const productsData = productsSnapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }));

//       // Update products and carts
//       const updatedProducts = await updateProducts(
//         productsData,
//         discountData.DiscountAmount
//       );
//       const cartsSnapshot = await db.collection("carts").get();
//       await updateCarts(cartsSnapshot, updatedProducts);

//       // Calculate the delay for reset based on ToDate
//       const resetDelay = ToDate.diff(currentDate);
//       const resetFunction = async () => {
//         console.log(`Resetting products and carts for subcategory.`);

//         // Reset products and carts
//         const resetProductsArray = await resetProducts(productsData);
//         const cartsSnapshot = await db.collection("carts").get();
//         await resetCarts(cartsSnapshot, resetProductsArray);

//         // Set subcategory active status to false
//         subcategory.active = false;

//         // Update the discount document with the modified subcategories
//         discountData.subcategories = discountData.subcategories.map((sub) =>
//           sub.id === subcategory.id ? subcategory : sub
//         );
//         await discountDocRef.update({
//           subcategories: discountData.subcategories,
//         });

//         console.log(`Products and carts reset for subcategory.`);
//       };

//       // Schedule reset function based on resetDelay
//       const resetTimeoutId = setTimeout(resetFunction, resetDelay);

//       // Update the reset timeout ID for the subcategory
//       subcategory.resetTimeoutId = resetTimeoutId.toString();
//     } else {
//       // Deactivating the subcategory
//       subcategory.active = false;

//       // Clear existing timeouts
//       clearTimeout(Number(subcategory.updateTimeoutId));
//       clearTimeout(Number(subcategory.resetTimeoutId));

//       // Fetch products for the current subcategory
//       const productsSnapshot = await db
//         .collection("products")
//         .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
//         .get();

//       const productsData = productsSnapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }));

//       // Reset products and carts
//       const resetProductsArray = await resetProducts(productsData);
//       const cartsSnapshot = await db.collection("carts").get();
//       await resetCarts(cartsSnapshot, resetProductsArray);
//     }

//     // Update the discount document with the modified subcategories
//     discountData.subcategories = discountData.subcategories.map((sub) =>
//       sub.id === subcategory.id ? subcategory : sub
//     );
//     await discountDocRef.update({
//       subcategories: discountData.subcategories,
//     });

//     // Return a success response
//     const newStatus = subcategory.active;
//     return res.status(200).send({
//       message: `Subcategory status updated successfully to: ${newStatus}.`,
//     });
//   } catch (error) {
//     console.error(`Error updating subcategory status: ${error.message}`);
//     return res.status(200).send({
//       message: `Error updating subcategory status: ${error.message}`,
//     });
//   }
// };

const updateSubcategoryStatus = async (req, res) => {
  try {
    const { discountId, subcategoryid } = req.params;

    // Validate input
    if (!discountId) {
      return res.status(200).send({ message: "Discount ID is required." });
    }
    if (!subcategoryid) {
      return res.status(200).send({ message: "Subcategory ID is required." });
    }

    // Retrieve discount document
    const discountDocRef = db.collection("discounts").doc(discountId);
    const discountSnapshot = await discountDocRef.get();

    if (!discountSnapshot.exists) {
      return res.status(200).send({ message: "Discount not found." });
    }

    const discountData = discountSnapshot.data();
    const currentDate = moment();
    const ToDate = moment(discountData.ToDate.toDate())
      .utc()
      .add(5, "hours")
      .add(30, "minutes");
    const allUpdatedProducts = [];
    // Find the specified subcategory
    const subcategory = discountData.subcategories.find(
      (sub) => sub.id === subcategoryid
    );

    if (!subcategory) {
      return res.status(200).send({
        message: "Subcategory not found in the discount document.",
      });
    }

    const currentStatus = subcategory.active;

    if (!currentStatus) {
      // If the current status is false, attempt to activate
      if (!ToDate.isAfter(currentDate)) {
        // Check if ToDate is greater than current date
        return res.status(200).send({
          message:
            "Cannot activate subcategory: ToDate must be greater than the current date.",
        });
      }

      // Update subcategory active status to true
      subcategory.active = true;

      // Fetch products for the current subcategory
      const productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
        .get();
      if (productsSnapshot && productsSnapshot.docs) {
        productsSnapshot.docs.forEach((productDoc) => {
          allUpdatedProducts.push({
            id: productDoc.id,
            ...productDoc.data(),
          });
        });
      }
      console.log(allUpdatedProducts);
      // Update products with discount and subcategory data
      const updatedProducts = await updateProducts(
        allUpdatedProducts,
        discountData.DiscountAmount
      );

      // Update carts based on the updated products for the specified subcategory only
      const cartsSnapshot = await db.collection("carts").get();
      await updateCarts(cartsSnapshot, updatedProducts);

      // Calculate reset delay based on ToDate
      const resetDelay = ToDate.diff(currentDate);
      const resetFunction = async () => {
        console.log(`Resetting products and carts for subcategory.`);

        // Reset products and carts for the subcategory only
        const resetProductsArray = await resetProducts(allUpdatedProducts);
        const cartsSnapshot = await db.collection("carts").get();
        await resetCarts(cartsSnapshot, resetProductsArray);

        // Set subcategory active status to false
        subcategory.active = false;

        // Update the discount document with the modified subcategory
        discountData.subcategories = discountData.subcategories.map((sub) =>
          sub.id === subcategory.id ? subcategory : sub
        );
        await discountDocRef.update({
          subcategories: discountData.subcategories,
        });

        console.log(`Products and carts reset for subcategory.`);
      };

      // Schedule reset function based on reset delay
      const resetTimeoutId = setTimeout(resetFunction, resetDelay);
      subcategory.resetTimeoutId = resetTimeoutId.toString();
    } else {
      // Deactivating the subcategory
      subcategory.active = false;

      // Clear existing timeouts
      clearTimeout(Number(subcategory.updateTimeoutId));
      clearTimeout(Number(subcategory.resetTimeoutId));

      // Fetch products for the current subcategory
      const productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
        .get();

      // Extract products data
      const productsData = productsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Reset products and carts for the subcategory only
      const resetProductsArray = await resetProducts(productsData);
      const cartsSnapshot = await db.collection("carts").get();
      await resetCarts(cartsSnapshot, resetProductsArray);
    }

    // Update the discount document with the modified subcategory
    discountData.subcategories = discountData.subcategories.map((sub) =>
      sub.id === subcategory.id ? subcategory : sub
    );
    await discountDocRef.update({
      subcategories: discountData.subcategories,
    });

    // Return a success response
    const newStatus = subcategory.active;
    return res.status(200).send({
      message: `Subcategory status updated successfully to: ${newStatus}.`,
    });
  } catch (error) {
    console.error(`Error updating subcategory status: ${error.message}`);
    return res.status(200).send({
      message: `Error updating subcategory status: ${error.message}`,
    });
  }
};

module.exports = {
  createDiscount,
  getallDiscount,
  updateDiscount,
  updateDiscountStatus,
  updateSubcategoryDiscount,
  updateSubcategoryStatus,
};
