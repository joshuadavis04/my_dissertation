Diabetic Eye Screening AI Chatbot

The aim of my dissertation is to provide a Proof of Concept conversational AI chatbot to help patients better understand their screening results.

It uses a Python/Flask backend with a JavaScript frontend, powered by a local large language model via Ollama.

Before you start running this project, you will need to install the following:

1. Python 3.8+
2. Ollama

To ensure patient privacy, a locally hosted LLM is used.

To setup the custom Ollama model:

1. Open your terminal.
2. Navigate to the 'backend' folder for the project.
3. Build the custom model using the provided Modelfile by running the following command:
	ollama create nhs-eye-bot-v2 -f Modelfile
Note: If you encounter memory problems, please ensure that you have at least 3GB of free RAM
or close down unused background applications.

To setup/run the backend:

1. Ensure that Ollama is running in the background.
2. Open your terminal.
3. Navigate to the 'backend' folder for this project.
4. *Optional* create and activate a virtual environment.
5. Install the required Python dependencies:
	pip install -r requirements.txt
6. Start the Flask Server:
	python server.py
7. The server will now be running on - http://127.0.0.1:5000

To run the frontend:

1. Open a new terminal.
2. Navigate to the frontend folder.
3. Start a local web server:
	python -m http.server 5500
4. Open a web browser and navigate to - http://localhost:5500
