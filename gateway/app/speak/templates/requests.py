T: dict[str, dict[str, str]] = {
    "doc_statement": {"en": "loan statement", "hi": "लोन स्टेटमेंट", "hinglish": "loan statement", "mr": "कर्ज स्टेटमेंट"},
    "doc_interest_cert": {"en": "interest certificate", "hi": "ब्याज प्रमाणपत्र", "hinglish": "interest certificate", "mr": "व्याज प्रमाणपत्र"},
    "document_raised": {
        "en": "Request {ticket} is raised for your {doc}. It will be emailed to your registered email. I have also sent you an SMS.",
        "hi": "आपके {doc} के लिए अनुरोध {ticket} बना दिया गया है। यह आपके पंजीकृत ईमेल पर भेजा जाएगा। मैंने आपको एसएमएस भी भेजा है।",
        "hinglish": "Aapke {doc} ke liye request {ticket} raise ho gayi hai. Ye aapke registered email par bheja jayega. Maine aapko SMS bhi bheja hai.",
        "mr": "तुमच्या {doc} साठी विनंती {ticket} तयार केली आहे. ते तुमच्या नोंदणीकृत ईमेलवर पाठवले जाईल. मी तुम्हाला एसएमएसही पाठवला आहे.",
    },
    "sms_document": {
        "en": "Sahyadri Finance Bank: your {doc} request {ticket} is received. It will be emailed to your registered email.",
        "hi": "सह्याद्रि फ़ाइनेंस बैंक: आपका {doc} अनुरोध {ticket} प्राप्त हुआ। यह आपके पंजीकृत ईमेल पर भेजा जाएगा।",
        "hinglish": "Sahyadri Finance Bank: aapki {doc} request {ticket} mil gayi hai. Ye aapke registered email par bheji jayegi.",
        "mr": "सह्याद्री फायनान्स बँक: तुमची {doc} विनंती {ticket} मिळाली आहे. ती तुमच्या नोंदणीकृत ईमेलवर पाठवली जाईल.",
    },
    "readback_nominee": {
        "en": "Nominee name {name}, relation {relation}. Is that correct? Please say yes.",
        "hi": "नामांकित व्यक्ति का नाम {name}, संबंध {relation}। क्या यह सही है? कृपया हाँ कहें।",
        "hinglish": "Nominee ka naam {name}, relation {relation}. Kya ye sahi hai? Please haan boliye.",
        "mr": "नामनिर्देशित व्यक्तीचे नाव {name}, नाते {relation}. हे बरोबर आहे का? कृपया हो म्हणा.",
    },
    "nominee_raised": {
        "en": "Request {ticket} is raised to set {name} ({relation}) as your nominee.",
        "hi": "{name} ({relation}) को आपका नामांकित व्यक्ति बनाने का अनुरोध {ticket} बना दिया गया है।",
        "hinglish": "{name} ({relation}) ko aapka nominee banane ki request {ticket} raise ho gayi hai.",
        "mr": "{name} ({relation}) यांना तुमचे नामनिर्देशित व्यक्ती करण्याची विनंती {ticket} तयार केली आहे.",
    },
    "readback_address": {
        "en": "Address: {line1}, {city}, pincode {pincode}. Is that correct? Please say yes.",
        "hi": "पता: {line1}, {city}, पिनकोड {pincode}। क्या यह सही है? कृपया हाँ कहें।",
        "hinglish": "Address: {line1}, {city}, pincode {pincode}. Kya ye sahi hai? Please haan boliye.",
        "mr": "पत्ता: {line1}, {city}, पिनकोड {pincode}. हे बरोबर आहे का? कृपया हो म्हणा.",
    },
    "address_raised": {
        "en": "Request {ticket} is raised to update your address to {line1}, {city}, pincode {pincode}.",
        "hi": "आपका पता {line1}, {city}, पिनकोड {pincode} करने का अनुरोध {ticket} बना दिया गया है।",
        "hinglish": "Aapka address {line1}, {city}, pincode {pincode} karne ki request {ticket} raise ho gayi hai.",
        "mr": "तुमचा पत्ता {line1}, {city}, पिनकोड {pincode} करण्याची विनंती {ticket} तयार केली आहे.",
    },
}
