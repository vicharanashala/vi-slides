import express from 'express';
import {
    createAssignment,
    getAllAssignments,
    getAssignmentById,
    updateAssignment,
    deleteAssignment
} from '../controllers/assignmentController';
import { protect } from '../middleware/auth';

const router = express.Router();
router.use(protect);
router.post('/', createAssignment);
router.get('/', getAllAssignments);
router.get('/:id', getAssignmentById);
router.patch('/:id', updateAssignment);
router.delete('/:id', deleteAssignment);
export default router;
