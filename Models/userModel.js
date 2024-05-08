const Joi = require("joi");

const createUserSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.number().required(),
  password: Joi.string().min(7).required(),
  photo: Joi.string().allow(null).optional().default(null),
  permission: Joi.boolean().default(true),
  DeviceToken: Joi.string(),
  address: Joi.array()
    .items(
      Joi.object({
        plot: Joi.string().allow(null).optional().default(null),
        street: Joi.string().allow(null).optional().default(null),
        landmark: Joi.string().allow(null).optional().default(null),
        area: Joi.string().allow(null).optional().default(null),
        city: Joi.string().allow(null).optional().default(null),
        pincode: Joi.number()
          .integer()
          .min(100000)
          .max(999999)
          .allow(null)
          .optional()
          .default(null),
      })
    )
    .allow(null)
    .optional()
    .default(null),
});
const updateUserAddressSchema = Joi.object({
  address: Joi.array()
    .items(
      Joi.object({
        plot: Joi.string().required(),
        street: Joi.string().required(),
        landmark: Joi.string().required(),
        area: Joi.string().required(),
        city: Joi.string().required(),
        pincode: Joi.number().integer().min(100000).max(999999).required(),
      })
    )
    .required(),
});

module.exports = {
  createUserSchema,
  updateUserAddressSchema,
};
