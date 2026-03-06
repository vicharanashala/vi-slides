import { io, Socket } from 'socket.io-client';

const hostname = window.location.hostname;
const SOCKET_URL = (import.meta.env.VITE_API_URL || `http://${hostname}:5001`).replace('/api', '');

class SocketService {
    private socket: Socket | null = null;

    connect() {
        if (!this.socket) {
            this.socket = io(SOCKET_URL);

            this.socket.on('connect', () => {
                console.log('🔌 Connected to WebSocket server');
            });
            this.socket.on('disconnect', () => {
                console.log('🔌 Disconnected from WebSocket server');
            });
        }
        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    joinSession(payload: any) {
        if (this.socket) {
            this.socket.emit('join_session', payload);
        }
    }

    leaveSession(sessionCode: string) {
        if (this.socket) {
            this.socket.emit('leave_session', sessionCode);
        }
    }

    onNewQuestion(callback: (question: any) => void) {
        if (this.socket) {
            this.socket.on('new_question', callback);
        }
    }

    onUpdateQuestion(callback: (question: any) => void) {
        if (this.socket) {
            this.socket.on('update_question', callback);
        }
    }

    onDeleteQuestion(callback: (questionId: string) => void) {
        if (this.socket) {
            this.socket.on('delete_question', callback);
        }
    }

    onSessionStatusUpdate(callback: (data: { status: string }) => void) {
        if (this.socket) {
            this.socket.on('session_status_update', callback);
        }
    }

    onUserJoined(callback: (user: any) => void) {
        if (this.socket) {
            this.socket.on('user_joined', callback);
        }
    }

    offUserJoined() {
        if (this.socket) {
            this.socket.off('user_joined');
        }
    }

    onQuestionAnalyzed(callback: (question: any) => void) {
        if (this.socket) {
            this.socket.on('question_analyzed', callback);
        }
    }

    onQuestionsRefined(callback: (data: any) => void) {
        if (this.socket) {
            this.socket.on('questions_refined', callback);
        }
    }

    onBatchRefinementFailed(callback: (data: any) => void) {
        if (this.socket) {
            this.socket.on('batch_refinement_failed', callback);
        }
    }

    onQuestionPinnedToggle(callback: (question: any) => void) {
        if (this.socket) {
            this.socket.on('question_pinned_toggle', callback);
        }
    }

    // Poll Events
    onNewPoll(callback: (poll: any) => void) {
        if (this.socket) this.socket.on('new_poll', callback);
    }
    onPollUpdate(callback: (poll: any) => void) {
        if (this.socket) this.socket.on('poll_update', callback);
    }
    onPollClosed(callback: (poll: any) => void) {
        if (this.socket) this.socket.on('poll_closed', callback);
    }

    // Remove listeners to prevent memory leaks
    offNewQuestion() { if (this.socket) this.socket.off('new_question'); }
    offUpdateQuestion() { if (this.socket) this.socket.off('update_question'); }
    offDeleteQuestion() { if (this.socket) this.socket.off('delete_question'); }
    offSessionStatusUpdate() { if (this.socket) this.socket.off('session_status_update'); }
    offQuestionAnalyzed() { if (this.socket) this.socket.off('question_analyzed'); }
    offQuestionsRefined() { if (this.socket) this.socket.off('questions_refined'); }
    offBatchRefinementFailed() { if (this.socket) this.socket.off('batch_refinement_failed'); }
    offQuestionPinnedToggle() { if (this.socket) this.socket.off('question_pinned_toggle'); }

    offPollEvents() {
        if (this.socket) {
            this.socket.off('new_poll');
            this.socket.off('poll_update');
            this.socket.off('poll_closed');
        }
    }

    // Whiteboard Events
    onWhiteboardOpen(callback: (data: { teacherId: string }) => void) {
        if (this.socket) this.socket.on('whiteboard_open', callback);
    }
    onWhiteboardClose(callback: () => void) {
        if (this.socket) this.socket.on('whiteboard_close', callback);
    }
    onWhiteboardDraw(callback: (data: any) => void) {
        if (this.socket) this.socket.on('whiteboard_draw', callback);
    }
    onWhiteboardClear(callback: () => void) {
        if (this.socket) this.socket.on('whiteboard_clear', callback);
    }

    emitWhiteboardOpen(sessionCode: string) {
        if (this.socket) this.socket.emit('whiteboard_open', { sessionCode });
    }
    emitWhiteboardClose(sessionCode: string) {
        if (this.socket) this.socket.emit('whiteboard_close', { sessionCode });
    }
    emitWhiteboardDraw(sessionCode: string, data: any) {
        if (this.socket) this.socket.emit('whiteboard_draw', { sessionCode, data });
    }
    emitWhiteboardClear(sessionCode: string) {
        if (this.socket) this.socket.emit('whiteboard_clear', { sessionCode });
    }

    offWhiteboardEvents() {
        if (this.socket) {
            this.socket.off('whiteboard_open');
            this.socket.off('whiteboard_close');
            this.socket.off('whiteboard_draw');
            this.socket.off('whiteboard_clear');
        }
    }

    // Engagement Events
    emitUnderstandingUpdate(sessionCode: string, understanding: string, user: any) {
        if (this.socket) this.socket.emit('student_understanding_update', { sessionCode, understanding, user });
    }
    onTeacherUnderstandingUpdate(callback: (data: any) => void) {
        if (this.socket) this.socket.on('teacher_understanding_update', callback);
    }

    emitHandRaise(sessionCode: string, isRaised: boolean, user: any) {
        if (this.socket) this.socket.emit('student_hand_raise', { sessionCode, isRaised, user });
    }
    onTeacherHandRaise(callback: (data: any) => void) {
        if (this.socket) this.socket.on('teacher_hand_raise', callback);
    }

    offEngagementEvents() {
        if (this.socket) {
            this.socket.off('teacher_understanding_update');
            this.socket.off('teacher_hand_raise');
        }
    }

    // Private Messaging
    emitPrivateMsg(payload: { recipientId: string, message: string, sender: any }) {
        if (this.socket) this.socket.emit('send_private_msg', payload);
    }
    onReceivePrivateMsg(callback: (data: any) => void) {
        if (this.socket) this.socket.on('receive_private_msg', callback);
    }
    offReceivePrivateMsg() {
        if (this.socket) this.socket.off('receive_private_msg');
    }

    // Pulse Check Events
    emitPulseCheckInit(sessionCode: string) {
        if (this.socket) this.socket.emit('pulse_check_init', { sessionCode });
    }
    onPulseCheckStart(callback: () => void) {
        if (this.socket) this.socket.on('pulse_check_start', callback);
    }
    emitPulseCheckResponse(userId: string, sessionCode: string) {
        if (this.socket) this.socket.emit('pulse_check_response', { userId, sessionCode });
    }
    onPointsUpdated(callback: (data: any) => void) {
        if (this.socket) this.socket.on('points_updated', callback);
    }

    // Celebration
    onCelebration(callback: (data: any) => void) {
        if (this.socket) this.socket.on('celebration', callback);
    }

    offPulseCheckEvents() {
        if (this.socket) {
            this.socket.off('pulse_check_start');
            this.socket.off('points_updated');
            this.socket.off('celebration');
        }
    }

    // New Interaction Features
    emitEmojiReaction(sessionCode: string, emoji: string, user: any) {
        if (this.socket) this.socket.emit('emoji_reaction', { sessionCode, emoji, user });
    }
    onStreamEmoji(callback: (data: any) => void) {
        if (this.socket) this.socket.on('stream_emoji', callback);
    }
    offStreamEmoji() {
        if (this.socket) this.socket.off('stream_emoji');
    }

    emitSaveBookmark(userId: string, sessionCode: string, sessionTitle: string) {
        if (this.socket) this.socket.emit('save_bookmark', { userId, sessionCode, sessionTitle });
    }
    onBookmarkSaved(callback: (data: any) => void) {
        if (this.socket) this.socket.on('bookmark_saved', callback);
    }

    emitTriggerSpotlight(sessionCode: string, teacherId: string) {
        if (this.socket) this.socket.emit('trigger_spotlight', { sessionCode, teacherId });
    }
    onSpotlightResult(callback: (data: any) => void) {
        if (this.socket) this.socket.on('spotlight_result', callback);
    }
    onSpotlightError(callback: (data: any) => void) {
        if (this.socket) this.socket.on('spotlight_error', callback);
    }
    offSpotlightEvents() {
        if (this.socket) {
            this.socket.off('spotlight_result');
            this.socket.off('spotlight_error');
        }
    }
}

export const socketService = new SocketService();