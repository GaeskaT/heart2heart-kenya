/* ============================================================
   Heart2Heart Kenya — seed data
   Static reference data + candidate pool for matching.
   ============================================================ */

const COUNTIES = [
  "Nairobi","Mombasa","Kisumu","Nakuru","Eldoret (Uasin Gishu)","Kiambu","Machakos",
  "Kakamega","Nyeri","Meru","Kericho","Kilifi","Kajiado","Thika","Kisii","Bungoma"
];

const VALUES = [
  "Faith","Family","Honesty","Growth","Kindness","Ambition","Community",
  "Stability","Adventure","Health","Service","Financial discipline"
];

const FAITHS = ["Christian","Muslim","Hindu","Spiritual / not religious","Prefer not to say"];

const INTENTIONS = [
  { id:"marriage",  label:"Marriage-focused" },
  { id:"committed", label:"Committed long-term relationship" },
  { id:"exploring", label:"Open, taking it slowly" },
];

const FAMILY_GOALS = ["Want children","Open to children","Have children already","Prefer no children","Still deciding"];

const EDUCATION = ["Secondary","Certificate / Diploma","Undergraduate","Postgraduate"];

/* ---- Relationship Readiness assessment ----
   6 dimensions, each with weighted Likert (1..5) statements.
   Higher agreement = healthier. */
const READINESS = [
  { id:"emotional", label:"Emotional wellness", icon:"🌤️", questions:[
    "I understand and can name what I am feeling.",
    "I have made peace with my past relationships.",
    "I can be alone without feeling anxious or empty.",
  ]},
  { id:"communication", label:"Communication skills", icon:"🗣️", questions:[
    "I express my needs clearly and calmly.",
    "I listen to understand, not just to reply.",
    "I can raise a difficult topic without shutting down.",
  ]},
  { id:"conflict", label:"Conflict resolution", icon:"🤝", questions:[
    "I stay respectful even when I strongly disagree.",
    "I take responsibility for my part in a conflict.",
    "I can repair and reconnect after an argument.",
  ]},
  { id:"values", label:"Personal values", icon:"🧭", questions:[
    "I know the values I will not compromise on.",
    "My daily choices reflect what I say matters to me.",
    "I respect that a partner may hold different beliefs.",
  ]},
  { id:"goals", label:"Life goals", icon:"🌱", questions:[
    "I have a clear sense of where my life is heading.",
    "I am building a stable, independent life.",
    "I know what I want a shared future to look like.",
  ]},
  { id:"expectations", label:"Relationship expectations", icon:"🎯", questions:[
    "My expectations of a partner are realistic and fair.",
    "I see a relationship as two whole people, not rescue.",
    "I am ready to give as much as I hope to receive.",
  ]},
];

const CODE_OF_CONDUCT = [
  "I will treat every member with respect, honesty and kindness.",
  "I understand there is no anonymous messaging — I connect as my verified self.",
  "I will not pressure anyone, and I accept a 'no' gracefully.",
  "I will keep others' shared stories private and confidential.",
  "I am pursuing a healthy, intentional relationship — not casual harm.",
  "I will report concerns and support a safe community for all.",
];

/* ---- Guided-dating content ---- */
const WEEKLY_PROMPTS = [
  "What does emotional safety feel like to you in a relationship?",
  "Describe a time you felt truly understood. What made it possible?",
  "What is one boundary you're proud of setting?",
  "How does your family show love, and how has that shaped you?",
  "What does 'a good partner' do in the small everyday moments?",
  "Where do you hope to be in five years — and who is beside you?",
];

const EXERCISES = [
  { t:"The 3-minute check-in", d:"Each share one high, one low, and one need from the week — no fixing, just listening." },
  { t:"Values card sort", d:"Separately rank your top 5 values, then compare. Talk about where they meet and differ." },
  { t:"Appreciation round", d:"Tell each other three specific things you admired this week." },
  { t:"The repair rehearsal", d:"Recall a small disagreement and practise saying 'here's my part.'" },
];

const DATE_IDEAS = [
  "A morning walk at Karura Forest, then coffee and conversation.",
  "Volunteer together at a local community day.",
  "Cook a meal from each other's home county.",
  "Visit a museum or gallery and swap what moved you.",
  "Sunset at a viewpoint with your phones away.",
];

/* Academy course + lesson content now lives in lessons.js (COURSES). */

/* ---- Wellness Tools content ---- */
const MOODS = [
  { score:1, emoji:"😔", label:"Low" },
  { score:2, emoji:"😕", label:"Down" },
  { score:3, emoji:"😐", label:"Okay" },
  { score:4, emoji:"🙂", label:"Good" },
  { score:5, emoji:"😄", label:"Great" },
];

const AFFIRMATIONS = [
  "I am worthy of a healthy, respectful love.",
  "My peace does not depend on being chosen.",
  "I can be soft and strong at the same time.",
  "I am allowed to take relationships slowly.",
  "My boundaries protect my well-being, and that is good.",
  "I have grown, and I am still growing.",
  "I bring value simply by being who I am.",
  "I can feel a hard emotion without being ruled by it.",
  "I deserve honesty, kindness and patience.",
  "I am not defined by my past relationships.",
  "It is safe for me to be fully myself.",
  "I choose partners from wholeness, not from fear.",
  "I trust myself to walk away from what harms me.",
  "I am learning to receive love as freely as I give it.",
  "Today, I offer myself the same grace I offer others.",
  "I am becoming the partner I would want to meet.",
];

/* Faith-inclusive: a mix of prayer, gratitude and secular meditation prompts */
const REFLECT_PROMPTS = [
  { type:"Meditation", text:"Sit quietly for one minute. Notice three sounds around you, then how your body feels supported where you sit." },
  { type:"Prayer",     text:"Give thanks for one person who has helped you heal. Hold them gently in your heart." },
  { type:"Meditation", text:"Breathe slowly and silently repeat: 'I am here. I am safe. I am enough.'" },
  { type:"Prayer",     text:"Ask for the wisdom to know your worth, and the courage to honour it." },
  { type:"Meditation", text:"Picture the version of you a year from now, healed and steady. What would they thank you for today?" },
  { type:"Prayer",     text:"Offer up any anxiety about the future, and receive peace for just this day." },
  { type:"Meditation", text:"Place a hand on your heart. Feel it beating for you, faithfully, without being asked." },
  { type:"Prayer",     text:"Bless the relationships in your life, and pray for grace in the ones still to come." },
];

const BREATH_PATTERNS = [
  { id:"box",  name:"Box breathing",  hint:"Calm & focus",  phases:[["Breathe in",4],["Hold",4],["Breathe out",4],["Hold",4]] },
  { id:"calm", name:"4–7–8 calm",     hint:"Ease anxiety",   phases:[["Breathe in",4],["Hold",7],["Breathe out",8]] },
  { id:"soft", name:"Slow & soft",    hint:"Gentle reset",   phases:[["Breathe in",4],["Breathe out",6]] },
];

const CHECKIN_QUESTIONS = [
  { id:"mood",       q:"How is your heart today?",              opts:["Struggling","Heavy","Okay","Steady","Bright"] },
  { id:"sleep",      q:"How well have you been resting?",        opts:["Poorly","Not great","Fair","Well","Deeply"] },
  { id:"connection", q:"How connected do you feel to others?",   opts:["Isolated","A little","Somewhat","Connected","Held"] },
  { id:"self",       q:"How kind have you been to yourself?",    opts:["Harsh","Critical","Neutral","Gentle","Very kind"] },
];

/* ---- Candidate pool ----
   Each has the attributes the matcher scores against. Photos are avatar
   initials + colour (no real people). "prefs" describes what they seek. */
const CANDIDATES = [
  { id:"c1", name:"Amina", age:31, county:"Nairobi", color:"#0f6f6a",
    faith:"Muslim", education:"Postgraduate", career:"Public health officer",
    values:["Faith","Family","Service","Health"], familyGoal:"Want children",
    intention:"marriage", verified:true,
    bio:"Rebuilt myself after a hard divorce. Counselling gave me my voice back. I love calm mornings, honest conversation and mangoes from the coast.",
    prefs:{ ageMin:30, ageMax:42 } },

  { id:"c2", name:"Brian", age:35, county:"Nakuru", color:"#6b4a72",
    faith:"Christian", education:"Undergraduate", career:"Agribusiness owner",
    values:["Faith","Ambition","Financial discipline","Family"], familyGoal:"Want children",
    intention:"marriage", verified:true,
    bio:"Widower, two years on. I've done the grief work and I'm ready to build again — patiently, and with faith at the centre.",
    prefs:{ ageMin:27, ageMax:38 } },

  { id:"c3", name:"Cynthia", age:28, county:"Kisumu", color:"#e2674f",
    faith:"Christian", education:"Undergraduate", career:"Software developer",
    values:["Growth","Honesty","Adventure","Ambition"], familyGoal:"Open to children",
    intention:"committed", verified:true,
    bio:"Curious, direct, a little nerdy. I learned in counselling that I can be soft and strong at once. Looking for a steady, kind partner.",
    prefs:{ ageMin:28, ageMax:40 } },

  { id:"c4", name:"David", age:39, county:"Nairobi", color:"#12857f",
    faith:"Christian", education:"Postgraduate", career:"Secondary school teacher",
    values:["Family","Kindness","Community","Stability"], familyGoal:"Have children already",
    intention:"marriage", verified:true,
    bio:"Single dad of one wonderful daughter. Slow to anger, quick to listen. I want a partnership built on respect and shared Sunday lunches.",
    prefs:{ ageMin:30, ageMax:44 } },

  { id:"c5", name:"Fatuma", age:33, county:"Mombasa", color:"#e0a44b",
    faith:"Muslim", education:"Certificate / Diploma", career:"Boutique owner",
    values:["Faith","Family","Kindness","Financial discipline"], familyGoal:"Want children",
    intention:"marriage", verified:true,
    bio:"Warm, funny, house-proud. I've learned my worth and I won't shrink for anyone. Seeking gentleness and a good sense of humour.",
    prefs:{ ageMin:32, ageMax:46 } },

  { id:"c6", name:"Grace", age:30, county:"Kiambu", color:"#cc5b8a",
    faith:"Christian", education:"Undergraduate", career:"Nurse",
    values:["Service","Health","Faith","Growth"], familyGoal:"Want children",
    intention:"committed", verified:true,
    bio:"I care for others all day; I'd love someone who notices when I need caring for too. Nature walks, worship music, quiet strength.",
    prefs:{ ageMin:29, ageMax:41 } },

  { id:"c7", name:"Kevin", age:34, county:"Eldoret (Uasin Gishu)", color:"#3a6ea5",
    faith:"Spiritual / not religious", education:"Undergraduate", career:"Civil engineer",
    values:["Growth","Honesty","Adventure","Ambition"], familyGoal:"Still deciding",
    intention:"committed", verified:true,
    bio:"Trail runner and bad-guitar enthusiast. Therapy taught me to say what I mean. I value honesty over comfort.",
    prefs:{ ageMin:26, ageMax:37 } },

  { id:"c8", name:"Wanjiru", age:37, county:"Nyeri", color:"#7a8b3a",
    faith:"Christian", education:"Postgraduate", career:"University lecturer",
    values:["Community","Stability","Family","Service"], familyGoal:"Open to children",
    intention:"marriage", verified:true,
    bio:"Twice I mistook intensity for love. I'm wiser now. I want the quiet, reliable kind — the person who shows up. Books, tea, long talks.",
    prefs:{ ageMin:34, ageMax:48 } },

  { id:"c9", name:"Otieno", age:41, county:"Nairobi", color:"#b5651d",
    faith:"Christian", education:"Undergraduate", career:"Small business consultant",
    values:["Family","Financial discipline","Faith","Kindness"], familyGoal:"Have children already",
    intention:"marriage", verified:true,
    bio:"Divorced, co-parenting well, at peace. I've learned that love is a daily choice, not a spark. Ready to choose someone, fully.",
    prefs:{ ageMin:33, ageMax:45 } },

  { id:"c10", name:"Leila", age:29, county:"Machakos", color:"#9b3d54",
    faith:"Prefer not to say", education:"Undergraduate", career:"Graphic designer",
    values:["Growth","Adventure","Kindness","Health"], familyGoal:"Open to children",
    intention:"exploring", verified:true,
    bio:"Gentle, creative, a work in progress and proud of it. No rush — I'd rather build something real and slow than something loud and fast.",
    prefs:{ ageMin:27, ageMax:38 } },
];
