import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Users, FileText, Plus, Eye, Settings, BookOpen, Clock, CheckCircle, AlertCircle, LogOut } from 'lucide-react';
import axios from 'axios';

const TeacherDashboard = () => {
  const [activeTab, setActiveTab] = useState('classrooms');
  const [classrooms, setClassrooms] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newClassroom, setNewClassroom] = useState({
    name: '',
    subject: '',
    description: '',
    document: null,
    studentEmails: '',
    difficulty: 'medium',
    numQuestions: 5,
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Get teacher data from localStorage
  const teacherData = JSON.parse(localStorage.getItem('teacherData')) || {};
  const teacherName = teacherData.name || 'Unknown Teacher';

  // Check authentication on mount
  useEffect(() => {
    if (!teacherData.name) {
      console.log('No teacher data found, redirecting to /teacher/auth');
      localStorage.removeItem('teacherData');
      navigate('/teacher/auth');
    }
  }, [navigate]);

  const fetchClassrooms = async () => {
    setIsLoading(true);
    setError('');
    try {
      console.log(`Fetching classrooms for teacher: ${teacherName}`);
      const response = await axios.get(`http://localhost:5000/api/classrooms/${encodeURIComponent(teacherName)}`);
      console.log('Classrooms response:', response.data);
      setClassrooms(response.data || []);
      setError('');
    } catch (error) {
      console.error('Error fetching classrooms:', error);
      let errorMessage = 'Failed to load classrooms. Please try again.';
      if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
        localStorage.removeItem('teacherData');
        navigate('/teacher/auth');
      } else if (error.response) {
        errorMessage = `Error: ${error.response.status} - ${error.response.data?.error || 'Unknown server error'}`;
      } else if (error.request) {
        errorMessage = 'Unable to reach the server. Please check if the backend is running.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (teacherName !== 'Unknown Teacher') {
      fetchClassrooms();
    }
  }, [teacherName]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      setNewClassroom((prev) => ({
        ...prev,
        document: file,
      }));
      setError('');
    } else {
      setError('Please upload a valid PDF, DOC, or DOCX file.');
    }
  };

  const handleCreateClassroom = async () => {
    if (!newClassroom.name || !newClassroom.document || !newClassroom.studentEmails) {
      setError('Please fill all required fields: Classroom Name, Lesson Document, and Student Emails.');
      return;
    }

    if (!['easy', 'medium', 'hard'].includes(newClassroom.difficulty)) {
      setError('Please select a valid difficulty level.');
      return;
    }

    if (!Number.isInteger(Number(newClassroom.numQuestions)) || newClassroom.numQuestions < 1 || newClassroom.numQuestions > 20) {
      setError('Please enter a valid number of questions (1–20).');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('name', newClassroom.name);
      formData.append('subject', newClassroom.subject);
      formData.append('description', newClassroom.description);
      formData.append('document', newClassroom.document);
      formData.append('studentEmails', newClassroom.studentEmails);
      formData.append('teacher', teacherName);
      formData.append('difficulty', newClassroom.difficulty);
      formData.append('numQuestions', newClassroom.numQuestions);

      console.log('Creating classroom with data:', {
        name: newClassroom.name,
        subject: newClassroom.subject,
        description: newClassroom.description,
        studentEmails: newClassroom.studentEmails,
        teacher: teacherName,
        difficulty: newClassroom.difficulty,
        numQuestions: newClassroom.numQuestions,
        document: newClassroom.document?.name,
      });

      const response = await axios.post('http://localhost:5000/api/classrooms', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Create classroom response:', response.data);
      setClassrooms((prev) => [...prev, response.data]);

      setNewClassroom({
        name: '',
        subject: '',
        description: '',
        document: null,
        studentEmails: '',
        difficulty: 'medium',
        numQuestions: 5,
      });

      setShowCreateForm(false);
      alert('Classroom and quiz created successfully!');
    } catch (error) {
      console.error('Error creating classroom:', error);
      let errorMessage = error.response?.data?.error || 'Error creating classroom. Please try again.';
      if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
        localStorage.removeItem('teacherData');
        navigate('/teacher/auth');
      } else if (error.response?.status === 500) {
        errorMessage = `Server error: ${error.response.data?.error || 'Please check the backend logs.'}`;
      }
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogout = () => {
    console.log('Logging out, clearing localStorage');
    localStorage.removeItem('teacherData');
    navigate('/teacher/auth');
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <BookOpen className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">EduQuiz Teacher Portal</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">Welcome, {teacherName}</div>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                {teacherName.charAt(0)}
              </div>
              <button
                onClick={handleLogout}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{error}</span>
            <button
              onClick={fetchClassrooms}
              className="ml-4 px-3 py-1 bg-red-200 text-red-800 rounded-md hover:bg-red-300 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('classrooms')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'classrooms'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              My Classrooms
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Analytics
            </button>
          </nav>
        </div>

        {activeTab === 'classrooms' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Classrooms</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Create New Classroom</span>
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2"></div>
                <span className="text-gray-600">Loading classrooms...</span>
              </div>
            ) : classrooms.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">No classrooms found. Create a new one to get started.</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Classroom</span>
                </button>
              </div>
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
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            classroom.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {classroom.status || 'Unknown'}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <Users className="h-4 w-4 mr-2" />
                          <span>{(classroom.students || []).length} Students</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <FileText className="h-4 w-4 mr-2" />
                          <span>{(classroom.quizzes || []).length} Quizzes</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="h-4 w-4 mr-2" />
                          <span>
                            Created{' '}
                            {new Date(classroom.createdDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <button className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center">
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </button>
                        <button className="flex-1 bg-gray-50 text-gray-600 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center">
                          <Settings className="h-4 w-4 mr-1" />
                          Settings
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showCreateForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Create New Classroom</h3>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setError('');
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Classroom Name *</label>
                      <input
                        type="text"
                        value={newClassroom.name}
                        onChange={(e) => setNewClassroom((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Mathematics - Grade 10"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                      <input
                        type="text"
                        value={newClassroom.subject}
                        onChange={(e) => setNewClassroom((prev) => ({ ...prev, subject: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Mathematics"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={newClassroom.description}
                      onChange={(e) => setNewClassroom((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="2"
                      placeholder="Brief description of the classroom"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty Level *</label>
                      <select
                        value={newClassroom.difficulty}
                        onChange={(e) => setNewClassroom((prev) => ({ ...prev, difficulty: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Number of Questions *</label>
                      <input
                        type="number"
                        value={newClassroom.numQuestions}
                        onChange={(e) => setNewClassroom((prev) => ({ ...prev, numQuestions: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 5"
                        min="1"
                        max="20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lesson Document * (PDF, DOC, DOCX)
                    </label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                      <div className="space-y-1 text-center">
                        <Upload className="mx-auto h-12 w-12 text-gray-400" />
                        <div className="flex text-sm text-gray-600">
                          <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                            <span>Upload a file</span>
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,.doc,.docx"
                              onChange={handleFileUpload}
                            />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">PDF, DOC, DOCX up to 10MB</p>
                        {newClassroom.document && (
                          <div className="mt-2 text-sm text-green-600 flex items-center justify-center">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {newClassroom.document.name} ({formatFileSize(newClassroom.document.size)})
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Student Email Addresses * (One per line)
                    </label>
                    <textarea
                      value={newClassroom.studentEmails}
                      onChange={(e) => setNewClassroom((prev) => ({ ...prev, studentEmails: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="6"
                      placeholder="student1@email.com
student2@email.com
student3@email.com"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Enter one email address per line. These students will be able to access the quiz.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm flex items-center">
                      <AlertCircle className="h-5 w-5 mr-2" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        setError('');
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                      disabled={isGenerating}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateClassroom}
                      disabled={isGenerating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isGenerating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating Quiz...
                        </>
                      ) : (
                        'Create Classroom'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;