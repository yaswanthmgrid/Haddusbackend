const Joi = require("joi");

// Define the schema for coupon validation
const couponSchema = Joi.object({
  promocode: Joi.string().trim().required(),
  limit: Joi.number().integer().min(0).required(),
  coupontype: Joi.string().trim().required(),
  couponAmount: Joi.number().min(0).required(),
  fromdate: Joi.date().iso().required(),
  todate: Joi.date().iso().required(),
  minimumamount: Joi.number().min(0).required(),
});

module.exports = couponSchema;
