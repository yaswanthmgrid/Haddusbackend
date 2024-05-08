const Joi = require("joi");

const productSchema = Joi.object({
  name: Joi.string().required(),
  category: Joi.string().required(),
  subcategory: Joi.string().required(),
  price: Joi.number().required(),
  type: Joi.string().allow(null, "").optional().default(null),
  Gst: Joi.number().optional(),
  photo: Joi.any().optional(),
  active: Joi.boolean().default(true),
  addOns: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().optional().default(null),

        price: Joi.number().optional().default(null),
      }).or("name", "price")
    )
    .optional()
    .default([]),
});

module.exports = productSchema;
