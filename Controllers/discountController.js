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

  for (const product of allUpdatedProducts) {
    const taxedPrice = product.taxedPrice;
    const discountedAmount = (discountAmount / 100) * taxedPrice;
    let discountPrice = taxedPrice - discountedAmount;
    discountPrice = Math.ceil(discountPrice);

    await db.collection("products").doc(product.id).update({
      Discount: discountAmount,
      DiscountPrice: discountPrice,
    });

    const updatedProduct = {
      id: product.id,
      name: product.name,
      DiscountPrice: discountPrice,
    };
    updatedProducts.push(updatedProduct);
  }

  return updatedProducts;
};

const resetProducts = async (allUpdatedProducts) => {
  const resetProductsArray = [];

  for (const product of allUpdatedProducts) {
    await db.collection("products").doc(product.id).update({
      Discount: 0,
      DiscountPrice: 0,
    });

    const resetProduct = {
      id: product.id,
      name: product.name,
      taxedPrice: product.taxedPrice,
    };
    resetProductsArray.push(resetProduct);
  }

  return resetProductsArray;
};

const updateCarts = async (cartsSnapshot, updatedProducts) => {
  const cartsToUpdatePromises = cartsSnapshot.docs.map(async (cartDoc) => {
    const cartData = cartDoc.data();
    let newBill = 0;

    if (cartData.products && Array.isArray(cartData.products)) {
      cartData.products.forEach((product) => {
        const updatedProduct = updatedProducts.find(
          (p) => p.id === product.productId
        );

        if (updatedProduct) {
          if (discountPrice > 0) {
            product.price = discountPrice;
          } else {
            product.price = taxedPrice;
          }

          product.price2 = product.price * product.quantity;
          if (product.addOns && Array.isArray(product.addOns)) {
            product.addOns.forEach((addon) => {
              product.price2 += addon.price * product.quantity;
            });
          }
          newBill += product.price2;
        } else {
          const discountPrice = product.DiscountPrice || 0;
          const taxedPrice = product.taxedPrice || 0;

          if (discountPrice > 0) {
            product.price = discountPrice;
          } else {
            product.price = taxedPrice;
          }

          product.price2 = product.price * product.quantity;
          if (product.addOns && Array.isArray(product.addOns)) {
            product.addOns.forEach((addon) => {
              product.price2 += addon.price * product.quantity;
            });
          }

          newBill += product.price2;
        }
      });

      const updateData = {
        products: cartData.products,
        bill: newBill,
      };

      if (cartData.Finalbill !== undefined) {
        updateData.Finalbill = cartData.Finalbill;
      }
      if (cartData.couponId !== undefined) {
        updateData.couponId = cartData.couponId;
      }
      if (cartData.couponAmount !== undefined) {
        updateData.couponAmount = cartData.couponAmount;
      }

      await cartDoc.ref.update(updateData);
    } else {
      console.log(`No products found for cart: ${cartDoc.id}`);
    }
  });

  await Promise.all(cartsToUpdatePromises);
};

const resetCarts = async (cartsSnapshot, resetProductsArray) => {
  const cartsResetPromises = cartsSnapshot.docs.map(async (cartDoc) => {
    const cartData = cartDoc.data();
    let newBill = 0;
    if (cartData.products && Array.isArray(cartData.products)) {
      cartData.products.forEach((product) => {
        const resetProduct = resetProductsArray.find(
          (p) => p.id === product.productId
        );

        if (resetProduct) {
          product.price = resetProduct.taxedPrice || 0;
          product.price2 = product.price * product.quantity;
        }
      });

      cartData.products.forEach((product) => {
        newBill += product.price2;
      });

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
        for (let element of applicableinput) {
          const categorySnapshot = await db
            .collection("categories")
            .where("name", "==", element)
            .get();

          if (categorySnapshot.empty) {
            return res.status(200).send({
              message: `Category '${element}' not found`,
            });
          }

          const categoryName = categorySnapshot.docs[0].data().name;
          const categoryId = categorySnapshot.docs[0].id;
          const existingDiscountSnapshot = await db
            .collection("discounts")
            .where("Category", "==", categoryName)
            .where("Products", "==", "All")
            .get();

          if (!existingDiscountSnapshot.empty) {
            const existingDiscountDoc = existingDiscountSnapshot.docs[0];
            const existingDiscountId = existingDiscountDoc.id;
            const existingDiscountRef = db
              .collection("discounts")
              .doc(existingDiscountId);

            try {
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

              for (let subcategory of subcategoriesData) {
                subcategory.DiscountAmount = discountamount;
                subcategory.FromDate = fromdate;
                subcategory.ToDate = todate;

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
              }

              const updateDelay = moment(Inputfromdate).diff(moment());
              const resetDelay = moment(Inputtodate).diff(moment());
              console.log(updateDelay, resetDelay);

              const updateFunction = async () => {
                await discountNotification(
                  userId,
                  applicableinput,
                  discountamount,
                  applicablefor
                );
                console.log("Updating Products...");

                const updatedProducts = await updateProducts(
                  allUpdatedProducts,
                  discountamount
                );
                console.log("Products updated.");

                const cartsSnapshot = await db.collection("carts").get();
                await updateCarts(cartsSnapshot, updatedProducts);

                console.log("Updating subcategories...");
                await existingDiscountRef.update({
                  subcategories: subcategoriesData.map((sub) => ({
                    ...sub,
                    active: true,
                  })),
                  active: true,
                });

                console.log("Subcategories updated.");
              };

              const resetFunction = async () => {
                console.log("Resetting Products...");

                const resetProductsArray = await resetProducts(
                  allUpdatedProducts
                );

                const cartsSnapshot = await db.collection("carts").get();
                await resetCarts(cartsSnapshot, resetProductsArray);

                console.log("Resetting subcategories and discount document...");

                await existingDiscountRef.update({
                  subcategories: subcategoriesData.map((sub) => ({
                    ...sub,
                    active: false,
                  })),
                  active: false,
                });

                console.log("Subcategories and discount document reset.");
              };

              const updateTimeoutId = setTimeout(updateFunction, updateDelay);
              const resetTimeoutId = setTimeout(resetFunction, resetDelay);

              subcategoriesData.forEach((sub) => {
                sub.updateTimeoutId = String(updateTimeoutId);
                sub.resetTimeoutId = String(resetTimeoutId);
              });

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

            const subcategories = [];
            const allUpdatedProducts = [];

            for (const subcategoryDoc of subcategoriesSnapshot.docs) {
              const subcategoryData = subcategoryDoc.data();
              const subcategoryId = subcategoryDoc.id;

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
                console.log(allUpdatedProducts);
              } else {
                console.error(
                  `No products found for subcategory ${subcategoryId}`
                );
              }

              subcategories.push({
                id: subcategoryId,
                name: subcategoryData.name,
                DiscountAmount: discountamount,
                FromDate: fromdate,
                ToDate: todate,
                active: false,
              });
            }
            const updateDelay = moment(Inputfromdate).diff(moment());
            const resetDelay = moment(Inputtodate).diff(moment());

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
            const discountRef = await db
              .collection("discounts")
              .add(Object.assign({}, validInput));
            const discountId = discountRef.id;
            const discountDocRef = db.collection("discounts").doc(discountId);

            const updateFunction = async () => {
              await discountNotification(
                userId,
                applicableinput,
                discountamount,
                applicablefor
              );
              console.log("Updating Products...");

              const updatedProducts = await updateProducts(
                allUpdatedProducts,
                discountamount
              );
              console.log(updateProducts);

              const cartsSnapshot = await db.collection("carts").get();
              await updateCarts(cartsSnapshot, updatedProducts);

              console.log("Updating subcategories...");
              await discountDocRef.update({
                subcategories: subcategories.map((sub) => ({
                  ...sub,
                  active: true,
                })),
                active: true,
              });

              console.log("Subcategories updated.");
            };

            const resetFunction = async () => {
              console.log("Resetting Products...");

              const resetProductsArray = await resetProducts(
                allUpdatedProducts
              );

              const cartsSnapshot = await db.collection("carts").get();
              await resetCarts(cartsSnapshot, resetProductsArray);

              console.log("Resetting subcategories and discount document...");

              await discountDocRef.update({
                subcategories: subcategories.map((sub) => ({
                  ...sub,
                  active: false,
                })),
                active: false,
              });

              console.log("Subcategories and discount document reset.");
            };

            const updateTimeoutId = setTimeout(updateFunction, updateDelay);
            const resetTimeoutId = setTimeout(resetFunction, resetDelay);

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

          for (let subcategory of applicableinput) {
            const subcategorySnapshot = await db
              .collection("subcategories")
              .where("name", "==", subcategory)
              .get();

            if (subcategorySnapshot.empty) {
              return res.status(200).send({
                message: ` Subcategory '${subcategory}' not found`,
              });
            }

            subcategoryDoc = subcategorySnapshot.docs[0];
            const categoryRef = subcategoryDoc.data().category;
            const categoryDoc = await categoryRef.get();
            const categoryName = categoryDoc.data().name;

            const existingDiscountQuery = await db
              .collection("discounts")
              .where("Category", "==", categoryName)
              .where("Products", "==", "All")
              .get();

            if (!existingDiscountQuery.empty) {
              const discountDoc = existingDiscountQuery.docs[0];
              const discountDocRef = db
                .collection("discounts")
                .doc(discountDoc.id);
              const discountData = discountDoc.data();

              if (
                moment(fromdate).isAfter(discountData.FromDate) ||
                moment(todate).isAfter(discountData.ToDate)
              ) {
                await discountDocRef.update({
                  FromDate: fromdate,
                  ToDate: todate,
                });

                console.log(
                  `Updated existing discount document with new FromDate and ToDate.`
                );
              }
              const subcategories = discountData.subcategories || [];
              const inputSubcategoryIndex = subcategories.findIndex(
                (sub) => sub.name === subcategory
              );

              if (inputSubcategoryIndex !== -1) {
                const inputSubcategory = subcategories[inputSubcategoryIndex];

                clearTimeout(Number(inputSubcategory.updateTimeoutId));
                clearTimeout(Number(inputSubcategory.resetTimeoutId));

                inputSubcategory.DiscountAmount = discountamount;
                inputSubcategory.FromDate = fromdate;
                inputSubcategory.ToDate = todate;
                inputSubcategory.active = false;
                const updateDelay = moment(Inputfromdate).diff(moment());
                const resetDelay = moment(Inputtodate).diff(moment());
                console.log(`Update delay: ${updateDelay} ms`);
                console.log(`Reset delay: ${resetDelay} ms`);

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

                  await discountDocRef.update({
                    subcategories: subcategories.map((sub) => ({
                      ...sub,
                      active: sub.name === subcategory ? true : sub.active,
                    })),
                    active: true,
                  });
                };
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

                  await discountDocRef.update({
                    subcategories: subcategories.map((sub) => ({
                      ...sub,
                      active: sub.name === subcategory ? false : sub.active,
                    })),
                    active: false,
                  });
                };

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

              for (let subcategoryDoc of subcategoriesSnapshot.docs) {
                const subcategoryData = subcategoryDoc.data();
                const subcategoryName = subcategoryData.name;
                const subcategoryId = subcategoryDoc.id;

                if (applicableinput.includes(subcategoryName)) {
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
                  const updateDelay = moment(Inputfromdate).diff(moment());
                  const resetDelay = moment(Inputtodate).diff(moment());

                  const subcategoryIndex = subcategories.findIndex(
                    (sub) => sub.name === subcategoryName
                  );

                  const updateFunction = async () => {
                    console.log(
                      `Updating products for subcategory: ${subcategoryName}`
                    );

                    const updatedProducts = await updateProducts(
                      allUpdatedProducts,
                      discountamount
                    );
                    console.log(
                      `Products updated for subcategory: ${subcategoryName}`
                    );

                    const cartsSnapshot = await db.collection("carts").get();
                    await updateCarts(cartsSnapshot, updatedProducts);
                    console.log(
                      `Carts updated for subcategory: ${subcategoryName}`
                    );

                    subcategories[subcategoryIndex].active = true;

                    await discountDocRef.update({
                      subcategories,
                      active: true,
                    });

                    console.log(
                      `Discount document and input subcategory set to true.`
                    );
                  };

                  const resetFunction = async () => {
                    console.log(
                      `Resetting products for subcategory: ${subcategoryName}`
                    );

                    const resetProductsArray = await resetProducts(
                      allUpdatedProducts
                    );
                    console.log(
                      `Products reset for subcategory: ${subcategoryName}`
                    );
                    const cartsSnapshot = await db.collection("carts").get();
                    await resetCarts(cartsSnapshot, resetProductsArray);
                    console.log(
                      `Carts reset for subcategory: ${subcategoryName}`
                    );

                    subcategories[subcategoryIndex].active = false;

                    await discountDocRef.update({
                      subcategories,
                      active: false,
                    });

                    console.log(
                      `Discount document and input subcategory set to false.`
                    );

                    const allSubcategoriesInactive = subcategories.every(
                      (sub) => !sub.active
                    );
                    if (allSubcategoriesInactive) {
                      await discountDocRef.update({
                        active: false,
                      });
                      console.log(
                        `All subcategories are inactive. Discount document set to false.`
                      );
                    }
                  };

                  const updateTimeoutId = setTimeout(
                    updateFunction,
                    updateDelay
                  );
                  const resetTimeoutId = setTimeout(resetFunction, resetDelay);

                  subcategories[subcategoryIndex].updateTimeoutId =
                    String(updateTimeoutId);
                  subcategories[subcategoryIndex].resetTimeoutId =
                    String(resetTimeoutId);
                } else {
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
    const discountSnapshot = await db.collection("discounts").get();

    const discounts = [];

    discountSnapshot.forEach((doc) => {
      const discountData = doc.data();
      const discountId = doc.id;
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

      const subcategories = [];
      discountData.subcategories.forEach((subcategory) => {
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

        const subcategoryObj = {
          name: subcategory.name,
          discount: subcategory.DiscountAmount,
          FromDate: subFromDate.toLocaleString(),
          ToDate: subToDate.toLocaleString(),
          active: subcategory.active,
        };

        subcategories.push(subcategoryObj);
      });

      const discount = {
        dicountId: discountId,
        Category: discountData.Category,
        DiscountAmount: discountData.DiscountAmount,
        FromDate: fromDate.toLocaleString(),
        ToDate: toDate.toLocaleString(),
        active: discountData.active,
        subcategories: subcategories,
      };
      discounts.push(discount);
    });

    if (discounts.length === 0) {
      res.status(200).send({ message: "No Discounts found" });
    } else {
      res.status(200).send({ message: "All Discounts", Discounts: discounts });
    }
  } catch (error) {
    res.status(200).send("Error getting Discounts: " + error.message);
  }
};

const updateDiscount = async (req, res) => {
  try {
    const { discountId } = req.params;
    const { discountamount, fromdate, todate } = req.body;

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

    const discountDocRef = db.collection("discounts").doc(discountId);
    const discountDoc = await discountDocRef.get();

    if (!discountDoc.exists) {
      return res.status(200).send({
        message: `No discount found with the given id: ${discountId}`,
      });
    }

    const existingDiscountData = discountDoc.data();

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

    await discountDocRef.update({
      DiscountAmount: discountamount,
      FromDate: inputfromdate,
      ToDate: inputtodate,
      active: false,
    });

    const subcategoriesData = existingDiscountData.subcategories || [];

    const allUpdatedProducts = [];
    const allResetProducts = [];

    for (let subcategory of subcategoriesData) {
      clearTimeout(Number(subcategory.updateTimeoutId));
      clearTimeout(Number(subcategory.resetTimeoutId));

      subcategory.DiscountAmount = discountamount;
      subcategory.FromDate = inputfromdate;
      subcategory.ToDate = inputtodate;
      subcategory.active = false;
      const productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
        .get();

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

          const updatedProducts = await updateProducts(
            allUpdatedProducts,
            discountamount
          );

          const cartsSnapshot = await db.collection("carts").get();
          await updateCarts(cartsSnapshot, updatedProducts);

          subcategory.active = true;

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

          const resetProductsArray = await resetProducts(allResetProducts);

          const cartsSnapshot = await db.collection("carts").get();
          await resetCarts(cartsSnapshot, resetProductsArray);

          subcategory.active = false;

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

      await discountDocRef.update({
        subcategories: updatedSubcategoriesData,
        active: newStatus,
      });

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

            await resetProducts(resetProductsArray);

            const cartsSnapshot = await db.collection("carts").get();
            await resetCarts(cartsSnapshot, resetProductsArray);

            subcategory.active = false;
          }

          await discountDocRef.update({
            subcategories: subcategoriesData,
            active: false,
          });

          console.log(`Products and carts reset for all subcategories.`);
        };

        const resetTimeoutId = setTimeout(resetFunction, resetDelay);

        subcategoriesData.forEach((subcategory) => {
          subcategory.resetTimeoutId = String(resetTimeoutId);
        });

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

    const discountDocRef = db.collection("discounts").doc(discountId);
    const discountDocSnapshot = await discountDocRef.get();

    if (!discountDocSnapshot.exists) {
      return res
        .status(200)
        .send({ message: "No discount found with the provided discountId" });
    }

    const discountData = discountDocSnapshot.data();

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

    const subcategoryDocRef = db.collection("subcategories").doc(subcategoryid);
    const subcategoryDocSnapshot = await subcategoryDocRef.get();

    if (!subcategoryDocSnapshot.exists) {
      return res.status(200).send({ message: "Subcategory not found" });
    }

    const subcategoryData = subcategoryDocSnapshot.data();

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
    if (
      moment(inputfromdate).isAfter(discountData.FromDate) ||
      moment(inputtodate).isAfter(discountData.ToDate)
    ) {
      await discountDocRef.update({
        FromDate: inputfromdate,
        ToDate: inputtodate,
      });
    }

    const subcategories = discountData.subcategories || [];
    const subcategoryIndex = subcategories.findIndex(
      (sub) => sub.id === subcategoryid
    );

    if (subcategoryIndex !== -1) {
      const subcategory = subcategories[subcategoryIndex];

      clearTimeout(Number(subcategory.updateTimeoutId));
      clearTimeout(Number(subcategory.resetTimeoutId));

      subcategory.DiscountAmount = discountamount;
      subcategory.FromDate = inputfromdate;
      subcategory.ToDate = inputtodate;

      const updateDelay = moment(formattedfromdate).diff(moment());
      const resetDelay = moment(formattedinputtodate).diff(moment());
      console.log(`updateDelay :${updateDelay},resetdelay :${resetDelay}`);

      const updateFunction = async () => {
        console.log(`Updating products for subcategory: ${subcategory.name}`);
        const updatedProducts = await updateProducts(
          allUpdatedProducts,
          discountamount
        );
        console.log(`Products updated for subcategory: ${subcategory.name}`);

        const cartsSnapshot = await db.collection("carts").get();
        await updateCarts(cartsSnapshot, updatedProducts);
        console.log(`Carts updated for subcategory: ${subcategory.name}`);

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

        const cartsSnapshot = await db.collection("carts").get();
        await resetCarts(cartsSnapshot, resetProductsArray);
        console.log(`Carts reset for subcategory: ${subcategory.name}`);

        subcategory.active = false;
        await discountDocRef.update({
          subcategories,
        });

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

      subcategory.updateTimeoutId = String(
        setTimeout(updateFunction, updateDelay)
      );
      subcategory.resetTimeoutId = String(
        setTimeout(resetFunction, resetDelay)
      );

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

const updateSubcategoryStatus = async (req, res) => {
  try {
    const { discountId, subcategoryid } = req.params;

    if (!discountId) {
      return res.status(200).send({ message: "Discount ID is required." });
    }
    if (!subcategoryid) {
      return res.status(200).send({ message: "Subcategory ID is required." });
    }

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
      if (!ToDate.isAfter(currentDate)) {
        return res.status(200).send({
          message:
            "Cannot activate subcategory: ToDate must be greater than the current date.",
        });
      }

      subcategory.active = true;
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
      console.log(`111111111111111111111`, allUpdatedProducts);
      const updatedProducts = await updateProducts(
        allUpdatedProducts,
        discountData.DiscountAmount
      );

      const cartsSnapshot = await db.collection("carts").get();
      await updateCarts(cartsSnapshot, updatedProducts);

      const resetDelay = ToDate.diff(currentDate);
      const resetFunction = async () => {
        console.log(`Resetting products and carts for subcategory.`);

        const resetProductsArray = await resetProducts(allUpdatedProducts);
        const cartsSnapshot = await db.collection("carts").get();
        await resetCarts(cartsSnapshot, resetProductsArray);

        subcategory.active = false;

        discountData.subcategories = discountData.subcategories.map((sub) =>
          sub.id === subcategory.id ? subcategory : sub
        );
        await discountDocRef.update({
          subcategories: discountData.subcategories,
        });

        console.log(`Products and carts reset for subcategory.`);
      };

      const resetTimeoutId = setTimeout(resetFunction, resetDelay);
      subcategory.resetTimeoutId = resetTimeoutId.toString();
    } else {
      subcategory.active = false;

      clearTimeout(Number(subcategory.updateTimeoutId));
      clearTimeout(Number(subcategory.resetTimeoutId));

      const productsSnapshot = await db
        .collection("products")
        .where("subcategory", "==", db.doc(`/subcategories/${subcategory.id}`))
        .get();

      const productsData = productsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const resetProductsArray = await resetProducts(productsData);
      const cartsSnapshot = await db.collection("carts").get();
      await resetCarts(cartsSnapshot, resetProductsArray);
    }

    discountData.subcategories = discountData.subcategories.map((sub) =>
      sub.id === subcategory.id ? subcategory : sub
    );
    await discountDocRef.update({
      subcategories: discountData.subcategories,
    });

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
