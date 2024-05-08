const Joi = require("joi");

const discountSchema = Joi.object({
  applicablefor: Joi.string().required(),
  applicableinput: Joi.array().required(),
  discountamount: Joi.number().required(),
  fromdate: Joi.date().required(),
  todate: Joi.date().required(),
  subcategories: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      discount: Joi.number().required(),
      active: Joi.boolean().required(),
    })
  ),
  products: Joi.array().items(Joi.string()),
});

module.exports = discountSchema;
