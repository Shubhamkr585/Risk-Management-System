
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

const protect = asyncHandler(async (req, res, next) => {
    const cookieToken = req.cookies?.accessToken;
    const authHeader = req.headers.authorization || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const token = cookieToken || headerToken;

    if (!token) {
        throw new ApiError(401, 'Unauthorized request: No access token found in cookies or Authorization header');
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const admin = await Admin.findById(decoded.id).select('-password -refreshToken');

        if (!admin) {
            throw new ApiError(401, 'Invalid access token: User not found');
        }

        if ((decoded.tokenVersion || 1) !== (admin.tokenVersion || 1)) {
            throw new ApiError(401, 'Unauthorized request: Token revoked due to permission change');
        }

        req.user = {
            id: admin._id,
            email: admin.email,
            username: admin.username,
            role: admin.role,
            tokenVersion: admin.tokenVersion || 1,
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ApiError(401, 'Unauthorized request: Access token expired');
        }
        if (error instanceof jwt.JsonWebTokenError) {
            throw new ApiError(401, 'Unauthorized request: Invalid access token');
        }
        throw error;
    }
});

const authorize = (roles = []) => {
    return (req, res, next) => {
        if (typeof roles === 'string') {
            roles = [roles];
        }

        if (!req.user || !req.user.role) {
            throw new ApiError(401, 'Authentication required');
        }

        if (roles.length > 0 && !roles.includes(req.user.role)) {
            throw new ApiError(403, `Access denied. Your role (${req.user.role}) is not authorized for this action.`);
        }

        next();
    };
};

export { protect, authorize };