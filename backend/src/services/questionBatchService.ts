/**
 * Question Batch Service
 * Manages queuing and batch refinement of student questions
 * Sends questions to LLM every N seconds for grammar/clarity refinement
 */

import { emitToSession } from '../config/socket';
import { batchRefineQuestions } from './aiService';
import Question from '../models/Question';
import mongoose from 'mongoose';

interface QueuedQuestion {
    _id: mongoose.Types.ObjectId | string;
    content: string;
    sessionId: string;
    userId?: mongoose.Types.ObjectId | string;
    guestName?: string;
    guestEmail?: string;
    timestamp: number;
}

// Store questions by session to organize batch processing
const questionQueue = new Map<string, QueuedQuestion[]>();

// Track active batch timers by session
const batchTimers = new Map<string, NodeJS.Timeout>();

// Configuration (in milliseconds)
const BATCH_INTERVAL = 3000;// Process every 10 seconds - adjustable per session
const MAX_BATCH_SIZE = 50; // Maximum questions per batch

/**
 * Add a question to the batch queue
 * Auto-starts batching timer if this is the first question in session
 */
export const queueQuestion = (question: QueuedQuestion): void => {
    const sessionId = question.sessionId;

    // Initialize session queue if needed
    if (!questionQueue.has(sessionId)) {
        questionQueue.set(sessionId, []);
    }

    // Add to queue
    const queue = questionQueue.get(sessionId)!;
    queue.push(question);

    console.log(`📌 Question queued for session ${sessionId}. Queue size: ${queue.length}`);

    // Start batch timer if not already running
    if (!batchTimers.has(sessionId)) {
        startBatchTimer(sessionId);
    }

    // Immediately process if batch size exceeded
    if (queue.length >= MAX_BATCH_SIZE) {
        processBatch(sessionId);
    }
};

/**
 * Start the batch timer for a session
 */
function startBatchTimer(sessionId: string): void {
    const timer = setInterval(() => {
        if (questionQueue.has(sessionId)) {
            const queue = questionQueue.get(sessionId)!;
            if (queue.length > 0) {
                processBatch(sessionId);
            }
        }
    }, BATCH_INTERVAL);

    batchTimers.set(sessionId, timer);
    console.log(`⏲️  Batch timer started for session ${sessionId} (interval: ${BATCH_INTERVAL}ms)`);
}

/**
 * Stop the batch timer for a session (when session ends)
 */
export const stopBatchTimer = (sessionId: string): void => {
    if (batchTimers.has(sessionId)) {
        clearInterval(batchTimers.get(sessionId)!);
        batchTimers.delete(sessionId);
        console.log(`⏹️  Batch timer stopped for session ${sessionId}`);
    }
};

/**
 * Process all queued questions for a session
 * Sends to LLM, saves refined versions, emits to teacher
 */
export const processBatch = async (sessionId: string): Promise<void> => {
    const queue = questionQueue.get(sessionId);

    if (!queue || queue.length === 0) {
        console.log(`📭 No questions to process for session ${sessionId}`);
        return;
    }

    const batchQuestions = [...queue];
    questionQueue.set(sessionId, []); // Clear queue

    console.log(`🔄 Processing batch of ${batchQuestions.length} questions for session ${sessionId}`);

    try {
        // Send batch to LLM for refinement
        const refinedResults = await batchRefineQuestions(
            batchQuestions.map(q => ({
                id: q._id.toString(),
                content: q.content
            }))
        );

        // Save refined questions to database and emit updates
        const refinedQuestions = [];

        for (let i = 0; i < batchQuestions.length; i++) {
            const original = batchQuestions[i];
            const refined = refinedResults[i];

            try {
                // Update question with refinement data
                const updatedQuestion = await Question.findByIdAndUpdate(
                    original._id,
                    {
                        $set: {
                            content: refined.refinedContent || original.content,
                            refinementStatus: 'completed',
                            refinedContent: refined.refinedContent,
                            originalContent: original.content,
                            refinementTimestamp: new Date()
                        }
                    },
                    { new: true }
                ).populate('user', 'name');

                if (updatedQuestion) {
                    refinedQuestions.push(updatedQuestion);
                    console.log(`✅ Question ${original._id} refined`);
                }
            } catch (error) {
                console.error(` Error updating question ${original._id}:`, error);
            }
        }

        // Emit refined questions to session (to teacher's view)
        if (refinedQuestions.length > 0) {
            emitToSession(sessionId, 'questions_refined', {
                count: refinedQuestions.length,
                questions: refinedQuestions,
                batchTimestamp: new Date()
            });

            console.log(` Emitted ${refinedQuestions.length} refined questions to session ${sessionId}`);
        }
    } catch (error) {
        console.error(`Error processing batch for session ${sessionId}:`, error);

        // Re-queue failed questions for retry
        questionQueue.set(sessionId, [...queue, ...(questionQueue.get(sessionId) || [])]);

        // Emit error event
        emitToSession(sessionId, 'batch_refinement_failed', {
            error: 'Failed to refine questions. Will retry.',
            count: queue.length
        });
    }
};

/**
 * Get current queue statistics
 */
export const getQueueStats = (): Record<string, number> => {
    const stats: Record<string, number> = {};
    questionQueue.forEach((queue, sessionId) => {
        stats[sessionId] = queue.length;
    });
    return stats;
};

/**
 * Clear queue for a session (useful when session ends)
 */
export const clearQueue = (sessionId: string): void => {
    questionQueue.delete(sessionId);
    stopBatchTimer(sessionId);
    console.log(`🗑️  Queue cleared for session ${sessionId}`);
};

/**
 * Manual batch processing trigger (for testing or admin)
 */
export const triggerBatchProcessing = (sessionId: string): void => {
    console.log(`⚡ Manual batch processing triggered for session ${sessionId}`);
    processBatch(sessionId);
};