import { Request, Response } from 'express';
import Assignment from '../models/Assignment';
import Submission from '../models/Submission';

export const createAssignment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { title, description, maxMarks, deadline } = req.body;

        // Validate teacher role
        if (req.user?.role?.toLowerCase() !== 'teacher') {
            res.status(403).json({ success: false, message: 'Only teachers can create assignments' });
            return;
        }

        const assignment = await Assignment.create({
            title,
            description,
            teacher: req.user._id,
            maxMarks,
            deadline: new Date(deadline)
        });

        res.status(201).json({
            success: true,
            data: assignment
        });
    } catch (error) {
        console.error('Create assignment error:', error);
        res.status(500).json({ success: false, message: 'Server error creating assignment' });
    }
};

export const getAllAssignments = async (req: Request, res: Response): Promise<void> => {
    try {
        let assignments;

        if (req.user?.role?.toLowerCase() === 'teacher') {
            // Teachers see only their assignments
            assignments = await Assignment.find({ teacher: req.user._id })
                .populate('teacher', 'name email')
                .sort({ createdAt: -1 });
        } else {
            // Students see all active assignments
            assignments = await Assignment.find({ status: 'active' })
                .populate('teacher', 'name email')
                .sort({ deadline: 1 });
        }

        res.status(200).json({
            success: true,
            data: assignments
        });
    } catch (error) {
        console.error('Get assignments error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching assignments' });
    }
};

// @desc    Get assignment by ID
// @route   GET /api/assignments/:id
// @access  Private
export const getAssignmentById = async (req: Request, res: Response): Promise<void> => {
    try {
        const assignment = await Assignment.findById(req.params.id)
            .populate('teacher', 'name email');

        if (!assignment) {
            res.status(404).json({ success: false, message: 'Assignment not found' });
            return;
        }

        res.status(200).json({
            success: true,
            data: assignment
        });
    } catch (error) {
        console.error('Get assignment error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching assignment' });
    }
};

// @desc    Update assignment
// @route   PATCH /api/assignments/:id
// @access  Private (Teacher only - own assignments)
export const updateAssignment = async (req: Request, res: Response): Promise<void> => {
    try {
        const assignment = await Assignment.findById(req.params.id);

        if (!assignment) {
            res.status(404).json({ success: false, message: 'Assignment not found' });
            return;
        }

        // Check if user is the teacher who created this assignment
        if (assignment.teacher.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to update this assignment' });
            return;
        }

        const { title, description, maxMarks, deadline, status } = req.body;

        if (title) assignment.title = title;
        if (description) assignment.description = description;
        if (maxMarks) assignment.maxMarks = maxMarks;
        if (deadline) assignment.deadline = new Date(deadline);
        if (status) assignment.status = status;

        await assignment.save();

        res.status(200).json({
            success: true,
            data: assignment
        });
    } catch (error) {
        console.error('Update assignment error:', error);
        res.status(500).json({ success: false, message: 'Server error updating assignment' });
    }
};

// @desc    Delete assignment
// @route   DELETE /api/assignments/:id
// @access  Private (Teacher only - own assignments)
export const deleteAssignment = async (req: Request, res: Response): Promise<void> => {
    try {
        const assignment = await Assignment.findById(req.params.id);

        if (!assignment) {
            res.status(404).json({ success: false, message: 'Assignment not found' });
            return;
        }

        // Check if user is the teacher who created this assignment
        if (assignment.teacher.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to delete this assignment' });
            return;
        }

        // Delete all submissions for this assignment
        await Submission.deleteMany({ assignment: assignment._id });

        // Delete the assignment
        await assignment.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Assignment and all submissions deleted successfully'
        });
    } catch (error) {
        console.error('Delete assignment error:', error);
        res.status(500).json({ success: false, message: 'Server error deleting assignment' });
    }
};
