import os
import tempfile
import json
from typing import TypedDict, List, Dict
import PyPDF2
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langsmith import Client
from langchain_core.tracers import LangChainTracer
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.retrievers import MultiQueryRetriever
from langgraph.graph import END, StateGraph
from bson.objectid import ObjectId
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv
from datetime import datetime
import bcrypt
import traceback
import gridfs
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {"origins": "http://localhost:5173"},
    r"/create-google-form": {"origins": "http://localhost:5173"},
    r"/latest-form-id": {"origins": "http://localhost:5173"},
    r"/fetch-responses/*": {"origins": "http://localhost:5173"},
    r"/evaluate-quiz": {"origins": "http://localhost:5173"},
    r"/api/health": {"origins": "http://localhost:5173"}
    
})

# MongoDB Configuration
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
try:
    client = MongoClient(MONGO_URI)
    db = client["eduquiz"]
    classroom_collection = db["classrooms"]
    quiz_collection = db["quizzes"]
    form_responses_collection = db["form_responses"]
    user_response_collection = db["user_response"]
    teacher_auth = db['teacher']
    classrooms = db['classrooms']
    fs = gridfs.GridFS(db)
    print("MongoDB connection successful")
except Exception as e:
    print(f"MongoDB connection failed: {str(e)}")

# Google Forms API Authentication
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "service-account.json")
SCOPES = [
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly"
]
try:
    creds = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    service = build("forms", "v1", credentials=creds)
    print("Google Forms API initialized successfully")
except Exception as e:
    print(f"Google Forms API initialization failed: {str(e)}")

# API Keys & Config
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "your-groq-api-key")
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY", "your-langchain-api-key")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "quiz-generator")
UPLOAD_FOLDER = tempfile.mkdtemp()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

client = Client(api_key=LANGCHAIN_API_KEY)
tracer = LangChainTracer(project_name=LANGCHAIN_PROJECT)
load_dotenv()

try:
    llm = ChatGroq(
        temperature=0.2,
        model_name="meta-llama/llama-4-maverick-17b-128e-instruct",
        groq_api_key=GROQ_API_KEY
    )
    print("ChatGroq initialized successfully")
except Exception as e:
    print(f"ChatGroq initialization failed: {str(e)}")

try:
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )
    print("HuggingFaceEmbeddings initialized successfully")
except Exception as e:
    print(f"HuggingFaceEmbeddings initialization failed: {str(e)}")

class GraphState(TypedDict):
    retriever: MultiQueryRetriever
    content: str
    difficulty: str
    num_questions: int
    questions: List[Dict]

def process_document(file_path, file_type=None):
    try:
        print(f"Processing document: {file_path} (type: {file_type})")
        if file_type == 'pdf':
            loader = PyPDFLoader(file_path)
        elif file_type in ['doc', 'docx']:
            loader = Docx2txtLoader(file_path)
        else:
            loader = TextLoader(file_path)
        documents = loader.load()
        content = " ".join([doc.page_content for doc in documents])
        print(f"Extracted content length: {len(content) if content else 0}")
        if not content:
            raise ValueError("Failed to extract content from the document")

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200
        )
        chunks = text_splitter.split_text(content)
        print(f"Number of chunks: {len(chunks)}")
        if not chunks:
            raise ValueError("No text chunks created from document")

        print("Creating FAISS vector store...")
        vectorstore = FAISS.from_texts(chunks, embeddings)
        base_retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

        print("Creating MultiQueryRetriever...")
        retriever = MultiQueryRetriever.from_llm(
            retriever=base_retriever,
            llm=llm,
        )
        return retriever
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in process_document: {error_details}")
        raise ValueError(f"Failed to process document: {str(e)}")

def retrieve_content(state: GraphState) -> GraphState:
    try:
        retriever = state.get("retriever")
        difficulty = state.get("difficulty", "medium")
        print(f"Retrieving content for difficulty: {difficulty}")

        if retriever is None:
            raise ValueError("Retriever object is missing")

        query = f"Information for {difficulty} difficulty quiz"
        docs = retriever.invoke(query)
        content = "\n\n".join([doc.page_content for doc in docs]) if docs else ""
        print(f"Retrieved content length: {len(content)}")
        if not content:
            raise ValueError("No relevant content retrieved")

        return {
            "retriever": retriever,
            "content": content,
            "difficulty": difficulty,
            "num_questions": state["num_questions"]
        }
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in retrieve_content: {error_details}")
        raise ValueError(f"Failed to retrieve content: {str(e)}")

def generate_questions(state: GraphState) -> GraphState:
    try:
        content = state["content"]
        difficulty = state["difficulty"]
        num_questions = state["num_questions"]
        print(f"Generating {num_questions} questions (difficulty: {difficulty}, content length: {len(content)})")

        prompt = ChatPromptTemplate.from_template(""" 
        You are an expert quiz creator. Create {num_questions} quiz questions with the following parameters:
        
        1. Difficulty level: {difficulty}
        2. Each question should have four possible answers (A, B, C, D)
        4. Only use information found in the provided content
        
        Content:
        {content}
        
        Return the quiz in the following JSON format:
        
        [
            {{"question": "Question text",
              "options": [
                  "A. Option A",
                  "B. Option B", 
                  "C. Option C",
                  "D. Option D"
              ],
              "correct_answer": "A. Option A",
              "explanation": "Brief explanation of why this is correct"
            }}
        ]
        
        Only return the JSON without any additional explanation or text.
        """)

        parser = JsonOutputParser()
        chain = prompt | llm | parser
        questions = chain.invoke({
            "content": content,
            "difficulty": difficulty,
            "num_questions": num_questions
        })
        print(f"Generated {len(questions) if questions else 0} questions")
        if not questions or not isinstance(questions, list):
            raise ValueError("No valid questions generated")

        # Validate each question
        for idx, question in enumerate(questions):
            if not all(key in question for key in ["question", "options", "correct_answer", "explanation"]):
                raise ValueError(f"Question {idx} is missing required fields")
            if len(question["options"]) != 4:
                raise ValueError(f"Question {idx} does not have exactly 4 options")
            if question["correct_answer"] not in question["options"]:
                raise ValueError(f"Question {idx} has a correct answer that is not in the options")

        return {"questions": questions}
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in generate_questions: {error_details}")
        raise Exception(f"Failed to generate questions: {str(e)}")

def create_quiz_graph():
    workflow = StateGraph(GraphState)
    workflow.add_node("retrieve_content", retrieve_content)
    workflow.add_node("generate_questions", generate_questions)
    workflow.add_edge("retrieve_content", "generate_questions")
    workflow.add_edge("generate_questions", END)
    workflow.set_entry_point("retrieve_content")
    return workflow.compile()

# Add this import at the top of your file
@app.route('/api/quiz-results', methods=['GET'])
def get_quiz_results():
    try:
        print("Fetching quiz results...")
        subject = request.args.get('subject')

        # Validate query parameters
        if not subject:
            print(f"Missing parameters: subject={subject}")
            return jsonify({"error": "Subject is required"}), 400

        # Query user_response_collection for all records matching the subject
        results = user_response_collection.find(
            {"subject": subject},
            {"email": 1, "score": 1, "total_questions": 1, "timestamp": 1, "_id": 0}  # Include timestamp for clarity
        )

        # Convert cursor to list and format results
        formatted_results = [
            {
                "email": result.get("email", "Unknown"),
                "marks": result.get("score", 0),
                "totalMarks": result.get("total_questions", 0),
                "timestamp": result.get("timestamp", "N/A")  # Include timestamp to distinguish attempts
            }
            for result in results
        ]

        # Check if results exist
        if not formatted_results:
            print(f"No results found for subject: {subject}")
            return jsonify({"error": "No results found for this subject"}), 404

        # Log the number of results found
        print(f"Found {len(formatted_results)} results for subject: {subject}")
        for result in formatted_results:
            print(f"Result: {result}")

        return jsonify(formatted_results), 200

    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in get_quiz_results: {error_details}")
        return jsonify({"error": str(e), "details": error_details}), 500
    
from datetime import datetime
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
            'created_at': datetime.now()
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

@app.route('/api/classrooms/<teacher>', methods=['GET'])
def get_classrooms(teacher):
    try:
        classrooms = classroom_collection.find({"teacher": teacher})
        classrooms_list = []
        
        for c in classrooms:
            quizzes = []
            for q in c.get("quizzes", []):
                # Handle quizzes that may be ObjectId or other types
                quizzes.append(str(q) if isinstance(q, ObjectId) else q)

            # Convert students list to ensure no ObjectId
            students = []
            for s in c.get("students", []):
                students.append(str(s))

            # Handle createdDate safely - MORE ROBUST APPROACH
            created = c.get("createdDate")
            created_str = ""
            if created:
                try:
                    # Try to call isoformat() if it's a datetime object
                    created_str = created.isoformat()
                except AttributeError:
                    # If it doesn't have isoformat(), convert to string
                    created_str = str(created)

            classroom_data = {
                "_id": str(c["_id"]),
                "name": c.get("name", ""),
                "subject": c.get("subject", ""),
                "description": c.get("description", ""),
                "document": c.get("document", ""),  # Ensure this field is serializable
                "teacher": c.get("teacher", ""),
                "students": students,
                "quizzes": quizzes,
                "createdDate": created_str,
                "status": c.get("status", "active")
            }
            classrooms_list.append(classroom_data)
        
        print(f"Fetched {len(classrooms_list)} classrooms for teacher: {teacher}")
        return jsonify(classrooms_list)
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in get_classrooms: {error_details}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/classrooms', methods=['POST'])
def create_classroom():
    print("Received request to create classroom")
    if 'document' not in request.files:
        print("Validation failed: No document provided")
        return jsonify({"error": "No document provided"}), 400

    file = request.files['document']
    name = request.form.get('name')
    subject = request.form.get('subject')
    description = request.form.get('description', '')
    student_emails = request.form.get('studentEmails')
    teacher = request.form.get('teacher')
    difficulty = request.form.get('difficulty', 'medium')
    num_questions = request.form.get('numQuestions', 5)

    if not name or not student_emails or not teacher:
        print("Validation failed: Required fields missing")
        return jsonify({"error": "Required fields missing"}), 400

    if difficulty not in ['easy', 'medium', 'hard']:
        print(f"Validation failed: Invalid difficulty: {difficulty}")
        return jsonify({"error": "Invalid difficulty level"}), 400

    try:
        num_questions = int(num_questions)
        if num_questions < 1 or num_questions > 20:
            print(f"Validation failed: Invalid number of questions: {num_questions}")
            return jsonify({"error": "Number of questions must be between 1 and 20"}), 400
    except ValueError:
        print(f"Validation failed: Invalid number of questions: {num_questions}")
        return jsonify({"error": "Number of questions must be a valid integer"}), 400

    file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if file_extension not in ['pdf', 'doc', 'docx']:
        print(f"Validation failed: Invalid file type: {file_extension}")
        return jsonify({"error": "Only PDF, DOC, DOCX files allowed"}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    try:
        file.save(file_path)
        print(f"Saved document to: {file_path}")
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Failed to save file: {error_details}")
        return jsonify({"error": f"Failed to save file: {str(e)}"}), 500

    try:
        # Step 1: Generate quiz using the document
        print("Generating quiz...")
        retriever = process_document(file_path, file_extension)
        quiz_graph = create_quiz_graph()
        result = quiz_graph.invoke({
            "retriever": retriever,
            "difficulty": difficulty,
            "num_questions": num_questions
        })

        if not result.get("questions") or not isinstance(result["questions"], list):
            print("Quiz generation failed: No valid questions generated")
            raise ValueError("No valid questions generated. The document may lack sufficient content for quiz generation.")

        generated_questions = result["questions"]
        print(f"Generated {len(generated_questions)} questions: {json.dumps(generated_questions, indent=2)}")

        # Step 2: Save the generated quiz to MongoDB (quiz_collection)
        quiz_data = {
            "title": f"Quiz for {name}",
            "questions": generated_questions,
            "createdDate": datetime.now(),
            "googleFormLink": None,
            "name": name,
            "subject": subject
        }
        quiz_result = quiz_collection.insert_one(quiz_data)
        quiz_id = quiz_result.inserted_id
        print(f"Quiz saved to MongoDB with ID: {quiz_id}")

        # Step 3: Create a Google Form using the generated questions
        print("Creating Google Form...")
        form_metadata = {"info": {"title": f"Quiz for {name}"}}
        form = service.forms().create(body=form_metadata).execute()
        form_id = form["formId"]
        print(f"Google Form created with ID: {form_id}")

        # Step 4: Add the generated questions to the Google Form
        requests = []
        for idx, question in enumerate(generated_questions):
            question_text = question["question"]
            options = question["options"]

            request_item = {
                "createItem": {
                    "item": {
                        "title": question_text,
                        "questionItem": {
                            "question": {
                                "required": True,
                                "choiceQuestion": {
                                    "type": "RADIO",
                                    "options": [{"value": option} for option in options],
                                    "shuffle": False
                                }
                            }
                        }
                    },
                    "location": {"index": idx}
                }
            }
            requests.append(request_item)

        if requests:
            service.forms().batchUpdate(formId=form_id, body={"requests": requests}).execute()
            print(f"Added {len(requests)} questions to Google Form with ID: {form_id}")
        else:
            print("No questions to add to Google Form")
            raise ValueError("No questions were added to the Google Form")

        form_link = f"https://docs.google.com/forms/d/{form_id}/viewform"
        print(f"Google Form link: {form_link}")

        # Step 5: Update the quiz in MongoDB with the Google Form link
        quiz_collection.update_one(
            {"_id": quiz_id},
            {"$set": {"googleFormLink": form_link}}
        )
        print(f"Updated quiz {quiz_id} with Google Form link")

        # Step 6: Store the Google Form metadata in form_responses_collection
        form_questions = [
            {
                "question_text": question["question"],
                "options": question["options"],
                "correct_answer": question["correct_answer"],
                "explanation": question["explanation"]
            }
            for question in generated_questions
        ]

        form_responses_collection.insert_one({
            "quiz_id": str(quiz_id),
            "form_id": form_id,
            "title": f"Quiz for {name}",
            "questions": form_questions,
            "google_form_link": form_link,
            "createdDate": datetime.now()
        })
        print(f"Saved Google Form metadata for quiz {quiz_id} in form_responses_collection")

        # Step 7: Save the classroom to MongoDB
        students = [
            {"email": email.strip()} for email in student_emails.split('\n') if email.strip()
        ]
        classroom_data = {
            "name": name,
            "subject": subject,
            "description": description,
            "document": file_path,
            "teacher": teacher,
            "students": students,
            "quizzes": [quiz_id],
            "createdDate": datetime.now(),
            "status": "active"
        }
        classroom_result = classroom_collection.insert_one(classroom_data)
        print(f"Classroom created with ID: {classroom_result.inserted_id}")

        return jsonify({
            "message": "Classroom and quiz created successfully",
            "classroom_id": str(classroom_result.inserted_id),
            "quiz_id": str(quiz_id),
            "google_form_link": form_link
        }), 201

    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in create_classroom: {error_details}")
        if 'quiz_id' in locals():
            quiz_collection.delete_one({"_id": quiz_id})
            print(f"Rolled back: Deleted quiz with ID: {quiz_id}")
            form_responses_collection.delete_one({"quiz_id": str(quiz_id)})
            print(f"Rolled back: Deleted form responses for quiz ID: {quiz_id}")
        return jsonify({"error": str(e)}), 500

    finally:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Temporary file removed: {file_path}")
        except Exception as e:
            print(f"Failed to remove temporary file {file_path}: {str(e)}")

@app.route('/api/student/login', methods=['POST'])
def student_login():
    try:
        data = request.get_json()
        email = data.get('email')
        if not email:
            print("Validation failed: Email is required")
            return jsonify({"error": "Email is required"}), 400

        classrooms = classroom_collection.find({"students.email": email})
        classrooms_list = []
        for c in classrooms:
            quizzes = []
            for q in c.get("quizzes", []):
                try:
                    quiz_id = ObjectId(q) if isinstance(q, str) else q
                    quiz = quiz_collection.find_one({"_id": quiz_id})
                    if quiz:
                        quizzes.append({
                            "_id": str(quiz["_id"]),
                            "title": quiz.get("title", ""),
                            "googleFormLink": quiz.get("googleFormLink", ""),
                            "name": quiz.get("name", ""),
                            "subject": quiz.get("subject", "")
                        })
                except Exception as e:
                    print(f"Invalid quiz ID: {q}, error: {str(e)}")
                    continue

            classrooms_list.append({
                "_id": str(c["_id"]),
                "name": c.get("name", ""),
                "subject": c.get("subject", ""),
                "quizzes": quizzes
            })

        if not classrooms_list:
            print(f"No classrooms found for email: {email}")
            return jsonify({"error": "No classrooms found for this email"}), 404

        print(f"Fetched {len(classrooms_list)} classrooms for student: {email}")
        return jsonify(classrooms_list)
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in student_login: {error_details}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/get-quiz/<quiz_id>', methods=['GET'])
def get_quiz(quiz_id):
    try:
        print(f"Fetching quiz with ID: {quiz_id}")
        try:
            quiz = quiz_collection.find_one({"_id": ObjectId(quiz_id)})
        except Exception as e:
            print(f"Invalid quiz_id format: {str(e)}")
            return jsonify({"error": "Invalid quiz_id format"}), 400

        if not quiz or not quiz.get("questions"):
            print(f"No quiz found for ID: {quiz_id}")
            return jsonify({"error": "No quiz found"}), 404

        print(f"Found quiz with {len(quiz['questions'])} questions")
        return jsonify({
            "message": "Quiz retrieved successfully",
            "quiz_id": str(quiz["_id"]),
            "title": quiz["title"],
            "questions": quiz["questions"],
            "googleFormLink": quiz.get("googleFormLink")
        })
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in get_quiz: {error_details}")
        return jsonify({"error": str(e)}), 500

@app.route('/fetch-responses/<form_id>', methods=['GET'])
def fetch_store_responses(form_id):
    try:
        print(f"Fetching responses for form ID: {form_id}")
        response_data = service.forms().responses().list(formId=form_id).execute()
        if "responses" not in response_data:
            print("No responses found")
            return jsonify({"message": "No responses found"}), 404

        user_responses = []
        for response in response_data["responses"]:
            response_id = response["responseId"]
            response_time = response.get("createTime", "")
            answers = response.get("answers", {})

            formatted_answers = {
                q_id: ans.get("textAnswers", {}).get("answers", [{}])[0].get("value", "")
                for q_id, ans in answers.items()
            }

            user_responses.append({
                "response_id": response_id,
                "response_time": response_time,
                "answers": formatted_answers,
                "form_id": form_id,  # Store form_id with each response
                "createdDate": datetime.now()
            })

        if user_responses:
            print(f"Storing {len(user_responses)} responses in MongoDB...")
            insert_result = user_response_collection.insert_many(user_responses)
            for i, obj_id in enumerate(insert_result.inserted_ids):
                user_responses[i]["_id"] = str(obj_id)
            print("Responses stored successfully")
            return jsonify({
                "message": "Responses stored successfully",
                "data": user_responses
            })

        print("No new responses")
        return jsonify({"message": "No new responses"}), 200
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in fetch_store_responses: {error_details}")
        return jsonify({"error": str(e)}), 500

@app.route('/evaluate-quiz', methods=['POST'])
def evaluate_quiz():
    try:
        print("Starting quiz evaluation...")
        data = request.get_json(silent=True)
        form_id = data.get("form_id") if data else None
        response_id = data.get("response_id") if data else None
        print(f"Received form_id: {form_id}, response_id: {response_id}")

        # Validate form_id
        if not form_id:
            print("No form_id provided")
            return jsonify({"error": "Form ID is required"}), 400

        # Fetch form response
        form_response = form_responses_collection.find_one({"form_id": form_id})
        if not form_response:
            print(f"No form responses found for form_id: {form_id}")
            return jsonify({"error": "No form responses found for the provided form_id"}), 404

        quiz_questions = form_response.get("questions", [])
        print(f"Form ID: {form_id}, Questions: {len(quiz_questions)}")

        if not quiz_questions:
            print("No questions found")
            return jsonify({"error": "No questions found"}), 404

        # Fetch user response
        user_response_query = {"form_id": form_id}
        if response_id:
            user_response_query["response_id"] = response_id
        user_response = user_response_collection.find_one(user_response_query, sort=[("createdDate", -1)])
        if not user_response:
            print("No user responses found, attempting to fetch responses...")
            # Fetch and store responses for the given form_id
            response = fetch_store_responses(form_id)
            if response[1] == 404 or response[0].json.get("message") == "No responses found":
                print("No responses fetched from Google Form")
                return jsonify({"error": "No responses available in Google Form"}), 404
            # Try fetching the latest user response again
            user_response = user_response_collection.find_one({"form_id": form_id}, sort=[("createdDate", -1)])
            if not user_response:
                print("No user responses found after fetching")
                return jsonify({"error": "No user responses found after fetching"}), 404

        user_answers = user_response.get("answers", {})
        user_response_id = user_response.get("response_id")
        print(f"User response found: {user_response_id}, Answers: {user_answers}")

        # Create mapping of question IDs to question text
        question_id_map = {}
        try:
            print(f"Fetching form structure for form ID: {form_id}")
            form_data = service.forms().get(formId=form_id).execute()
            for item in form_data.get("items", []):
                question_text = item.get("title", "")
                question_id = item.get("questionItem", {}).get("question", {}).get("questionId", "")
                if question_text and question_id:
                    question_id_map[question_id] = question_text
            print(f"Question ID Map: {question_id_map}")
        except Exception as e:
            print(f"Warning: Could not fetch form structure: {str(e)}")
            return jsonify({"error": f"Failed to fetch form structure: {str(e)}"}), 500

        # Prepare correct answers
        correct_answers = {q["question_text"]: q["correct_answer"] for q in quiz_questions}
        print(f"Correct Answers: {correct_answers}")

        score = 0
        total_questions = len(quiz_questions)
        question_results = []

        for question_data in quiz_questions:
            question_text = question_data["question_text"]
            correct_answer = question_data["correct_answer"]
            
            user_answer = ""
            # Match using question_id_map
            for q_id, q_text in question_id_map.items():
                if q_text.strip().lower() == question_text.strip().lower() and q_id in user_answers:
                    user_answer = user_answers[q_id].strip()
                    break

            is_correct = user_answer.strip().lower() == correct_answer.strip().lower() if user_answer else False
            if is_correct:
                score += 1

            print(f"Evaluating question: {question_text}")
            print(f"User Answer: {user_answer or 'Not answered'}, Correct Answer: {correct_answer}, Is Correct: {is_correct}")

            question_results.append({
                "question": question_text,
                "correct_answer": correct_answer,
                "user_answer": user_answer or "Not answered",
                "is_correct": is_correct
            })

        percentage_score = (score / total_questions * 100) if total_questions > 0 else 0
        print(f"Score: {score}/{total_questions} ({percentage_score}%)")

        evaluation_result = {
            "user_response_id": str(user_response["_id"]),
            "response_id": user_response_id,
            "form_id": form_id,
            "score": score,
            "percentage": round(percentage_score, 2),
            "total_questions": total_questions,
            "question_results": question_results,
            "evaluated_at": datetime.now().isoformat(),
            "name": data.get("name", "Unknown"),
            "email": data.get("studentEmail", "Unknown"),
            "subject": data.get("subject", "General Knowledge"),
            "guizid": data.get("quiz_id", str(form_response.get("quiz_id", ""))),
        }

        # Update user response in MongoDB
        print("Updating user response in MongoDB...")
        update_result = user_response_collection.update_one(
            {"_id": user_response["_id"]},
            {"$set": evaluation_result}
        )
        print(f"Update result: Matched {update_result.matched_count}, Modified {update_result.modified_count}")

        print("Returning evaluation result")
        return jsonify(evaluation_result)
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in evaluate_quiz at line {traceback.extract_tb(e.__traceback__)[-1].lineno}: {error_details}")
        return jsonify({"error": str(e), "details": error_details}), 500

@app.route('/create-google-form', methods=['GET'])
def create_google_form():
    try:
        quiz_id = request.args.get('quiz_id')
        
        if quiz_id:
            print(f"Fetching quiz with ID: {quiz_id}")
            try:
                quiz = quiz_collection.find_one({"_id": ObjectId(quiz_id)})
            except Exception as e:
                print(f"Invalid quiz_id format: {str(e)}")
                return jsonify({"error": "Invalid quiz_id format"}), 400

            if not quiz:
                print(f"No quiz found for ID: {quiz_id}")
                return jsonify({"error": "No quiz found"}), 404
        else:
            print("Fetching the latest quiz...")
            quiz = quiz_collection.find_one(sort=[("createdDate", -1)])
            if not quiz:
                print("No quizzes found in the database")
                return jsonify({"error": "No quizzes found"}), 404

        form_link = quiz.get("googleFormLink")
        if not form_link:
            print(f"No Google Form link found for quiz ID: {quiz['_id']}")
            return jsonify({"error": "No Google Form link available for this quiz"}), 404

        print(f"Returning Google Form link: {form_link}")
        return jsonify({
            "message": "Google Form link retrieved successfully",
            "google_form_link": form_link,
            "quiz_id": str(quiz["_id"])
        }), 200

    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in create_google_form: {error_details}")
        return jsonify({"error": str(e)}), 500

@app.route('/latest-form-id', methods=['GET'])
def get_latest_form_id():
    try:
        print("Fetching latest form ID...")
        latest_form_response = form_responses_collection.find_one(sort=[("createdDate", -1)])
        
        if not latest_form_response:
            print("No form responses found")
            return jsonify({"error": "No form responses found"}), 404
        
        form_id = latest_form_response.get("form_id")
        quiz_id = latest_form_response.get("quiz_id")
        print(f"Latest form ID: {form_id}, Quiz ID: {quiz_id}")
        
        return jsonify({
            "message": "Latest form ID retrieved successfully",
            "form_id": form_id,
            "quiz_id": quiz_id
        }), 200
    
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error in get_latest_form_id: {error_details}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    print("Health check requested")
    return jsonify({"status": "healthy"}), 200

if __name__ == "__main__":
    print("Starting Flask server...")
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))