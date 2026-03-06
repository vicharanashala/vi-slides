import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { authService } from '../services/authService';
import './Auth.css';

const Login: React.FC = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(formData);
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            const res = await authService.googleLogin(credentialResponse.credential);
            if (res.success) {
                sessionStorage.setItem('token', res.token);
                sessionStorage.setItem('user', JSON.stringify(res.user));
                window.location.href = '/dashboard'; // Hard reload to ensure context picks up or use proper context method
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Google Login failed');
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-background">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            <div className="auth-content fade-in">
                <div className="auth-card glass-card">
                    <div className="auth-header">
                        <h1 className="auth-title">Welcome Back</h1>
                        <p className="auth-subtitle">Sign in to continue to Vi-SlideS</p>
                    </div>

                    {error && (
                        <div className="alert alert-error slide-in">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label htmlFor="email" className="form-label">Email Address</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                className="form-input"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={onChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password" className="form-label">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    className="form-input"
                                    placeholder="••••••••"
                                    style={{ paddingRight: '2.5rem' }}
                                    value={formData.password}
                                    onChange={onChange}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-primary)',
                                        cursor: 'pointer',
                                        fontSize: '1.2rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 10
                                    }}
                                >
                                    {showPassword ? '👁️' : '🙈'}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-block"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner"></span>
                                    <span style={{ marginLeft: '0.5rem' }}>Signing in...</span>
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    <div style={{ margin: '1.5rem 0', textAlign: 'center', position: 'relative' }}>
                        <span style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0 10px', color: '#ccc', position: 'relative', zIndex: 1, borderRadius: '4px' }}>OR</span>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255, 255, 255, 0.1)', zIndex: 0 }}></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => setError('Google Login Failed')}
                            theme="filled_black"
                            shape="pill"
                            width="250"
                        />
                    </div>

                    <div className="auth-footer">
                        <p>
                            Don't have an account?{' '}
                            <Link to="/register" className="auth-link">
                                Sign Up
                            </Link>
                        </p>
                    </div>
                </div >
            </div >
        </div >
    );
};

export default Login;
