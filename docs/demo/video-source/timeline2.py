C="/mnt/user-data/uploads/f0afef77-kaam_ki_baat_-_Charan.m4a"
H="/mnt/user-data/uploads/dd1c382b-Bolna_Haackathon_Part_2_Harsh.m4a"
SEGS=[("C1",C,1.15,15.50,2.4),("C2",C,16.05,26.60,20.6),("H2a",H,11.10,14.80,31.4),("H2b",H,26.35,36.95,35.1),("H3",H,50.45,59.00,48.6),("H5",H,74.35,78.10,64.6),("H6",H,78.20,81.40,68.3)]
CUES={
 "C1":[(1.30,5.10,"Every team meeting starts with ideas and ends with decisions."),(5.40,9.00,"And a few hours later, we're all asking the same questions."),(9.40,11.25,"What did we actually decide?"),(11.40,12.75,"Who's responsible?"),(12.80,15.45,"And did that work ever make it into the code?")],
 "C2":[(16.15,17.95,"That's why we built Kaam Ki Baat."),(18.20,23.05,"It connects our conversations from Wispr Flow with actual GitHub code,"),(23.20,26.55,"and uses Bolna to make that entire context conversational.")],
 "H2a":[(11.15,12.55,"I'm turning left…"),(12.60,14.75,"Team Memory activates.")],
 "H2b":[(26.40,29.65,"I can ask it a question from the meeting,"),(29.70,32.85,"or if something hasn't been finalized, we don't have to guess."),(32.90,36.90,"We can get that verified directly by our leader — by moving to the center.")],
 "H3":[(50.50,53.60,"I turn right and go to the Code Navigator."),(53.70,56.45,"I ask it: show me exactly where this decision"),(56.45,58.95,"is saved in our code, and how we can verify it.")],
 "H5":[(74.40,78.05,"We know what was decided, where to look, and what to do next.")],
 "H6":[(78.30,79.75,"That's Kaam Ki Baat."),(79.75,81.35,"Meeting mein bola. Repo mein bana.")],
}
TOTAL=74.5
def cues_video():
    return [(round(v+(s-a),3),round(v+(e-a),3),t,sid[0]) for sid,f,a,b,v in SEGS for s,e,t in CUES[sid]]
