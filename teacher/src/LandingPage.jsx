import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, User } from 'lucide-react';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <BookOpen className="h-10 w-10 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">Welcome to EduQuiz</h1>
        </div>
        <p className="text-gray-600 text-center mb-8">Please select your role to proceed.</p>
        <div className="flex flex-col space-y-4">
          <Link
            to="/teacher"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
          >
            <User className="h-5 w-5" />
            <span>Teacher Login</span>
          </Link>
          <Link
            to="/student"
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
          >
            <User className="h-5 w-5" />
            <span>Student Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;