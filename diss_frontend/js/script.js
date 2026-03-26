/* Diabetic Eye Screening Chatbot Frontend logic 
J L Davis
26/03/2026

The purpose of this file is to handle all the frontend logic including:
- Capturing user input
- Hanlding Accessibility features
- Handling local browser storage
- Sending fetch requests to the server so the LLM can be used.
*/


// Where you can access the backend.
const API_URL = "http://127.0.0.1:5000/chat";

//This variable is used to keep track of what chat the user is looking at.
let active_conversation_session_id = null; 


/*
This function toggles the dark mode class and theme for the app and saves this choice to the browser
so they don't have to keep clicking it every time they change a page.
*/
function toggleTheme() {
    const is_dark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('preferred_theme', is_dark ? 'dark' : 'light');
}

/*
When the page initially loads, it checks if the user previously chose dark mode and if so applies it.
*/
function loadSavedTheme() {
    const saved_theme = localStorage.getItem('preferred_theme');
    
    // 2. Apply dark mode if that's what they saved
    if (saved_theme === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

/*
This function increases the text size for visually impaired users and saves their choice to
the broswer storage.
*/
function toggleAccessibleText() {
    const is_large = document.body.classList.toggle('accessible-text-mode');
    localStorage.setItem('preferred_text_size', is_large ? 'large' : 'normal');
}

/*
This function is used to check the browser storage on the load to determine 
whether they need large text applied.
*/
function loadAccessibleTextPreference() {
    const saved_size = localStorage.getItem('preferred_text_size');
    if (saved_size === 'large') {
        document.body.classList.add('accessible-text-mode');
    }
}


/*
The purpose of the togglesidebar function is to open and close the sidebar in instances
where the user wants more reading space.
*/

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const open_button = document.getElementById('open_side_bar_button');
    
    sidebar.classList.toggle('collapsed');
    
    // This little bit of code shows the sandwhich icon only if the sidebar is currently collapsed.
    if (sidebar.classList.contains('collapsed')) {
        open_button.style.display = 'block';
    } else {
        open_button.style.display = 'none';
    }
}


/*
This reaches into the browser's memory, gets all the previous conversations and
creates the buttons in the sidebar so that the user can interact with them.
*/
function loadOldGuidanceSessions() {
    const history_list = document.getElementById('chat_history_list');
    
    //If the user is currently on the help page, there is no side bar so hault running this function.
    if (!history_list) return; 
    
    history_list.innerHTML = '';
    
    //Get the saved chats or create a blank array if it is their first time using the system.
    const saved_chats = JSON.parse(localStorage.getItem('patient_chats')) || [];
    
    /* 
    This loop is used to go through every single chat saved in the browsers memory.
    */
    saved_chats.forEach(chat => {
        //To create the main clickable box to hold the current chat history.
        const chat_box = document.createElement('div');
        chat_box.className = 'history-item';
        //If the user clicks on this box, tell the system to load this chat's memory.
        chat_box.onclick = () => loadSpecificSession(chat.id); 
        
        //Create a text label to hold the short summary of what the chat was about.
        const title_span = document.createElement('span');
        title_span.className = 'session-summary-text';
        title_span.innerText = chat.summary;
        
        //Build the rubbish bin button so that the user can delete this specific chat from the browser memory.
        const delete_button = document.createElement('button');
        delete_button.className = 'delete_chat_button';
        delete_button.innerHTML = '🗑️'; 
        delete_button.onclick = (event) => {

            /*
            This is here as technically the delete button is sitting above the load chat button.
            The code below stops the browser from accidentally loading both of them at the same time.
            */
            event.stopPropagation(); 
            deleteSessionRecord(chat.id);
        };
        
        //Put together the sidebar button for the chats.
        chat_box.appendChild(title_span);
        chat_box.appendChild(delete_button);
        history_list.appendChild(chat_box);
    });
}

/*
This function is used to delete the chosen chat from the browser's memory and refreshes the screen.
*/
function deleteSessionRecord(id) {
    if (confirm("Are you sure you want to delete this chat?")) {
        let saved_chats = JSON.parse(localStorage.getItem('patient_chats')) || [];

        //Filter out the other chats that we want to keep from the one that will delete.
        saved_chats = saved_chats.filter(chat => chat.id !== id);
        localStorage.setItem('patient_chats', JSON.stringify(saved_chats));
        
        //If the user decides to delete the chat that they have open, put them back to the welcome screen.
        if (active_conversation_session_id === id) {
            startNewChat(); 
        }

        loadOldGuidanceSessions();
    }
}


/*
This function that deletes all saved chats from the browser's local storage.
*/
function clearAllSessionRecords() {
    if (confirm("Are you sure you want to delete ALL chat history? This cannot be undone.")) {
        localStorage.removeItem('patient_chats');
        startNewChat();
        loadOldGuidanceSessions();
    }
}

/*
This is the main save function. Every time the user or the AI speaks, this updates the browser's memory
ensuring that nothing is lost when the refresh the page.
*/
function saveChatSession(patient_query, system_guidance, medical_safety_flags) {
    let saved_chats = JSON.parse(localStorage.getItem('patient_chats')) || [];
    let current_chat_index = saved_chats.findIndex(chat => chat.id === active_conversation_session_id);
    
    //If the current chat ID is unavailable it means that it a new conversation, so create the structure for it.
    if (current_chat_index === -1) {
        const new_chat = {
            id: active_conversation_session_id,
            //Get the first 30 characters of the user's message to use it as the title of the sidebar
            summary: patient_query.substring(0, 30) + (patient_query.length > 30 ? "..." : ""),
            messages: [],
            triggered_rules: []
        };
        saved_chats.push(new_chat);
        current_chat_index = saved_chats.length - 1; 
    }
    
    /*
    The code below gets the exact message that the user typed in and the reply that the AI provided
    and puts this into a memory array for the conversation.
    */
    saved_chats[current_chat_index].messages.push({ role: 'user', content: patient_query });
    saved_chats[current_chat_index].messages.push({ role: 'assistant', content: system_guidance });
    
    //If a new emergency rule was triggered, the list is updated here so that it can be remembered for next time.
    if (medical_safety_flags) {
        saved_chats[current_chat_index].triggered_rules = medical_safety_flags; 
    }
    
    localStorage.setItem('patient_chats', JSON.stringify(saved_chats));

    //Refreshes the sidebar just incase another chat has been added.
    loadOldGuidanceSessions();
}

/*
When the user clicks an old chat in the sidebar, this function reads the memory and displays it back to the user.
*/
function loadSpecificSession(id) {
    const saved_chats = JSON.parse(localStorage.getItem('patient_chats')) || [];
    const chat_to_load = saved_chats.find(c => c.id === id);
    
    if (chat_to_load) {
        active_conversation_session_id = id;
        
        //This hides the welcome screen and pulls up the chat bubbles.
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('activeChatArea').style.display = 'flex';
        
        const chat_body = document.getElementById('guidance-chat-window');
        chat_body.innerHTML = '';
        
        chat_to_load.messages.forEach(msg => {
            //Translate the backend LLM roes into the CSS classes to the page displays correctly.
            const message_source = msg.role === 'assistant' ? 'bot' : 'user';
            displayChatBubble(msg.content, message_source); 
        });
    }
}


//This function enables the user just to hit the enter key to send a message from the welcome screen.
function handleInitialKeyPress(event) {
    if (event.key === "Enter") startChat();
}

//This function allows the user to hit the enter key to send follow up messages.
function handleChatKeyPress(event) {
    if (event.key === "Enter") submitFollowUpQuery();
}


/*
This functions job is responsible for drawing the small chat
buttons onto the screen. It breaks it down into text to display and who sent
it via parameters.
*/
function displayChatBubble(text, message_source) {
    const chat_body = document.getElementById("guidance-chat-window");

    //Create a message box.
    const message_bubble = document.createElement("div");

    //After creating the message bubble apply the css to this box instead of the main chat area.
    message_bubble.className = `message ${message_source === 'bot' ? 'system-guidance-bubble' : 'patient-query-bubble'}`;
    message_bubble.innerHTML = text;

    //To put the message bubble on the screen.
    chat_body.appendChild(message_bubble);
    chat_body.scrollTop = chat_body.scrollHeight;
}


/*
This function only runs when the user types their first message into the
large search bar on the initial welcome screen.
*/
async function startChat() {
    //Gets the input recieved from the user.
    const input_field = document.getElementById("initialInput");
    const patient_query = input_field.value.trim();
    if (!patient_query) return;

    /*
    This ensures that the server treats this as a new conversation as does not get
    confused with previous chats.
    */
    active_conversation_session_id = null;

    /*
    Hides the welcome text and displays the actual chat interface where the conversation with the AI will occur.
    */
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('activeChatArea').style.display = 'flex';

    //Clears the chat of any previous messages.
    document.getElementById("guidance-chat-window").innerHTML = ''; 
    
    await processPatientQuery(patient_query);
}

/*
This function acts as a reset button, as it is triggered when the user clicks
new chat in the sidebar or deletes the chat which they are already reading.
*/
function startNewChat() {
    //Forget the current session ID.
    active_conversation_session_id = null;

    //Clear the chat messages from the screen.
    document.getElementById("guidance-chat-window").innerHTML = '';

    //Hides the active chat area and show the Welcome Screen again.
    document.getElementById('activeChatArea').style.display = 'none';
    document.getElementById('welcomeScreen').style.display = 'flex';

    //Clear the main input box so it's empty for a question.
    document.getElementById("initialInput").value = '';
}


/*
This function handles all follow up questions once the user's chat has
already started.
*/
async function submitFollowUpQuery() {
    const input_field = document.getElementById("chatInput");
    const user_text = input_field.value.trim();
    if (!user_text) return;

    input_field.value = "";
    //Passes the follow up text to the server.
    await processPatientQuery(user_text);
}

/*
This is one of the main functions of the frontend.
The code below, takes the user's message, their chat history and the subsequent safety rules and pushes this to the
server in the backend.
*/
async function processPatientQuery(patient_query) {
    displayChatBubble(patient_query, "user");

    //Create a chat ID via time stamping to a new chat.
    if (!active_conversation_session_id) {
        active_conversation_session_id = Date.now().toString();
    }

    //Get the current chats memory so all the required context is sent to the LLM.
    let saved_chats = JSON.parse(localStorage.getItem('patient_chats')) || [];
    let current_chat = saved_chats.find(chat => chat.id === active_conversation_session_id);
    
    let session_history = current_chat ? current_chat.messages : [];
    let medical_safety_flags = current_chat ? (current_chat.triggered_rules || []) : [];

    //Push a 'Thinking' text to the page so that the user knows that the LLM is procesing a response and not that it has broken.
    const loading_id = "loading-" + Date.now();
    const chat_body = document.getElementById("guidance-chat-window");
    const loading_chat_area = document.createElement("div");
    loading_chat_area.className = "message system-guidance-bubble";
    loading_chat_area.innerText = "Thinking...";
    loading_chat_area.id = loading_id;
    chat_body.appendChild(loading_chat_area);
    chat_body.scrollTop = chat_body.scrollHeight;

    let system_guidance = "";

    try {
        //Try pushing this information to the python server.
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: patient_query, 
                history: session_history, 
                triggered_rules: medical_safety_flags 
            }) 
        });

        const data = await response.json();
        
        //The server responded so remove the 'thinking' text.
        document.getElementById(loading_id).remove();


        //Check if the server produced an error.
        if (data.error) {
            console.error("Server Error:", data.error);
            system_guidance = "Error: " + data.error;
            displayChatBubble(system_guidance, "bot");
        //If everything is ok, post the chatbot reply.
        } else if (data.reply) {
            system_guidance = data.reply;
            displayChatBubble(system_guidance, "bot");
            //Save the exchange and rules and put this to the browser's local storage.
            saveChatSession(patient_query, system_guidance, data.triggered_rules); 
        }

    } catch (error) {
        //This catch statement's job is to catch any network errors (e.g the python server is not running)
        if (document.getElementById(loading_id)) document.getElementById(loading_id).remove();
        console.error("Network Error:", error);
        system_guidance = "Network Error. Is your Python server running?";
        displayChatBubble(system_guidance, "bot");
    }
}

//On the page loading, run these functions to get the UI working.
window.onload = function() {
    loadOldGuidanceSessions();
    loadSavedTheme();
    loadAccessibleTextPreference();    
};