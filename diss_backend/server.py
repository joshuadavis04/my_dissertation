"""
J L Davis 
25/03/2026

Description: 

This file serves as the backend application for the proof of concept conversational AI system. The system has been built using Flask, with a separate frontend and backend, with its purpose to
process patient queries regarding their screening results.

Goal:

The primary goal is to help patients understand their sometimes complex screening results, with empathy and in an accessible language. To reduce the risk that the LLM hallucinates, the system contains
a 'Deterministic Safety Layer'. This layer uses regular expressions to catch high risk medical emergencies and specific grading codes, overriding the AI to provide pre-approved hardcoded medical advice.

Input & Output:

- This server receives HTTP POST requests, with the subsequent JSON payload containing the user's message, the ongoing chat history and a list of the triggered rules.
- The code ouputs a JSON file containing the system's reply and an updated list of triggered rules for the frontend to store.

"""

from flask import Flask, request, jsonify
#This allows for a decoupled frontend.
from flask_cors import CORS
import ollama
#RE (Regular Expressions) this library is used as pattern recognition for the deterministic layer.
import re
#Used to track the latency.
import time

#Initialising the Flask application.
app = Flask(__name__)
CORS(app)

#The deterministic layer.
Deterministic_Rules = [
    {
        "id": "vague_no_treatment",
        "pattern": r'\b(some changes.*do not need.*treatment)\b',
        "reply": "Your letter mentions some changes were seen but don't need treatment right now. To give you specific detials, can you check the bottom right corner of your letter? There should be a table with codes like 'R1' or 'M0'. If you see them, please type them here."
    },
    {
        "id": "vague_existing_condition",
        "pattern": r'\b(existing eye condition.*not be necessary.*screened)\b',
        "reply" : "It looks like you have an existing eye condition, so the screening service is passing your care back to your GP or specialist. If you want to know more about what changes were seen, please contact your GP to discuss your future care."
    },
    {
        "id": "vague_no_changes",
        "pattern": r'\b(no changes due to diabetes were seen)\b',
        "reply" : "This is excellent news! Your letters states that no changes were seen. If you look at bottom right hand corner of your letter, you might see codes like 'R0' or 'M1' in a table. If you'd like me to explain them, just type them in. Otherwise keep up the good work!"
    },
    {
        "id": "vague_further_exam",
        "pattern": r'\b(changes.*require further examination.*hospital eye specialist)\b',
        "reply": "Your letter mentions changes that require a further examination by a specialist. I know this can sound worrying, but checking the bottom right hand corner of your letter for a table of codes (like R2, R3, or M1) can help me explain what this means. Do you see any codes there?"
    },
    {
        "id": "vague_ungradable",
        "pattern": r'\b(photographs.*did not allow us to see.*retina)\b',
        "reply": "Your letter states the clinic couldn't get a clear photograph of the back of your eye, this can happen for many harmless reasons, like having small pupils or cataracts. The clinic will contact you for a recall appointment or refer you to a specialist who has different equipment to see your eye clearly."
    },
    {
        "id": "emergency_vision_loss",
        "pattern": r'\b(sudden vision loss|lost sight|gone dark|vision went black|total loss|woke up blind|suddenly blind)\b',
        "reply": "Urgent: Sudden vision loss requires immediate assessment. Please contact your local optician right away and ask for an emergency appointment. They have the specialist equipment to check your eye and can make an urgent hospital referral if needed."
    },
    {
        "id": "emergency_detachment",
        "pattern": r'\b(curtain|shadow|flashing lights|flashes|spider web|floaters)\b',
        "reply": "Urgent: A ‘curtain’ effect, shadows, or new flashing lights can be signs of a retinal tear or detachment. Please contact your local optician immediately for an emergency appointment so they can examine your eye properly."
    },
    {
       "id": "emergency_trauma",
        "pattern": r'\b(severe pain|agony|eye hurt bad|deep pain|headache|haloes|nausea|vomiting)\b',
        "reply": "Urgent: Diabetic screening does not usually result in pain. Severe eye pain requires urgent assessment. Please contact your local optician immediately for an emergency appointment so they can examine your eye and provide the right advice." 
    },
    {
        "id": "emergency_bleeding",
        "pattern": r'\b(bleeding|blood in my eye|red mist|filled with blood|red vision)\b',
        "reply": "Urgent: Seeing a red mist or haze can indicate a bleed inside the eye. Please contact your local optician right away. They can urgently check your eye, explain what is happening, and arrange a fast-tracked specialist referral if necessary."
    },
    {
        "id": "emergency_stroke",
        "pattern": r'\b(double vision|drooping|slurred)\b',
        "reply": "Urgent: Sudden double vision or drooping can be signs of a stroke. Please call 999 immediately."
    },
    {
        "id": "grade_r0",
        "pattern": r'\b(r0)\b',
        "reply": "If your letter states that R0 (No Retinopathy) has been observed, this is excellent news. It means that no changes were found. Your screening recall may extend from 1 year to every 2 years."
    },
    {
        "id": "grade_r1",
        "pattern": r'\b(r1)\b',
        "reply": "If your letter states that R1 (Background Retinopathy) has been observed, it means mild changes like small leaks have been noted. This is not sight threatening. You will likely to be recalled to screening in 1 year. Good self-care now can stop it from getting worse."
    },
    {
        "id": "grade_r2",
        "pattern": r'\b(r2)\b',
        "reply": "If your letter states that R2 has been observed, this result means that have been moderate changes (R2) to your eye health. This result doesn’t currently need treatment. While this sounds serious,  the good news is we are catching it now. To keep you safe, we need to screen you more often (every 3-6 months) or refer you to a specialist."
    },
    {
        "id": "grade_r3",
        "pattern": r'\b(r3)\b',
        "reply": "If your letter states that R3 (Proliferative Retinopathy) has been observed, although it sounds scary it just means that we need to act now. New, weak blood vessels may be growing in your eye, which can sometimes bleed. Because screening is not a final diagnosis, you have been referred to a specialist for further checking, monitoring, and to discuss potential treatments to help protect your sight."
    },
    {
        "id": "grade_r3a",
        "pattern": r'\b(r3a)\b',
        "reply": "If your letter states that R3a has been observed, it stands for Active Proliferative Retinopathy. This suggests there may be active changes happening, such as new blood vessels growing. Because screening is a check and not a final diagnosis, you have been referred to a specialist who will fully examine your eyes and discuss whether you need treatment, or just closer monitoring."
    },
    {
        "id": "grade_r3s",
        "pattern": r'\b(r3s)\b',
        "reply": "If your letter states that R3s has been observed, it stands for Stable Proliferative Retinopathy. This is reassuring news! It usually means that any previous treatments you have had appear to be working well, and the blood vessels currently look stable. You will continue to be monitored to ensure they stay this way."
    },
    {
        "id": "grade_m0",
        "pattern": r'\b(m0)\b',
        "reply": "If your letter states that M0 (No Maculopathy) has been observed, it means that there are no changes to your central vision. Since this area is healthy, your next appointment depends entirely on your 'R' grade."
    },
    {
        "id": "grade_m1",
        "pattern": r'\b(m1)\b',
        "reply": "If your letter states that M1 (Maculopathy) has been observed, this means the screening has picked up some potential changes near the macula, which is the part of your eye responsible for your central vision. You will likely be referred to a specialist or asked to attend more frequent screenings to check and monitor this carefully."
    },
    {
        "id": "treatment_laser",
        "pattern": r'\b(laser)\b',
        "reply": "Laser treatment is a common way to help protect your sight. It uses a focused beam of light to shrink abnormal blood vessels and stop them from bleeding. The main goal here is to stabilise your vision, rather than improve it. You may need this treatment more than once, but it is the best way to save your sight."
    },
    {
        "id": "treatment_injection",
        "pattern": r'\b(injection|anti-vegf)\b',
        "reply": "I know the idea of an eye injection sounds scary, but the hospital team will make sure you are comfortable. First they use anaesthetic drops to numb your eye so you do not feel pain. Then, they will inject a medicine called Anti-VEGF. This blocks the hormone that causes leakage. These are usually given monthly at first to help stabilise your vision."
    },
    {
        "id": "treatment_vitrectomy",
        "pattern": r'\b(vitrectomy)\b',
        "reply": "A vitrectomy is a surgery performed under local or general anaesthetic. The surgeon gently removes the clear gel from the middle of your eye to clear your vision. This is usually considered if other treatments haven't worked, and aims to preserve your remaining sight."
    },
    {
       "id": "treatment_implant",
        "pattern": r'\b(implant|steroid)\b',
        "reply": "A steroid implant is a tiny device placed inside your eye. It slowly releases medicine over 3 to 6 months to reduce swelling. This is a great option because it reduces the need for frequent injections. However, since steroids can sometimes increase the risk of cataracts or glaucoma, your specialist will monitor you closely to keep you safe."
    },
    {
        "id": "condition_cataract_ungradable",
        "pattern": r'\b(cataract|cataracts|unable to photograph|couldn\'t photograph|unclear picture)\b',
        "reply": "A cataract is a cloudiness in the lens of your eye. This is very common, but it means the screening camera was unable to get a clear photograph of the back of your eye today. Because we couldn't get a clear view, you have been referred to an eye specialist who has the right equipment to examine your eyes fully."
    }
]

def check_deterministic_layer(patient_query, triggered_rules_list):
    """
    
    The purpose of this function is to scan the user's input against the deterministic rules using regular
    expressions.

    """

    #Using .lower() to make pattern matching easier.
    text = patient_query.lower()
    #Use a set here to remove any duplicates from the list.
    triggered = set(triggered_rules_list)

    for rule in Deterministic_Rules:
        if re.search(rule["pattern"], text):

            #This is critical here. This if statement ensures that we have not already given the user a hard coded rule already, as a conversational chatbot shouldn't repeat itself.
            if rule["id"] not in triggered:
                triggered.add(rule["id"])
                #Return the hardcoded reply, and the list of updated rules to send back to the frontend.
                return rule["reply"], list(triggered)
    
    #If no new rules are triggered, return a None value so that the LLM can answer the user's question.
    return None, list(triggered)

@app.route('/chat', methods=['POST'])
def chat():

    """
        This code receives JSON payloads from the frontend which contains the user's new message, any previous messages (the chat history)
        and any previously triggered safety rules.
    
    """

    #Attempts to get this information from the JSON file. If this information is unavailable then a default value is applied.
    data = request.json
    patient_query = data.get('message', '')
    session_history = data.get('history', [])
    medical_safety_flags = data.get('triggered_rules', [])

    #Run the input received through the deterministic layer first.
    deterministic_reply, updated_rules = check_deterministic_layer(patient_query, medical_safety_flags)
    
    #If a hardcoded rule is outputed, then do not use the LLM and return the response to the user.
    if deterministic_reply:
        return jsonify({
            "reply": deterministic_reply,
            "triggered_rules": updated_rules
        })

    #If the deterministic layer is not triggered in this instance, use the LLM.
    try:
        #Add the new user message to the chat history so that Ollama has context for any follow up questions.
        temp_history = session_history + [{'role': 'user', 'content': patient_query}]

        start_time = time.time()

        response = ollama.chat(model='nhs-eye-bot-v2', messages=temp_history)
        
        end_time = time.time()
        latency = round(end_time - start_time, 2)

        print(f"LLM Latency: {latency} seconds")

        #Get the text reply from Ollama and push this to the frontend to the user.
        ollama_reply = response['message']['content']
        
        #Send the reply and rules back to the frontend to be saved.
        return jsonify({
            "reply": ollama_reply,
            "triggered_rules": updated_rules
        })
    except Exception as error:
        #Catch any errors and return a 500 error status.
        return jsonify({"error": str(error)}), 500

if __name__ == '__main__':
    #Starts the flask app up on port 5000.
    app.run(port=5000)