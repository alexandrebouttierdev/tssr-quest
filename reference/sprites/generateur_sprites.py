from PIL import Image, ImageDraw
import base64, io
P={'K':'#0e1116','k':'#1b2129','g':'#2a323d','G':'#3a4552','h':'#556273','H':'#7d8a9a','w':'#c9d1d9','W':'#eef2f5',
 'b':'#1e3a5f','B':'#2f6fb0','c':'#5fb6e0','C':'#a8e4f5','n':'#2fbf71','N':'#8ff0b0','a':'#f2b54a','r':'#e0524a','R':'#ff9a8a',
 'o':'#6b4a33','O':'#8f6644','p':'#2f7a45','P':'#5cb860','y':'#e8c86a','s':'#f0c39b','S':'#d39a72','x':'#3a2418',
 'v':'#3d7be0','V':'#2a58a8','j':'#2b3448','m':'#141820'}
def hx(c): c=P.get(c,c); return tuple(int(c[i:i+2],16) for i in (1,3,5))+(255,)
TS=16
sheet=Image.new('RGBA',(TS*8,TS*2),(0,0,0,0))
def tile(i):
    im=Image.new('RGBA',(TS,TS),(0,0,0,0)); return im,ImageDraw.Draw(im)
def px(d,x,y,c): d.point((x,y),fill=hx(c))
def r(d,x0,y0,x1,y1,c): d.rectangle((x0,y0,x1,y1),fill=hx(c))
tiles=[]
# 0 raised floor
im,d=tile(0); r(d,0,0,15,15,'G'); r(d,0,0,15,0,'h'); r(d,0,0,0,15,'h'); r(d,15,0,15,15,'g'); r(d,0,15,15,15,'g')
for (x,y) in [(2,2),(13,2),(2,13),(13,13)]: px(d,x,y,'k')
px(d,7,7,'g');px(d,8,8,'g'); tiles.append(im)
# 1 perforated cold aisle
im,d=tile(1); r(d,0,0,15,15,'#2c4560'); r(d,0,0,15,0,'#3f6285'); r(d,0,0,0,15,'#3f6285'); r(d,15,0,15,15,'b'); r(d,0,15,15,15,'b')
for y in range(3,14,3):
    for x in range(3,14,3): px(d,x,y,'#5f93bf')
tiles.append(im)
# 2 wall top
im,d=tile(2); r(d,0,0,15,15,'K'); r(d,0,15,15,15,'k'); px(d,4,6,'k'); px(d,11,10,'k'); tiles.append(im)
# 3 wall face
def wallface(d):
    r(d,0,0,15,15,'g'); r(d,0,0,15,1,'h'); r(d,0,13,15,15,'k'); r(d,0,12,15,12,'K')
    for x in (5,11): r(d,x,2,x,11,'#323b47')
im,d=tile(3); wallface(d); tiles.append(im)
# 4/5 rack top/bottom, 6/7 alternate LEDs
def rack(d,part,alt):
    r(d,1,0,14,15,'K'); r(d,2,0,13,15,'k')
    if part=='top': r(d,1,0,14,1,'h'); r(d,1,0,14,0,'H')
    else: r(d,1,14,14,15,'K'); r(d,2,15,3,15,'m'); r(d,12,15,13,15,'m')
    ys=[3,6,9,12] if part=='top' else [1,4,7,10]
    for i,y in enumerate(ys):
        r(d,3,y,12,y+1,'g'); r(d,3,y,12,y,'h')
        for xx in range(5,10,2): px(d,xx,y+1,'K')
        on=((i+alt)%2==0)
        px(d,11,y+1,'n' if on else '#164d30'); px(d,12,y,'a' if (i==1 and alt) or (i==3 and not alt) else '#5a4520')
        if part=='bottom' and i==3: px(d,4,y+1,'c' if alt else 'b')
for part,alt in [('top',0),('bottom',0)]:
    im,d=tile(0); rack(d,part,alt); tiles.append(im)
for part,alt in [('top',1),('bottom',1)]:
    im,d=tile(0); rack(d,part,alt); tiles.append(im)
# 8 desk + monitor, 9 desk monitor cursor variant
def desk(d,cur):
    r(d,0,8,15,13,'O'); r(d,0,8,15,8,'#b08458'); r(d,0,14,15,14,'o'); r(d,1,15,2,15,'o'); r(d,13,15,14,15,'o')
    r(d,3,0,12,7,'K'); r(d,4,1,11,6,'#0b2a1f')
    for y,w in [(2,5),(3,4),(4,6)]: r(d,5,y,4+w,y,'n')
    if cur: r(d,5,5,6,5,'N')
    r(d,7,7,8,8,'k'); r(d,4,10,9,11,'h'); r(d,11,10,12,11,'w')
im,d=tile(0); desk(d,0); tiles.append(im)
im,d=tile(0); desk(d,1); tiles.append(im)
# 10 network cabinet with switch
im,d=tile(0); r(d,1,1,14,15,'K'); r(d,2,2,13,14,'k'); r(d,3,3,12,5,'h'); 
for x in range(4,12): px(d,x,4,'K')
for x in (4,6,9,11): px(d,x,3,'n')
r(d,3,8,12,10,'h'); 
for x in range(4,12): px(d,x,9,'K')
for x,c in [(4,'y'),(5,'B'),(6,'y'),(8,'B'),(10,'r')]: r(d,x,6,x,7,c); r(d,x,11,x,13,c)
tiles.append(im)
# 11 door in wall
im,d=tile(0); wallface(d); r(d,3,1,12,15,'o'); r(d,4,2,11,15,'O'); r(d,4,2,11,2,'#b08458'); px(d,10,9,'a'); r(d,6,5,9,7,'C'); tiles.append(im)
# 12 plant
im,d=tile(0); r(d,5,11,10,15,'#9a5a3a'); r(d,5,11,10,11,'#b8734c')
for (x,y,c) in [(7,3,'P'),(8,2,'P'),(5,5,'p'),(6,4,'P'),(9,4,'P'),(10,6,'p'),(4,8,'p'),(6,7,'P'),(8,6,'p'),(9,8,'P'),(11,9,'p'),(7,9,'p'),(5,9,'P'),(8,9,'p'),(7,5,'p'),(10,8,'P')]:
    r(d,x,y,x+1,y+1,c)
tiles.append(im)
# 13 AC unit (CRAC)
im,d=tile(0); r(d,1,0,14,15,'w'); r(d,1,0,14,0,'W'); r(d,14,0,14,15,'H'); r(d,1,15,14,15,'H')
for y in range(2,9,2): r(d,3,y,12,y,'H')
r(d,3,11,6,13,'K'); px(d,4,12,'c'); px(d,5,12,'C'); r(d,9,11,12,12,'#9fb3c2'); tiles.append(im)
# 14 wall + extinguisher
im,d=tile(0); wallface(d); r(d,6,4,9,12,'r'); r(d,6,4,6,12,'R'); r(d,7,2,8,3,'K'); r(d,9,2,10,2,'K'); r(d,6,7,9,8,'W'); tiles.append(im)
# 15 floor with hazard tape
im,d=tile(0); tiles[0] and im.paste(tiles[0]); d=ImageDraw.Draw(im)
for x in range(16): r(d,x,6,x,9,'y' if (x//2)%2==0 else 'K')
tiles.append(im)
for i,t in enumerate(tiles): sheet.paste(t,((i%8)*TS,(i//8)*TS))
sheet.save('tileset_salle_serveurs.png')

# Character 16x24, frames: rows=down,left,right,up ; cols=stand,stepA,stand,stepB
HEAD={'down':["................",".....KKKKKK.....","....KxxxxxxK....","...KxxxxxxxxK...","...KxxxxxxxxK...","...KxssssssxK...","...KsKssssKsK...","...KssssssssK...","....KsSSSSsK....",".....KKssKK.....",
 "...KKvvvvvvKK...","..KvvvvaavvvvK..","..KvVvvvvvvVvK..","..KvVvvvvvvVvK..","..KsKvvvvvvKsK..","..KKKVVVVVVKKK.."],
 'up':["................",".....KKKKKK.....","....KxxxxxxK....","...KxxxxxxxxK...","...KxxxxxxxxK...","...KxxxxxxxxK...","...KxxxxxxxxK...","...KxxxxxxxxK...","....KxxxxxxK....",".....KKssKK.....",
 "...KKvvvvvvKK...","..KvvvvvvvvvvK..","..KvVvvvvvvVvK..","..KvVVVVVVVVvK..","..KsKvvvvvvKsK..","..KKKVVVVVVKKK.."],
 'right':["................",".....KKKKKK.....","....KxxxxxxK....","...KxxxxxxxxK...","...KxxxxxxxxK...","...KxxxxxsssK...","...KxxxsssKsK...","...KxxssssssK...","....KxsSSSsK....",".....KKssKK.....",
 "....KKvvvvKK....","....KvvvvvvK....","....KvVvvvvK....","....KvVsvvvK....","....KvVsvvvK....","....KKVVVVKK...."]}
LEGS={'stand':["....KjjjjjjK....","....KjjjjjjK....","....KjjKKjjK....","....KjjKKjjK....","....KjjKKjjK....","....KmmKKmmK....","....KKKKKKKK....","................"],
 'A':["....KjjjjjjK....","....KjjjjjjK....","....KjjKKjjK....","....KjjKKjjK....","....KmmKKjjK....","....KKKKKmmK....","........KKKK....","................"],
 'B':["....KjjjjjjK....","....KjjjjjjK....","....KjjKKjjK....","....KjjKKjjK....","....KjjKKmmK....","....KmmKKKKK....","....KKKK........","................"],
 'side':[".....KjjjjK.....",".....KjjjjK.....",".....KjjjjK.....",".....KjjjjK.....",".....KjjjjK.....",".....KmmmmmK....",".....KKKKKKK....","................"],
 'sidestep':[".....KjjjjK.....","....KjjKKjjK....","...KjjK..KjjK...","...KjjK..KjjK...","..KmmmK..KmmmK..","..KKKKK..KKKKK..","................","................"]}
for k,v in list(HEAD.items())+list(LEGS.items()):
    for row in v: assert len(row)==16,(k,row,len(row))
def frame(head,legs,bob):
    im=Image.new('RGBA',(16,24),(0,0,0,0))
    rows=head+legs
    for y,row in enumerate(rows):
        for x,ch in enumerate(row):
            if ch!='.':
                yy=y-bob
                if 0<=yy<24: im.putpixel((x,yy),hx(ch))
    return im
char=Image.new('RGBA',(64,96),(0,0,0,0))
plans={'down':[('down','stand',0),('down','A',1),('down','stand',0),('down','B',1)],
 'right':[('right','side',0),('right','sidestep',1),('right','side',0),('right','sidestep',1)],
 'up':[('up','stand',0),('up','A',1),('up','stand',0),('up','B',1)]}
order=['down','left','right','up']
for ri,dname in enumerate(order):
    src='right' if dname=='left' else dname
    for ci,(h,l,b) in enumerate(plans[src]):
        f=frame(HEAD[h],LEGS[l],b)
        if dname=='left': f=f.transpose(Image.FLIP_LEFT_RIGHT)
        char.paste(f,(ci*16,ri*24))
char.save('personnage_technicien.png')
for n in ['tileset_salle_serveurs.png','personnage_technicien.png']:
    big=Image.open(n); big=big.resize((big.width*6,big.height*6),Image.NEAREST); big.save(n.replace('.png','_x6.png'))
open('b64.txt','w').write(base64.b64encode(open('tileset_salle_serveurs.png','rb').read()).decode()+'\n'+base64.b64encode(open('personnage_technicien.png','rb').read()).decode())
print('ok')
