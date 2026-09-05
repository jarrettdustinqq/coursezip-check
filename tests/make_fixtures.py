from pathlib import Path
import io,json,struct,zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'fixtures'; OUT.mkdir(exist_ok=True)
NS='http://www.imsproject.org/xsd/imscp_rootv1p1p2'
def manifest(resources='<resource identifier="r1" type="webcontent" href="index.html"><file href="index.html"/></resource>',attrs='',items='<item identifier="i1" identifierref="r1"/>'):
    return f'<?xml version="1.0" encoding="UTF-8"?><manifest xmlns="{NS}" identifier="m1" {attrs}><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations><organization identifier="o1">{items}</organization></organizations><resources>{resources}</resources></manifest>'
BASE=manifest(); cases=[]
def make(name,xml=BASE,files=None,status='clear',code=None,compression=zipfile.ZIP_DEFLATED,manifest_name='imsmanifest.xml',mutate=None):
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w',compression=compression) as z:
        z.writestr(zipfile.ZipInfo(manifest_name,(2026,1,1,0,0,0)),xml,compress_type=compression)
        for key,value in (files if files is not None else {'index.html':'<h1>Synthetic training course</h1>'}).items(): z.writestr(zipfile.ZipInfo(key,(2026,1,1,0,0,0)),value,compress_type=compression)
    data=b.getvalue()
    if mutate: data=mutate(bytearray(data))
    (OUT/(name+'.zip')).write_bytes(data)
    cases.append({'file':name+'.zip','status':status,'code':code})
make('good-stored',compression=zipfile.ZIP_STORED)
make('good-deflated')
make('good-utf16',xml=BASE.replace('UTF-8','UTF-16').encode('utf-16'))
make('good-2004',xml=BASE.replace(NS,'http://www.imsglobal.org/xsd/imscp_v1p1').replace('1.2</schemaversion>','2004 4th Edition</schemaversion>'))
make('wrapped-folder',manifest_name='course/imsmanifest.xml',files={'course/index.html':'hi'},status='issues',code='root-manifest')
make('wrong-manifest-case',manifest_name='IMSManifest.xml',status='issues',code='root-manifest')
make('missing-file',files={},status='issues',code='missing-file')
make('wrong-path-case',files={'Index.html':'hi'},status='issues',code='case-mismatch')
make('case-collision',files={'index.html':'hi','Index.html':'hello'},status='review',code='case-collision')
make('valid-query-fragment',xml=BASE.replace('href="index.html"','href="index.html?mode=learn&amp;lang=en#start"'))
make('valid-percent-space',xml=BASE.replace('index.html','lesson%20one.html'),files={'lesson one.html':'hello'})
make('valid-utf8-name',xml=BASE.replace('index.html','caf%C3%A9.html'),files={'café.html':'hello'})
make('valid-xml-base',xml=manifest(attrs='xml:base="assets/"'),files={'assets/index.html':'hi'})
make('valid-parent-base',xml=manifest('<resource identifier="r1" xml:base="unit/" href="../index.html"><file href="../index.html"/></resource>',attrs='xml:base="assets/"'),files={'assets/index.html':'hi'})
make('root-escape',xml=BASE.replace('index.html','../index.html'),status='issues',code='invalid-reference')
make('encoded-root-escape',xml=BASE.replace('index.html','%2e%2e/index.html'),status='issues',code='invalid-reference')
make('root-relative',xml=BASE.replace('index.html','/index.html'),status='issues',code='invalid-reference')
make('encoded-separator',xml=BASE.replace('index.html','assets%2findex.html'),status='issues',code='invalid-reference')
make('bad-percent',xml=BASE.replace('index.html','index%ZZ.html'),status='issues',code='invalid-reference')
make('backslash-ref',xml=BASE.replace('index.html','assets\\index.html'),status='issues',code='invalid-reference')
make('script-url',xml=BASE.replace('index.html','javascript:alert(1)'),status='issues',code='invalid-reference')
make('external-url',xml=BASE.replace('index.html','https://example.com/course.html'),status='review',code='external-reference')
make('external-base',xml=manifest(attrs='xml:base="https://example.com/course/"'),status='review',code='external-reference')
make('malformed-xml',xml=BASE.replace('</resources>','</broken>'),status='incomplete',code='incomplete')
make('xml-entity',xml=BASE.replace('<manifest','<!DOCTYPE manifest [<!ENTITY x SYSTEM "file:///etc/passwd">]><manifest',1),status='incomplete',code='incomplete')
make('unknown-resource',xml=BASE.replace('identifierref="r1"','identifierref="missing"'),status='issues',code='unknown-resource')
make('unknown-dependency',xml=manifest('<resource identifier="r1" href="index.html"><dependency identifierref="missing"/></resource>'),status='issues',code='unknown-dependency')
make('duplicate-id',xml=manifest('<resource identifier="r1" href="index.html"/><resource identifier="r1" href="index.html"/>'),status='issues',code='duplicate-resource')
make('empty-file',xml=manifest('<resource identifier="r1" href="index.html"><file/></resource>'),status='issues',code='empty-reference')
make('submanifest',xml=BASE.replace('</manifest>','<manifest identifier="nested"/></manifest>'),status='incomplete',code='incomplete')
make('unsafe-path',files={'../index.html':'unsafe'},status='incomplete',code='incomplete')
make('absolute-path',files={'/index.html':'unsafe'},status='incomplete',code='incomplete')
make('truncated',mutate=lambda b:b[:-5],status='incomplete',code='incomplete')
def patch_manifest(b,relative,value,format='<I',local=None):
    p=b.index(b'PK\x01\x02'); struct.pack_into(format,b,p+relative,value)
    if local is not None: struct.pack_into(format,b,local,value)
    return b
make('bad-crc',mutate=lambda b:patch_manifest(b,16,42,local=14),status='incomplete',code='incomplete')
make('encrypted',mutate=lambda b:patch_manifest(b,8,1,'<H',local=6),status='incomplete',code='incomplete')
make('zip64-entry',mutate=lambda b:patch_manifest(b,24,0xffffffff),status='incomplete',code='incomplete')
make('oversized-manifest',mutate=lambda b:patch_manifest(b,24,2097153,local=22),status='incomplete',code='incomplete')
make('false-small-inflation',xml=BASE.replace('</manifest>','<!--'+'x'*2000000+'--></manifest>'),mutate=lambda b:patch_manifest(b,24,20,local=22),status='incomplete',code='incomplete')
make('mismatched-local-name',mutate=lambda b:b[:30]+b'X'+b[31:],status='incomplete',code='incomplete')
make('report-escaping',xml=BASE.replace('index.html','&lt;script&gt;alert(1)&lt;/script&gt;'),status='issues',code='missing-file')
make('many-findings',xml=manifest('<resource identifier="r1" href="index.html">'+''.join(f'<file href="missing-{i}.js"/>' for i in range(400))+'</resource>'),status='issues',code='missing-file')
(OUT/'cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(f'Created {len(cases)} synthetic package fixtures.')
# A genuine sparse archive: valid stored files, then unused padding before the directory.
# Logical size > 1 GiB; actual disk use stays small. The original entry CRCs remain valid.
source=(OUT/'good-stored.zip').read_bytes()
end=source.rfind(b'PK\x05\x06'); old_offset=struct.unpack_from('<I',source,end+16)[0]
new_offset=1024*1024*1024
new_end=bytearray(source[end:]);struct.pack_into('<I',new_end,16,new_offset)
with (OUT/'large-sparse.zip').open('wb') as f:
    f.write(source[:old_offset]);f.seek(new_offset);f.write(source[old_offset:end]);f.write(new_end)
with zipfile.ZipFile(OUT/'large-sparse.zip') as z:
    assert z.read('index.html')==b'<h1>Synthetic training course</h1>'
    assert z.read('imsmanifest.xml')==BASE.encode()
print('Verified a sparse ZIP larger than 1 GiB using the independent Python ZIP reader.')
