import { Request, Response } from 'express';
import Submission from '../models/Submission';
import Assignment from '../models/Assignment';
import User from '../models/User';
import { sendGradeNotification } from '../services/emailService';

// @desc    Submit assignment
// @route   POST /api/submissions
// @access  Private (Student only)
export const submitAssignment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { assignmentId, submissionText, pdfUrl } = req.body;

        // Validate student role
        if (req.user?.role?.toLowerCase() !== 'student') {
            res.status(403).json({ success: false, message: 'Only students can submit assignments' });
            return;
        }

        // Check if assignment exists
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            res.status(404).json({ success: false, message: 'Assignment not found' });
            return;
        }

        // Check if already submitted
        const existingSubmission = await Submission.findOne({
            assignment: assignmentId,
            student: req.user._id
        });

        if (existingSubmission) {
            res.status(400).json({ success: false, message: 'You have already submitted this assignment' });
            return;
        }

        // Check if submission is late
        const isLate = new Date() > new Date(assignment.deadline);

        const submission = await Submission.create({
            assignment: assignmentId,
            student: req.user._id,
            submissionText,
            pdfUrl: pdfUrl || null,
            isLate,
            status: 'submitted'
        });

        const populatedSubmission = await Submission.findById(submission._id)
            .populate('student', 'name email')
            .populate('assignment', 'title maxMarks deadline');

        res.status(201).json({
            success: true,
            data: populatedSubmission
        });
    } catch (error: any) {
        console.error('Submit assignment error:', error);
        if (error.code === 11000) {
            res.status(400).json({ success: false, message: 'You have already submitted this assignment' });
        } else {
            res.status(500).json({ success: false, message: 'Server error submitting assignment' });
        }
    }
};

export const getSubmissionsByAssignment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { assignmentId } = req.params;

        // Check if assignment exists and belongs to the teacher
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            res.status(404).json({ success: false, message: 'Assignment not found' });
            return;
        }

        if (assignment.teacher.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to view these submissions' });
            return;
        }

        const submissions = await Submission.find({ assignment: assignmentId })
            .populate('student', 'name email')
            .populate('assignment', 'title maxMarks deadline')
            .sort({ submittedAt: -1 });

        res.status(200).json({
            success: true,
            data: submissions
        });
    } catch (error) {
        console.error('Get submissions error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching submissions' });
    }
};

// @desc    Get student's own submissions
// @route   GET /api/submissions/my-submissions
// @access  Private (Student only)
export const getMySubmissions = async (req: Request, res: Response): Promise<void> => {
    try {
        if (req.user?.role?.toLowerCase() !== 'student') {
            res.status(403).json({ success: false, message: 'Only students can view their submissions' });
            return;
        }

        const submissions = await Submission.find({ student: req.user._id })
            .populate('assignment', 'title maxMarks deadline teacher')
            .populate({
                path: 'assignment',
                populate: {
                    path: 'teacher',
                    select: 'name'
                }
            })
            .sort({ submittedAt: -1 });

        res.status(200).json({
            success: true,
            data: submissions
        });
    } catch (error) {
        console.error('Get my submissions error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching submissions' });
    }
};

// @desc    Grade submission and send email
// @route   PATCH /api/submissions/:id/grade
// @access  Private (Teacher only)
export const gradeSubmission = async (req: Request, res: Response): Promise<void> => {
    try {
        const { marksObtained, feedback } = req.body;
        const submissionId = req.params.id;

        // Find submission with populated data
        const submission = await Submission.findById(submissionId)
            .populate('student', 'name email')
            .populate('assignment', 'title maxMarks teacher');

        if (!submission) {
            res.status(404).json({ success: false, message: 'Submission not found' });
            return;
        }

        // Check if teacher owns this assignment
        const assignment: any = submission.assignment;
        if (assignment.teacher.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to grade this submission' });
            return;
        }

        // Validate marks
        if (marksObtained < 0 || marksObtained > assignment.maxMarks) {
            res.status(400).json({
                success: false,
                message: `Marks must be between 0 and ${assignment.maxMarks}`
            });
            return;
        }

        // Update submission
        submission.marksObtained = marksObtained;
        submission.feedback = feedback || '';
        submission.status = 'graded';
        submission.gradedAt = new Date();

        await submission.save();

        // Send email notification
        const student: any = submission.student;
        const emailResult = await sendGradeNotification(
            student.email,
            student.name,
            assignment.title,
            marksObtained,
            assignment.maxMarks,
            feedback || 'No feedback provided',
            req.user?.name || 'Your Teacher'
        );

        res.status(200).json({
            success: true,
            data: submission,
            emailSent: emailResult.success,
            emailMessage: emailResult.message
        });
    } catch (error) {
        console.error('Grade submission error:', error);
        res.status(500).json({ success: false, message: 'Server error grading submission' });
    }
};
