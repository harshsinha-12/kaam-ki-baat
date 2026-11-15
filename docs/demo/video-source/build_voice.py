import subprocess, json
from timeline import SEGS, TOTAL
parts=[]
for sid,f,a,b,v in SEGS:
    out=f"audio/{sid}.wav"; d=b-a
    af=("highpass=f=75,afftdn=nf=-32:tn=1,rubberband=pitch=0.93:formant=preserved,"
        "bass=g=3.5:f=120:w=0.8,equalizer=f=3200:t=q:w=1.2:g=2,deesser=i=0.35,"
        "acompressor=threshold=-21dB:ratio=3.2:attack=6:release=90:makeup=3,"
        f"loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.04,afade=t=out:st={d-0.06:.3f}:d=0.06,aresample=48000")
    subprocess.run(["ffmpeg","-v","error","-y","-ss",str(a),"-to",str(b),"-i",f,"-af",af,"-ac","2","-ar","48000",out],check=True)
    parts.append((out,v))
inputs=sum([["-i",p] for p,_ in parts],[])
fc="".join(f"[{i}]adelay={int(v*1000)}|{int(v*1000)}[a{i}];" for i,(_,v) in enumerate(parts))
fc+="".join(f"[a{i}]" for i in range(len(parts)))+f"amix=inputs={len(parts)}:normalize=0,apad=whole_dur={TOTAL}[out]"
subprocess.run(["ffmpeg","-v","error","-y",*inputs,"-filter_complex",fc,"-map","[out]","-t",str(TOTAL),"-ar","48000","audio/voice.wav"],check=True)
print("ok")
