import Joi from 'joi';

// Define the two possible schemas for the login identifier
const usernameSchema = Joi.string().min(3);
const emailSchema = Joi.string().email({ tlds: { allow: false } }); // Basic email validation

// Joi schema for validating admin login credentials
const adminLoginSchema = Joi.object({
    // This field can now be either a username or an email
    email: Joi.alternatives()
        .try(usernameSchema, emailSchema)
        .required()
        .messages({
            'any.required': 'Email or Username is required',
            'string.empty': 'Email or Username cannot be empty',
            'alternatives.match': 'Please provide a valid email or username'
        }),

    password: Joi.string()
        .min(6)
        .required()
        .messages({
            'string.min': 'Password must be at least 6 characters long',
            'string.empty': 'Password cannot be empty',
            'any.required': 'Password is required'
        })
});

// Joi schema for validating admin registration data (if you enable it temporarily)
const adminRegisterSchema = Joi.object({
    username: Joi.string()
        .trim()
        .min(3)
        .required()
        .messages({
            'string.min': 'Username must be at least 3 characters long',
            'string.empty': 'Username cannot be empty',
            'any.required': 'Username is required'
        }),
    // Added email validation here
    email: Joi.string()
        .email({ tlds: { allow: false } }) // Basic email validation, allows common TLDs but not strict
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'string.empty': 'Email cannot be empty',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .min(6)
        .required()
        .messages({
            'string.min': 'Password must be at least 6 characters long',
            'string.empty': 'Password cannot be empty',
            'any.required': 'Password is required'
        }),
    role: Joi.string()
        .valid('viewer', 'admin', 'superadmin')
        .default('viewer')
        .messages({
            'any.only': 'Role must be one of "viewer", "admin", or "superadmin"'
        })
});

export { adminLoginSchema, adminRegisterSchema };
