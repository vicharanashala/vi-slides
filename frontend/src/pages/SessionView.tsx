import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sessionService, Session } from '../services/sessionService';
import { questionService, Question } from '../services/questionService';
import { socketService } from '../services/socketService';
import QuestionInput from '../components/QuestionInput';
import QuestionCard from '../components/QuestionCard';
import PollCreator from '../components/PollCreator';
import PollCard from '../components/PollCard';
import { pollService, Poll } from '../services/pollService';
import Toast from '../components/Toast';
import Whiteboard from '../components/Whiteboard';
import EngagementControls from '../components/EngagementControls';
import EngagementTeacherView from '../components/EngagementTeacherView';
import Leaderboard from '../components/Leaderboard';
import PrivateChat from '../components/PrivateChat';
import Confetti from '../components/Confetti';

const SessionView: React.FC = () => {
    const { code } = useParams<{ code: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [session, setSession] = useState<Session | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showEndModal, setShowEndModal] = useState(false);
    const [isEnding, setIsEnding] = useState(false);
    const [activePoll, setActivePoll] = useState<Poll | null>(null);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [activePrivateChatRecipient, setActivePrivateChatRecipient] = useState<{ id: string; name: string } | null>(null);
    const [pulseCheckActive, setPulseCheckActive] = useState(false);
    const [pulseCheckClicked, setPulseCheckClicked] = useState(false);
    const [pulseCheckTimer, setPulseCheckTimer] = useState(10);
    const [showConfetti, setShowConfetti] = useState(false);

    // New State for 3-Column Layout
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    const [showExportOptions, setShowExportOptions] = useState(false);

    const [showLeftSidebar, setShowLeftSidebar] = useState(false);
    const [showRightSidebar, setShowRightSidebar] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [showEngagement, setShowEngagement] = useState(false);

    const isTeacher = user?.role?.toLowerCase() === 'teacher';

    useEffect(() => {
        const fetchData = async () => {
            if (!code) return;
            try {
                // 1. Fetch Session Details
                const sessionRes = await sessionService.getSessionDetails(code);
                if (sessionRes.success) {
                    setSession(sessionRes.data);
                    if (sessionRes.data.status === 'ended') {
                        navigate('/dashboard');
                        return;
                    }

                    // 2. Fetch Questions
                    const questionsRes = await questionService.getSessionQuestions(sessionRes.data._id);
                    if (questionsRes.success) {
                        setQuestions([...questionsRes.data].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
                    }

                    // 3. Fetch Active Poll
                    const pollRes = await pollService.getActivePoll(sessionRes.data._id);
                    if (pollRes.success) {
                        setActivePoll(pollRes.data);
                    }

                    // 4. Connect Socket and Join Room
                    socketService.connect();
                    socketService.joinSession({
                        sessionCode: code,
                        user: {
                            _id: user?.id,
                            name: user?.name,
                            email: user?.email
                        }
                    });

                    // 5. Setup Socket Listeners (Safely clear previous ones first)
                    socketService.offNewQuestion();
                    socketService.onNewQuestion((newQ: Question) => {
                        console.log('📨 New question received:', newQ);
                        setQuestions(prev => {
                            // Deduplication check
                            if (prev.find(q => q._id === newQ._id)) return prev;
                            return [...prev, newQ]; // Append to keep oldest first
                        });
                    });

                    socketService.offUpdateQuestion();
                    socketService.onUpdateQuestion((updatedQ: Question) => {
                        console.log('📨 SessionView received updated question:', updatedQ);
                        console.log('📨 Teacher answer:', updatedQ.teacherAnswer);
                        setQuestions(prev => {
                            const newQuestions = prev.map(q => q._id === updatedQ._id ? updatedQ : q);
                            console.log('📨 Updated questions array:', newQuestions);
                            return newQuestions;
                        });
                    });

                    socketService.offDeleteQuestion();
                    socketService.onDeleteQuestion((deletedId: string) => {
                        setQuestions(prev => prev.filter(q => q._id !== deletedId));
                    });

                    socketService.offSessionStatusUpdate();
                    socketService.onSessionStatusUpdate((data) => {
                        setSession(prev => prev ? { ...prev, status: data.status as any } : null);
                        if (data.status === 'ended') {
                            navigate('/dashboard');
                        }
                    });

                    socketService.offQuestionAnalyzed();
                    socketService.onQuestionAnalyzed((analyzedQ: Question) => {
                        setQuestions(prev => prev.map(q => q._id === analyzedQ._id ? analyzedQ : q));
                    });

                    socketService.offQuestionPinnedToggle();
                    socketService.onQuestionPinnedToggle((updatedQ: Question) => {
                        setQuestions(prev => prev.map(q => q._id === updatedQ._id ? updatedQ : q));
                    });

                    socketService.offQuestionsRefined();
                    socketService.onQuestionsRefined((data: any) => {
                        console.log('✨ Questions refined:', data.count);
                        setQuestions(prev => {
                            const updated = [...prev];
                            data.questions.forEach((refinedQ: Question) => {
                                const index = updated.findIndex(q => q._id === refinedQ._id);
                                if (index !== -1) {
                                    updated[index] = refinedQ;
                                }
                            });
                            return updated;
                        });
                        setToast({ message: `Refined ${data.count} questions for clarity`, type: 'info' });
                    });

                    socketService.offBatchRefinementFailed();
                    socketService.onBatchRefinementFailed((data: any) => {
                        console.error('❌ Batch refinement failed:', data.error);
                        setToast({ message: 'AI Refinement failed, retrying...', type: 'warning' });
                    });

                    // User Join Listener
                    socketService.offUserJoined();
                    socketService.onUserJoined((newUser: any) => {
                        console.log('👤 User joined:', newUser);
                        setSession(prev => {
                            if (!prev) return null;
                            // Check if student already exists
                            const exists = prev.students.find((s: any) => s._id === newUser._id || s.id === newUser._id);
                            if (exists) return prev;

                            return {
                                ...prev,
                                students: [...prev.students, newUser]
                            };
                        });
                        setToast({ message: `${newUser.name} joined!`, type: 'info' });
                    });

                    // Whiteboard Socket Listeners
                    socketService.offWhiteboardEvents();
                    socketService.onWhiteboardOpen(() => {
                        setShowWhiteboard(true);
                    });
                    socketService.onWhiteboardClose(() => {
                        setShowWhiteboard(false);
                    });

                    // Poll Listeners
                    socketService.offPollEvents();
                    socketService.onNewPoll((newPoll: Poll) => {
                        setActivePoll(newPoll);
                        setShowPollCreator(false);
                    });
                    socketService.onPollUpdate((updatedPoll: Poll) => {
                        setActivePoll(updatedPoll);
                    });
                    socketService.onPollClosed((_closedPoll: Poll) => {
                        // Hide poll immediately when closed
                        setActivePoll(null);
                    });

                    // Pulse Check Listeners
                    socketService.offPulseCheckEvents();
                    socketService.onPulseCheckStart(() => {
                        if (user?.role?.toLowerCase() === 'student') {
                            setPulseCheckActive(true);
                            setPulseCheckClicked(false);
                            setPulseCheckTimer(10);
                            setToast({ message: '🔥 PULSE CHECK! Click the button for bonus points!', type: 'warning' });
                        }
                    });

                    // Celebration / Confetti
                    socketService.onCelebration((data: any) => {
                        if (data.type === 'confetti') {
                            setShowConfetti(true);
                        }
                    });

                    // Points/Leaderboard Updates
                    socketService.onPointsUpdated((data) => {
                        console.log('🏆 Points updated:', data);
                        setSession(prev => {
                            if (!prev) return null;
                            const updatedStudents = prev.students.map((s: any) => {
                                if (s._id === data.userId || s.id === data.userId) {
                                    return { ...s, points: data.points };
                                }
                                return s;
                            });
                            return { ...prev, students: updatedStudents };
                        });

                        // Also show a toast if it's the current user
                        if (data.userId === user?.id) {
                            setToast({ message: `🎉 You got points! Total: ${data.points}`, type: 'success' });
                        }
                    });
                }
            } catch (err: any) {
                setError(err.response?.data?.message || 'Failed to fetch session data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [code, navigate]);

    // 5-Second Auto-Refresh Logic for Teacher Answers
    useEffect(() => {
        if (!session || session.status === 'ended' || !session._id) return;

        const refreshInterval = setInterval(async () => {
            try {
                const questionsRes = await questionService.getSessionQuestions(session._id);
                if (questionsRes.success) {
                    setQuestions(prev => {
                        const newQuestions = questionsRes.data;
                        // Check for new teacher answers
                        const hasNewTeacherAnswers = newQuestions.some(nq =>
                            nq.teacherAnswer && !prev.find(pq => pq._id === nq._id && pq.teacherAnswer === nq.teacherAnswer)
                        );

                        if (hasNewTeacherAnswers) {
                            console.log('📨 Polling found new teacher answers');
                        }

                        return [...newQuestions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    });
                }
            } catch (err) {
                console.log('Polling error:', err);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(refreshInterval);
    }, [session]);



    // Pulse Check Timer & Helpers
    useEffect(() => {
        let interval: any;
        if (pulseCheckActive && pulseCheckTimer > 0) {
            interval = setInterval(() => {
                setPulseCheckTimer(prev => prev - 1);
            }, 1000);
        } else if (pulseCheckTimer === 0) {
            setPulseCheckActive(false);
        }
        return () => clearInterval(interval);
    }, [pulseCheckActive, pulseCheckTimer]);

    const handlePulseClick = () => {
        if (!pulseCheckClicked && user?.id) {
            socketService.emitPulseCheckResponse(user.id, code || '');
            setPulseCheckClicked(true);
            setToast({ message: '✅ Bonus points claimed!', type: 'success' });
            setTimeout(() => setPulseCheckActive(false), 1000);
        }
    };

    const triggerPulseCheck = () => {
        if (isTeacher && code) {
            socketService.emitPulseCheckInit(code);
            setToast({ message: 'Pulse check triggered for students!', type: 'info' });
        }
    };

    const handlePauseSession = async () => {
        if (!session) return;
        try {
            const response = await sessionService.pauseSession(session._id);
            if (response.success) {
                setSession(prev => prev ? { ...prev, status: response.status as any } : null);
            }
        } catch (err) {
            console.error('Error toggling pause:', err);
            setToast({ message: 'Failed to update session status', type: 'error' });
        }
    };



    const handleExportPDF = () => {
        if (!questions.length) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            setToast({ message: 'Please allow popups to export PDF', type: 'warning' });
            return;
        }

        const date = new Date().toLocaleDateString();
        const sorted = [...questions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const html = `
            <html>
            <head>
                <title>Session Q&A - ${session?.title}</title>
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
                    .header { border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #6366f1; font-size: 24px; }
                    .header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
                    .question-item { margin-bottom: 25px; page-break-inside: avoid; }
                    .question-text { font-weight: 700; font-size: 16px; margin-bottom: 8px; display: flex; gap: 10px; }
                    .answer-box { background: #f8fafc; border-left: 4px solid #e2e8f0; padding: 12px 16px; margin-left: 25px; font-size: 15px; border-radius: 0 4px 4px 0; }
                    .ai-label { font-size: 11px; font-weight: 800; color: #6366f1; margin-bottom: 4px; display: block; text-transform: uppercase; }
                    .meta { font-size: 12px; color: #94a3b8; margin-top: 4px; }
                    .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #cbd5e1; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${session?.title}</h1>
                    <p>Session Code: <strong>${session?.code}</strong> | Date: ${date} | Total Questions: ${questions.length}</p>
                </div>
                <div class="questions-list">
                    ${sorted.map((q, i) => `
                        <div class="question-item">
                            <div class="question-text">
                                <span>${i + 1}.)</span>
                                <div>${q.content}</div>
                            </div>
                            <div class="meta">Asked by ${q.user?.name || 'Anonymous'} • ${new Date(q.createdAt).toLocaleTimeString()}</div>
                            ${q.aiAnalysis?.aiAnswer ? `
                                <div class="answer-box">
                                    <span class="ai-label">🤖 AI Response</span>
                                    ${q.aiAnalysis.aiAnswer}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="footer">
                    Generated by Vi-SlideS - Interactive Learning Platform
                </div>
                <script>
                    window.onload = () => {
                        window.print();
                        window.close();
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleEndSession = () => {
        setShowEndModal(true);
    };

    const confirmEndSession = async () => {
        if (!session) return;
        setIsEnding(true);
        try {
            const response = await sessionService.endSession(session._id);
            if (response.success) {
                navigate(`/session/${session.code}/summary`, { state: { summaryData: response.data } });
            }
        } catch (err) {
            console.error('Error ending session:', err);
            setToast({ message: 'Failed to end session', type: 'error' });
            setIsEnding(false);
            setShowEndModal(false);
        }
    };

    const handleLeaveSession = async () => {
        if (!code) return;
        try {
            await sessionService.leaveSession(code);
            navigate('/dashboard');
        } catch (err) {
            console.error('Error leaving session:', err);
            navigate('/dashboard'); // Navigate anyway
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg)' }}>
                <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
            </div>
        );
    }

    if (!session) return null;

    // We use the questions array directly for navigation (Oldest First)
    const sortedQuestions = questions;
    const selectedQuestion = questions.find(q => q._id === selectedQuestionId);

    const exportToCSV = () => {
        if (!questions.length) return;

        const headers = ['ID', 'Author', 'Question', 'Upvotes', 'Pinned', 'AI Complexity', 'AI Sentiment', 'Created At'];
        const rows = questions.map(q => [
            q._id,
            q.user?.name || 'Unknown',
            `"${q.content.replace(/"/g, '""')}"`,
            q.upvotes?.length || 0,
            q.isPinned ? 'Yes' : 'No',
            q.aiAnalysis?.complexity || 'N/A',
            q.aiAnalysis?.sentiment || 'N/A',
            new Date(q.createdAt).toLocaleString()
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `session_questions_${code}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportOptions(false);
    };



    const handleNextQuestion = () => {
        if (!sortedQuestions.length) return;
        const currentIndex = sortedQuestions.findIndex(q => q._id === selectedQuestionId);
        if (currentIndex === -1 || currentIndex === sortedQuestions.length - 1) {
            if (currentIndex === -1 && sortedQuestions.length > 0) setSelectedQuestionId(sortedQuestions[0]._id);
            return;
        }
        setSelectedQuestionId(sortedQuestions[currentIndex + 1]._id);
    };

    const handlePrevQuestion = () => {
        if (!sortedQuestions.length) return;
        const currentIndex = sortedQuestions.findIndex(q => q._id === selectedQuestionId);
        if (currentIndex <= 0) return;
        setSelectedQuestionId(sortedQuestions[currentIndex - 1]._id);
    };



    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
            {/* Session Header */}
            <nav style={{
                background: 'var(--color-bg-secondary)',
                opacity: 0.95,
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid var(--color-surface)',
                padding: '1rem 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 100
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-primary-light)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Live Session
                        </div>
                        {session.status === 'paused' && (
                            <span style={{
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#f59e0b',
                                padding: '0.2rem 0.6rem',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                textTransform: 'uppercase'
                            }}>
                                PAUSED
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{session.title}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div className="glass-card" style={{ padding: '0.4rem 1rem', borderRadius: 'var(--radius-md)', margin: 0, border: '1px solid var(--color-primary-light)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block', lineHeight: 1 }}>CODE</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--color-primary-light)' }}>{session.code}</span>
                    </div>



                    {user?.role?.toLowerCase() === 'teacher' ? (
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowQRModal(true)}
                                className="btn btn-secondary"
                                style={{
                                    background: 'rgba(236, 72, 153, 0.1)',
                                    color: '#ec4899',
                                    borderColor: 'rgba(236, 72, 153, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                                title="Show Join Code"
                            >
                                <span style={{ fontSize: '1.2rem' }}>📱</span>
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowExportOptions(!showExportOptions)}
                                    className="btn btn-secondary"
                                    style={{
                                        background: 'rgba(99, 102, 241, 0.1)',
                                        color: 'var(--color-primary-light)',
                                        borderColor: 'rgba(99, 102, 241, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem'
                                    }}
                                >
                                    📄 Export ▾
                                </button>

                                {showExportOptions && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        marginTop: '0.5rem',
                                        background: 'var(--color-surface)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 'var(--radius-sm)',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                                        zIndex: 1000,
                                        minWidth: '150px',
                                        overflow: 'hidden'
                                    }}>
                                        <button
                                            onClick={() => {
                                                handleExportPDF();
                                                setShowExportOptions(false);
                                            }}
                                            style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                        >
                                            📄 PDF Document
                                        </button>
                                        <button
                                            onClick={exportToCSV}
                                            style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                        >
                                            📊 CSV Spreadsheet
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setShowPollCreator(!showPollCreator)}
                                className="btn btn-secondary"
                                style={{
                                    background: showPollCreator ? 'var(--color-primary)' : 'rgba(99, 102, 241, 0.1)',
                                    color: showPollCreator ? 'white' : 'var(--color-primary-light)',
                                    borderColor: 'rgba(99, 102, 241, 0.2)'
                                }}
                                title="Manage Polls"
                            >
                                📊 Poll
                            </button>
                            <button
                                onClick={handlePauseSession}
                                className="btn btn-secondary"
                                style={{
                                    background: session.status === 'paused' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: session.status === 'paused' ? '#10b981' : '#f59e0b',
                                    borderColor: session.status === 'paused' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'
                                }}
                            >
                                {session.status === 'paused' ? 'Resume' : 'Pause'}
                            </button>
                            <button
                                onClick={() => setShowEngagement(!showEngagement)}
                                className="btn btn-secondary"
                                style={{
                                    background: showEngagement ? 'var(--color-primary)' : 'rgba(99, 102, 241, 0.1)',
                                    color: showEngagement ? 'white' : 'var(--color-primary-light)',
                                    borderColor: 'rgba(99, 102, 241, 0.2)'
                                }}
                                title="View Student Engagement"
                            >
                                📊 Engagement
                            </button>
                            <button
                                onClick={triggerPulseCheck}
                                className="btn btn-secondary"
                                style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }}
                                title="Check if students are paying attention"
                            >
                                🔥 Pulse Check
                            </button>
                            <button
                                onClick={() => {
                                    setShowWhiteboard(true);
                                    socketService.emitWhiteboardOpen(code || '');
                                }}
                                className="btn btn-secondary"
                                style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary-light)', borderColor: 'rgba(99, 102, 241, 0.2)' }}
                            >
                                Open Whiteboard
                            </button>
                            <button onClick={handleEndSession} className="btn btn-secondary" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                                End Session
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleLeaveSession} className="btn btn-secondary">
                            Leave
                        </button>
                    )}
                </div>
            </nav >
            {error && <div className="container" style={{ marginTop: '1rem' }}><div className="alert alert-error">{error}</div></div>}

            {showWhiteboard && (
                <Whiteboard
                    sessionCode={code || ''}
                    isTeacher={isTeacher}
                    onClose={() => {
                        setShowWhiteboard(false);
                        if (isTeacher) socketService.emitWhiteboardClose(code || '');
                    }}
                />
            )}

            {/* Main Content Area - 3 Column Layout */}
            <main style={{
                height: 'calc(100vh - 74px)', // Adjust based on navbar height
                display: 'flex',
                overflow: 'hidden'
            }}>

                {/* Left Column: Question Sidebar List */}
                <div style={{
                    width: showLeftSidebar ? '280px' : '0px',
                    minWidth: showLeftSidebar ? '280px' : '0px',
                    transition: 'all 0.3s ease',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(15, 23, 42, 0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--color-primary-light)' }}>Questions ({questions.length})</h3>
                        <button onClick={() => setShowLeftSidebar(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                            ◀️
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                        {questions.length === 0 ? (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                No questions yet
                            </div>
                        ) : (
                            questions.map((q, idx) => (
                                <div
                                    key={q._id}
                                    onClick={() => setSelectedQuestionId(q._id)}
                                    style={{
                                        padding: '0.75rem',
                                        marginBottom: '0.5rem',
                                        borderRadius: 'var(--radius-sm)',
                                        background: selectedQuestionId === q._id ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)',
                                        border: selectedQuestionId === q._id ? '1px solid var(--color-primary)' : '1px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.25rem' }}>
                                        {idx + 1}. {q.content}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{q.user?.name}</span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {q.isPinned && <span style={{ fontSize: '0.8rem' }}>📌</span>}
                                            {q.teacherAnswer && <span style={{ fontSize: '0.8rem' }}>✅</span>}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Center Column: Spotlight / Slide View */}
                <section style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    background: 'var(--color-bg)',
                    overflowY: 'auto',
                    padding: '2rem'
                }}>
                    {!showLeftSidebar && (
                        <button
                            onClick={() => setShowLeftSidebar(true)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                left: '1rem',
                                zIndex: 10,
                                background: 'var(--color-surface)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '0.5rem',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                color: 'var(--color-text-secondary)'
                            }}
                        >
                            ▶️ Show Questions
                        </button>
                    )}

                    {!showRightSidebar && (
                        <button
                            onClick={() => setShowRightSidebar(true)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                zIndex: 10,
                                background: 'var(--color-surface)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '0.5rem',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                color: 'var(--color-text-secondary)'
                            }}
                        >
                            Show Info ◀️
                        </button>
                    )}

                    {/* Polls at Top of Center */}
                    <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto 2rem auto' }}>
                        {isTeacher && showPollCreator && (
                            <PollCreator
                                sessionId={session?._id || ''}
                                onPollCreated={(poll) => {
                                    setActivePoll(poll);
                                    setShowPollCreator(false);
                                }}
                            />
                        )}

                        {activePoll && (
                            <PollCard
                                poll={activePoll}
                                isTeacher={isTeacher}
                                onClose={() => setActivePoll(null)}
                            />
                        )}

                        {user?.role?.toLowerCase() === 'student' && (
                            <div style={{ marginBottom: '1rem' }}>
                                <EngagementControls sessionCode={code || ''} user={user} />
                                <QuestionInput sessionId={session?._id || ''} sessionStatus={session?.status || 'active'} />
                            </div>
                        )}
                    </div>

                    {/* Engagement Popup Overlay (Teacher Only) */}
                    {isTeacher && showEngagement && (
                        <div
                            className="anim-slide-down"
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                width: '400px',
                                maxWidth: '90vw',
                                zIndex: 1000,
                                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowEngagement(false)}
                                    style={{
                                        position: 'absolute',
                                        top: '0.5rem',
                                        right: '0.5rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        color: 'var(--color-text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '1.2rem',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 10
                                    }}
                                    title="Close"
                                >
                                    ×
                                </button>
                                <EngagementTeacherView />
                            </div>
                        </div>
                    )}

                    {/* Spotlight Question */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '85%',
                        height: '100%',
                        margin: '0 auto',
                        position: 'relative',
                        padding: '1.5rem'
                    }} className="slide-container">
                        {/* Question Counter - moved outside slide content */}
                        <div style={{
                            position: 'absolute',
                            top: '-3rem',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            color: 'var(--color-text-muted)',
                            fontSize: '0.9rem',
                            fontWeight: '500',
                            zIndex: 10,
                            background: 'rgba(15, 23, 42, 0.9)',
                            padding: '0.5rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                        }}>
                            Question {sortedQuestions.findIndex(q => q._id === selectedQuestionId) + 1} of {questions.length}
                        </div>

                        {/* Navigation Controls - only arrows, no counter */}
                        <div className="slide-nav-controls" style={{ top: '50%' }}>
                            <button
                                onClick={handlePrevQuestion}
                                disabled={sortedQuestions.findIndex(q => q._id === selectedQuestionId) === 0}
                                className="btn-nav btn-prev"
                            >
                                &lt;
                            </button>
                            <button
                                onClick={handleNextQuestion}
                                disabled={sortedQuestions.findIndex(q => q._id === selectedQuestionId) === sortedQuestions.length - 1}
                                className="btn-nav btn-next"
                            >
                                &gt;
                            </button>
                        </div>

                        {selectedQuestion ? (
                            <div className="anim-scale-up" style={{
                                width: '100%',
                                height: '100%',
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <QuestionCard
                                    question={selectedQuestion}
                                    isTeacher={isTeacher}
                                    onUpdate={(updated) => setQuestions(prev => prev.map(item => item._id === updated._id ? updated : item))}
                                    onDelete={(id) => {
                                        setQuestions(prev => prev.filter(item => item._id !== id));
                                        if (selectedQuestionId === id) setSelectedQuestionId(null);
                                    }}
                                />
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', opacity: 0.5 }}>
                                {/* <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👋</div> */}
                            </div>
                        )}
                    </div>
                </section>

                {/* Right Column: Session Info & Participants (Fixed Width) */}
                <aside style={{
                    width: showRightSidebar ? '320px' : '0px',
                    minWidth: showRightSidebar ? '320px' : '0px',
                    padding: showRightSidebar ? '1.5rem' : '0',
                    transition: 'all 0.3s ease',
                    background: 'var(--color-bg)',
                    borderLeft: '1px solid rgba(255,255,255,0.05)',
                    overflowY: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button onClick={() => setShowRightSidebar(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                            ▶️
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                        <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h4 style={{ margin: 0 }}>Session Info</h4>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                <p><strong>Teacher:</strong> {session.teacher?.name}</p>
                                <p><strong>Started:</strong> {new Date(session.createdAt).toLocaleTimeString()}</p>
                            </div>
                        </div>

                        <Leaderboard students={session.students} />

                        <div className="glass-card" style={{ padding: '1rem', marginTop: '1.5rem' }}>
                            <h4 className="mb-2">Participants ({session.students.length})</h4>
                            <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                                {session.students.length === 0 ? (
                                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>No students have joined yet.</p>
                                ) : (
                                    <ul style={{ listStyle: 'none', padding: 0 }}>
                                        {session.students.map((s: any) => (
                                            <li key={s._id || s.id} style={{
                                                padding: '0.5rem 0',
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem'
                                            }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    background: 'var(--gradient-primary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {s.name.charAt(0)}
                                                </div>
                                                <span style={{ fontSize: '0.9rem', flex: 1 }}>{s.name}</span>
                                                {(s._id !== user?.id && s.id !== user?.id) && (
                                                    <button
                                                        onClick={() => setActivePrivateChatRecipient({ id: s._id || s.id, name: s.name })}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            fontSize: '1rem',
                                                            cursor: 'pointer',
                                                            opacity: 0.7
                                                        }}
                                                        title="Message participant"
                                                    >
                                                        💬
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>

            </main >

            {/* Custom End Session Modal */}
            {
                showEndModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.8)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '1.5rem'
                    }}>
                        <div className="glass-card anim-slide-up" style={{
                            maxWidth: '400px',
                            width: '100%',
                            padding: '2rem',
                            textAlign: 'center',
                            background: 'rgba(30, 41, 59, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>End Session?</h3>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', lineHeight: '1.5' }}>
                                This will stop all submissions and generate a final report. This action cannot be undone.
                            </p>

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <button
                                    onClick={() => setShowEndModal(false)}
                                    className="btn btn-secondary"
                                    style={{ flex: 1, padding: '0.8rem' }}
                                    disabled={isEnding}
                                >
                                    Continue
                                </button>
                                <button
                                    onClick={confirmEndSession}
                                    className="btn btn-primary"
                                    style={{
                                        flex: 1,
                                        padding: '0.8rem',
                                        background: 'var(--color-error)',
                                        borderColor: 'var(--color-error)'
                                    }}
                                    disabled={isEnding}
                                >
                                    {isEnding ? <div className="spinner" style={{ width: '18px', height: '18px' }}></div> : 'Terminate'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Pulse Check Modal for Students */}
            {
                pulseCheckActive && user?.role?.toLowerCase() === 'student' && (
                    <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 2000,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(15, 23, 42, 0.7)',
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'all'
                    }}>
                        <div className="glass-card anim-scale-up" style={{
                            width: '300px',
                            padding: '2rem',
                            textAlign: 'center',
                            background: 'rgba(30, 41, 59, 0.95)',
                            border: '2px solid var(--color-warning)',
                            boxShadow: '0 0 40px rgba(245, 158, 11, 0.4)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚡</div>
                            <h2 style={{ marginBottom: '0.5rem', color: 'var(--color-warning)' }}>WAKE UP!</h2>
                            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
                                Click now for **+15 Points**!
                            </p>

                            <button
                                onClick={handlePulseClick}
                                disabled={pulseCheckClicked}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    fontSize: '1.2rem',
                                    fontWeight: 'bold',
                                    letterSpacing: '1px',
                                    background: pulseCheckClicked ? 'var(--color-success)' : 'var(--gradient-primary)',
                                    border: 'none',
                                    color: 'white',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    animation: !pulseCheckClicked ? 'pulse 1s infinite' : 'none',
                                    transition: 'all 0.3s ease'
                                }}
                            >
                                {pulseCheckClicked ? 'CLAIMED! ✅' : 'I AM HERE!'}
                            </button>

                            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                                <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${(pulseCheckTimer / 10) * 100}%`,
                                        height: '100%',
                                        background: 'var(--color-warning)',
                                        transition: 'width 1s linear'
                                    }}></div>
                                </div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{pulseCheckTimer}s</span>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Private Chat Window */}
            {
                activePrivateChatRecipient && (
                    <PrivateChat
                        recipient={activePrivateChatRecipient}
                        onClose={() => setActivePrivateChatRecipient(null)}
                        currentUser={user}
                        sessionCode={code || ''}
                    />
                )
            }

            {/* Toast Notification */}
            {
                toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )
            }


            {
                showConfetti && (
                    <Confetti
                        duration={5000}
                        onComplete={() => setShowConfetti(false)}
                    />
                )
            }
            {/* QR Code Modal for Session View */}
            {showQRModal && session && (
                <div className="modal-overlay fade-in" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 2000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '1rem'
                }} onClick={() => setShowQRModal(false)}>
                    <div className="glass-card slide-in" style={{
                        position: 'relative',
                        textAlign: 'center',
                        padding: '2rem',
                        borderRadius: '20px',
                        background: 'rgba(15, 15, 20, 0.95)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setShowQRModal(false)}
                            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: 'white', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        >
                            ✕
                        </button>

                        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem', fontWeight: '700' }}>Join Session</h2>
                        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '1.5rem', fontWeight: '500' }}>{session.title}</h3>

                        {session.qrCodeDataUrl ? (
                            <div style={{ background: 'white', padding: '0.8rem', borderRadius: '12px', display: 'inline-block', boxShadow: '0 0 30px rgba(99, 102, 241, 0.15)' }}>
                                <img src={session.qrCodeDataUrl} alt="QR Code" style={{ width: '250px', height: '250px', display: 'block' }} />
                            </div>
                        ) : (
                            <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>QR Code missing</div>
                        )}

                        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0' }}>Scan or visit</p>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.6rem', borderRadius: '8px' }}>
                                <p style={{ fontSize: '1rem', fontFamily: 'monospace', color: 'var(--color-primary-light)', fontWeight: 'bold', margin: 0 }}>
                                    {session.joinUrl || `${window.location.origin}/join/${session.code}`}
                                </p>
                                <button
                                    onClick={() => {
                                        const url = session.joinUrl || `${window.location.origin}/join/${session.code}`;
                                        navigator.clipboard.writeText(url);
                                        // Optional: Show toast
                                    }}
                                    title="Copy Link"
                                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '0.2rem 0.5rem', color: 'white', fontSize: '0.9rem' }}
                                >
                                    📋
                                </button>
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                            <span style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '3px', textTransform: 'uppercase' }}>{session.code}</span>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.1rem' }}>SESSION CODE</div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default SessionView;