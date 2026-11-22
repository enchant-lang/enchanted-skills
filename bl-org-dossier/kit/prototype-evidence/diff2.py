import sys, re, collections, difflib
from html.parser import HTMLParser
class C(HTMLParser):
    def __init__(s): super().__init__(convert_charrefs=True); s.o=[]
    def handle_starttag(s,t,a):
        a=[(k,('H' if k=='data-review-target' else v)) for k,v in a]; s.o.append('<'+t+' '+' '.join(f'{k}={v!r}' for k,v in sorted(a))+'>')
    def handle_endtag(s,t): s.o.append('</'+t+'>')
    def handle_data(s,d):
        if d.strip(): s.o.append(d)
def canon(x): c=C(); c.feed(x); return c.o
n=int(sys.argv[1]); same=0; kinds=collections.Counter(); ex={}; bad=[]
for i in range(n):
    b=canon(open(f"out/beam/{i}.html").read()); j=canon(open(f"out/js/{i}.html").read())
    if b==j: same+=1; continue
    bad.append(i)
    for op,a1,a2,b1,b2 in difflib.SequenceMatcher(None,b,j,autojunk=False).get_opcodes():
        if op=='equal': continue
        k=re.sub(r'\d+','#',(' '.join(b[a1:a2])[:80]+' || '+' '.join(j[b1:b2])[:80]))
        kinds[k]+=1; ex.setdefault(k,i)
print("identical after normalising", same, "of", n, "differing:", bad)
for k,c in kinds.most_common(30): print(c, ex[k], k.replace('\n',' '))
