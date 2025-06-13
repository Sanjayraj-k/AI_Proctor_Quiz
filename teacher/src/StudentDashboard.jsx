import React, { useState } from 'react';
import { BookOpen, FileText, LogIn, Mail, ExternalLink, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const StudentDashboard = () => {
  const [email, setEmail] = useState('');
  const [classrooms, setClassrooms] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setError('');
    setSuccessMessage('');

    try {
      const response = await axios.post('http://localhost:5000/api/student/login', { email });
      const fetchedClassrooms = response.data || [];
      setClassrooms(fetchedClassrooms);
      setIsLoggedIn(true);
      setSuccessMessage('Login successful! Here are your classrooms.');
      setEmail(''); // Clear the email input after login
    } catch (error) {
      console.error('Error during student login:', error);
      setError(error.response?.data?.error || 'Failed to log in. Please try again.');
    }
  };

  const handleStartProctoredQuiz = (quiz) => {
    navigate('/uploadface', { state: { quiz } });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <BookOpen className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">EduQuiz Student Portal</h1>
            </div>
            {isLoggedIn && (
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  Logged in as {classrooms[0]?.students?.find(s => s.email === email)?.email || email}
                </div>
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {email.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error and Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-md">
            {successMessage}
          </div>
        )}

        {/* Login Form */}
        {!isLoggedIn ? (
          <div className="bg-white p-6 rounded-lg shadow-sm border max-w-md mx-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Student Login</h2>
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="student@example.com"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
              >
                <LogIn className="h-4 w-4" />
                <span>Log In</span>
              </button>
            </form>
          </div>
        ) : (
          /* Classrooms List */
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Your Classrooms</h2>
            {classrooms.length === 0 ? (
              <p className="text-gray-600">No classrooms found. Please contact your teacher to be added to a classroom.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {classrooms.map((classroom) => (
                  <div key={classroom._id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">{classroom.name}</h3>
                          <p className="text-sm text-gray-600">{classroom.subject || 'No subject'}</p>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <FileText className="h-4 w-4 mr-2" />
                          <span>{(classroom.quizzes || []).length} Quizzes</span>
                        </div>
                      </div>

                      {/* Quizzes List */}
                      <div className="space-y-3">
                        {classroom.quizzes && classroom.quizzes.length > 0 ? (
                          classroom.quizzes.map((quiz) => (
                            <div
                              key={quiz._id}
                              className="border-t pt-3 flex justify-between items-center"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">{quiz.title}</p>
                                {quiz.googleFormLink ? (
                                  <button
                                    onClick={() => handleStartProctoredQuiz(quiz)}
                                    className="text-blue-600 hover:underline text-sm flex items-center"
                                  >
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Start Quiz with Proctoring
                                  </button>
                                ) : (
                                  <p className="text-sm text-gray-500">Quiz link not available</p>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No quizzes available</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;