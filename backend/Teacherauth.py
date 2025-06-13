from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import bcrypt
from datetime import datetime
from werkzeug.utils import secure_filename
import gridfs

app = Flask(__name__)

# Enhanced CORS configuration
CORS(app, resources={r"/api/*": {
    "origins": "http://localhost:3000",
    "methods": ["GET", "POST", "OPTIONS"],  # Explicitly allow these methods
    "allow_headers": ["Content-Type", "Authorization"],  # Allow these headers
    "supports_credentials": True  # If you plan to use cookies or auth headers
}})

# Load environment variables
load_dotenv()
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/eduquiz')

# MongoDB connection
client = MongoClient(MONGODB_URI)
db = client['eduquiz']
teacher_auth = db['teacher']
classrooms = db['classrooms']
fs = gridfs.GridFS(db)

# Helper function to validate email format
def is_valid_email(email):
    import re
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(email_regex, email)

@app.route('/api/teachers/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        print(f"Signup request data: {data}")
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        qualification = data.get('qualification')

        # Input validation
        if not all([name, email, password, qualification]):
            return jsonify({'error': 'All fields are required'}), 400
        
        if not is_valid_email(email):
            return jsonify({'error': 'Invalid email format'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400

        # Check for existing teacher
        if teacher_auth.find_one({'email': email}):
            return jsonify({'error': 'Email already registered'}), 409

        # Hash password
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        # Create teacher document
        teacher = {
            'name': name,
            'email': email,
            'password': hashed_password,
            'qualification': qualification,
            'created_at': datetime.utcnow()
        }

        # Insert into MongoDB
        result = teacher_auth.insert_one(teacher)
        teacher_id = str(result.inserted_id)
        print(f"Teacher created with ID: {teacher_id}")

        # Return success response
        return jsonify({
            'message': 'Teacher created successfully',
            'teacher': {
                'name': name,
                'email': email,
                'qualification': qualification
            }
        }), 201

    except Exception as e:
        print(f"Signup error: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/teachers/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        print(f"Login request data: {data}")
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')

        # Input validation
        if not all([name, email, password]):
            return jsonify({'error': 'All fields are required'}), 400

        # Find teacher
        teacher = teacher_auth.find_one({'email': email, 'name': name})
        if not teacher:
            print(f"Teacher not found for email: {email}, name: {name}")
            return jsonify({'error': 'Invalid name or email'}), 401

        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), teacher['password']):
            print(f"Invalid password for email: {email}")
            return jsonify({'error': 'Invalid password'}), 401

        print(f"Teacher logged in: {email}")
        # Return success response
        return jsonify({
            'teacher': {
                'name': teacher['name'],
                'email': teacher['email'],
                'qualification': teacher['qualification']
            }
        }), 200

    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)