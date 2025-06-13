import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const QuizResultsPage = () => {
  const [quizResult, setQuizResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchQuizResults();
  }, []);

  const fetchQuizResults = async () => {
    setLoading(true);
    setError(null);
    console.log('Starting fetchQuizResults...');

    try {
      // Step 1: Fetch the latest form_id
      console.log('Fetching latest form ID...');
      const formIdResponse = await fetch('http://localhost:5000/latest-form-id', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      console.log('Form ID response status:', formIdResponse.status);
      if (!formIdResponse.ok) {
        const errorText = await formIdResponse.text();
        throw new Error(`Failed to fetch form ID: ${errorText}`);
      }
      const formIdData = await formIdResponse.json();
      console.log('Form ID data:', formIdData);

      if (!formIdData.form_id) {
        throw new Error('No form ID found');
      }
      const formId = formIdData.form_id;

      // Step 2: Evaluate quiz with the form_id
      console.log(`Evaluating quiz for form ID: ${formId}...`);
      const evaluationResponse = await fetch('http://localhost:5000/evaluate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_id: formId }),
      });
      console.log('Evaluation response status:', evaluationResponse.status);
      if (!evaluationResponse.ok) {
        const errorText = await evaluationResponse.text();
        throw new Error(`Failed to evaluate quiz: ${errorText}`);
      }
      const evaluationData = await evaluationResponse.json();
      console.log('Evaluation data:', evaluationData);

      if (!evaluationData || !evaluationData.question_results) {
        throw new Error('Invalid evaluation data');
      }

      setQuizResult(evaluationData);
    } catch (err) {
      console.error('Error in fetchQuizResults:', err);
      setError(`Failed to load quiz results: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-4 text-lg font-semibold text-gray-700">Loading results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading Results</h2>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={fetchQuizResults}
          className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!quizResult) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <AlertCircle size={48} className="text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">No Results Found</h2>
        <p className="text-gray-600">No quiz results are available at this time.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6">
            <h1 className="text-2xl font-bold text-white">Quiz Results</h1>
            <div className="flex items-center mt-2">
              <div className="flex items-center bg-white bg-opacity-20 rounded-lg px-3 py-1">
                <span className="text-black font-medium mr-2">Score:</span>
                <span className="text-black font-bold">{quizResult.score} / {quizResult.total_questions}</span>
              </div>
              <div className="ml-4 flex items-center bg-white bg-opacity-20 rounded-lg px-3 py-1">
                <span className="text-black font-medium mr-2">Percentage:</span>
                <span className="text-black font-bold">{quizResult.percentage}%</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Questions & Answers</h2>
            <div className="space-y-6">
              {quizResult.question_results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${
                    result.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-start mb-3">
                    <div className="flex-shrink-0 mr-3 mt-1">
                      {result.is_correct ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-gray-800 font-medium">
                        Q{index + 1}: {result.question}
                      </h3>
                    </div>
                  </div>
                  <div className="ml-8 space-y-2">
                    <div className="flex items-start">
                      <span className="text-gray-600 font-medium mr-2">Your answer:</span>
                      <span className={result.is_correct ? 'text-green-700' : 'text-red-700'}>
                        {result.user_answer || 'Not answered'}
                      </span>
                    </div>
                    {!result.is_correct && (
                      <div className="flex items-start">
                        <span className="text-gray-600 font-medium mr-2">Correct answer:</span>
                        <span className="text-green-700">{result.correct_answer}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-gray-600">
          <p className="text-lg font-medium">
            {quizResult.percentage >= 70
              ? 'Great job! You passed the quiz.'
              : 'Keep studying! You\'ll do better next time.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuizResultsPage;