import Admin from '../models/Admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';


/**
 * @desc    Login Admin & save both tokens in separate cookies
 * @route   POST /api/admin/login
 */
export const adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // 1. Validation & Admin Fetch
    const admin = await Admin.findOne({
        $or: [{ email }, { username: email }]
    }).select('+password');

    if (!admin || !(await admin.matchPassword(password))) {
        res.status(401);
        throw new Error('Invalid credentials');
    }

    // 2. Generate Tokens
    const accessToken = admin.generateAccessToken();
    const refreshToken = admin.generateRefreshToken();

    // 3. Persist Refresh Token in DB
    admin.refreshToken = refreshToken;
    await admin.save({ validateBeforeSave: false });

    // 4. DEFINE THE MISSING VARIABLES HERE
    const accessTokenCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: '/'
    };

    const refreshTokenCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
    };

    // 5. Send Response
    res.status(200)
        .cookie('accessToken', accessToken, accessTokenCookieOptions)
        .cookie('refreshToken', refreshToken, refreshTokenCookieOptions)
        .json({
            success: true,
            message: 'Login successful',
            accessToken, // Sending this in JSON too so frontend can verify immediately
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

    // 1. Verify specific token exists in DB
    const admin = await Admin.findOne({ refreshToken: incomingRefreshToken });

    if (!admin) {
        res.status(401);
        throw new Error('Session expired or invalid');
    }

    // 2. Generate new pair
    const newAccessToken = admin.generateAccessToken();
    const newRefreshToken = admin.generateRefreshToken();

    // 3. Update DB
    admin.refreshToken = newRefreshToken;
    await admin.save({ validateBeforeSave: false });

    // 4. Update both cookies
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

    // Remove token from DB
    if (refreshToken) {
        await Admin.findOneAndUpdate(
            { refreshToken },
            { $unset: { refreshToken: 1 } }
        );
    }

    // Clear both cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
});

 export const registerAdmin = asyncHandler(async (req, res) => {
  //the logic goes here
  
 });