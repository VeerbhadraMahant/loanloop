LABELS = {
    "mobile": {"en": "registered mobile number", "hi": "पंजीकृत मोबाइल नंबर", "hinglish": "registered mobile number", "mr": "नोंदणीकृत मोबाइल नंबर"},
    "email": {"en": "registered email", "hi": "पंजीकृत ईमेल", "hinglish": "registered email", "mr": "नोंदणीकृत ईमेल"},
    "account": {"en": "account number", "hi": "खाता नंबर", "hinglish": "account number", "mr": "खाते क्रमांक"},
    "loan": {"en": "loan number", "hi": "लोन नंबर", "hinglish": "loan number", "mr": "कर्ज क्रमांक"},
    "customer_id": {"en": "customer ID", "hi": "कस्टमर आईडी", "hinglish": "customer ID", "mr": "ग्राहक आयडी"},
    "ifsc": {"en": "branch IFSC", "hi": "ब्रांच का आईएफएससी", "hinglish": "branch ka IFSC", "mr": "शाखेचा आयएफएससी"},
    "branch": {"en": "branch", "hi": "ब्रांच", "hinglish": "branch", "mr": "शाखा"},
}
ENDING = {"en": "ending {d}", "hi": "{d} पर समाप्त", "hinglish": "{d} par khatam hone wala", "mr": "{d} वर संपणारा"}


def spell_ifsc(ifsc: str) -> str:
    """'SAHY0000101' -> 'S A H Y zero, 0 0 0 1 0 1': bank code spelled, then the 6-char branch code spaced."""
    return f"{' '.join(ifsc[:4])} zero, {' '.join(ifsc[5:])}"


T = {
    "branch_found": {
        "en": "{name}, {address}. IFSC: {ifsc}. MICR: {micr}. Open {hours}.",
        "hi": "{name}, {address}। आईएफएससी: {ifsc}। एमआईसीआर: {micr}। समय: {hours}।",
        "hinglish": "{name}, {address}. IFSC: {ifsc}. MICR: {micr}. Timing: {hours}.",
        "mr": "{name}, {address}. आयएफएससी: {ifsc}. एमआयसीआर: {micr}. वेळ: {hours}.",
    },
    "ifsc_bad_format": {
        "en": "That does not look like a valid IFSC. It has four letters, then a zero, then six letters or digits. Could you say it again?",
        "hi": "यह सही आईएफएससी नहीं लग रहा। इसमें चार अक्षर, फिर शून्य, फिर छह अक्षर या अंक होते हैं। क्या आप दोबारा बता सकते हैं?",
        "hinglish": "Ye sahi IFSC nahi lag raha. Isme chaar letters, phir zero, phir chhe letters ya digits hote hain. Kya aap dobara bata sakte hain?",
        "mr": "हा योग्य आयएफएससी वाटत नाही. यात चार अक्षरे, मग शून्य, मग सहा अक्षरे किंवा अंक असतात. कृपया पुन्हा सांगाल का?",
    },
    "ifsc_sahyadri": {
        "en": "Yes, {ifsc} is valid. It is {name}, {address}.",
        "hi": "हाँ, {ifsc} सही है। यह {name}, {address} है।",
        "hinglish": "Haan, {ifsc} sahi hai. Ye {name}, {address} hai.",
        "mr": "होय, {ifsc} बरोबर आहे. ही {name}, {address} आहे.",
    },
    "ifsc_other": {
        "en": "{ifsc} is in a valid format but it is not a Sahyadri branch. Please confirm it with the payee's bank.",
        "hi": "{ifsc} का प्रारूप सही है लेकिन यह सह्याद्रि की शाखा नहीं है। कृपया पाने वाले के बैंक से पुष्टि करें।",
        "hinglish": "{ifsc} ka format sahi hai lekin ye Sahyadri ki branch nahi hai. Please payee ke bank se confirm kijiye.",
        "mr": "{ifsc} चे स्वरूप योग्य आहे पण ही सह्याद्रीची शाखा नाही. कृपया प्राप्तकर्त्याच्या बँकेकडून खात्री करा.",
    },
    "mp_line": {
        "en": "Your {label} is {v}.",
        "hi": "आपका {label} {v} है।",
        "hinglish": "Aapka {label} {v} hai.",
        "mr": "तुमचा {label} {v} आहे.",
    },
    "mp_none": {
        "en": "I do not have that on record.",
        "hi": "मेरे रिकॉर्ड में यह नहीं है।",
        "hinglish": "Mere record mein ye nahi hai.",
        "mr": "माझ्या नोंदीत हे नाही.",
    },
    "sms_sent": {
        "en": "I have sent the details by SMS to your number {v}. For your safety I do not read them out.",
        "hi": "मैंने विवरण आपके नंबर {v} पर एसएमएस से भेज दिया है। आपकी सुरक्षा के लिए मैं इन्हें बोलकर नहीं बताती।",
        "hinglish": "Maine details aapke number {v} par SMS se bhej di hain. Aapki safety ke liye main inhe bolkar nahi batati.",
        "mr": "मी तपशील तुमच्या क्रमांक {v} वर एसएमएसने पाठवले आहेत. तुमच्या सुरक्षेसाठी मी ते बोलून सांगत नाही.",
    },
    "pw_app": {
        "en": "To reset your password in the Sahyadri app: open the app, tap Forgot Password on the login screen, enter your registered mobile number, and follow the steps on screen. The bank will never ask you for your password, PIN or OTP, not even on a call.",
        "hi": "सह्याद्रि ऐप में पासवर्ड रीसेट करने के लिए: ऐप खोलें, लॉगिन स्क्रीन पर पासवर्ड भूल गए पर टैप करें, अपना पंजीकृत मोबाइल नंबर डालें और स्क्रीन के निर्देश मानें। बैंक कभी आपसे पासवर्ड, पिन या ओटीपी नहीं माँगता, कॉल पर भी नहीं।",
        "hinglish": "Sahyadri app mein password reset karne ke liye: app kholiye, login screen par Forgot Password par tap kijiye, apna registered mobile number daliye aur screen ke steps follow kijiye. Bank kabhi aapse password, PIN ya OTP nahi mangta, call par bhi nahi.",
        "mr": "सह्याद्री ॲपमध्ये पासवर्ड रीसेट करण्यासाठी: ॲप उघडा, लॉगिन स्क्रीनवर पासवर्ड विसरलात वर टॅप करा, तुमचा नोंदणीकृत मोबाइल नंबर टाका आणि स्क्रीनवरील सूचनांचे पालन करा. बँक कधीही पासवर्ड, पिन किंवा ओटीपी मागत नाही, कॉलवरही नाही.",
    },
    "pw_netbanking": {
        "en": "To reset your net banking password: open the Sahyadri net banking page, choose Forgot Password, enter your customer ID, and complete the steps shown on screen. The bank will never ask you for your password, PIN or OTP, not even on a call.",
        "hi": "नेट बैंकिंग पासवर्ड रीसेट करने के लिए: सह्याद्रि नेट बैंकिंग पेज खोलें, पासवर्ड भूल गए चुनें, अपनी कस्टमर आईडी डालें और स्क्रीन पर दिए चरण पूरे करें। बैंक कभी आपसे पासवर्ड, पिन या ओटीपी नहीं माँगता, कॉल पर भी नहीं।",
        "hinglish": "Net banking password reset karne ke liye: Sahyadri net banking page kholiye, Forgot Password chuniye, apni customer ID daliye aur screen par diye steps poore kijiye. Bank kabhi aapse password, PIN ya OTP nahi mangta, call par bhi nahi.",
        "mr": "नेट बँकिंग पासवर्ड रीसेट करण्यासाठी: सह्याद्री नेट बँकिंग पेज उघडा, पासवर्ड विसरलात निवडा, तुमचा ग्राहक आयडी टाका आणि स्क्रीनवरील पायऱ्या पूर्ण करा. बँक कधीही पासवर्ड, पिन किंवा ओटीपी मागत नाही, कॉलवरही नाही.",
    },
}
