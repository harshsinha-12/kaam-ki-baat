# Master timeline: voice segments (source in/out) placed on the video clock, plus cleaned subtitle cues (source times).
C="/mnt/user-data/uploads/f0afef77-kaam_ki_baat_-_Charan.m4a"
H="/mnt/user-data/uploads/dd1c382b-Bolna_Haackathon_Part_2_Harsh.m4a"
SEGS = [  # id, file, src_in, src_out, video_start
 ("C1", C, 1.15, 15.50, 5.0),
 ("C2", C, 16.05, 26.60, 31.0),
 ("C3", C, 26.95, 38.30, 41.75),
 ("H1", H, 0.55, 3.35, 62.5),
 ("H2", H, 11.10, 36.95, 65.5),
 ("H3", H, 42.65, 63.00, 98.0),
 ("H5", H, 69.85, 78.10, 137.0),
 ("H6", H, 78.20, 81.40, 145.3),
]
CUES = {  # seg: [(src_start, src_end, text)]
 "C1": [(1.30,5.10,"Every team meeting starts with ideas and ends with decisions."),(5.40,9.00,"And a few hours later, we're all asking the same questions."),(9.40,11.25,"What did we actually decide?"),(11.40,12.75,"Who's responsible?"),(12.80,15.45,"And did that work ever make it into the code?")],
 "C2": [(16.15,17.95,"That's why we built Kaam Ki Baat."),(18.20,23.05,"It connects our conversations from Wispr Flow with actual GitHub code,"),(23.20,26.55,"and uses Bolna to make that entire context conversational.")],
 "C3": [(27.05,28.95,"And here's the interesting part."),(29.10,31.85,"Look left to remember what your team discussed."),(31.90,34.85,"Look straight to access the leader's private agent,"),(34.90,38.25,"and look right to navigate the actual codebase.")],
 "H1": [(0.65,3.30,"Okay, so let me show you how this actually works.")],
 "H2": [(11.15,12.55,"I'm turning left…"),(12.60,14.75,"Team Memory activates."),(14.80,20.30,"It uses the Wispr Flow MCP and understands"),(20.70,25.95,"the meeting context — everything that was talked about in the meeting."),(26.40,29.65,"I can ask it a question from the meeting,"),(29.70,32.85,"or if something hasn't been finalized, we don't have to guess."),(32.90,36.90,"We can get that verified directly by our leader — by moving to the center.")],
 "H3": [(42.75,44.65,"Now here's my favourite part."),(44.70,50.45,"I need to implement and write code — through an AI agent or by myself."),(50.50,53.60,"I turn right and go to the Code Navigator."),(53.70,56.45,"I ask it: show me exactly where this decision"),(56.45,58.95,"is saved in our code, and how we can verify it —"),(59.00,62.95,"how to implement our next feature, and improve the task.")],
 "H5": [(69.95,74.40,"So instead of searching through meetings, messages and hundreds of lines of code,"),(74.40,78.05,"we know what was decided, where to look, and what to do next.")],
 "H6": [(78.30,79.75,"That's Kaam Ki Baat."),(79.75,81.35,"Meeting mein bola. Repo mein bana.")],
}
TOTAL = 154.0
def cues_video():
    out=[]
    for sid,f,a,b,v in SEGS:
        for s,e,t in CUES[sid]:
            out.append((round(v+(s-a),3), round(v+(e-a),3), t, sid[0]))
    return out
if __name__=="__main__":
    import json; json.dump({"segs":[dict(id=s[0],start=s[4],end=s[4]+s[3]-s[2]) for s in SEGS],"cues":cues_video(),"total":TOTAL},open("timeline.json","w"),indent=1)
    for c in cues_video(): print(c)
