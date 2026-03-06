import express from 'express';
import { body } from 'express-validator';
import { register, login, getMe, updateDetails, googleLogin, getLeaderboard } from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = express.Router();
router.get('/leaderboard', getLeaderboard);
router.post(
    '/register',
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
        body('role')
            .isIn(['Teacher', 'Student'])
            .withMessage('Role must be either Teacher or Student')
    ],
    register
);
router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Please provide a valid email'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    login
);
router.post('/google', googleLogin);
router.get('/me', protect, getMe);
router.put(
    '/updatedetails',
    protect,
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Please provide a valid email')
    ],
    updateDetails
);

export default router;
