/* ============================================================
   Heart2Heart Kenya — Learning Academy content
   Real lessons. Each course -> lessons -> sections + takeaways + reflect.
   Tone: warm, practical, non-preachy, faith-inclusive.
   ============================================================ */

const COURSES = [
  /* ---------------------------------------------------------- */
  { id:"healthy-dating", icon:"🌱", tag:"Start here",
    title:"Healthy Dating Foundations",
    blurb:"What healthy, intentional dating looks like — and how to do it from a steady place.",
    lessons:[
      { id:"hd1", title:"What healthy dating actually means", minutes:5,
        intro:"Healthy dating isn't about performing or being chosen. It's two whole people getting to know each other honestly, without losing themselves.",
        sections:[
          { h:"It's a process, not a prize", p:[
            "Healthy dating treats getting to know someone as something you do *with* them, not something you win. You're both gathering information: Do our values fit? Do I feel safe, respected and myself around this person?",
            "That means slowing down enough to actually notice how you feel — instead of rushing to lock things in because the attention feels good."]},
          { h:"The signs you're doing it well", list:[
            "You can be honest about who you are, not a polished version.",
            "You leave dates feeling calm and respected, not anxious.",
            "You still keep your friendships, faith and routines.",
            "A 'no' — theirs or yours — is allowed and survivable."]},
        ],
        takeaways:[
          "Dating is mutual discovery, not an audition.",
          "Feeling calm and like yourself is data — pay attention to it.",
          "Keeping your own life intact is a sign of health, not distance."],
        reflect:"What does 'being fully myself' look like on a date? Where am I tempted to shrink or perform?" },

      { id:"hd2", title:"Dating from wholeness, not a wound", minutes:6,
        intro:"You've done the healing work to be here. Dating from a healed place feels very different from dating to fill a gap.",
        sections:[
          { h:"Wound-led vs. whole-led", p:[
            "When we date from a wound, another person becomes a painkiller — we need them to prove we're lovable, to fix loneliness, to rescue us. That pressure quietly distorts our choices.",
            "When we date from wholeness, connection is something we *add* to an already-steady life. We can want a partner without needing one to be okay."]},
          { h:"A quick self-check", p:[
            "Before a date, notice your motive. 'I'm curious about this person' is whole-led. 'I can't stand being alone another week' is wound-led — and worth bringing to your own reflection or a counsellor first."]},
        ],
        takeaways:[
          "Wanting a partner is healthy; needing one to feel okay is a signal to pause.",
          "Wholeness means your peace doesn't depend on someone choosing you.",
          "Notice your motive before you connect."],
        reflect:"Am I looking for a companion to share my life, or a rescuer to complete it?" },

      { id:"hd3", title:"Letting trust grow at the speed of safety", minutes:5,
        intro:"Intensity is not the same as intimacy. Real trust is built slowly, in small proven moments.",
        sections:[
          { h:"Why pacing protects you", p:[
            "Moving fast can feel like passion, but it skips the part where trust is actually earned. Healthy pacing lets you see how someone behaves over time and in small tests — not just how they perform on a good day."]},
          { h:"Pace in practice", list:[
            "Share a little, then see how it's held before you share more.",
            "Notice consistency over weeks, not grand gestures in a moment.",
            "It's okay to say, 'I like you and I'd like to take this slowly.'"]},
        ],
        takeaways:[
          "Intimacy is earned in small, consistent moments.",
          "Watch how someone holds the small things you share.",
          "Slowing down is a boundary you're allowed to set."],
        reflect:"Where do I tend to rush when I like someone — and what would 'slower' look like?" },

      { id:"hd4", title:"Knowing what you're actually looking for", minutes:6,
        intro:"Clarity is kind — to you and to the people you meet. Vague hopes lead to confusing dating.",
        sections:[
          { h:"Needs, wants and dealbreakers", p:[
            "Needs are non-negotiable (e.g. honesty, shared faith if it matters to you, wanting or not wanting children). Wants are preferences you can flex on (height, hobbies). Dealbreakers are the lines you won't cross.",
            "Knowing the difference stops you from ending things over a 'want' — or ignoring a real 'need' because someone is charming."]},
          { h:"Write it down", p:[
            "Naming your top 3 needs and top 2 dealbreakers on paper makes them harder to abandon in the heat of a crush."]},
        ],
        takeaways:[
          "Separate needs (non-negotiable) from wants (flexible).",
          "Charm can tempt you to ignore a real need — clarity guards against that.",
          "Written values are steadier than remembered ones."],
        reflect:"What are my three non-negotiable needs, and my two honest dealbreakers?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"red-flags", icon:"🚩", tag:"Safety",
    title:"Recognising Red Flags",
    blurb:"Spot the early warning signs that a connection may not be safe or healthy.",
    lessons:[
      { id:"rf1", title:"What a red flag is — and isn't", minutes:5,
        intro:"A red flag is a pattern of behaviour that signals disrespect, dishonesty or harm — not simply a habit you dislike.",
        sections:[
          { h:"Flag vs. preference", p:[
            "'He supports a different team' is a preference. 'He mocks me when I disagree' is a red flag. Flags are about how someone treats you and others, especially under stress.",
            "One bad moment isn't a flag; a *pattern* is. Watch what repeats."]},
          { h:"Look at behaviour, not potential", p:[
            "It's easy to fall for who someone *could* be. Healthy assessment looks at who they consistently *are* right now."]},
        ],
        takeaways:[
          "Red flags are patterns of disrespect or harm, not mere differences.",
          "One bad day isn't a flag; repetition is.",
          "Date the person in front of you, not their potential."],
        reflect:"Am I responding to who this person is, or to who I hope they'll become?" },

      { id:"rf2", title:"Early warning signs to take seriously", minutes:6,
        intro:"Some behaviours are worth noticing early, before you're deeply attached.",
        sections:[
          { h:"Watch for these patterns", list:[
            "Disrespect toward waiters, family or exes — it often comes for you eventually.",
            "Controlling your time, clothes or friendships 'out of love'.",
            "Never taking responsibility; everything is someone else's fault.",
            "Pushing your boundaries after you've said no.",
            "Hot-and-cold cycles that keep you anxious and off-balance."]},
          { h:"Believe the pattern", p:[
            "When words and actions disagree, believe the actions. Kind words that never match behaviour are not kindness."]},
        ],
        takeaways:[
          "How someone treats others is a preview of how they'll treat you.",
          "Control dressed as care is still control.",
          "When words and actions clash, trust the actions."],
        reflect:"Have I noticed any pattern I've been explaining away? What is it?" },

      { id:"rf3", title:"Love-bombing and moving too fast", minutes:5,
        intro:"Overwhelming early affection can feel wonderful — and can also be a tactic to skip your defences.",
        sections:[
          { h:"What love-bombing looks like", p:[
            "Excessive gifts, constant messaging, talk of marriage within days, and pressure to commit before you really know each other. It can be sincere intensity — or a way to create dependence fast.",
            "The test is what happens when you set a small boundary. A safe person respects it. A love-bomber sulks, guilts or escalates."]},
        ],
        takeaways:[
          "Fast, intense affection is a reason to slow down, not speed up.",
          "Set a small boundary early and watch the response.",
          "Respect for your 'no' is the real test of someone's care."],
        reflect:"When someone moves fast, do I feel excited, pressured, or both? What is the pressure telling me?" },

      { id:"rf4", title:"Trusting your gut and acting on it", minutes:5,
        intro:"Your body often notices unsafety before your mind explains it. Learning to trust that signal keeps you safe.",
        sections:[
          { h:"From feeling to action", p:[
            "A knot in your stomach, dreading their calls, feeling smaller around them — these are signals, not overreactions. You don't need a court-ready case to step back.",
            "You're allowed to end a connection simply because it doesn't feel right. 'It's a no for me' is a complete reason."]},
          { h:"You always have options", list:[
            "Slow down and observe for a few more weeks.",
            "Name the concern directly and watch the response.",
            "Talk it through with a counsellor or trusted friend.",
            "End it — kindly, clearly, without a debate."]},
        ],
        takeaways:[
          "Your body's discomfort is information worth respecting.",
          "You don't need 'proof' to protect your peace.",
          "'It's a no for me' is a full and valid reason."],
        reflect:"When have I ignored my gut before? What did it cost me, and what would I do differently now?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"green-flags", icon:"💚", tag:"Popular",
    title:"Green Flags & Secure Love",
    blurb:"Learn what safe, secure love actually looks like — so you recognise it when it arrives.",
    lessons:[
      { id:"gf1", title:"What secure love looks like", minutes:5,
        intro:"Secure love is often quiet. It feels calm, steady and free — not dramatic.",
        sections:[
          { h:"The feeling of safety", p:[
            "In a secure connection you can relax. You don't have to earn affection, decode moods, or walk on eggshells. Disagreement doesn't threaten the whole relationship.",
            "It can feel unfamiliar — even 'boring' — if you're used to chaos. Calm is not the absence of chemistry; it's the presence of safety."]},
        ],
        takeaways:[
          "Secure love feels calm, not anxious.",
          "You don't have to earn basic kindness in a healthy bond.",
          "If calm feels 'boring', that may be healing, not incompatibility."],
        reflect:"Do I associate love with excitement and anxiety? What would it mean to feel safe instead?" },

      { id:"gf2", title:"Green flags in the first few dates", minutes:6,
        intro:"Healthy signs are visible early too, if you know what to watch for.",
        sections:[
          { h:"Encouraging early signs", list:[
            "They ask about you and actually listen to the answers.",
            "They respect your time, boundaries and 'no' without sulking.",
            "They're consistent — words and plans match actions.",
            "They speak about exes and family with fairness, not venom.",
            "You feel more like yourself around them, not less."]},
          { h:"Consistency over charm", p:[
            "Charm is easy for a night. Consistency across several weeks is the green flag that matters most."]},
        ],
        takeaways:[
          "Listening, consistency and respect for boundaries are core green flags.",
          "How they speak of others reveals their character.",
          "Feeling more yourself is one of the best signs of all."],
        reflect:"On my last good date, which green flags did I notice — and did I let myself value them?" },

      { id:"gf3", title:"How a healthy person handles conflict", minutes:6,
        intro:"You learn the most about someone not when things are smooth, but when you disagree.",
        sections:[
          { h:"Signs of healthy conflict", p:[
            "A secure partner stays on the problem instead of attacking you. They can hear 'this hurt me' without collapsing or counter-attacking. They take responsibility for their part and want repair, not victory.",
            "You both can pause, cool down, and come back — rather than escalating until someone gives in."]},
        ],
        takeaways:[
          "Healthy conflict attacks the problem, not the person.",
          "Wanting repair matters more than winning.",
          "The ability to pause and return is a mark of security."],
        reflect:"How do I handle conflict? Which of these healthy habits do I already have, and which am I growing?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"eq", icon:"🧠",
    title:"Emotional Intelligence",
    blurb:"Understand and work with your emotions — the quiet engine of every relationship.",
    lessons:[
      { id:"eq1", title:"Naming what you feel", minutes:5,
        intro:"You can't manage what you can't name. Emotional intelligence starts with vocabulary.",
        sections:[
          { h:"Beyond 'fine' and 'stressed'", p:[
            "Most of us default to a few words. But 'stressed' might really be *overwhelmed*, *unappreciated* or *afraid*. Naming the specific feeling turns a fog into something you can actually address.",
            "Try this: pause and finish the sentence, 'Right now I feel ___ because ___.' Precision brings relief and clarity."]},
        ],
        takeaways:[
          "Specific feeling-words give you power over the feeling.",
          "'Stressed' often hides a more precise emotion underneath.",
          "'I feel ___ because ___' is a simple naming tool."],
        reflect:"What am I feeling right now — in one precise word — and why?" },

      { id:"eq2", title:"Regulating strong emotions", minutes:6,
        intro:"Feelings are information, not instructions. Regulation is the pause between feeling and reacting.",
        sections:[
          { h:"The pause that protects", p:[
            "When emotion spikes, your thinking brain goes partly offline. Acting in that moment usually makes things worse. A short pause — a few slow breaths, a walk, a glass of water — lets you respond instead of react."]},
          { h:"A simple reset", list:[
            "Notice: 'I'm activated right now.'",
            "Breathe out slowly, longer than you breathe in.",
            "Name the feeling and the need beneath it.",
            "Choose your next action on purpose."]},
        ],
        takeaways:[
          "Strong emotion temporarily dims clear thinking.",
          "A short pause turns reaction into response.",
          "Longer out-breaths help settle the body fast."],
        reflect:"What's my early warning sign that I'm 'activated' — and what pause works best for me?" },

      { id:"eq3", title:"Empathy: feeling with, not fixing", minutes:5,
        intro:"Empathy is joining someone in their experience — not rushing to solve it.",
        sections:[
          { h:"Presence over solutions", p:[
            "When someone shares pain, the instinct to fix can leave them feeling unheard. Often they need to feel understood first: 'That sounds really hard. I'm here.'",
            "Fixing can come later, and only if they want it. Ask: 'Do you want comfort, or ideas?'"]},
        ],
        takeaways:[
          "People usually want to be understood before they want advice.",
          "'That sounds hard, I'm here' is often enough.",
          "Ask whether they want comfort or solutions."],
        reflect:"Do I jump to fixing when someone I love is upset? What would slowing down to listen change?" },

      { id:"eq4", title:"Triggers and where they come from", minutes:6,
        intro:"A trigger is when a present moment sets off an old, oversized reaction. Knowing yours protects your relationships.",
        sections:[
          { h:"Old wounds, present moments", p:[
            "If a partner being ten minutes late fills you with rage or panic, the size of the feeling often points to an older story — of being abandoned, dismissed or unsafe.",
            "Recognising 'this is an old wound, not just this moment' lets you respond to now, instead of re-fighting the past through your partner."]},
        ],
        takeaways:[
          "An oversized reaction usually has an older root.",
          "Naming a trigger separates the past from the present.",
          "Your triggers are yours to understand and tend — a fair thing to work on with a counsellor."],
        reflect:"What situation triggers a reaction bigger than the moment deserves? What older story might it touch?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"love-languages", icon:"💌",
    title:"The Five Love Languages",
    blurb:"A simple framework for how we each give and receive love — and why partners often miss each other.",
    lessons:[
      { id:"ll1", title:"Five ways we give and receive love", minutes:5,
        intro:"The idea of five 'love languages' comes from counsellor Gary Chapman: we each tend to feel loved most through certain kinds of expression.",
        sections:[
          { h:"The five, in brief", list:[
            "Words of affirmation — encouragement, appreciation, kind words.",
            "Quality time — undivided attention and shared presence.",
            "Acts of service — help and effort that lightens your load.",
            "Gifts — thoughtful tokens that say 'I was thinking of you'.",
            "Physical touch — a hand held, a hug, closeness."]},
          { h:"Why it helps", p:[
            "We tend to give love the way we like to receive it. If your languages differ, you can both be trying hard and still feel unloved. Naming them ends a lot of silent hurt."]},
        ],
        takeaways:[
          "We each have preferred ways of feeling loved.",
          "We often give love in our own language, not our partner's.",
          "Naming the difference prevents needless hurt."],
        reflect:"Which two of the five make me feel most loved? Which does my family tend to use?" },

      { id:"ll2", title:"Discovering your own language", minutes:5,
        intro:"Before you can ask for what you need, you have to know it.",
        sections:[
          { h:"Clues to your language", p:[
            "Notice what you ask for most ('spend time with me'), what you give most freely (that's often your language), and what hurts most when it's missing (criticism stings hardest for words people).",
            "There are no wrong answers, and most of us value several — but usually one or two lead."]},
        ],
        takeaways:[
          "What you request and what you give both reveal your language.",
          "What hurts most when absent is a strong clue.",
          "Most people have one or two leading languages."],
        reflect:"What do I most often wish a partner would do? What does that reveal about my language?" },

      { id:"ll3", title:"Loving your partner in their language", minutes:6,
        intro:"Real generosity is loving someone the way *they* receive it — even when it isn't your natural style.",
        sections:[
          { h:"Stretch toward them", p:[
            "If your partner values acts of service but you're a words person, a heartfelt note won't land as much as doing the dishes unasked. Loving well often means stretching outside your default.",
            "The kindest move is simply to ask: 'What makes you feel most loved by me?' — then do that on purpose."]},
        ],
        takeaways:[
          "Love in your partner's language, not only your own.",
          "Ask directly what makes them feel loved.",
          "Stretching outside your default is an act of care."],
        reflect:"If I had a partner, what small act in their language could I offer this week?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"communication", icon:"🗣️",
    title:"Communication that Connects",
    blurb:"Practical skills for being heard and truly hearing another — the daily craft of closeness.",
    lessons:[
      { id:"cm1", title:"Listening to understand", minutes:5,
        intro:"Most listening is really waiting to talk. Connected listening is a skill you can practise.",
        sections:[
          { h:"How to listen well", list:[
            "Put the phone down and turn toward them.",
            "Listen for the feeling under the words, not just the facts.",
            "Reflect back: 'So you felt left out when I forgot?'",
            "Resist defending or fixing until they feel heard."]},
          { h:"Why it works", p:[
            "When people feel truly heard, they soften. Most arguments cool the moment someone feels understood rather than corrected."]},
        ],
        takeaways:[
          "Listen for the feeling, not only the facts.",
          "Reflecting back proves you understood.",
          "Feeling heard defuses most conflict."],
        reflect:"Am I usually listening to understand, or waiting for my turn to speak?" },

      { id:"cm2", title:"'I' statements: speaking without blame", minutes:6,
        intro:"How you open a hard sentence often decides how it ends. Blame invites defence; ownership invites listening.",
        sections:[
          { h:"The shift", p:[
            "'You never help me' puts the other on the defensive. 'I feel overwhelmed and I need a hand this evening' shares your experience and a request. Same issue, very different outcome.",
            "The pattern: *I feel ___ when ___, and I need ___.*"]},
        ],
        takeaways:[
          "'You' accusations trigger defence; 'I' statements invite listening.",
          "Pair your feeling with a clear, doable request.",
          "Use the frame: I feel ___ when ___, I need ___."],
        reflect:"Think of a recent complaint I made. How could I rephrase it as an 'I' statement?" },

      { id:"cm3", title:"Repair: reconnecting after rupture", minutes:5,
        intro:"Every relationship has ruptures. Health isn't never fighting — it's repairing well.",
        sections:[
          { h:"The repair move", p:[
            "Repair can be small: 'I'm sorry I snapped. You didn't deserve that.' It's owning your part without a 'but'. A sincere repair rebuilds safety faster than pretending nothing happened.",
            "You can repair even mid-argument: 'Can we start over? I don't like how I'm speaking to you.'"]},
        ],
        takeaways:[
          "Healthy couples rupture and repair — repair is the skill.",
          "Own your part with no 'but' attached.",
          "You can hit reset even in the middle of a fight."],
        reflect:"Do I tend to repair, or wait for it to blow over? What makes repair hard for me?" },

      { id:"cm4", title:"Hard conversations, held with care", minutes:6,
        intro:"Avoiding hard talks doesn't keep the peace — it postpones and grows the problem.",
        sections:[
          { h:"Set it up to go well", list:[
            "Pick a calm time, not the heat of the moment.",
            "Lead with care: 'I love us, and something's on my mind.'",
            "Name one issue, not a list of grievances.",
            "Aim for understanding, not winning."]},
          { h:"Stay in it", p:[
            "If it heats up, take a break and agree a time to return. Walking away *to cool down and come back* is very different from abandoning the conversation."]},
        ],
        takeaways:[
          "Avoidance grows problems; caring honesty shrinks them.",
          "One issue at a time, at a calm moment.",
          "A break to return is healthy; disappearing is not."],
        reflect:"What conversation have I been avoiding? What's one caring way I could begin it?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"forgiveness", icon:"🕊️",
    title:"Forgiveness & Letting Go",
    blurb:"Release the weight of old hurts — for the sake of your own freedom and future.",
    lessons:[
      { id:"fg1", title:"What forgiveness is — and isn't", minutes:5,
        intro:"Forgiveness is often misunderstood, which keeps people stuck. Let's clear it up.",
        sections:[
          { h:"Freeing you, not excusing them", p:[
            "Forgiveness is releasing the grip that resentment has on *you*. It is not saying the wrong was okay, forgetting it, or being obliged to trust or reconcile with the person again.",
            "You can forgive and still keep a boundary. Forgiveness heals your heart; boundaries protect your future."]},
        ],
        takeaways:[
          "Forgiveness frees you; it doesn't excuse the harm.",
          "You can forgive and still not reconcile.",
          "Forgiveness and boundaries work together."],
        reflect:"Is there a hurt I'm still carrying? What has holding onto it cost me?" },

      { id:"fg2", title:"Releasing resentment", minutes:6,
        intro:"Resentment is like drinking poison and hoping the other person suffers. Letting go is a process, not a switch.",
        sections:[
          { h:"How release happens", p:[
            "It usually comes in layers: acknowledging the hurt honestly, grieving what you lost, and slowly choosing — again and again — to stop rehearsing the offence.",
            "Some hurts are big enough to need a counsellor's help to process. Reaching for support is strength, not failure."]},
        ],
        takeaways:[
          "Letting go is gradual and layered, not instant.",
          "You must feel the hurt before you can release it.",
          "Bigger wounds may need professional support to heal."],
        reflect:"What would I be free to do or feel if I finally set this resentment down?" },

      { id:"fg3", title:"Forgiving yourself", minutes:5,
        intro:"Sometimes the hardest person to forgive is the one in the mirror.",
        sections:[
          { h:"From shame to growth", p:[
            "Carrying shame from past relationships keeps you dating from a wound. Self-forgiveness isn't pretending you did no harm — it's owning it, making amends where you can, learning, and letting the punishment end.",
            "You are allowed to be a different person now than the one who made those choices."]},
        ],
        takeaways:[
          "Unforgiven shame keeps you dating from a wound.",
          "Own the harm, make amends, then let the sentence end.",
          "You're allowed to have grown."],
        reflect:"What do I still need to forgive myself for — and what would offering that grace change?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"trust", icon:"🤝",
    title:"Building & Rebuilding Trust",
    blurb:"How trust is built, what makes you trustworthy, and how it can be repaired.",
    lessons:[
      { id:"tr1", title:"The building blocks of trust", minutes:5,
        intro:"Trust isn't a leap; it's a stack of small, kept promises.",
        sections:[
          { h:"Made of small moments", p:[
            "Trust grows every time someone does what they said, shows up when it matters, and handles your vulnerability with care. It's built in ordinary reliability, not grand declarations.",
            "That's why pacing matters: you need enough small moments to actually see the pattern."]},
        ],
        takeaways:[
          "Trust is built from many small, kept promises.",
          "Reliability speaks louder than declarations.",
          "Give it time — patterns need moments to form."],
        reflect:"Who has earned my trust through small consistency? What did they do?" },

      { id:"tr2", title:"Being someone safe to trust", minutes:5,
        intro:"Trust is a two-way street. It's worth asking not only 'can I trust them?' but 'am I trustworthy?'",
        sections:[
          { h:"Trustworthiness in practice", list:[
            "Keep your word on small things, not just big ones.",
            "Handle what others share with confidentiality.",
            "Be honest even when it's uncomfortable.",
            "Own your mistakes quickly and cleanly."]},
        ],
        takeaways:[
          "Being trustworthy is as important as finding someone who is.",
          "Small reliability builds your credibility.",
          "Owning mistakes quickly deepens trust, not weakens it."],
        reflect:"Where am I fully trustworthy — and where could I be more reliable or honest?" },

      { id:"tr3", title:"Rebuilding after trust is broken", minutes:6,
        intro:"Broken trust can sometimes be rebuilt — but only with honesty, time and changed behaviour.",
        sections:[
          { h:"What repair requires", p:[
            "The one who broke trust must own it fully (no minimising), show consistent changed behaviour over time, and offer patience. The one who was hurt needs space to feel, and to see proof — not just promises.",
            "Rebuilding is possible, but it can't be rushed, and it isn't always the right choice. Some breaches are dealbreakers, and that's okay."]},
        ],
        takeaways:[
          "Repair needs full ownership plus changed behaviour over time.",
          "Proof rebuilds trust; promises alone don't.",
          "Not all trust should be rebuilt — some breaches are dealbreakers."],
        reflect:"What would I need to see, over time, to trust again after a betrayal?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"marriage-prep", icon:"💍", tag:"Stage 4",
    title:"Marriage Preparation",
    blurb:"The honest conversations that build a marriage able to last — before the wedding.",
    lessons:[
      { id:"mp1", title:"Are we ready? Readiness beyond romance", minutes:6,
        intro:"Loving each other is essential — and not, by itself, enough. Readiness is about foundations.",
        sections:[
          { h:"Signs of real readiness", list:[
            "You handle conflict and repair well, not just love easily.",
            "Your core values and life goals genuinely align.",
            "You've met each other honestly, flaws included.",
            "You're choosing marriage freely, not from pressure or fear."]},
          { h:"Romance and readiness", p:[
            "Butterflies fade; partnership remains. Marriage rests on friendship, shared values and the daily choice to love — with romance as a welcome guest, not the foundation."]},
        ],
        takeaways:[
          "Love is necessary but not sufficient for marriage.",
          "Conflict repair and value alignment matter more than intensity.",
          "Choose marriage freely, never from pressure."],
        reflect:"Beyond our feelings, what foundations tell me we're ready — or not yet?" },

      { id:"mp2", title:"Money conversations before marriage", minutes:6,
        intro:"Finances are among the most common sources of marital strain — and among the most avoidable, with honesty upfront.",
        sections:[
          { h:"Talk about it plainly", list:[
            "Debts, income and financial obligations to family.",
            "Spending vs. saving styles and money fears.",
            "Whose money is 'ours' — joint, separate, or a mix?",
            "How big decisions and family support will be handled."]},
          { h:"Values, not just numbers", p:[
            "Money conflicts are usually value conflicts — about security, generosity, or status. Understanding each other's money story matters as much as the figures."]},
        ],
        takeaways:[
          "Discuss debts, styles and 'ours vs. mine' before marriage.",
          "Money conflicts are usually value conflicts underneath.",
          "Family financial obligations deserve an explicit conversation."],
        reflect:"What's my money story — and what would I need to know about a partner's before marrying?" },

      { id:"mp3", title:"Roles, family and expectations", minutes:6,
        intro:"Many couples marry with unspoken, mismatched assumptions about roles and extended family. Naming them early prevents pain.",
        sections:[
          { h:"Make the unspoken spoken", p:[
            "Who does what at home? How will careers and caregiving be shared? What role will parents and in-laws play in your decisions and boundaries?",
            "In many Kenyan families, extended family is deeply woven in — a gift and, sometimes, a pressure. Agreeing your boundaries together, as a team, protects your marriage."]},
        ],
        takeaways:[
          "Unspoken role assumptions cause avoidable conflict.",
          "Discuss home, career and caregiving expectations openly.",
          "Agree on family boundaries together, before you need them."],
        reflect:"What did I absorb about 'husband' and 'wife' roles growing up? What do I actually want?" },

      { id:"mp4", title:"Building a shared vision", minutes:5,
        intro:"A strong marriage rows in the same direction. A shared vision turns two lives into one journey.",
        sections:[
          { h:"Dream on purpose", p:[
            "Talk through the big picture: children, faith, where you'll live, work and ambition, how you'll serve others, what 'a good life' means to each of you.",
            "You won't agree on everything — the goal is a vision you're both genuinely excited to build, with room for both of you in it."]},
        ],
        takeaways:[
          "Shared direction sustains a marriage through hard seasons.",
          "Discuss children, faith, home and purpose explicitly.",
          "Aim for a vision with room for both people in it."],
        reflect:"What does 'a good life together' look like to me in ten years?" },
    ]},

  /* ---------------------------------------------------------- */
  { id:"parenting", icon:"👶",
    title:"Parenting Readiness",
    blurb:"Thinking honestly about children and co-parenting — long before the nursery.",
    lessons:[
      { id:"pr1", title:"Talking about children before you need to", minutes:5,
        intro:"Whether, when and how to raise children is too important to assume. It deserves an early, honest conversation.",
        sections:[
          { h:"The questions to ask together", list:[
            "Do we both want children — and roughly when?",
            "What if it turns out to be difficult, or doesn't happen?",
            "How do we each imagine raising and disciplining them?",
            "What role will faith and extended family play?"]},
          { h:"Alignment matters", p:[
            "A mismatch here — one certain, one unsure — is a real 'need', not a 'want'. Loving someone doesn't resolve it; honesty about it does."]},
        ],
        takeaways:[
          "Don't assume alignment on children — ask early.",
          "Discuss the 'what ifs', not only the happy plan.",
          "A children mismatch is a core need to take seriously."],
        reflect:"What do I truly want regarding children — and how firm is that for me?" },

      { id:"pr2", title:"The parents we had, the parents we'll be", minutes:6,
        intro:"We parent from what we lived — unless we pause to choose. Awareness lets you keep the good and change the rest.",
        sections:[
          { h:"Inherited patterns", p:[
            "Think about how you were raised: what felt loving, what hurt, how discipline and affection were shown. Under stress, we tend to repeat our parents — for better and worse.",
            "Deciding *together*, in advance, what you want to carry forward and what you want to leave behind is one of the kindest gifts you can give future children."]},
        ],
        takeaways:[
          "We default to how we were parented, especially under stress.",
          "Awareness lets you keep the good and change the harmful.",
          "Decide your parenting values together, on purpose."],
        reflect:"What from my own upbringing do I want to pass on — and what do I want to end with me?" },

      { id:"pr3", title:"Parenting as a team", minutes:5,
        intro:"Children thrive most when parents are a united, supportive team — married or co-parenting.",
        sections:[
          { h:"United front, shared load", p:[
            "Agreeing on the big rules, backing each other up in front of the children, and sharing the invisible work fairly all protect both the kids and the relationship.",
            "For those already co-parenting after a separation, the same holds: respect and consistency between homes give children stability."]},
        ],
        takeaways:[
          "A united parental team gives children security.",
          "Share the invisible load, not just the visible tasks.",
          "Co-parents thrive on respect and consistency across homes."],
        reflect:"What would being a great 'team' with a co-parent look like, day to day?" },
    ]},
];

/* Convenience lookups */
const courseById = id => COURSES.find(c => c.id === id);
function lessonRef(courseId, lessonId){
  const c = courseById(courseId); if(!c) return null;
  const l = c.lessons.find(x => x.id === lessonId); if(!l) return null;
  const idx = c.lessons.indexOf(l);
  return { course:c, lesson:l, idx, next:c.lessons[idx+1] || null };
}
