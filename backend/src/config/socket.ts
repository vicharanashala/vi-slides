import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import Session from '../models/Session';
import User from '../models/User';
import mongoose from 'mongoose';

let io: SocketServer;

const socketMap = new Map<string, { userId: string; name: string; email: string; sessionCode: string }>();

export const initSocket = (server: HttpServer) => {
    io = new SocketServer(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket: Socket) => {

        console.log(`🔌 New client connected: ${socket.id}`);

        socket.on('join_session', async (payload: any) => {

            let sessionCode = '';
            let user = null;

            if (typeof payload === 'string') {
                sessionCode = payload;
            } else {
                sessionCode = payload.sessionCode;
                user = payload.user;
            }

            if (!sessionCode) return;

            socket.join(sessionCode);

            if (user && user._id) {
                try {

                    socketMap.set(socket.id, {
                        userId: user._id,
                        name: user.name,
                        email: user.email,
                        sessionCode
                    });

                    await Session.findOneAndUpdate(
                        { code: sessionCode },
                        {
                            $push: {
                                attendance: {
                                    student: user._id,
                                    name: user.name,
                                    email: user.email,
                                    joinTime: new Date()
                                }
                            }
                        }
                    );

                    const freshUser = await User.findById(user._id).select('name email points avatar');

                    io.to(sessionCode).emit('user_joined', freshUser);

                } catch (error) {
                    console.error('Error recording attendance:', error);
                }
            }
        });

        socket.on('leave_session', async (sessionCode: string) => {
            socket.leave(sessionCode);
            await handleUserLeave(socket.id);
        });

        socket.on('disconnect', async () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
            await handleUserLeave(socket.id);
        });

        socket.on('whiteboard_open', ({ sessionCode }) => {
            socket.to(sessionCode).emit('whiteboard_open', { teacherId: socket.id });
        });

        socket.on('whiteboard_close', ({ sessionCode }) => {
            socket.to(sessionCode).emit('whiteboard_close');
        });

        socket.on('whiteboard_draw', ({ sessionCode, data }) => {
            socket.to(sessionCode).emit('whiteboard_draw', data);
        });

        socket.on('whiteboard_clear', ({ sessionCode }) => {
            socket.to(sessionCode).emit('whiteboard_clear');
        });

        socket.on('student_understanding_update', ({ sessionCode, understanding, user }) => {
            socket.to(sessionCode).emit('teacher_understanding_update', {
                socketId: socket.id,
                understanding,
                user
            });
        });

        socket.on('student_hand_raise', ({ sessionCode, isRaised, user }) => {
            socket.to(sessionCode).emit('teacher_hand_raise', {
                socketId: socket.id,
                isRaised,
                user
            });
        });

        socket.on('send_private_msg', ({ recipientId, message, sender }) => {

            for (const [sId, data] of socketMap.entries()) {

                if (data.userId.toString() === recipientId.toString() && data.sessionCode === sender.sessionCode) {

                    io.to(sId).emit('receive_private_msg', {
                        sender,
                        message,
                        timestamp: new Date()
                    });

                }
            }
        });

        socket.on('pulse_check_init', ({ sessionCode }) => {
            socket.to(sessionCode).emit('pulse_check_start');
        });

        socket.on('pulse_check_response', async ({ userId, sessionCode }) => {

            try {

                const user = await User.findByIdAndUpdate(
                    userId,
                    { $inc: { points: 15 } },
                    { new: true }
                );

                const userObjectId = new mongoose.Types.ObjectId(userId);

                await Session.updateOne(
                    { code: sessionCode, "attendance.student": userObjectId },
                    { $inc: { "attendance.$.score": 15 } }
                );

                if (user) {
                    io.to(sessionCode).emit('points_updated', {
                        userId,
                        points: user.points,
                        name: user.name
                    });
                }

            } catch (error) {
                console.error('Pulse check reward error:', error);
            }
        });

    });
};

const handleUserLeave = async (socketId: string) => {

    const data = socketMap.get(socketId);
    if (!data) return;

    const { userId, sessionCode } = data;

    try {

        const session = await Session.findOne({ code: sessionCode });

        if (session) {

            let entryIndex = -1;

            for (let i = session.attendance.length - 1; i >= 0; i--) {

                if (
                    session.attendance[i].student.toString() === userId.toString() &&
                    !session.attendance[i].leaveTime
                ) {
                    entryIndex = i;
                    break;
                }
            }

            if (entryIndex !== -1) {

                session.attendance[entryIndex].leaveTime = new Date();
                await session.save();

            }
        }

    } catch (error) {
        console.error('Error recording leave time:', error);
    }

    socketMap.delete(socketId);
};

export const getIO = () => {

    if (!io) {
        throw new Error('Socket.io not initialized!');
    }

    return io;
};

export const emitToSession = (sessionCode: string, event: string, data: any) => {

    if (io) {
        io.to(sessionCode).emit(event, data);
    }

};