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

/* ---- Counsellor Support content ---- */
const COUNSELLORS = [
  { id:"cn1", name:"Dr. Njeri Kamau", color:"#0f6f6a", title:"Clinical Psychologist",
    focus:["Healing after divorce","Trauma","Self-worth"],
    bio:"15 years walking with people through painful endings toward healthy new beginnings." },
  { id:"cn2", name:"Amina Hassan", color:"#e0a44b", title:"Marriage & Family Therapist",
    focus:["Communication","Conflict","Couples"],
    bio:"Helps individuals and couples turn conflict into closeness, with warmth and practicality." },
  { id:"cn3", name:"Grace Wanjiku", color:"#9b3d54", title:"Counselling Psychologist",
    focus:["Grief","Widowhood","Loneliness"],
    bio:"A gentle guide for those rebuilding after loss and rediscovering their worth." },
  { id:"cn4", name:"Pastor Daniel Ochieng", color:"#6b4a72", title:"Faith-based Counsellor",
    focus:["Marriage prep","Faith","Forgiveness"],
    bio:"Integrates faith and sound counselling for couples preparing for a lasting marriage." },
  { id:"cn5", name:"Victoria Njuguna", color:"#0f6f6a", title:"Clinical Psychologist",
    focus:["Anxiety","Emotional wellness","Boundaries"],
    bio:"Calm, practical support for building emotional steadiness and healthy boundaries." },
  { id:"cn6", name:"Priscilla Maina", color:"#cc5b8a", title:"Marriage & Family Therapist",
    focus:["Couples","Communication","Family expectations"],
    bio:"Helps couples navigate expectations and communicate with honesty and care." },
  { id:"cn7", name:"Brenda Omondi", color:"#3a6ea5", title:"Counselling Psychologist",
    focus:["Single parents","Self-worth","New beginnings"],
    bio:"Warm, encouraging guidance for single parents and anyone starting a new chapter." },
];

const SESSION_TYPES = [
  { id:"refresher", name:"Refresher check-in", mins:30, desc:"A short catch-up to keep you steady." },
  { id:"individual", name:"Individual counselling", mins:50, desc:"One-to-one support for what you're facing." },
  { id:"couples", name:"Couples session", mins:50, desc:"Grow together with professional guidance." },
  { id:"quick", name:"Quick support call", mins:15, desc:"A brief call when you just need to talk." },
];

const SESSION_FORMATS = [
  { id:"video", name:"Video call", icon:"🎥" },
  { id:"phone", name:"Phone call", icon:"📞" },
  { id:"inperson", name:"In person", icon:"🏢" },
];

const SLOT_TIMES = ["09:00","11:00","14:00","16:00","18:00"];

/* Webinars — inDays is offset from today, computed at render time */
const WEBINARS = [
  { id:"w1", title:"Rebuilding Trust After Betrayal", by:"Dr. Njeri Kamau", inDays:3, time:"19:00",
    blurb:"What repair really requires, and whether — and when — trust can be rebuilt." },
  { id:"w2", title:"Healthy Communication in Marriage", by:"Amina Hassan", inDays:6, time:"18:30",
    blurb:"Turn everyday conversations into connection, even in disagreement." },
  { id:"w3", title:"Grief, Grace and New Beginnings", by:"Grace Wanjiku", inDays:10, time:"17:00",
    blurb:"Honouring loss while gently opening to love again." },
  { id:"w4", title:"Faith and Partnership", by:"Pastor Daniel Ochieng", inDays:14, time:"19:00",
    blurb:"Building a relationship on shared values and lasting commitment." },
];

const SUPPORT_GROUPS = [
  { id:"g1", name:"Healing After Divorce", when:"Tuesdays · 7:00 pm", by:"Dr. Njeri Kamau", members:24, icon:"🌱" },
  { id:"g2", name:"Widows & Widowers Circle", when:"Thursdays · 6:00 pm", by:"Grace Wanjiku", members:18, icon:"🕊️" },
  { id:"g3", name:"Singles Preparing for Marriage", when:"Saturdays · 10:00 am", by:"Pastor Daniel Ochieng", members:31, icon:"💍" },
  { id:"g4", name:"Single Parents Together", when:"Wednesdays · 7:00 pm", by:"Amina Hassan", members:22, icon:"👪" },
];

/* Confidential Q&A — supportive auto-acknowledgements (a real counsellor follows up) */
const QA_ACKS = [
  "Thank you for trusting us with this. What you're feeling makes complete sense, and you're not alone in it.",
  "That takes courage to put into words. A counsellor will follow up personally within 24 hours — for now, be gentle with yourself.",
  "We hear you. This is a safe place to bring exactly this kind of question, and there's no judgement here.",
  "Thank you for reaching out. One of our counsellors will reply in detail soon; in the meantime, your wellbeing matters.",
];

/* Educational resources — 'course' items deep-link into the Academy */
const RESOURCES = [
  { title:"Recognising red flags", kind:"course", ref:"red-flags", icon:"🚩" },
  { title:"Rebuilding trust", kind:"course", ref:"trust", icon:"🤝" },
  { title:"Communication that connects", kind:"course", ref:"communication", icon:"🗣️" },
  { title:"Crisis & safety helplines (Kenya)", kind:"info", icon:"📞",
    body:"If you are in immediate danger, call 999 or 112. For emotional crisis support in Kenya, Befrienders Kenya offers a confidential listening line. You deserve support, and reaching out is a sign of strength." },
  { title:"When to seek professional help", kind:"info", icon:"💛",
    body:"Consider booking a session if you feel persistently low, anxious or stuck; if past hurt keeps affecting your relationships; or simply if you'd value a steady, professional space to think. You don't need to be in crisis to deserve support." },
];

/* ---- Couple Space content ---- */
const COUPLE_PROMPTS = [
  "What's one thing your partner did this week that you appreciated?",
  "What's a small worry you've been carrying that you could share?",
  "Where would you like us to grow closer this month?",
  "What did we handle well the last time we disagreed?",
  "What's a dream you'd love us to work toward together?",
];
const COUPLE_CHECKIN = [
  { id:"closeness",   q:"How close have we felt this week?" },
  { id:"communication", q:"How well have we been communicating?" },
  { id:"support",     q:"How supported do you feel by me?" },
];

/* ---- Marriage Preparation pathway ---- */
const MARRIAGE_TOPICS = [
  { id:"financial", icon:"💰", title:"Financial planning",
    desc:"Align on money before it becomes a strain.",
    points:["Share incomes, debts and family obligations openly","Agree on saving vs. spending and 'ours vs. mine'","Set one shared financial goal for your first year","Understand each other's money story, not just the numbers"] },
  { id:"conflict", icon:"🕊️", title:"Conflict management",
    desc:"Learn to disagree without disconnecting.",
    points:["Agree how you'll pause when things heat up","Practise 'I feel… I need…' instead of blame","Repair quickly — own your part without a 'but'","Decide together what fighting fair looks like"] },
  { id:"family", icon:"👨‍👩‍👧", title:"Family expectations",
    desc:"Name the unspoken assumptions about family.",
    points:["Discuss roles at home and how you'll share them","Agree boundaries with extended family together","Talk about holidays, support and involvement","Present a united front on the big decisions"] },
  { id:"parenting", icon:"👶", title:"Parenting discussions",
    desc:"Get aligned on children before you need to.",
    points:["Whether and when you both want children","How you'll discipline and show affection","The role of faith and family in raising them","What you'll each carry forward — and leave behind"] },
  { id:"intimacy", icon:"❤️", title:"Intimacy & sexual health",
    desc:"An honest, respectful conversation about closeness.",
    points:["Talk openly about expectations and comfort","Understand consent and ongoing communication","Discuss sexual health and any medical check-ups","Agree that intimacy grows on trust and safety"] },
  { id:"legal", icon:"⚖️", title:"Legal aspects of marriage",
    desc:"Understand the practical and legal side.",
    points:["Types of marriage recognised in Kenya and registration","Rights, responsibilities and property","Whether to discuss any pre-marital agreements","Documents you'll need and how to prepare them"] },
  { id:"wedding", icon:"💒", title:"Wedding planning checklist",
    desc:"Plan a celebration that reflects you both.",
    points:["Agree a budget you're both at peace with","Decide guest list, venue and date together","Divide tasks so the load is shared","Keep sight of the marriage, not just the wedding"] },
];

/* ---- Community discussion groups (distinct from counselling support groups) ---- */
const COMMUNITY_GROUPS = [
  { id:"cg1", icon:"💍", name:"Singles Preparing for Marriage", members:214,
    desc:"For those getting ready to build a lasting partnership.",
    seed:[ {a:"Faith W.", t:"Grateful for this space. Six months of counselling and I finally feel ready to date with intention.", d:2},
           {a:"Peter O.", t:"What helped you all rebuild self-worth after a hard breakup?", d:5} ] },
  { id:"cg2", icon:"💼", name:"Young Professionals", members:180,
    desc:"Balancing career, growth and a healthy love life.",
    seed:[ {a:"Aisha M.", t:"How do you make time for dating when work is this demanding?", d:1} ] },
  { id:"cg3", icon:"🕊️", name:"Widows & Widowers", members:96,
    desc:"Gentle support for loving again after loss.",
    seed:[ {a:"Grace N.", t:"Two years on. Some days are heavy, but this community reminds me I'm not alone.", d:3} ] },
  { id:"cg4", icon:"👪", name:"Single Parents", members:142,
    desc:"Dating and healing while raising your children.",
    seed:[ {a:"Daniel K.", t:"When is the right time to introduce someone to your kids? Would love your thoughts.", d:4} ] },
  { id:"cg5", icon:"🌿", name:"Retirement & Later-life Love", members:63,
    desc:"Companionship and connection in a new season.",
    seed:[ {a:"Margaret A.", t:"It's never too late for gentle companionship. So glad I joined.", d:6} ] },
  { id:"cg6", icon:"✝️", name:"Faith-based Enrichment", members:158,
    desc:"Growing in relationships rooted in shared faith.",
    seed:[ {a:"Samuel W.", t:"Weekly reflection: love is patient. How does that show up in how you date?", d:2} ] },
];

/* ---- Events ---- */
const EVENTS = [
  { id:"e1", icon:"🥂", type:"Singles mixer", title:"Nairobi Singles Mixer", inDays:5, time:"18:00",
    location:"Nairobi", price:"KES 500", blurb:"A relaxed, counsellor-hosted evening to meet other members in a safe, respectful setting." },
  { id:"e2", icon:"🎤", type:"Seminar", title:"Building Secure Love", inDays:9, time:"15:00",
    location:"Online", price:"Free", blurb:"A live seminar on what secure attachment looks like and how to cultivate it." },
  { id:"e3", icon:"💍", type:"Workshop", title:"Premarital Workshop", inDays:16, time:"10:00",
    location:"Nairobi", price:"KES 2,000", blurb:"A full-day workshop for couples preparing for engagement and marriage." },
  { id:"e4", icon:"🏞️", type:"Retreat", title:"Marriage Enrichment Retreat", inDays:30, time:"09:00",
    location:"Naivasha", price:"KES 12,000", blurb:"A weekend away to deepen connection, guided by our counselling team." },
  { id:"e5", icon:"🤝", type:"Community", title:"Community Service Day", inDays:12, time:"08:30",
    location:"Machakos", price:"Free", blurb:"Serve together and build friendships through shared purpose." },
];

/* ---- Premium plans (prototype — no real payment is taken) ---- */
const PREMIUM_PLANS = [
  { id:"free", name:"Free", price:"KES 0", per:"", tagline:"The core journey",
    features:["Relationship Readiness & Wellness Score","A few curated matches","Mutual-consent messaging","Learning Academy","Wellness Tools"] },
  { id:"premium", name:"Premium", price:"KES 1,500", per:"/month", tagline:"Go deeper", popular:true,
    features:["Everything in Free","Unlimited counsellor messaging","Monthly video counselling","Compatibility insights","Exclusive webinars"] },
  { id:"premiumplus", name:"Premium+", price:"KES 3,500", per:"/month", tagline:"Fully supported",
    features:["Everything in Premium","Weekly video counselling","Dedicated couples coaching","Advanced relationship courses","Priority event access"] },
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
