import numpy as np, subprocess, json
from scipy.signal import butter, sosfilt
SR=48000; TOTAL=154.0; N=int(SR*TOTAL)
BPM=120; BEAT=60/BPM; OFF=1.5          # bars start at 1.5 + 2k
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def add(sig,t,gain=1.0,pan=0.0):
    i=int(t*SR)
    if i>=N or i+len(sig)<=0: return
    s=sig[:N-i]; l=np.cos((pan+1)*np.pi/4); r=np.sin((pan+1)*np.pi/4)
    L[i:i+len(s)]+=s*gain*l*1.41; R[i:i+len(s)]+=s*gain*r*1.41
def env(n,a=0.002,d=0.2):
    t=np.arange(n)/SR; return np.minimum(1,t/max(a,1e-4))*np.exp(-t/d)
def lp(x,f): return sosfilt(butter(2,f,'low',fs=SR,output='sos'),x)
def hp(x,f): return sosfilt(butter(2,f,'high',fs=SR,output='sos'),x)
def bp(x,f1,f2): return sosfilt(butter(2,[f1,f2],'band',fs=SR,output='sos'),x)
def saw(f,n,det=0.0):
    t=np.arange(n)/SR; return 2*((t*f*(1+det))%1)-1
def kick():
    n=int(.45*SR); t=np.arange(n)/SR; f=45+80*np.exp(-t*28)
    ph=2*np.pi*np.cumsum(f)/SR; return np.sin(ph)*np.exp(-t*7)+0.3*np.exp(-t*300)*rng.standard_normal(n)*0.2
def clap():
    n=int(.25*SR); x=bp(rng.standard_normal(n),900,4000); e=np.zeros(n)
    for k,dl in enumerate([0,.011,.022]): i=int(dl*SR); e[i:]+=np.exp(-np.arange(n-i)/SR*(60 if k<2 else 18))
    return x*e*0.6
def hat(open_=False):
    n=int((.18 if open_ else .05)*SR); return hp(rng.standard_normal(n),7000)*env(n,.001,.06 if open_ else .012)*0.35
def pluck(f,dur=.22):
    n=int(dur*SR); x=saw(f,n)*0.5+saw(f,n,.006)*0.5; return lp(x,2400)*env(n,.002,.09)
def pad(freqs,dur,cut=1800):
    n=int(dur*SR); x=sum(saw(f,n,d) for f in freqs for d in (-.004,0,.005))/ (3*len(freqs))
    a=np.minimum(1,np.arange(n)/SR/0.25); rel=np.minimum(1,(n-np.arange(n))/SR/0.3); return lp(x,cut)*a*rel
def bassnote(f,dur):
    n=int(dur*SR); x=saw(f,n)*0.6+np.sin(2*np.pi*f*np.arange(n)/SR)*0.6; return lp(x,420)*env(n,.004,dur*0.9)
def riser(dur):
    n=int(dur*SR); t=np.arange(n)/SR; x=rng.standard_normal(n); out=np.zeros(n); seg=int(SR*0.05)
    for i in range(0,n,seg):
        fc=300+6000*(i/n)**2; out[i:i+seg]=bp(x[i:i+seg],fc,fc*1.6)
    sweep=np.sin(2*np.pi*np.cumsum(200+900*(t/dur)**2)/SR)*0.15
    return (out*0.5+sweep)*(t/dur)**2
def impact():
    n=int(2.2*SR); t=np.arange(n)/SR; boom=np.sin(2*np.pi*np.cumsum(38+60*np.exp(-t*6))/SR)*np.exp(-t*2.2)
    return boom*0.9+lp(rng.standard_normal(n),1800)*np.exp(-t*5)*0.35
# A minor: Am F C G
CH=[(220,261.6,329.6),(174.6,220,261.6),(196,261.6,329.6),(196,246.9,293.7)]
ROOT=[55,43.65,65.41,49]
# energy per section: (start,end,level 0..3)
SEC=[(0,5,0),(5,19.35,1),(19.35,31,3),(31,53.1,1.5),(53.1,62.5,2.5),(62.5,91.35,1),(91.35,98,2),(98,118.3,1.5),(118.3,137,3),(137,145.3,1.5),(145.3,148.45,0.5),(148.45,154,0)]
def level(t):
    for a,b,l in SEC:
        if a<=t<b: return l
    return 0
K,CL,HT,PL,BS=kick(),clap(),hat(),None,None
nbars=int((TOTAL-OFF)/2)+1
for bar in range(-1,nbars):
    t0=OFF+bar*2
    ci=bar%4; ch=CH[ci]; root=ROOT[ci]
    lv=level(max(t0,0)+0.01)
    if t0+2<0: continue
    if lv>0: add(pad(ch,2.05,900+600*lv),t0,0.10+0.03*lv)
    for b in range(4):
        tb=t0+b*BEAT; lb=level(tb)
        if tb<0 or tb>=TOTAL-0.3: continue
        if lb>=1: add(K,tb,0.75 if lb>=2 else 0.5)
        if lb>=2 and b in (1,3): add(CL,tb,0.55)
        if lb>=1: add(hat(True),tb+BEAT/2,0.35 if lb>=2 else 0.22,0.3)
        if lb>=2.5:
            for s in (0.25,0.75): add(hat(),tb+s*BEAT,0.25,-0.3)
        if lb>=1:
            for e in range(2): add(bassnote(root*(2 if (e==1 and lb>=2) else 1),BEAT/2*0.95),tb+e*BEAT/2,0.55)
        if lb>=2.5:
            arp=[ch[0]*2,ch[1]*2,ch[2]*2,ch[1]*2]
            for s in range(4): add(pluck(arp[s]),tb+s*BEAT/4,0.10,0.4 if s%2 else -0.4)
# risers + impacts into big sections
for t in (5.0,19.35,53.1,91.35,118.3,148.45):
    add(riser(2.5 if t>6 else 4.5),t-(2.5 if t>6 else 4.5),0.32)
    add(impact(),t,0.55)
# final chord
add(pad((220,261.6,329.6,440),5.5,1400),148.45,0.22)
music=np.stack([L,R],1)
# sidechain kick pump on pads/bass is implicit; duck under voice
import wave
v=subprocess.run(["ffmpeg","-v","error","-i","audio/voice.wav","-ac","1","-ar",str(SR),"-f","f32le","-"],capture_output=True).stdout
vo=np.frombuffer(v,np.float32)[:N]; vo=np.pad(vo,(0,N-len(vo)))
w=int(0.05*SR); rms=np.sqrt(np.convolve(vo**2,np.ones(w)/w,'same'))
active=(rms>0.01).astype(float)
# smooth attack 60ms release 400ms
g=np.zeros(N); a=1-np.exp(-1/(0.06*SR)); r=1-np.exp(-1/(0.4*SR)); s=0.0
step=48
for i in range(0,N,step):
    tgt=active[i]; s+= (a*step if tgt>s else r*step)*(tgt-s); s=min(max(s,0),1); g[i:i+step]=s
duck=10**(-11*g/20)
music*=duck[:,None]
music/=np.max(np.abs(music))+1e-9; music*=0.6
pcm=(np.clip(music,-1,1)*32767).astype(np.int16)
with wave.open("audio/music.wav","wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
print("music ok")
