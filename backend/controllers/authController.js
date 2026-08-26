import Admin from '../models/Admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';


/**
 * @desc    Login Admin & save both tokens in separate cookies
 * @route   POST /api/admin/login
 */
import jwt from 'jsonwebtoken';

export const adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const admin = await Admin.findOne({
        $or: [{ email }, { username: email }]
    }).select('+password');

    if (!admin || !(await admin.matchPassword(password))) {
        res.status(401);
        throw new Error('Invalid credentials');
    }

    const accessToken = admin.generateAccessToken();
    const refreshToken = admin.generateRefreshToken();

    admin.refreshToken = refreshToken;
    await admin.save({ validateBeforeSave: false });

    const accessTokenCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/'
    };

    const refreshTokenCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
    };

    res.status(200)
        .cookie('accessToken', accessToken, accessTokenCookieOptions)
        .cookie('refreshToken', refreshToken, refreshTokenCookieOptions)
        .json({
            success: true,
            message: 'Login successful',
            data: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                role: admin.role
            }
        });
});

/**
 * @desc    Refresh Access Token and rotate Refresh Token
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken;

    if (!incomingRefreshToken) {
        res.status(401);
        throw new Error('No refresh token provided');
    }

    let decoded;
    try {
        decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
        res.status(401);
        throw new Error('Refresh token expired or invalid');
    }

    const admin = await Admin.findOne({ _id: decoded.id, refreshToken: incomingRefreshToken });

    if (!admin) {
        res.status(401);
        throw new Error('Session expired or invalid');
    }

    if ((decoded.tokenVersion || 1) !== (admin.tokenVersion || 1)) {
        res.status(401);
        throw new Error('Token revoked due to permission change');
    }

    const newAccessToken = admin.generateAccessToken();
    const newRefreshToken = admin.generateRefreshToken();

    admin.refreshToken = newRefreshToken;
    await admin.save({ validateBeforeSave: false });

    res.status(200)
        .cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 15 * 60 * 1000,
            path: '/'
        })
        .cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        })
        .json({
            success: true,
            message: 'Tokens refreshed',
            data: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                role: admin.role
            }
        });
});

/**
 * @desc    Logout Admin and clear both cookies
 */
export const logoutAdmin = asyncHandler(async (req, res) => {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
        const admin = await Admin.findOne({ refreshToken });
        if (admin) {
        admin.revokeSessions();
            await admin.save({ validateBeforeSave: false });
        }
    }

    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
});

export const registerAdmin = asyncHandler(async (req, res) => {
    const { username, email, password, role = 'admin' } = req.body;
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const existingAdmin = await Admin.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail }
        ]
    });

    if (existingAdmin) {
        const duplicateField = existingAdmin.username === normalizedUsername
            ? 'username'
            : 'email';
        throw new ApiError(409, `Admin with this ${duplicateField} already exists`);
    }

    try {
        const admin = await Admin.create({
            username: normalizedUsername,
            email: normalizedEmail,
            password,
            role
        });

        return res.status(201).json({
            success: true,
            message: 'Admin registered successfully',
            data: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        if (error?.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern || {})[0] || 'username';
            throw new ApiError(409, `Admin with this ${duplicateField} already exists`);
        }
        throw error;
    }
});